import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { brotliCompressSync } from 'node:zlib';


const routePathParamRegex = /\/?\[(\.{3})?([^\[]+)\]/g;
const pageElementNameRegex = /customElements.define\(['"`]([^'"`]*)['"`],/;
const routeComponentAttrsRegex = /<li-route(?:\s(?<attrs>.*?))?(\s?\/)?>/gm;
const routeComponentAttrIndividualRegex = /(\w+)="(.+?)"/gm;
const stripCommentsRegex = /<!--([.\S\s]*?)-->/g
const cspMetaTagRegex = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/;


export default async function build({ basedir, outdir, entryPoint, entryPointCSS, indexHTML, devServer, devWarnings, securityLevel, compression, compressionConfig, compressionLabel, isDev, csp }, inputs, appOutputs) {
  let routeConfigs = await parseRoutes(basedir, inputs);
  let indexHTMLtemplate = await readFile(indexHTML, 'utf-8');
  let routeComponents = getRouteComponents(indexHTMLtemplate);

  indexHTMLtemplate = replaceAppTags(basedir, entryPoint, entryPointCSS, outdir, appOutputs, indexHTMLtemplate, isDev, devServer, csp);

  let routeComponentHTML = '';
  await Promise.all(routeConfigs.map(async route => {
    const pageComponent = await readFile(path.join(basedir, route.importPath), 'utf-8');
    const match = pageComponent.match(pageElementNameRegex);
    if (!match) return console.error(`Cannot find component name for route: ${path}. customElements.define('component-name', Page);`);
    const componentName = match[1];

    // already has an <li-route> component
    if (routeComponents.includes(componentName)) return;

    routeComponentHTML += `  <li-route path="${route.path}" component="${componentName}"${route.notFound ? ' notfound' : ''}></li-route>\n`;
  }));

  if (routeComponentHTML) {
    indexHTMLtemplate = indexHTMLtemplate.replace(/<body>/, `<body>\n${routeComponentHTML}`);
  }

  if (devWarnings) indexHTMLtemplate = indexHTMLtemplate.replace(/<head>/, '<head>\n  <meta name="lidevwarnings" content="true">');
  indexHTMLtemplate = indexHTMLtemplate.replace(/<head>/, `<head>\n  <meta name="lisecuritylevel" content="${securityLevel}">`);
  if (devServer.livereload) {
    indexHTMLtemplate = indexHTMLtemplate.replace(/<\/body>/, `  <script nonce="livereload">
  new EventSource('/esbuild').addEventListener('change', e => {
    const { added, removed, updated } = JSON.parse(e.data);
    if (!added.length && !removed.length && updated.length > 0) {
      const updatedFiltered = updated.filter(u => !u.endsWith('.map'));
      if (updatedFiltered.length !== 1) return;
      for (const link of document.getElementsByTagName("link")) {
        const url = new URL(link.href);
        if (url.host === location.host && url.pathname === updatedFiltered[0]) {
          const next = link.cloneNode();
          next.href = updatedFiltered[0] + '?' + Math.random().toString(36).slice(2);
          next.onload = () => link.remove();
          link.parentNode.insertBefore(next, link.nextSibling);
          return;
        }
      }
    }

    location.reload();
  });
  </script >\n</body > `);
  }

  if (compression) {
    await writeFile(path.join(outdir, `index.html.${compressionLabel}`), brotliCompressSync(indexHTMLtemplate, compressionConfig));
  }

  await writeFile(path.join(outdir, 'index.html'), indexHTMLtemplate, 'utf-8');

}


async function parseRoutes(basedir, inputs) {
  const routeStripRegex = new RegExp(`${basedir.replace(/\/$/, '')}\/routes|\/index\.js$`, 'g');

  let hasIndex = false;
  let routeConfigs = [];
  for await (const entry of glob(path.join(basedir, '/routes/**/index.js'))) {
    if (!inputs[entry]) {
      console.warn(`Page component is not imported: ${entry}`);
      continue;
    }
    const relativePath = entry.replace(routeStripRegex, '');
    let routePath = relativePath.replace(routePathParamRegex, (_str, rest, label) => {
      return `/${!!rest ? '*' : ':'}${label}`
    });
    if (routePath === '/index') {
      routePath = '/';
      hasIndex = true;
    }
    routeConfigs.push({
      importPath: `./routes${relativePath}/index.js`,
      path: routePath,
      notFound: relativePath === '/404',
    });
  }

  if (!hasIndex) console.warn('Missing index route. `routes/index/index.js`');
  return routeConfigs;
}

// Find <li-route> components that are not in comments and return their attrs (path, component)
function getRouteComponents(indexHTMLtemplate) {
  let routeComponents = [];
  const matches = indexHTMLtemplate.replace(stripCommentsRegex, '').matchAll(routeComponentAttrsRegex);
  for (const match of matches) {
    const attrMatches = match.groups.attrs.matchAll(routeComponentAttrIndividualRegex);
    let path;
    let component;
    for (const attrMatch of attrMatches) {
      if (attrMatch[1] === 'path') path = attrMatch[2];
      if (attrMatch[1] === 'component') component = attrMatch[2];
    }

    if (!path || !component) {
      console.warn('li-route component is missing attribute: requires (path, component)', match);
      continue;
    }

    routeComponents.push(component)
  }

  return routeComponents;
}

function replaceAppTags(basedir, entryPoint, entryPointCSS, outdir, appOutputs, indexHTMLtemplate, isDev, devServer, csp) {
  const originalAppJS = path.relative(basedir, entryPoint);
  const originalAppCSS = entryPointCSS ? path.relative(basedir, entryPointCSS) : undefined;
  let outputAppJSName;
  let outputAppCSSName;
  for (const item of appOutputs) {
    if (item[0] === entryPoint) {
      outputAppJSName = path.relative(outdir, item[1]);
    } else if (entryPointCSS && item[0] === entryPointCSS) {
      outputAppCSSName = path.relative(outdir, item[1]);
    }
  }

  const appScriptTagRegex = new RegExp(`\\bsrc\\s*=\\s*["']/?${originalAppJS}["']`, 'g');
  if (appScriptTagRegex.test(indexHTMLtemplate)) indexHTMLtemplate = indexHTMLtemplate.replace(appScriptTagRegex, `src="/${outputAppJSName}"`);
  else indexHTMLtemplate = indexHTMLtemplate.replace(/<\/head>/, `  <script defer type="module" src="/${outputAppJSName}"></script>\n</head>`);

  if (outputAppCSSName) {
    const appLinkTagRegex = new RegExp(`\\bhref\\s*=\\s*["']/?${originalAppCSS}["']`, 'g');
    if (appLinkTagRegex.test(indexHTMLtemplate)) indexHTMLtemplate = indexHTMLtemplate.replace(appLinkTagRegex, `href="/${outputAppCSSName}"`);
    else indexHTMLtemplate = indexHTMLtemplate.replace(/<\/head>/, `  <link rel="stylesheet" href="/?${outputAppCSSName}">\n</head>`);


    // make sure we are not preloading css so we can hot swap
    if (devServer?.enable && devServer?.livereload) {
      const appLinkTagRegexs = new RegExp(`<link(?=\\s)(?!(?:[^>]*?\\s)?rel=(?!["']?preload["']))(?!(?:[^>]*?\\s)?href=(?!["']?\\/?${outputAppCSSName}["']))[^>]*>`, 'g');
      indexHTMLtemplate = indexHTMLtemplate.replace(appLinkTagRegexs, str => {
        return str.replace('preload', 'stylesheet');
      });
    }
  }

  if (csp?.enable) {
    const cspContent = `
      ${!csp.requireTrustedTypes ? '' : `
        require-trusted-types-for 'script';
        trusted-types ${csp.trustedTypes?.join(' ')};
      `}
      default-src 'self';
      script-src 'self' ${isDev && devServer?.enable && devServer?.livereload ? `'nonce-livereload'` : ''};
      style-src 'self' 'unsafe-inline' ${(csp?.styleSrc || []).join(' ')};
      ${(csp?.fontSrc?.length || 0) > 0 ? `font-src ${(csp?.fontSrc || []).join(' ')};` : ''}
    `.replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ");
    if (!cspMetaTagRegex.test(indexHTMLtemplate)) indexHTMLtemplate = indexHTMLtemplate.replace(/<\/head>/, `  <meta http-equiv="Content-Security-Policy" content="${cspContent}">\n</head>`);
  }

  return indexHTMLtemplate;
}
