import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';


const routePathParamRegex = /\/?\[(\.{3})?([^\[]+)\]/g;
const pageElementNameRegex = /customElements.define\(['"`]([^'"`]*)['"`],/;
const routeComponentAttrsRegex = /<li-route(?:\s(?<attrs>.*?))?(\s?\/)?>/gm;
const routeComponentAttrIndividualRegex = /(\w+)="(.+?)"/gm;
const stripCommentsRegex = /<!--([.\S\s]*?)-->/g


export default async function build({ basedir, outdir, entryPoints, indexHTML, devServerLivereload, devWarnings, securityLevel }, inputs, appOutput) {  
  let routeConfigs = await parseRoutes(basedir, inputs);
  let indexHTMLtemplate = await readFile(indexHTML, 'utf-8');
  let routeComponents = getRouteComponents(indexHTMLtemplate);
  indexHTMLtemplate = replaceAppJSScriptTag(basedir, entryPoints, outdir, appOutput, indexHTMLtemplate);

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
  if (securityLevel) indexHTMLtemplate = indexHTMLtemplate.replace(/<head>/, `<head>\n  <meta name="lisecuritylevel" content="${securityLevel}">`);
  if (devServerLivereload) {
    indexHTMLtemplate = indexHTMLtemplate.replace(/<\/body>/, "  <script>new EventSource('/esbuild').addEventListener('change', () => location.reload())</script>\n</body>");
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

function replaceAppJSScriptTag(basedir, entryPoints, outdir, appOutput, indexHTMLtemplate) {
  const originalAppJS = path.relative(basedir, entryPoints);
  const outputAppJSName = path.relative(outdir, appOutput);
  const outputAppJSScriptTag = `<script type="module" src="/${outputAppJSName}"></script>`;
  const appScriptTagRegex = new RegExp(`<script[\\s\\S]*src="/${originalAppJS}"[^>]*>\\s*</script>`);
  if (appScriptTagRegex.test(indexHTMLtemplate)) indexHTMLtemplate = indexHTMLtemplate.replace(appScriptTagRegex, outputAppJSScriptTag);
  else indexHTMLtemplate = indexHTMLtemplate.replace(/<\/head>/, `  ${outputAppJSScriptTag}\n</head>`);
  return indexHTMLtemplate;
}
