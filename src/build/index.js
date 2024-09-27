import esbuild from 'esbuild';
import path from 'node:path';
// package is broken on m1 mac currently and the other options have to many sub dependencies
// import minifyHtml from '@minify-html/node';
// import { Buffer } from 'node:buffer';
import { access, readFile, readdir, stat, rm, writeFile, mkdir } from 'node:fs/promises';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import devServer from './dev-server.js';
import routeParser from './route-parser.js';
import parseHTMLString from './dom.js';
import copyFiles from './copy-files.js';

const asyncGzip = promisify(gzip);
const isDev = process.env.NODE_ENV !== 'production';

/**
 * Build application
 * @param {Object} config
 * @param {Boolean} config.spa Enable spa routing. Default: true
 * @param {String} config.basedir App root directory. Default: 'app/'
 * @param {String} config.outdir App bundle directory. Default: 'dist/'
 * @param {Boolean} config.chunks Chunk app per page. Default: true
 * @param {Boolean} config.minify Minify bundle. Default: true
 * @param {Boolean} config.sourcemaps Include sourcemaps. Default: false
 * @param {Boolean} config.gzip Compress bundle. Default: true
 * @param {Boolean} config.devServer Enable dev server. Default: true
 * @param {Number} config.devServerPort Dev server port. Default: 3000
 * @param {Boolean} config.devServerLivereload Enable live reload. Default: true
 * @param {Boolean} config.devWarnings Enable console warning (only html sanitization currently). Default: false
 * @param {Number} config.securityLevel Change html template security level for warnings. Values: 0,1,2 - Default: 1
 * @param {Object[]} config.copyFiles Copy file config
 * @param {String} config.copyFiles[].from Location of file
 * @param {String} config.copyFiles[].to Destination for file
 * @param {Function} config.copyFiles[].transform Transform function
 * @returns {Object} Build data
 */
export default async function build(config = {
  spa: true,
  basedir: 'app/',
  outdir: 'dist/',
  chunks: true,
  minify: true,
  keepHTMLComments: false,
  sourcemaps: false,
  gzip: true,
  devServer: true,
  devServerPort: 3000,
  devServerLivereload: true,
  devWarnings: false,
  securityLevel: 1,
  copyFiles: [{
    from: '',
    to: '',
    transform: ({
      content,
      outputFileNames
    }) => { },
    gzip: false
  }],
  onStart: () => { },
  onEnd: () => { }
}) {
  if (isDev) {
    if (config.sourcemaps === undefined) config.sourcemaps = true;
    if (config.devServer !== false && config.devServerLivereload !== false) config.liveReloadScript = liveReloadScript;
    config.debugScript = debugScript(config.devWarnings);
    config.keepHTMLComments = config.keepHTMLComments === false ? false : true;
    if (config.keepHTMLComments !== false) config.liveReloadScript = liveReloadScript;
  } else {
    if (config.gzip === undefined) config.gzip = true;
    if (config.minify === undefined) config.minify = true;
    if (config.gzip === undefined) config.gzip = true;
    config.keepHTMLComments = config.keepHTMLComments === true ? true : false;
  }

  // create output dir
  try {
    await access(config.outdir);
  } catch {
    await mkdir(config.outdir);
  }

  if (config.securityLevel && ![0, 1, 2].includes(config.securityLevel)) {
    console.warn('Invalid security level value. You cna use [0,1,2]. Defaulting to 1');
    config.securityLevel = 1;
  }

  if (config.onStart) await config.onStart();
  await cleanOutdir(config.outdir);
  config.isDev = isDev;
  config.appJsPath = path.join(config.basedir, '/app.js');
  config.indexHTMLPath = path.join(config.basedir, '/index.html');
  const appCSSPath = path.join(config.basedir, '/app.css');
  const hasAppCSS = await access(appCSSPath).then(e => true).catch(e => false);
  config.routes = await routeParser(config);
  const entryPoints = [config.appJsPath];
  // add entry points for each page
  if (config.chunks) entryPoints.push(...config.routes.routesConfig.map(v => v.filePath));
  const { metafile } = await esbuild.build({
    entryPoints,
    bundle: true,
    outdir: config.outdir,
    metafile: true,
    entryNames: '[name]-[hash]',
    format: 'esm',
    plugins: [pluginHTML(config), pluginCss(config.minify), injectCode(config)],
    minify: config.minify,
    splitting: config.chunks,
    sourcemap: config.sourcemap
  });
  
  const appCSSContext = !hasAppCSS ? undefined : await esbuild.build({
    entryPoints: [appCSSPath],
    bundle: true,
    outdir: config.outdir,
    metafile: true,
    entryNames: '[name]-[hash]',
    minify: config.minify
  });
  
  const {
    routeConfigs,
    outputs,
    appJSOutput,
    appCSSOutput
  } = buildOutputs(metafile.outputs, appCSSContext?.metafile.outputs, config);
  const indexHTMLFiles = await buildIndexHTML(appJSOutput, appCSSOutput, routeConfigs, config);
  const copiedFiles = await copyFiles(config.copyFiles, outputs);
  if (config.gzip) await gzipFiles(outputs.concat(indexHTMLFiles));
  if (config.onEnd) await config.onEnd();

  const returnData = {
    outdir: config.outdir,
    routes: routeConfigs.map(v => ({
      route: v.routePath,
      regex: v.regex,
      filePath: v.indexHTMLFileName,
      fileName: v.indexHTMLFileName.split('/').pop(),
      notFound: v.notFound,
      hash: v.hash
    })),
    files: outputs
      .map(v => ({
        filePath: v.output,
        fileName: v.output.split('/').pop()
      })).concat(...copiedFiles),
    gzip: config.gzip
  };

  if (isDev && config.devServer !== false) devServer(returnData, config.devServerPort);
  return returnData;
}


async function buildIndexHTML(appJSOutput, appCSSOutput, routeConfigs, config) {
  const appScriptPath = `/${appJSOutput.output.split('/').pop()}`;
  const appCssPath = appCSSOutput && `/${appCSSOutput.output.split('/').pop()}`;
  let indexFile = await readFile(config.indexHTMLPath, 'utf-8');

  const appScriptPreload = `\n  <link rel="modulepreload" href="${appScriptPath}"/>\n`;
  const appImportChunks = appJSOutput.imports.map(v => v.path.split('/').pop()).filter(v => v.startsWith('chunk-'));
  const appScriptTag = `<script src="${appScriptPath}" type="module" defer></script>`;
  const appCssPreloadTag = !appCssPath ? '' : `  <link rel="preload" href="${appCssPath}" as="style">\n`;
  const appCssTag = !appCssPath ? '' : `<link rel="stylesheet" href="${appCssPath}">`;
  
  // add mock dome so we can load the app script and render templates
  parseHTMLString(indexFile);
  const head = document.querySelector('head');
  head.insertAdjacentHTML('afterbegin', appScriptPreload + appCssPreloadTag);

  const appScriptElement = document.querySelector('script[src="app.js"]') || document.querySelector('script[src="/app.js"]') || document.querySelector('script[src="./app.js"]');
  if (appScriptElement) {
    appScriptElement.src = appScriptPath;
    appScriptElement.type = 'module';
    appScriptElement.defer = true;
  } else {
    head.insertAdjacentHTML('beforeend', appScriptTag);
  }
  head.insertAdjacentHTML('beforeend', `${config.liveReloadScript || ''}${isDev ? `\n${config.debugScript}` : ''}`);

  if (appCssPath) {
    const appStyleElement = document.querySelector('link[href="app.css"]') || document.querySelector('link[href="/app.css"]') || document.querySelector('link[href="./app.css"]');
    if (appStyleElement) {
      appStyleElement.href = appCssPath;
    } else {
      head.insertAdjacentHTML('beforeend', appCssTag);
    }
  }

  // used to prevent router code from running
  window.__isBuilding = true;
  // load script so we can grab templates
  await import(path.resolve('.', appJSOutput.output));

  // render template and build index html file for each page
  const data = await Promise.all(routeConfigs.map(async route => {
    // load page to build template
    let routeModule = window.litheRoutes.find(v => v.path === route.routePath).component;
    if (config.chunks) routeModule = (await routeModule).default;
    customElements.define(`page-${route.hash}`, routeModule);
    routeModule._isPage = true;
    routeModule._isBuild = true;
    const instance = new routeModule();
    instance.render();

    // prepare module preload links
    const pageScriptPreload = route.routeScriptPath && route.routeScriptPath !== appScriptPath ? `\n  <link page rel="modulepreload" href="${route.routeScriptPath}" />` : '';
    const pageImportChunks = [...new Set(appImportChunks.concat(
      route.imports.map(v => v.path.split('/').pop()).filter(v => v.startsWith('chunk-'))
    ))].map(v => `\n  <link rel="modulepreload" href="/${v}" />`).join('');

    const title = document.querySelector('title');
    if (title) title.textContent = routeModule.title;
    const previousPageReloads = document.querySelectorAll('link[page]');
    for (const p of previousPageReloads) {
      p.remove();
    }

    const head = document.querySelector('head');
    head.insertAdjacentHTML('afterbegin', `${pageScriptPreload}${pageImportChunks}`);
    const content = `<!doctype html>\n${document.documentElement.outerHTML}`;
    document.querySelector('#page-content').innerHTML = '';

    return {
      fileName: route.indexHTMLFileName,
      content
    };
  }));

  await Promise.all(data.map(async v => writeFile(v.fileName, v.content)));
  return data.map(v => ({ output: v.fileName }));
}


// build information for writing outputs and building page index html files
function buildOutputs(appOutputs, appCSSOutputs, config) {
  const outputs = Object.keys(appOutputs).map(key => ({
    output: key,
    ...appOutputs[key]
  }));

  let appCSSOutput;
  if (appCSSOutputs) {
    appCSSOutput = Object.keys(appCSSOutputs).map(key => ({
      output: key,
      ...appCSSOutputs[key]
    }))[0];
    outputs.push(appCSSOutput)
  }

  const routeConfigs = config.routes.routesConfig.map(route => {
    const moduleOutput = !config.chunks ? outputs.find(v => v.entryPoint === config.appJsPath) : outputs.find(b => b.entryPoint === route.filePath);
    return {
      ...route,
      output: moduleOutput.output,
      imports: moduleOutput.imports,
      htmlImports: Object.keys(moduleOutput.inputs).filter(v => v.endsWith('html')),
      routeScriptPath: `/${moduleOutput.output.split('/').pop()}`
    };
  });

  return {
    routeConfigs,
    outputs,
    appJSOutput: outputs.find(v => v.entryPoint === config.appJsPath),
    appCSSOutput
  };
}



async function cleanOutdir(dir) {
  const files = await readdir(dir);
  await Promise.all(files.map(async file => {
    const filePath = path.join(dir, file);
    if ((await stat(filePath)).isDirectory()) return cleanOutdir(filePath);
    await rm(filePath);
  }));
}

async function gzipFiles(outputFiles) {
  await Promise.all(outputFiles.map(async item => {
    // some files are only temporarily used to build then deleted
    const exists = await access(item.output).then(() => true).catch(() => false);
    if (!exists) return;

    try {
      let content = await readFile(item.output);
      const result = await asyncGzip(content);
      await writeFile(item.output, result);
    } catch (e) {
      console.log('error', item, e)
    }
  }));
}

const routesImportRegex = /routes[^@]+@webformula\/core(?:'|");/;
function injectCode(config) {
  return {
    name: 'injectCode',
    setup(build) {
      // inject route config to app.js
      build.onLoad({ filter: /app\.js/ }, async args => {
        let contents = await readFile(args.path, 'utf-8');
        if (contents.match(routesImportRegex) === null) {
          contents = `import { setSecurityLevel, routes, enableSPA } from \'@thewebformula/lithe\';\nenableSPA();\nsetSecurityLevel(${config.securityLevel === undefined ? 1 : config.securityLevel});\n${config.routes.routesCode}\n${contents}`;
        }
        return { contents };
      });
    }
  }
};

function pluginHTML(config) {
  return {
    name: 'html',
    setup(build) {
      build.onLoad({ filter: /\.html$/ }, async args => {
        let contents = await readFile(args.path, 'utf-8');
        // package is broken on m1 mac currently and the other options have to many sub dependencies
        // if (config.minify) {
        //   try {
        //     contents = minifyHtml.minify(Buffer.from('`' + contents.trim() + '`'), {
        //       ensure_spec_compliant_unquoted_attribute_values: true,
        //       keep_spaces_between_attributes: true,
        //       keep_comments: config.keepHTMLComments
        //     }).toString().slice(1, -1)
        //   } catch (e) { }
        // }
        return {
          contents: contents.trim(),
          loader: 'text'
        };
      });
    }
  };
}

function pluginCss(minify) {
  return {
    name: 'css',
    setup(build) {
      // bundle css file and inline
      build.onLoad({ filter: /\.css$/ }, async args => {
        // need to use build instead of transform because transform is not resolving @imports from node modules
        const contextCss = await esbuild.build({
          entryPoints: [args.path],
          bundle: true,
          write: false,
          minify,
          loader: { '.css': 'css' }
        });
        const contents = `
          const styles = new CSSStyleSheet();
          styles.replaceSync(\`${contextCss.outputFiles[0].text}\`);
          export default styles;`;
        return { contents };
      });
    }
  };
}


const debugScript = (devWarnings) => `
<script>
  window.litheDev = ${devWarnings === true ? 'true;' : 'false;'}
  console.warn('Lithe: Debug mode');

  window.getPageTemplate = () => {
    console.log(window.page.getTemplate());
  }

  window.getRoutes = () => {
    console.log(window.litheRoutes);
  }
</script>`;
const liveReloadScript = `
  <script>
    let isReconnecting = false;
    const es = new EventSource('/livereload');
    es.addEventListener('error', () => { isReconnecting = true; });
    es.addEventListener('open', () => {
      if (isReconnecting) {
        isReconnecting = false;
        location.reload();
      }
    })
  </script>`;
