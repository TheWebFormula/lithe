import { runTransition } from './viewTransitions.js';

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
let routeId = 0;
let currentPathRegex;


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

export function getSearchParameters() {
  return Object.fromEntries([...new URLSearchParams(location.search).entries()]);
}

export function getUrlParameters() {
  return !currentPathRegex ? {} : location.pathname.match(currentPathRegex)?.groups || {};
}



function route(locationObject, back, target) {
  let matchKey = pathLookup.find(v => v[0].test(locationObject.pathname));
  if (!matchKey) matchKey = notFoundPage;
  if (!matchKey) console.warn(`No page found for path: ${locationObject.pathname}`);
  const match = routes.get(matchKey[1]);
  const currentPage = pageContainer.firstElementChild;
  const samePage = currentPage?.nodeName.toLowerCase() === match;
  if (samePage) {
    const hashMatches = locationObject.hash === location.hash;
    const searchMatches = locationObject.search === location.search;
    const pathMatch = locationObject.pathname === location.pathname;

    if (!hashMatches || !searchMatches || !pathMatch) {
      // TODO remove when using navigation api
      if (!back) window.history.pushState({}, currentPage.constructor.title, `${locationObject.pathname}${locationObject.search}${locationObject.hash}`);
      if (!hashMatches) window.dispatchEvent(new Event('hashchange'));
    }
    currentPage.urlChange();
    return;
  }

  runTransition({
    newContainer: pageContainer,
    oldContainer: target,
    back,
    routeId: window.history.state?.id
  }, () => {
    navigate(match, matchKey[0], locationObject, currentPage, back);
  });
}

async function navigate(component, pathRegex, locationObject, current, back, initial, target) {;
  if (!pageContainer) {
    throw Error('No page container found. Make sure to add an element with the id "page-content" to your HTML');
  }

  currentPathRegex = pathRegex;
  if (!initial && !back) {
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  }

  if (current) current.remove();

  // add page component to dom
  template.innerHTML = `<${component}>`;
  const page = template.content.cloneNode(true).firstElementChild;
  pageContainer.appendChild(page);

  // wait for component to be defined then configure it as a page
  await customElements.whenDefined(component);
  page.constructor._isPage = true;

  if (!back && !initial) window.history.pushState({ id: routeId++ }, page.constructor.title, `${locationObject.pathname}${locationObject.search}${locationObject.hash}`);
  
  // set page title
  const title = document.documentElement.querySelector('title');
  title.textContent = page.constructor.title;

  // make page class globally available and render
  window.page = page;
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
      if (prefix === ':') return `\/?(?<${label}>[^\/]+)${optional}`;
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
    route(new URL(newRoute), false, event.target);
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
