import '@webformula/material/components/navigation-drawer';
import '@webformula/material/components/navigation-bar';
import '@webformula/material/components/anchor';
import '@webformula/material/components/card';
import '@webformula/material/components/button';
import '@webformula/material/components/switch';
import '@webformula/material/components/textfield';

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
  hljs.configure({ ignoreUnescapedHTML: true });
  hljs.highlightAll();
}

window.addEventListener('load', () => {
  if (location.hash) handleHashAnchor(location.hash, false);
});

window.addEventListener('locationchange', () => {
  // setTimeout(() => {
    hljs.highlightAll();
    if (!location.hash) return;
    handleHashAnchor(location.hash, false);
  // });
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
      else document.documentElement.scroll({ top: element.offsetTop });
    }
  } catch { console.log('error'); }
}
