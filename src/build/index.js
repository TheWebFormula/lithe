import * as esbuild from 'esbuild';
import { copy } from 'esbuild-plugin-copy';
import http from 'node:http';
import path from 'node:path';
import { readdir, stat, rm, access, mkdir } from 'node:fs/promises';
import buildRoutes from './buildRoutes.js';



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
  devServer: true,
  devServerPort: 3000,
  devServerLivereload: true,
  devWarnings: true,
  securityLevel: 1,
  onStart: () => { },
  onEnd: () => { },
  define: {}
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

  config.indexHTML = config.indexHTML || path.join(config.basedir, 'index.html')
  config.minify = config.minify !== undefined ? config.minify : isDev ? false : true;
  config.sourcemap = config.sourcemap !== undefined ? config.sourcemap : isDev ? true : false;
  config.copy = config.copy || [];
  config.devServer = config.devServer !== undefined ? config.devServer : isDev ? true : false;
  config.devServerPort = config.devServerPort || 3000;
  config.devServerLivereload = config.devServerLivereload !== undefined ? config.devServerLivereload : isDev ? true : false;
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
          return { contents };
        }
      });
    }
  };

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
    entryNames: isDev ? '[name]' : '[name]-[hash]',
    loader: {
      '.html': 'text'
    },
    define: config.define,
    plugins: [
      buildPlugin,
      cssPlugin,
      copy({
        resolveFrom: 'cwd',
        assets: config.copy,
        watch: true
      })
    ]
  });

  if (!config.devServer) {
    await ctx.rebuild();
    process.exit(0);
  } else {
    await ctx.watch();
    let { host, port } = await ctx.serve({
      servedir: config.outdir,
    });

    http.createServer((req, res) => {
      let path = req.url !== '/esbuild' && req.url !== '/' && req.url.split('.').length === 1 ? `/index.html` : req.url;
      // path = path.replace('%20', '-');
      const options = {
        host,
        port,
        path,
        method: req.method,
        headers: req.headers,
      };

      // Forward each incoming request to esbuild
      const proxyReq = http.request(options, proxyRes => {
        // If esbuild returns "not found", send a custom 404 page
        if (proxyRes.statusCode === 404) {
          res.writeHead(404, { 'Content-Type': 'text/html' })
          res.end('<h1>A custom 404 page</h1>')
          return
        }

        // Otherwise, forward the response from esbuild to the client
        res.writeHead(proxyRes.statusCode, proxyRes.headers)
        proxyRes.pipe(res, { end: true })
      })

      // Forward the body of the request to esbuild
      req.pipe(proxyReq, { end: true })
    }).listen(config.devServerPort)
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
