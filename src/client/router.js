const excludeLinkRegex = /^mailto:|^tel:|^sms:|:\/\//;
let routes = new Map();
let pathLookup = [];
let notFoundPage;
let pageContainer;

const spaceRegex = /\s/g;
const containsVariableOrWildcardRegex = /\/:|\*/g;
const searchRegexString = '(\\?([^#]*))?';
const hashRegexString = '(#(.*))?';
const followedBySlashRegexString = '(?:\/$|$)';
const routeRegexReplaceRegex = /\/(\*|:)?([^\/\?]+)(\?)?/g;
const template = document.createElement('template');


document.documentElement.scrollTop = 0;

export function register(path, component, notFound) {
  if (routes.has(path)) throw Error('exists');

  routes.set(path, component);
  const regex = buildPathRegex(path);
  pathLookup.push([regex, path]);
  if (notFound) notFoundPage = [regex, component];
  if (!pageContainer) pageContainer = document.querySelector('#page-content');
  if (regex.test(location.pathname)) navigate(component, regex, location, undefined, undefined, true);
}



function route(locationObject, back) {
  let matchKey = pathLookup.find(v => v[0].test(locationObject.pathname));
  if (!matchKey) matchKey = notFoundPage;
  if (!matchKey) console.warn(`No page found for path: ${locationObject.pathname}`);
  const match = routes.get(matchKey[1]);
  const currentPage = pageContainer.firstElementChild;
  const samePage = currentPage?.nodeName.toLowerCase() === match;

  if (samePage) {
    const hashMatches = locationObject.hash === location.hash;
    const searchMatches = locationObject.search === location.search;
    if (hashMatches && searchMatches) return;
    // TODO remove when using navigation api
    if (!back) window.history.pushState({}, currentPage.constructor.title, `${locationObject.pathname}${locationObject.search}${locationObject.hash}`);
    if (!hashMatches) window.dispatchEvent(new Event('hashchange'));
    return;
  }

  navigate(match, matchKey[0], locationObject, currentPage, back);
}

async function navigate(component, pathRegex, locationObject, current, back, initial) {;
  if (!initial && !back) {
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  }

  if (current) current.remove();
  template.innerHTML = `<${component}>`;
  const page = template.content.cloneNode(true).firstElementChild;
  page._pathRegex = pathRegex;
  if (!back && !initial) window.history.pushState({}, page.constructor.title, `${locationObject.pathname}${locationObject.search}${locationObject.hash}`);
  pageContainer.appendChild(page);
  window.page = page;
  await customElements.whenDefined(component);
  page.render();

  queueMicrotask(() => {
    if (!initial) window.dispatchEvent(new Event('locationchange'));
    else window.dispatchEvent(new Event('locationchangeinitial'));
  });
}

function buildPathRegex(path) {
  let regexString;

  // if no parameters found in path then use standard regex
  if (path.match(containsVariableOrWildcardRegex) === null) {
    // Do not allow hashes on root or and hash links
    if (path.trim() === '/' || path.includes('#')) regexString = `^${path}$`;
    regexString = `^${path}${searchRegexString}${hashRegexString}$`;

    // parse parameters in path
  } else {
    regexString = `^${path.replace(routeRegexReplaceRegex, (_str, prefix, label, optional = '') => {
      if (prefix === '*') return `\/(?<${label}>.+)${optional}`;
      if (prefix === ':') return `\/(?<${label}>[^\/]+)${optional}`;
      return `\/${label}`;
    })}${followedBySlashRegexString}`;
  }

  return new RegExp(regexString.replace(spaceRegex, '(?:[\\s-]|%20)'));
}


/** Makes navigation localized for SPA */
export function enableSPA() {
  document.addEventListener('click', event => {
    if (!event.target.matches('[href]')) return;
    const href = event.target.getAttribute('href');
    if (excludeLinkRegex.test(href)) return;
    event.preventDefault();
    const newRoute = !event.target.href ? location.origin + href : event.target.href;
    route(new URL(newRoute));
  }, false);

  let popPrevented = false;
  window.addEventListener('popstate', event => {
    if (popPrevented) return popPrevented = false; // used in preventing back navigation
    const beforeUnloadEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnloadEvent);
    if (beforeUnloadEvent.defaultPrevented && !confirm('Changes you made may not be saved.')) {
      popPrevented = true;
      history.go(1);
    } else route(new URL(event.currentTarget.location), true);
  });
}
enableSPA();
