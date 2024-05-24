import { Signal, Compute, effect } from './src/client/signal.js'
import { html, setSecurityLevel } from './src/client/html.js'
import Component from './src/client/Component.js';
import { routes, enableSPA } from './src/client/router.js';
import { i18n } from './src/client/i18n.js';

export {
  routes,
  enableSPA,
  Component,
  html,
  Signal,
  Compute,
  effect,
  setSecurityLevel,
  i18n,
}

window.html = html;
window.i18n = i18n;
