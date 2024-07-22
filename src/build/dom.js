import { parseHTML, NodeFilter, Node, DOMParser, NodeList, HTMLTemplateElement, DocumentFragment } from 'linkedom';

// TODO do i need to inject the app index.html
const dom = parseHTML(`<!doctype html>
<html lang="en">
  <head>
    <title></title>
  </head>
  <body>
    <page-content></page-content>
  </body>
</html>`);


class CSSStyleSheet {
  href = '';
  replaceSync() { }
};
class EventSource { }
const localStorage = {
  getItem() { },
  setItem() { },
  removeItem() { }
};
const sessionStorage = {
  getItem() { },
  setItem() { },
  removeItem() { }
};
function getComputedStyle() {
  return {
    getPropertyValue() {},
    setPropertyValue() {}
  };
}
function matchMedia() {
  return {
    matches: false,
    addEventListener() {}
  };
}
function requestAnimationFrame(cb = () => {}) {
  cb();
}
const location = {
  href: '',
  pathname: '/'
};
const history = {
  pushState() { },
  popState() { }
}
const screen = {
  orientation: {
    type: 'landscape-primary',
    addEventListener() {}
  }
}
const visualViewport = {
  width: 400,
  height: 900,
  addEventListener() {}
};

class ResizeObserver {
  observe() {}
  disconnect() {}
}

class IntersectionObserver {
  observe() { }
  disconnect() { }
}

const navigation = {
  addEventListener() { }
};

// Fix broken linkedom Customevent
class CustomEvent extends dom.Event {
  constructor(type, eventInitDict = {}) {
    super(type, eventInitDict);
    this.detail = eventInitDict.detail;
  }
}

// export default function add(indexFile) {
//   global.CustomEvent = CustomEvent;
//   global.dispatchEvent = () => { };
//   global.window = dom.window
//   global.HTMLElement = dom.HTMLElement;
//   global.HTMLInputElement = dom.HTMLInputElement;
//   global.document = dom.document;
//   global.CSSStyleSheet = CSSStyleSheet;
//   global.MutationObserver = dom.MutationObserver;
//   global.IntersectionObserver = IntersectionObserver;
//   global.ResizeObserver = ResizeObserver;
//   global.getComputedStyle = getComputedStyle;
//   global.localStorage = localStorage;
//   global.sessionStorage = sessionStorage;
//   global.matchMedia = matchMedia;
//   global.navigator = {
//     ...dom.navigator,
//     language: 'en-US',
//     languages: ['en', 'en-US']
//   };
//   global.customElements = dom.customElements;
//   global.location = location;
//   global.EventSource = EventSource;
//   global.screen = screen;
//   global.visualViewport = visualViewport;
//   global.history = history;
//   global.requestAnimationFrame = requestAnimationFrame;
//   global.navigation = navigation;
//   global.DOMParser = DOMParser;
//   global.NodeFilter = NodeFilter;
//   global.Node = Node;

//   return {
//     DOMParser
//   };
// }


export default function parseHTMLString(string) {
  const dom = parseHTML(string);
  pollyFill();

  dom.document.adoptedStyleSheets = [];
  dom.document.styleSheets = [];
  dom.document.fonts = { ready: Promise.resolve([]) };
  dom.window.scrollTo = () => { };
  dom.window.postMessage = () => { };
  dom.window.navigation = navigation;
  global.window = dom.window
  global.HTMLElement = dom.HTMLElement;
  global.HTMLInputElement = dom.HTMLInputElement;
  global.document = dom.document;
  global.MutationObserver = dom.MutationObserver;
  // global.navigator = {
  //   ...dom.navigator,
  //   language: 'en-US',
  //   languages: ['en', 'en-US']
  // };

  return {
    document: dom
  }
}


let isPollyfilled = false;
function pollyFill() {
  if (isPollyfilled) return;
  isPollyfilled = true;

  global.CustomEvent = CustomEvent;
  global.dispatchEvent = () => { };
  global.CSSStyleSheet = CSSStyleSheet;
  global.IntersectionObserver = IntersectionObserver;
  global.ResizeObserver = ResizeObserver;
  global.getComputedStyle = getComputedStyle;
  global.localStorage = localStorage;
  global.sessionStorage = sessionStorage;
  global.matchMedia = matchMedia;
  global.customElements = dom.customElements;
  global.location = location;
  global.EventSource = EventSource;
  global.screen = screen;
  global.visualViewport = visualViewport;
  global.history = history;
  global.requestAnimationFrame = requestAnimationFrame;
  global.navigation = navigation;
  global.DOMParser = DOMParser;
  global.NodeFilter = NodeFilter;
  global.NodeList = NodeList;
  global.Node = Node;
  global.HTMLTemplateElement = HTMLTemplateElement;
  global.DocumentFragment = DocumentFragment;
  global.TouchEvent = class TouchEvent { };
}
