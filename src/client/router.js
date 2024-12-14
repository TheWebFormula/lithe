import { runTransition } from './viewTransitions.js';


let paths = new Map();
let pathLookup = [];
let notFound;
let isPreventNavigation = false;
let routeId = 0;

// make sure the page starts at 0. For some reason the page can start at 12 or 18 pixels. This causes a small page shift when it resets to 0.
document.documentElement.scrollTop = 0;

/**
* @typedef {Object} config
* @property {Component} component Component class
* @property {string} path Route path
* @property {boolean} [notFound] Mark as not found page
*/
/**
 * Register routes. This is called automatically
 * @param {config[]} config route configuration
 */
export function routes(config = [{
  component,
  path,
  notFound,
  hash
}]) {
  for (let i = 0; i < config.length; i += 1) {
    const item = config[i];
    if (!item.component || !item.path) throw Error('Routes missing properties: { path, component }');

    if (!paths.has(item.path)) {
      paths.set(item.path, item);
      pathLookup.push([item.regex, item.path]);
      if (item.notFound) notFound = item;
    }
  }

  window.litheRoutes = paths;
  if (!window.__isBuilding) route(location, false, true);
}


/**
 * Prevents all navigation. Good for auth flow
 * @param {boolean} enabled Enable for SPA
 */
export function preventNavigation(enabled = true) {
  isPreventNavigation = !!enabled;
}


/**
 * TODO replace current spa intercepting with navigation api when broadly available
 * https://developer.mozilla.org/en-US/docs/Web/API/Navigation#specifications
 */
// let isSpa = false;
// export function enableSPA() {
//   if (isSpa) return;
//   isSpa = true;

//   navigation.addEventListener('navigate', event => {
//     const url = new URL(event.destination.url);
//     if (
//       event.navigationType === 'reload' ||
//       location.origin !== url.origin ||
//       !event.canIntercept ||
//       event.hashChange ||
//       event.downloadRequest ||
//       event.formData
//     ) return;


//     event.intercept({
//       handler() {
//         route(url);
//       }
//     });
//   });
// }

const excludeLinkRegex = /^mailto:|^tel:|^sms:|:\/\//;

/** Makes navigation localized for SPA */
export function enableSPA() {
  document.addEventListener('click', event => {
    if (!event.target.matches('[href]')) return;
    const href = event.target.getAttribute('href');
    if (excludeLinkRegex.test(href)) return;
    event.preventDefault();
    const newRoute = !event.target.href ? location.origin + href : event.target.href;
    // const com = event.composedPath().reverse().slice(4);
    route(new URL(newRoute), undefined, undefined, event.target);
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

/**
 * Change route. This is automatically called by href links
 * @param {Object} locationObject route configuration
 * @param {Boolean} [back] Declare back navigation
 * @param {Boolean} [initial] Declare initial navigation
 */
async function route(locationObject, back = false, initial = false, target) {
  if (!initial && isPreventNavigation) return;
  let matchKey = pathLookup.find(v => v[0].test(locationObject.pathname));
  if (!matchKey) matchKey = [,notFound?.path];
  if (!matchKey) console.warn(`No page found for path: ${locationObject.pathname}`);
  let match = paths.get(matchKey[1]);

  // using web components for pages so we need to define it
  if (!match.component._defined) {
    match.component = await Promise.resolve(match.component);
    if (typeof match.component !== 'function') match.component = match.component.default;
    match.component._isPage = true;
    // match.component._pagePathRegex = match.regex;
    customElements.define(`page-${match.hash}`, match.component);
    match.component._defined = true;
  }

  if (initial) {
    const cur = document.querySelector(`page-${match.hash}`);
    window.page = cur;
    cur.render();
  } else {
    const currentPage = window.page;
    const samePage = currentPage?.constructor === match.component;

    if (samePage) {
      const hashMatches = locationObject.hash === location.hash;
      const searchMatches = locationObject.search === location.search;
      if (hashMatches && searchMatches) return;
      // TODO remove when using navigation api
      if (!back) window.history.pushState({}, currentPage.constructor.title, `${locationObject.pathname}${locationObject.search}${locationObject.hash}`);
      if (!hashMatches) window.dispatchEvent(new Event('hashchange'));
      return;
    }
    
    const newContainer = document.querySelector('#page-content');
    runTransition({
      newContainer,
      oldContainer: target,
      back,
      routeId: window.history.state?.id
    }, () => {
      routeTransition(currentPage, match, locationObject, back, initial);
    });
  }
}

function routeTransition(currentPage, match, locationObject, back, initial) {
  if (!initial && !back) {
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  }

  if (currentPage) {
    currentPage._internalDisconnectedCallback();
    currentPage.remove();
  }

  const nextPage = new match.component();
  // TODO remove when using navigation api
  if (!back && !initial) window.history.pushState({ id: routeId++ }, nextPage.constructor.title, `${locationObject.pathname}${locationObject.search}${locationObject.hash}`);
  window.page = nextPage;

  nextPage.render();

  queueMicrotask(() => {
    if (!initial) window.dispatchEvent(new Event('locationchange'));
    else window.dispatchEvent(new Event('locationchangeinitial'));
  });
}
