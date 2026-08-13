import { runTransition } from './viewTransitions.js';
import { policyHTML } from './policy.js';
import { manual } from 'prismjs';


// TODO fix runTransitions


let routes = new Map();
let pathLookup = [];
let notFoundPage;
let pageContainer;
let routeIdCounter = 1;

const spaceRegex = /\s/g;
const containsVariableOrWildcardRegex = /\/:|\*/g;
const searchRegexString = '(\\?([^#]*))?';
const hashRegexString = '(#(.*))?';
const followedBySlashRegexString = '(?:\/$|$)';
const routeRegexReplaceRegex = /\/(\*|:)?([^\/\?]+)(\?)?/g;
let currentPathRegex;

document.documentElement.scrollTop = 0;


// auto handle preload CSS links tp avoid inline scripts
const preloadCSS = document.querySelectorAll('[rel="preload"][as="style"]');
const CSSLinks = [...document.querySelectorAll('[rel="stylesheet"]')];
for (const cssLink of preloadCSS) {
  if (CSSLinks.find(link => link.href === cssLink.href)) continue;

  let link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = cssLink.href;
  document.head.appendChild(link);
}


export function register(path, component, notFound) {
  if (routes.has(path)) throw Error('exists');

  routes.set(path, component);
  const regex = buildPathRegex(path);
  pathLookup.push([regex, path]);
  if (notFound) notFoundPage = [regex, component];
  if (!pageContainer) pageContainer = document.querySelector('#page-content');
  if (regex.test(location.pathname)) renderPage(component, regex);
}

export function getSearchParameters() {
  return Object.fromEntries([...new URLSearchParams(location.search).entries()]);
}

export function getUrlParameters() {
  return !currentPathRegex ? {} : location.pathname.match(currentPathRegex)?.groups || {};
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
  navigation.addEventListener('navigate', event => {
    if (!event.canIntercept || event.hashChange || event.downloadRequest !== null || event.navigationType === 'reload') return;

    event.intercept({
      // scroll: 'after-transition',
      // focusReset: 'manual',
      async handler() {
        const url = new URL(event.destination.url);
        let matchKey = pathLookup.find(v => v[0].test(url.pathname));
        if (!matchKey) matchKey = notFoundPage;
        if (!matchKey) console.warn(`No page found for path: ${url.pathname}`);
        const match = routes.get(matchKey[1]);
        await runTransition({
          newContainer: pageContainer,
          oldContainer: event.sourceElement,
          back: event.destination.index !== -1,
          routeId: event.target.activation.entry.id
        }, () => {
          renderPage(match, matchKey[0]);
        });
      },
    });
  });
}
enableSPA();


let pageTemplates = new Map();
async function renderPage(componentName, pathRegex) {
  currentPathRegex = pathRegex;

  let hasTemplate = pageTemplates.has(componentName);
  if (!hasTemplate) {
    const el = document.createElement('template');
    el.innerHTML = policyHTML.createHTML(`<${componentName}>`);
    pageTemplates.set(componentName, el);
  }

  let template = pageTemplates.get(componentName);
  const fragment = document.importNode(template.content, true);
  const page = fragment.firstChild;

  // make sure components is fully upgraded so we can render before inserting to dom
  if (!hasTemplate) {
    if (!customElements.get(componentName)) await customElements.whenDefined(componentName);
    customElements.upgrade(page);
  }

  page.constructor._isPage = true;
  document.title = page.constructor.title;
  window.page = page;

  page.render();

  const currentPage = pageContainer.firstElementChild;
  if (currentPage) currentPage.replaceWith(page);
  else pageContainer.appendChild(page);
}
