import path from 'node:path';
import { readdir, stat } from 'node:fs/promises';

const spaceRegex = /\s/g;
const containsVariableOrWildcardRegex = /\/:|\*/g;
const searchRegexString = '(\\?([^#]*))?';
const hashRegexString = '(#(.*))?';
const followedBySlashRegexString = '(?:\/$|$)';
const routeToNameRegex = /\/|\.|\s|\[|\]|\?/g;
const routePathParamRegex = /\/?\[(\.{3})?([^\[]+)\]/g;
const routeRegexReplaceRegex = /\/(\*|:)?([^\/\?]+)(\?)?/g;

export default async function getRoutes(config) {
  const routeStripper = new RegExp(`${config.basedir}routes|\/index\.js$`, 'g');
  const routePaths = await getRoutePaths(config.basedir, path.join(config.basedir, 'routes'));
  
  let hasIndex = false;
  const routes = routePaths.map(filePath => {
    const relativePath = filePath.replace(routeStripper, '');

    // convert parameters. [id] -> :id, [...rest] -> *rest
    let routePath = relativePath.replace(routePathParamRegex, (_str, rest, label) => {
      return `/${!!rest ? '*' : ':'}${label}`
    });

    if (routePath === '/index') {
      routePath = '/';
      hasIndex = true;
    }

    // convert path to filename for page index html
    const indexHTMLFileName = routePath === '/' ? path.join(config.outdir, 'index.html') : path.join(config.outdir, `${routePath.replace(spaceRegex, '-').replace(routeToNameRegex, '')}.html`);
    return {
      filePath,
      importPath: `./routes${relativePath}/index.js`,
      routePath,
      indexHTMLFileName,
      regex: buildPathRegex(routePath),
      routeModuleName: `routeModule_${relativePath.replace(routeToNameRegex, '')}`,
      notFound: relativePath === '/404',
      hash: generateHash(routePath)
    };
  });

  if (!hasIndex) console.warn('Missing index route. `routes/index/index.js`');
  return {
    routesCode: generateRouteCode(routes, config),
    routesConfig: routes
  };
}

function generateHash(str) {
  return str.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
}

// find all paths to index.js. This is the page class file
// TODO node glob
async function getRoutePaths(basedir, dir, arr = []) {
  const files = await readdir(dir);
  await Promise.all(files.map(async file => {
    const filePath = path.join(dir, file);
    if ((await stat(filePath)).isDirectory()) return getRoutePaths(basedir, filePath, arr);
    if (filePath.endsWith('index.js')) arr.push(filePath);
  }));
  return arr;
}

function buildPathRegex(route) {
  let regexString;

  // if no parameters found in path then use standard regex
  if (route.match(containsVariableOrWildcardRegex) === null) {
    // Do not allow hashes on root or and hash links
    if (route.trim() === '/' || route.includes('#')) regexString = `^${route}$`;
    regexString = `^${route}${searchRegexString}${hashRegexString}$`;

    // parse parameters in path
  } else {
    regexString = `^${route.replace(routeRegexReplaceRegex, (_str, prefix, label, optional = '') => {
      if (prefix === '*') return `\/(?<${label}>.+)${optional}`;
      if (prefix === ':') return `\/(?<${label}>[^\/]+)${optional}`;
      return `\/${label}`;
    })}${followedBySlashRegexString}`;
  }

  return new RegExp(regexString.replace(spaceRegex, '(?:[\\s-]|%20)'));
}

// generate code to inject for routes
function generateRouteCode(routes, config) {
  return `
${routes.map(route => `const ${route.routeModuleName} = import('${route.importPath}');`).join('\n')}

routes([
  ${routes.map(route => `{
    path: '${route.routePath}',
    regex: ${route.regex},
    hash: ${route.hash},
    component: ${route.routeModuleName}${!route.notFound ? '' : `,
    notFound: true`}
  }`)}
]);${!config.isDev ? '' : `\n\nwindow.litheRoutes = [${routes.map(route => `{
  path: '${route.routePath}',
  regex: ${route.regex},
  hash: ${route.hash},
  component: ${route.routeModuleName}${!route.notFound ? '' : `,
  notFound: true`}
}`)}];`}`;
}
