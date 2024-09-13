import { viewTransitions } from './viewTransitions.js';

const app = {
  paths: [],
  componentModuleQueue: [],
  preventNavigation: false
};
let isReducedMotion;
let viewTransitionGlobal;
let viewTransitionGlobalBack;
let lastViewTransition;

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
  const invalid = config.find(r => !r.component || !r.path);
  if (invalid) throw Error('Routes missing properties: { path, component }');

  let isCurrent = false;
  for (const c of config) {
    if (!app.paths.find(v => v.path === c.path)) {
      app.paths.push(c);
      if (!isCurrent) isCurrent = location.pathname.match(c.regex) !== null;
    }
  }

  window.litheRoutes = app.paths;
  if (!window.__isBuilding && isCurrent) route(location, false, true);
}


/**
 * Prevents all navigation. Good for auth flow
 * @param {boolean} enabled Enable for SPA
 */
export function preventNavigation(enabled = true) {
  app.preventNavigation = !!enabled;
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


/** Makes navigation localized for SPA */
export function enableSPA() {
  document.addEventListener('click', event => {
    if (!event.target.matches('[href]')) return;
    const href = event.target.getAttribute('href');
    if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('sms:')) return;
    if (href.includes('://')) return;
    event.preventDefault();
    const newRoute = !event.target.href ? location.origin + href : event.target.href;
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
  if (isReducedMotion === undefined) isReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (viewTransitionGlobal === undefined) {
    const viewTransitionMeta = document.querySelector('[name=view-transition]');
    viewTransitionGlobal = viewTransitionMeta?.content || false;
    const viewTransitionBackMeta = document.querySelector('[name=view-transition-back]');
    viewTransitionGlobalBack = viewTransitionBackMeta?.content || false;
  }

  if (!initial && app.preventNavigation) return;
  let match = app.paths.find(v => locationObject.pathname.match(v.regex) !== null);
  if (!match) match = app.paths.find(v => v.notFound);
  if (!match) console.warn(`No page found for path: ${locationObject.pathname}`);

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

    const transitionName = target?.getAttribute('transition-name') || (back ? viewTransitionGlobalBack || viewTransitionGlobal : viewTransitionGlobal);
    if (document.startViewTransition && !isReducedMotion && transitionName) {
      const container = document.querySelector('#page-content');
      const transitionMethods = viewTransitions[transitionName];
      const transitionSetup = transitionMethods?.setup(container, target);
      container.style.viewTransitionName = transitionName;
      const transition = document.startViewTransition(() => routeTransition(currentPage, match, locationObject, back, initial));
      await transition.ready;
      if (transitionMethods?.animate) transitionMethods.animate(container, transitionSetup);
      transition.finished.then(() => {
        container.style.viewTransitionName = '';
      });
    } else {
      routeTransition(currentPage, match, locationObject, back, initial);
    }

    queueMicrotask(() => {
      if (!initial) window.dispatchEvent(new Event('locationchange'));
      else window.dispatchEvent(new Event('locationchangeinitial'));
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
  if (!back && !initial) window.history.pushState({}, nextPage.constructor.title, `${locationObject.pathname}${locationObject.search}${locationObject.hash}`);
  window.page = nextPage;

  nextPage.render();
  nextPage.connectedCallback();
}
