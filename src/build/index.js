import * as esbuild from 'esbuild';
import { copy } from 'esbuild-plugin-copy';
import htmlMinify from "html-minifier";
import { createBrotliCompress, constants } from 'node:zlib';
import { createReadStream, createWriteStream, watch, readFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import https from 'node:https';
import http from 'node:http';
import path from 'node:path';
import { readFile, readdir, stat, rm, access, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import buildRoutes from './buildRoutes.js';

// TODO gzip


let liveReloadClients = new Set();
const isDev = process.env.NODE_ENV !== 'production';
export default async function build(config = {
  entryPoint: 'app/app.js',
  entryPointCSS: '',
  indexHTML: 'app/index.html',
  outdir: 'dist',
  minify: true,
  sourcemap: false,

  copy: [
    { from: 'docs/somefile', to: 'dist/' }
  ],

  devServer: {
    enable: true,
    livereload: true,
    host: 'localhost',
    port: 3000,
    cacheHeaders: false,
    keyfile: '/tmp/ssl/dev.local.key',
    certfile: '/tmp/ssl/dev.local.crt',
    cors: {
      origin: 'https://localhost'
    }
  },

  compression: true,
  compressionConfig: {
    type: 'brd',
    level: 19
  },

  csp: {
    enable: false,
    requireTrustedTypes: false,
    trustedTypes: [],
    styleSrc: [self, "https://fonts.googleapis.com"],
    fontSrc: [self, "https://fonts.gstatic.com"]
  },

  devWarnings: true,
  securityLevel: 1,
  onStart: () => { },
  onEnd: () => { },
  define: { }
}) {
  config.entryPoint = config.entryPoint || 'app/app.js';
  config.outdir = config.outdir || 'dist';

  // get basedir and appj s filename
  let entrySplit = config.entryPoint.split('/');
  if (entrySplit.length > 1) {
    config.basedir = entrySplit[0];
    entrySplit[0] = config.outdir;
  } else config.basedir = '';
  config.appJSFilename = entrySplit[entrySplit.length - 1].replace('.js', '');

  // get app css filename
  if (config.entryPointCSS) {
    let entryCSSSplit = config.entryPointCSS.split('/');
    config.appCSSFilename = entryCSSSplit[entryCSSSplit.length - 1].replace('.css', '');
  }

  config.isDev = isDev;
  config.indexHTML = config.indexHTML || path.join(config.basedir, 'index.html')
  config.minify = config.minify !== undefined ? config.minify : isDev ? false : true;
  config.sourcemap = config.sourcemap !== undefined ? config.sourcemap : isDev ? true : false;
  config.copy = config.copy || [];
  config.compression = config.compression !== undefined ? config.compression : false;
  config.compressionConfig = config.compressionConfig || { type: 'brd', level: 19 };
  config.compressionLabel = config.compressionConfig.type === 'brd' ? 'br' : 'gz';
  config.compressionExt = `.${config.compressionLabel}`;

  if (typeof config.devServer === 'object') {
    if (typeof config.devServer.enable === 'undefined') config.devServer.enable = isDev;
  } else {
    config.devServer = {
      enable: isDev,
      livereload: isDev,
      https: false,
      port: 3000
    };
  }

  config.csp = config.csp || { enable: false };
  if (config.csp?.enable && config.csp?.requireTrustedTypes) {
    config.csp.trustedTypes = config.csp.trustedTypes || [];
    config.csp.trustedTypes.push('li-html', 'materially');
  }

  config.devWarnings = config.devWarnings !== undefined ? config.devWarnings : isDev ? true : false;
  config.securityLevel = config.securityLevel === undefined ? 1 : config.securityLevel;
  if (config.securityLevel && ![0, 1, 2].includes(config.securityLevel)) {
    console.warn('Invalid security level value. You cna use [0,1,2]. Defaulting to 1');
    config.securityLevel = 1;
  }

  // create output dir
  try {
    await access(config.outdir);
  } catch {
    await mkdir(config.outdir);
  }

  await cleanOutdir(config.outdir);

  const buildPlugin = {
    name: 'build',
    setup(build) {
      // NOTE if we ever need to rebuild on index.html changes, uncomment the following
      // build.onResolve({ filter: new RegExp(`${config.entryPoint}$`) }, (args) => {
      //   return {
      //     path: path.join(args.resolveDir, args.path),
      //     watchFiles: [path.join(args.resolveDir, config.indexHTML)]
      //   };
      // });

      if (typeof config.onStart === 'function') {
        build.onStart(async () => {
          await config.onStart();
        });
      }

      build.onEnd(async (results) => {
        const appOutputs = Object.entries(results.metafile.outputs)
          .map(([filename, item]) => [item.entryPoint, filename])
          .filter(v => v[0] === config.entryPoint || v[0] === config.entryPointCSS);
        await buildRoutes(config, results.metafile.inputs, appOutputs);
        if (typeof config.onEnd === 'function') await config.onEnd(results);
      });
    }
  };

  async function getHash(path) {
    const hash = createHash('sha256');
    await pipeline(createReadStream(path), hash);
    return `sha256-${hash.digest('base64')}`;
  }

  // converts html to a function wrapped in html template tag
  const customHTMLLoader = {
    name: 'html-loader',
    setup(build) {
      build.onResolve({ filter: /\.css\?raw$/ }, (args) => {
        return {
          namespace: 'html',
          path: path.resolve(args.resolveDir, args.path)
        };
      });

      build.onLoad({ filter: /\.html$/ }, async (args) => {
        const rawContent = await readFile(args.path, 'utf8');
        // TODO more advanced minifier that will handle template expressions
        const minifiedContent = !config.minify ? rawContent : htmlMinify.minify(rawContent, {
          collapseWhitespace: true,
          minifyCSS: true,
          minifyJS: true,
          continueOnParseError: true
        });
        return {
          contents: `export default (page) => page.constructor._html\`${minifiedContent}\`;`,
          loader: 'js',
        };
      });
    },
  };

  const cssPlugin = {
    name: 'css',
    setup(build) {
      const entryPointCSSResolved = config.entryPointCSS  ? path.resolve(config.entryPointCSS) : undefined;

      // bundle css file and inline
      build.onLoad({ filter: /\.css$/ }, async args => {
        // need to use build instead of transform because transform is not resolving @imports from node modules
        const contextCss = await esbuild.build({
          entryPoints: [args.path],
          bundle: true,
          write: false,
          minify: config.minify,
          loader: { '.css': 'css' }
        });

        if (args.path === entryPointCSSResolved) {
          // build and output separate file if entryPointCSS is set
          return { contents: contextCss.outputFiles[0].text, loader: 'css' };
        } else {
          const contents = `
            const styles = new CSSStyleSheet();
            styles.replaceSync(\`${contextCss.outputFiles[0].text}\`);
            export default styles;`;

          return { contents, watchFiles: [args.path] };
        }
      });
    }
  };

  const brotliOptions = {
    params: {
      [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
      [constants.BROTLI_PARAM_QUALITY]: 8,
      [constants.BROTLI_PARAM_LGWIN]: 20
    }
  };
  const compressPlugin = {
    name: 'compress',
    setup(build) {
      build.onEnd(async result => {
        let p = performance.now();
        const files = Object.keys(result.metafile.outputs);
        let prs = [];
        for (let file of files) {
          prs.push(pipeline(
            createReadStream(file),
            createBrotliCompress(brotliOptions),
            createWriteStream(`${file}.br`)
          ));
        }
        await Promise.all(prs);
      });
    }
  }

  let entryPoints = [{ in: config.entryPoint, out: config.appJSFilename }];
  if (config.appCSSFilename) {
    entryPoints.push({ in: config.entryPointCSS, out: config.appCSSFilename });
  }

  let ctx = await esbuild.context({
    entryPoints: entryPoints,
    bundle: true,
    metafile: true,
    format: 'esm',
    outdir: config.outdir,
    minify: config.minify,
    sourcemap: config.sourcemap,
    entryNames: isDev && !config.devServer?.cacheHeaders ? '[name]' : '[name]-[hash]',
    define: config.define,
    plugins: [
      buildPlugin,
      customHTMLLoader,
      cssPlugin,
      copy({
        resolveFrom: 'cwd',
        assets: config.copy,
        watch: true
      }),
      ...(config.compression ? [compressPlugin] : []),
    ]
  });

  if (!config.devServer.enable) {
    await ctx.rebuild();
    process.exit(0);
  } else {
    await ctx.watch();

    // watch index.html
    watch(config.indexHTML, (_eventType, filename) => {
      if (filename) {
        liveReloadClients.forEach(res => {
          res.write(`event: change\n`);
          res.write(`data: ${JSON.stringify({ added: [], removed: [], updated: ['index.html'] })}\n\n`);
        });
      }
    });

    let { host, port } = await ctx.serve({
      servedir: config.outdir,
      host: config.devServer?.host,
      cors: config.devServer?.cors
    });

    const serverConfig = {
      key: config.devServer?.keyfile ? readFileSync(config.devServer?.keyfile) : undefined,
      cert: config.devServer?.certfile ? readFileSync(config.devServer?.certfile) : undefined,
    }
    const protocal = config.devServer?.https ? https : http;
    protocal.createServer(serverConfig, (req, res) => {
      let reqPath = req.url !== '/esbuild' && req.url !== '/' && req.url.split('.').length === 1 ? `/index.html` : req.url;
      if (reqPath === '/') reqPath = '/index.html';

      if (config.compression) {
        if (reqPath.endsWith('.js')) {
          reqPath += config.compressionExt;
          req.url += config.compressionExt; // Append .br so esbuild's serve serves the compressed file
          res.setHeader('Content-Encoding', config.compressionLabel);
          res.setHeader('Content-Type', 'application/javascript');
        } else if (reqPath.endsWith('.css')) {
          reqPath += config.compressionExt;
          req.url += config.compressionExt; // Append .br so esbuild's serve serves the compressed file
          res.setHeader('Content-Encoding', config.compressionLabel);
          res.setHeader('Content-Type', 'text/css; charset=utf-8');
        } else if (reqPath.endsWith('.html')) {
          reqPath += config.compressionExt;
          req.url += config.compressionExt; // Append .br so esbuild's serve serves the compressed file
          res.setHeader('Content-Encoding', config.compressionLabel);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
        }
      }

      const options = {
        host,
        port,
        path: reqPath,
        method: req.method,
        headers: req.headers
      };

      // Forward each incoming request to esbuild
      const proxyReq = http.request(options, proxyRes => {

        // If esbuild returns "not found", send a custom 404 page
        if (proxyRes.statusCode === 404) {
          res.writeHead(404, { 'Content-Type': 'text/html' });
          res.end('<h1>A custom 404 page</h1>');
          return;
        }

        // intercept sourceEvent so we can send live reload updates for index.html
        if (proxyRes.req.path === '/esbuild') {
          liveReloadClients.add(res);
          req.on('close', () => {
            liveReloadClients.delete(res);
          });
        }

        if (reqPath.endsWith(`.js${config.compressionExt}`)) {
          proxyRes.headers['Content-Encoding'] = config.compressionLabel;
          proxyRes.headers['Content-Type'] = 'application/javascript';
        } else if (reqPath.endsWith(`.css${config.compressionExt}`)) {
          proxyRes.headers['Content-Encoding'] = config.compressionLabel;
          proxyRes.headers['Content-Type'] = 'text/css; charset=utf-8';
        } else if (reqPath.endsWith(`.html${config.compressionExt}`)) {
          proxyRes.headers['Content-Encoding'] = config.compressionLabel;
          proxyRes.headers['Content-Type'] = 'text/html; charset=utf-8';
        }

        if (config.devServer?.cacheHeaders) {
          if (req.url.endsWith('.html') || req.url === '/') {
            proxyRes.headers['cache-control'] = 'no-cache, no-store, must-revalidate';
          } else {
            proxyRes.headers['cache-control'] = 'public, max-age=31536000, immutable';
          }
        }

        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      })

      // console.log(res.url, res.headers)
      // Forward the body of the request to esbuild
      req.pipe(proxyReq, { end: true });
    }).listen(config.devServer?.port || 3000, () => console.log(`dev server listening on port ${config.devServer?.port || 3000}`));
  }
}


async function cleanOutdir(dir) {
  const files = await readdir(dir);
  await Promise.all(files.map(async file => {
    const filePath = path.join(dir, file);
    if ((await stat(filePath)).isDirectory()) return cleanOutdir(filePath);
    await rm(filePath);
  }));
}
