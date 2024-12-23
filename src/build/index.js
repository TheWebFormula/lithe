import * as esbuild from 'esbuild';
import { copy } from 'esbuild-plugin-copy';
import http from 'node:http';
import path from 'node:path';
import { readdir, stat, rm } from 'node:fs/promises';
import buildRoutes from './buildRoutes.js';

// TODO handle app.css existence checking and index.html injection

const isDev = process.env.NODE_ENV !== 'production';
export default async function build(config = {
  basedir: 'app',
  entryPoint: 'app.js',
  entryPointCSS: 'app.css',
  indexHTML: 'index.html',
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
  onEnd: () => { }
}) {
  config.basedir = config.basedir || 'app';
  config.entryPoint = path.join(config.basedir, config.entryPoint || 'app.js');
  config.entryPointCSS = path.join(config.basedir, config.entryPointCSS || 'app.css');
  config.indexHTML = path.join(config.basedir, config.indexHTML || 'index.html');
  config.outdir = config.outdir || 'dist';
  config.minify = config.minify !== undefined ? config.minify : isDev ? false : true;
  config.sourcemap = config.sourcemap !== undefined ? config.sourcemap : isDev ? true : false;
  config.copy = config.copy || [];
  config.devServer = config.devServer !== undefined ? config.devServer : isDev ? true : false;
  config.devServerPort = config.devServerPort || 3000;
  config.devServerLivereload = config.devServerLivereload !== undefined ? config.devServerLivereload : isDev ? true : false;
  config.devWarnings = config.devWarnings !== undefined ? config.devWarnings : isDev ? true : false;

  config.securityLevel = config.securityLevel || 1;
  if (config.securityLevel && ![0, 1, 2].includes(config.securityLevel)) {
    console.warn('Invalid security level value. You cna use [0,1,2]. Defaulting to 1');
    config.securityLevel = 1;
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
        const appOutput = Object.entries(results.metafile.outputs).map(([filename, item]) => [item.entryPoint, filename]).find(v => v[0] === config.entryPoint);
        await buildRoutes(config, results.metafile.inputs, appOutput[1]);
        if (typeof config.onEnd === 'function')  await config.onEnd();
      });
    }
  };

  const cssPlugin = !config.entryPointCSS ? undefined : {
    name: 'css',
    setup(build) {
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
        let contents;
        if (args.path.endsWith(config.entryPointCSS)) contents = `
          const styles = new CSSStyleSheet();
          styles.replaceSync(\`${contextCss.outputFiles[0].text}\`);
          document.adoptedStyleSheets = [...document.adoptedStyleSheets, styles];`;
        else contents = `
          const styles = new CSSStyleSheet();
          styles.replaceSync(\`${contextCss.outputFiles[0].text}\`);
          export default styles;`;
        return { contents };
      });
    }
  };

  let ctx = await esbuild.context({
    entryPoints: [config.entryPoint],
    bundle: true,
    metafile: true,
    outdir: config.outdir,
    minify: config.minify,
    sourcemap: config.sourcemap,
    entryNames: isDev ? '[name]' : '[name]-[hash]',
    loader: {
      '.html': 'text'
    },
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


// let ctx = await esbuild.context({
//   entryPoint: ['docs/app.js'],
//   bundle: true,
//   outdir: 'dist',
//   sourcemap: true,
//   loader: {
//     '.html': 'text'
//   },
//   plugins: [
//     pluginCss(false),
//     {
//       name: 'buildIndexes',
//       setup() {
//         buildRoutes();
//       }
//     },
//     copy({
//       resolveFrom: 'cwd',
//       assets: [
//         { from: 'docs/_headers', to: 'dist/' },
//         { from: 'docs/robots.txt', to: 'dist/' },
//         { from: 'docs/sitemap.xml', to: 'dist/' },
//         { from: 'docs/favicon.ico', to: 'dist/' },
//         { from: 'docs/icons/*', to: 'dist/icons/' },
//         { from: 'docs/manifest.json', to: 'dist/' },
//         { from: 'docs/highlight-11.10.0.js', to: 'dist/' }
//       ],
//       watch: true
//     })
//   ]
// });

// await ctx.watch();

// let { host, port } = await ctx.serve({
//   servedir: 'dist'
// });

// http.createServer((req, res) => {
//   const options = {
//     host,
//     port,
//     path: req.url !== '/esbuild' && req.url !== '/' && req.url.split('.').length === 1 ? `${req.url}.html` : req.url,
//     method: req.method,
//     headers: req.headers,
//   }

//   // Forward each incoming request to esbuild
//   const proxyReq = http.request(options, proxyRes => {
//     // If esbuild returns "not found", send a custom 404 page
//     if (proxyRes.statusCode === 404) {
//       res.writeHead(404, { 'Content-Type': 'text/html' })
//       res.end('<h1>A custom 404 page</h1>')
//       return
//     }

//     // Otherwise, forward the response from esbuild to the client
//     res.writeHead(proxyRes.statusCode, proxyRes.headers)
//     proxyRes.pipe(res, { end: true })
//   })

//   // Forward the body of the request to esbuild
//   req.pipe(proxyReq, { end: true })
// }).listen(3000)

// function pluginCss(minify) {
//   return {
//     name: 'css',
//     setup(build) {
//       // bundle css file and inline
//       build.onLoad({ filter: /\.css$/ }, async args => {
//         // need to use build instead of transform because transform is not resolving @imports from node modules
//         const contextCss = await esbuild.build({
//           entryPoint: [args.path],
//           bundle: true,
//           write: false,
//           minify,
//           loader: { '.css': 'css' }
//         });
//         let contents;
//         if (args.path.endsWith('docs/app.css')) contents = `
//           const styles = new CSSStyleSheet();
//           styles.replaceSync(\`${contextCss.outputFiles[0].text}\`);
//           document.adoptedStyleSheets = [...document.adoptedStyleSheets, styles];`;
//         else contents = `
//           const styles = new CSSStyleSheet();
//           styles.replaceSync(\`${contextCss.outputFiles[0].text}\`);
//           export default styles;`;
//         return { contents };
//       });
//     }
//   };
// }
