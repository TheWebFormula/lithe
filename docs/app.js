import '@thewebformula/lithe';
import '@thewebformula/materially/components/navigation-drawer';
import '@thewebformula/materially/components/navigation-bar';
import '@thewebformula/materially/components/anchor';
import '@thewebformula/materially/components/card';
import '@thewebformula/materially/components/button';
import '@thewebformula/materially/components/switch';
import '@thewebformula/materially/components/textfield';
import '@thewebformula/materially/components/pane';
import '@thewebformula/materially/components/icon';

// TODO
import './app.css';
import './code-block.js';
import './routes/index/index.js';
import './routes/getting started/index.js';
import './routes/404/index.js';
import './routes/binding/index.js';
import './routes/build/index.js';
import './routes/fetcher/index.js';
import './routes/multi language/index.js';
import './routes/routing/index.js';
import './routes/templates/index.js';
import './routes/view transitions/index.js';
import './routes/web component/index.js';
// import './routes/test[id?]/index.js';


if (typeof hljs === 'undefined') {
  const hljsTag = document.querySelector('#hljsscript');
  hljsTag.onload = () => {
    initHLJS();
  };
} else {
  window.addEventListener('DOMContentLoaded', () => {
    initHLJS();
  });
}

function initHLJS() {
  hljs.configure({ ignoreUnescapedHTML: true, cssSelector: 'code-block pre' });
  hljs.highlightAll();
}

window.addEventListener('load', () => {
  if (location.hash) handleHashAnchor(location.hash, false);
});

window.addEventListener('locationchange', () => {
  hljs.highlightAll();
  if (!location.hash) return;
  handleHashAnchor(location.hash, false);
});


window.addEventListener('hashchange', () => {
  if (!location.hash) return;
  handleHashAnchor(location.hash);
});


function handleHashAnchor(hash, animate = true) {
  try {
    const element = document.querySelector(hash);
    if (element) {
      if (animate) document.documentElement.scroll({ top: element.offsetTop, behavior: 'smooth' });
      else document.documentElement.scroll({ top: element.offsetTop, behavior: 'instant' });
    }
  } catch (e) { console.log('error', e); }
}
