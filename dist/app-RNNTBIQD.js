var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/client/signal.js
function isSignal(node) {
  return node instanceof Base;
}
function setActiveConsumer(consumer) {
  const previous = activeConsumer;
  activeConsumer = consumer;
  return previous;
}
function beginConsumerCompute(consumer) {
  return setActiveConsumer(consumer);
}
function afterConsumerCompute(previousConsumer) {
  setActiveConsumer(previousConsumer);
}
function addToQueue(callback) {
  queue.add(callback);
  runQueue();
}
function runQueue() {
  if (queueRunning) return;
  queueRunning = true;
  queueMicrotask(() => {
    for (const callback of queue) {
      callback();
    }
    queue.clear();
    if (signalChangeIds.size > 0) {
      signalChangeIds.clear();
    }
    queueRunning = false;
  });
}
var SIGNAL, COMPUTE, ERRORED, queue, signalChangeIds, queueRunning, epoch, idCounter, activeConsumer, Base, Signal, Compute;
var init_signal = __esm({
  "src/client/signal.js"() {
    SIGNAL = Symbol("SIGNAL");
    COMPUTE = Symbol("COMPUTE");
    ERRORED = Symbol("ERRORED");
    queue = /* @__PURE__ */ new Set();
    signalChangeIds = /* @__PURE__ */ new Set();
    queueRunning = false;
    epoch = 0;
    idCounter = 0;
    Base = class {
      #id = idCounter++;
      #dirty = false;
      #version = 0;
      #lastCleanEpoch = 0;
      #value;
      #error;
      #consumers = [];
      #producers = [];
      #producerVersions = [];
      #watchers = /* @__PURE__ */ new Set();
      #notifyWatchers_bound = this.#notifyWatchers.bind(this);
      get id() {
        return this.#id;
      }
      get value() {
        if (activeConsumer) this.subscribe(activeConsumer);
        if (this.#value === ERRORED) throw this.#error;
        return this.#value;
      }
      set value(value) {
        this.#value = value;
        this.#version++;
        epoch++;
        this.notify();
        signalChangeIds.add(this.id);
      }
      get untrackValue() {
        if (this.#value === ERRORED) throw this.#error;
        return this.#value;
      }
      get version() {
        return this.#version;
      }
      get dirty() {
        return this.#dirty;
      }
      set dirty(value) {
        this.#dirty = value;
      }
      get lastCleanEpoch() {
        return this.#lastCleanEpoch;
      }
      set lastCleanEpoch(value) {
        this.#lastCleanEpoch = value;
      }
      get error() {
        return this.#error;
      }
      set error(value) {
        this.#error = value;
      }
      subscribe(node) {
        if (this.#producers.includes(node) || node === this) return;
        this.#producers.push(node);
        this.#producerVersions.push(node.version);
        if (node[COMPUTE]) {
          this.#consumers.push(node);
          node.subscribe(this);
        }
      }
      unsubscribe(node) {
        const index = this.#producers.indexOf(node);
        if (index > -1) {
          this.#producers[index] = this.#producers[this.#producers.length - 1];
          this.#producerVersions[index] = this.#producerVersions[this.#producerVersions.length - 1];
          this.#producers.length--;
          this.#producerVersions.length--;
        }
        if (node[COMPUTE]) {
          const index2 = this.#consumers.indexOf(node);
          if (index2 > -1) {
            this.#consumers[index2] = this.#consumers[this.#consumers.length - 1];
            this.#consumers.length--;
            node.unsubscribe(this);
          }
        }
      }
      notify() {
        for (const consumer of this.#consumers) {
          consumer.updateValueVersion();
        }
        addToQueue(this.#notifyWatchers_bound);
      }
      #notifyWatchers() {
        for (const watcher of this.#watchers) {
          watcher(this);
        }
      }
      dispose() {
        let i;
        for (i = 0; i < this.#producers.length; i++) {
          this.#producers[i].unsubscribe(this);
        }
        for (i = 0; i < this.#consumers.length; i++) {
          this.#consumers[i].unsubscribe(this);
        }
        this.#watchers.clear();
      }
      updateDirty() {
        if (this[SIGNAL] || !this.#dirty && this.#lastCleanEpoch === epoch) return;
        for (let i = 0; i < this.#producers.length; i++) {
          if (this.#producers[i].version !== this.#producerVersions[i]) {
            this.#dirty = true;
            this.#producerVersions[i] = this.#producers[i].version;
          }
        }
      }
      watch(callback) {
        this.#watchers.add(callback);
      }
      unwatch(callback) {
        this.#watchers.delete(callback);
      }
    };
    Signal = class extends Base {
      constructor(value) {
        super();
        this[SIGNAL] = true;
        super.value = value;
      }
      // block
      set error(_) {
      }
      set dirty(_) {
      }
      set lastCleanEpoch(_) {
      }
      get value() {
        return super.value;
      }
      set value(value) {
        if (super.value === value) return;
        super.value = value;
      }
    };
    Compute = class extends Base {
      #callback;
      constructor(callback) {
        super();
        this[COMPUTE] = true;
        this.#callback = callback;
        this.#recompute();
        if (super.error) throw super.error;
      }
      // block
      set value(_) {
      }
      set error(_) {
      }
      set dirty(_) {
      }
      set lastCleanEpoch(_) {
      }
      get value() {
        return super.value;
      }
      get dirty() {
        return super.dirty;
      }
      updateValueVersion(force = false) {
        if (force) super.dirty = true;
        this.updateDirty();
        if (super.dirty) {
          this.#recompute();
          super.dirty = false;
          super.lastCleanEpoch = epoch;
        }
      }
      #recompute() {
        const previousConsumer = beginConsumerCompute(this);
        let newValue;
        let changed = false;
        try {
          newValue = this.#callback();
          changed = super.value !== newValue;
        } catch (e) {
          super.value = ERRORED;
          super.error = e;
        } finally {
          afterConsumerCompute(previousConsumer);
        }
        if (!changed) return;
        super.value = newValue;
      }
    };
  }
});

// src/client/html.js
function html(strings, ...args) {
  if (typeof strings === "function") return htmlCompute(strings);
  args.reverse();
  const signals2 = [];
  const subClonedNodes = [];
  let template2 = "";
  let i = 0;
  for (; i < strings.length - 1; i++) {
    template2 = template2 + strings[i];
    const arg = args.pop();
    if (template2.match(insideCommentRegex)) {
      template2 += "${commented expression}";
    } else if (isSignal(arg)) {
      signals2.push(arg);
      if (!signalCache.has(arg)) {
        signalCache.set(arg, []);
        signalsToWatch.add(arg);
      }
      if (arg[HTMLCOMPUTE] === true) template2 += htmlComputeComment;
      else template2 += signalComment;
    } else if (Array.isArray(arg) ? arg[0] instanceof DocumentFragment : arg instanceof DocumentFragment) {
      subClonedNodes.push([].concat(arg));
      template2 += subTemplateComment;
    } else {
      template2 += escape(arg);
    }
  }
  template2 += strings[i];
  if (!templateCache.has(template2)) templateCache.set(template2, buildTemplateElement(template2));
  const templateElement = templateCache.get(template2);
  return prepareTemplateElement(templateElement, signals2, subClonedNodes);
}
function htmlCompute(callback) {
  const compute = new Compute(callback);
  compute[HTMLCOMPUTE] = true;
  return compute;
}
function watchSignals() {
  queueMicrotask(() => {
    for (const sig of signalsToWatch) {
      sig.watch(signalChange);
    }
  });
}
function destroySignalCache() {
  for (const sig of signalsToWatch) {
    sig.unwatch(signalChange);
  }
  signalsToWatch.clear();
}
function signalChange(signal) {
  const signalItems = signalCache.get(signal);
  if (!signalItems) return;
  for (const item of signalItems) {
    if (item[0].nodeType === Node.ATTRIBUTE_NODE) {
      let i = 0;
      item[0].value = item[1].replace(attrString, function() {
        return item[2][i++].untrackValue;
      });
    } else if (signal[HTMLCOMPUTE] === true) {
      for (const node of item[1]) {
        node.remove();
      }
      item[1] = [];
      for (const frag of [].concat(signal.untrackValue)) {
        item[1].push(...frag.childNodes);
        item[0].parentElement.insertBefore(frag, item[0]);
      }
    } else {
      item[0].textContent = signal.untrackValue;
    }
  }
}
function buildTemplateElement(template2) {
  template2 = adjustTemplateForAttributes(template2);
  const templateElement = document.createElement("template");
  templateElement.innerHTML = template2;
  const nodes = document.createNodeIterator(
    templateElement.content,
    NodeFilter.SHOW_ALL
  );
  let node = nodes.nextNode();
  while (node = nodes.nextNode()) {
    switch (node.nodeType) {
      case Node.ELEMENT_NODE:
        sanitizeNode(node);
        break;
      case Node.COMMENT_NODE:
        if (node.data === signalString) {
          const textNode = document.createTextNode(signalString);
          node.parentElement.replaceChild(textNode, node);
        }
        break;
    }
  }
  return templateElement;
}
function adjustTemplateForAttributes(template2) {
  return template2.replace(tagRegex, function(all) {
    let attrNameCounter = 0;
    return all.replace(attrRegex, function(attr, _name, _value, expr) {
      if (expr) return attr.replace(signalCommentRegex, attrString + attrNameCounter++);
      return attr.replace(signalCommentRegex, attrString);
    }).replace(twoSpaceRegex, " ");
  });
}
function prepareTemplateElement(templateElement, args, subClonedNodes) {
  args.reverse();
  subClonedNodes.reverse();
  const clonedNode = templateElement.content.cloneNode(true);
  const nodes = document.createNodeIterator(
    clonedNode,
    NodeFilter.SHOW_ALL
  );
  let node = nodes.nextNode();
  while (node = nodes.nextNode()) {
    switch (node.nodeType) {
      case Node.COMMENT_NODE:
      case Node.TEXT_NODE:
        switch (node.textContent) {
          case subTemplateString:
            for (const frag of subClonedNodes.pop()) {
              node.parentElement.insertBefore(frag, node);
            }
            break;
          case htmlComputeString:
            const compute = args.pop();
            const activeNodes = [];
            for (const frag of [].concat(compute.untrackValue)) {
              activeNodes.push(...frag.childNodes);
              node.parentElement.insertBefore(frag, node);
            }
            signalCache.get(compute).push([node, activeNodes]);
            break;
          case signalString:
            const signal = args.pop();
            node.textContent = signal.untrackValue;
            signalCache.get(signal).push([node]);
            break;
        }
        break;
      case Node.ELEMENT_NODE:
        const toRemove = [];
        const toAdd = [];
        let i = 0;
        for (; i < node.attributes.length; i++) {
          const attr = node.attributes[i];
          if (attr.value.includes(attrString)) {
            const signals2 = /* @__PURE__ */ new Set();
            const expressions = [];
            const templateValue = attr.value;
            attr.value = templateValue.replace(attrPlaceholderRegex, function() {
              const arg = args.pop();
              expressions.push(arg);
              if (isSignal(arg)) {
                signals2.add(arg);
                return arg.untrackValue;
              }
              return arg;
            });
            for (const sig of signals2) {
              signalCache.get(sig).push([attr, templateValue, expressions]);
            }
            signals2.clear();
          } else if (attr.name.includes(attrString)) {
            const expressionValue = args.pop();
            toAdd.push(document.createAttribute(expressionValue));
            toRemove.push(node.attributes[i]);
          }
        }
        for (i = 0; i < toAdd.length; i++) {
          node.setAttributeNode(toAdd[i]);
          node.removeAttributeNode(toRemove[i]);
        }
    }
  }
  return clonedNode;
}
function escape(str) {
  escapeElement.textContent = str;
  return escapeElement.innerHTML;
}
function sanitizeNode(node) {
  let sanitized = false;
  if (dangerousNodes.includes(node.nodeName)) {
    if (securityLevel === 0) {
      if (window.litheDev === true) console.warn(`Template sanitizer (WARNING): Potentially dangerous node NOT removed because of current level (${securityLevel}) "${node.nodeName}"`);
    } else {
      if (window.litheDev === true) console.warn(`Template sanitizer (INFO): A ${node.nodeName} tag was removed because of security level (${securityLevel})`);
      node.remove();
      sanitized = true;
    }
  }
  const attributes = node.attributes;
  for (const attr of attributes) {
    if (sanitizeAttribute(attr) === true) sanitized = true;
  }
  return sanitized;
}
function sanitizeAttribute(attr) {
  const nameSanitized = sanitizeAttributeName(attr.name, attr.value);
  const valueSanitized = sanitizeAttributeValue(attr.name, attr.value);
  if (nameSanitized || valueSanitized) {
    if (window.litheDev === true) console.warn(`Template sanitizer (INFO): Attribute removed "${attr.name}: ${attr.value}"`);
    attr.ownerElement.removeAttribute(attr.name);
    return true;
  }
  return false;
}
function sanitizeAttributeName(name, value) {
  let shouldRemoveLevel2 = false;
  let shouldRemoveLevel1 = false;
  if (name.startsWith("on") || dangerousAttributesLevel2.includes(name)) shouldRemoveLevel2 = true;
  if (dangerousAttributesLevel1.includes(name)) shouldRemoveLevel1 = true;
  if (window.litheDev === true && (securityLevel === 1 && shouldRemoveLevel2 && !shouldRemoveLevel1) || window.litheDev === true && securityLevel === 0 && (!shouldRemoveLevel2 || !shouldRemoveLevel1)) {
    console.warn(`Template sanitizer (WARNING): Potentially dangerous attribute NOT removed because of current level (${securityLevel}) "${name}: ${value}"`);
  }
  return shouldRemoveLevel1 && securityLevel > 0 || shouldRemoveLevel2 && securityLevel === 2;
}
function sanitizeAttributeValue(name, value) {
  value = value.replace(/\s+/g, "").toLowerCase();
  if (value.match(dangerousAttributeValueRegex) !== null) {
    if (window.litheDev === true && securityLevel === 0) {
      console.warn(`Template sanitizer (WARNING): Potentially dangerous attribute NOT removed because of current level (${securityLevel}) "${name}: ${value}"`);
    } else return true;
  }
  return false;
}
var HTMLCOMPUTE, htmlComputeString, htmlComputeComment, attrString, signalString, signalComment, subTemplateString, subTemplateComment, tagRegex, attrRegex, signalCommentRegex, twoSpaceRegex, attrPlaceholderRegex, insideCommentRegex, dangerousNodes, dangerousAttributesLevel2, dangerousAttributesLevel1, templateCache, signalCache, signalsToWatch, securityLevel, escapeElement, dangerousAttributeValueRegex;
var init_html = __esm({
  "src/client/html.js"() {
    init_signal();
    HTMLCOMPUTE = Symbol("HTMLCOMPUTE");
    htmlComputeString = "#htmlcompute#";
    htmlComputeComment = `<!--${htmlComputeString}-->`;
    attrString = "###";
    signalString = "#signal#";
    signalComment = `<!--${signalString}-->`;
    subTemplateString = "#template#";
    subTemplateComment = `<!--${subTemplateString}-->`;
    tagRegex = new RegExp(`<\\w+([^<>]*${signalComment}[^<\\/>]*)+\\/?>`, "g");
    attrRegex = new RegExp(`(?:(\\s+[^\\s\\/>"=]+)\\s*=\\s*"([\\w\\s]*${signalComment}[\\w\\s]*)")|(\\s*${signalComment}\\s*)`, "g");
    signalCommentRegex = new RegExp(signalComment, "g");
    twoSpaceRegex = /\s\s/g;
    attrPlaceholderRegex = new RegExp(attrString, "g");
    insideCommentRegex = /<!--(?![.\s\S]*-->)/;
    dangerousNodes = ["SCRIPT", "IFRAME", "NOSCRIPT"];
    dangerousAttributesLevel2 = ["src", "href", "xlink:href"];
    dangerousAttributesLevel1 = ["onload", "onerror"];
    templateCache = /* @__PURE__ */ new Map();
    signalCache = /* @__PURE__ */ new WeakMap();
    signalsToWatch = /* @__PURE__ */ new Set();
    securityLevel = 1;
    escapeElement = document.createElement("p");
    dangerousAttributeValueRegex = /javascript:|eval\(|alert|document.cookie|document\[['|"]cookie['|"]\]|&\#\d/gi;
  }
});

// src/client/Component.js
var Component;
var init_Component = __esm({
  "src/client/Component.js"() {
    init_html();
    Component = class extends HTMLElement {
      static _html = html;
      /**
        * Page title
        * @type {String}
        */
      static title;
      /**
        * Pass in HTML string. Use for imported .HTML
        *   Supports template literals: <div>${this.var}</div>
        * @type {String}
        */
      static htmlTemplate = "";
      /**
        * Pass in styles for shadow root.
        *   Can use imported stylesheets: import styles from '../styles.css' assert { type: 'css' };
        * @type {CSSStyleSheet}
        */
      static styleSheets = [];
      /**
        * Hook up shadow root
        * @type {Boolean}
        */
      static useShadowRoot = false;
      /**
        * @type {Boolean}
        */
      static shadowRootDelegateFocus = false;
      /**
      * @typedef {String} AttributeType
      * @value '' default handling
      * @value 'string' Convert to a string. null = ''
      * @value 'number' Convert to a number. isNaN = ''
      * @value 'int' Convert to a int. isNaN = ''
      * @value 'boolean' Convert to a boolean. null = false
      * @value 'event' Allows code to be executed. Similar to onchange="console.log('test')"
      */
      /**
      * Enhances observedAttributes, allowing you to specify types
      * @type {Array.<[name:String, AttributeType]>}
      */
      static get observedAttributesExtended() {
        return [];
      }
      static get observedAttributes() {
        return this.observedAttributesExtended.map((a) => a[0]);
      }
      /**
        * Use with observedAttributesExtended
        *   This automatically handles type conversions and duplicate calls from setting attributes
        * @name observedAttributesExtended
        * @function
        */
      // static get observedAttributesExtended() { }
      #attributeEvents = {};
      #attributesLookup;
      #prepared;
      #pageContent;
      constructor() {
        super();
        this.#attributesLookup = Object.fromEntries(this.constructor.observedAttributesExtended);
        if (this.constructor._isPage) {
          this.#pageContent = document.querySelector("#page-content");
          if (!this.#pageContent) throw Error("Could not find page-content");
        }
        if (this.constructor.useShadowRoot) {
          this.attachShadow({ mode: "open", delegatesFocus: this.constructor.shadowRootDelegateFocus });
        } else if (this.constructor.styleSheets[0] instanceof CSSStyleSheet) {
          document.adoptedStyleSheets.push(...this.constructor.styleSheets);
        }
      }
      connectedCallback() {
      }
      disconnectedCallback() {
      }
      /** Called before render */
      beforeRender() {
      }
      /** Called after render */
      afterRender() {
      }
      /**
       * Method that returns a html template string. This is an alternative to use static htmlTemplate
       *    template() {
       *       return `<div>${this.var}</div>`;
       *    }
       * @name template
       * @function
       * @return {String}
       */
      template() {
      }
      attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;
        const type = this.#attributesLookup[name];
        name = name.replace(dashCaseRegex, (_, s) => s.toUpperCase());
        if (type === "event") {
          if (this.#attributeEvents[name]) {
            this.removeEventListener(name.replace(/^on/, ""), this.#attributeEvents[name]);
            this.#attributeEvents[name] = void 0;
          }
          if (newValue) {
            this.#attributeEvents[name] = this.#attributeDescriptorTypeConverter(newValue, type);
            this.addEventListener(name.replace(/^on/, ""), this.#attributeEvents[name]);
          }
        } else {
          this.attributeChangedCallbackExtended(
            name,
            this.#attributeDescriptorTypeConverter(oldValue, type),
            this.#attributeDescriptorTypeConverter(newValue, type)
          );
        }
      }
      /**
       * Use with observedAttributesExtended
       * @function
       * @param {String} name - Attribute name
       * @param {String} oldValue - Old attribute value
       * @param {String} newValue - New attribute value
       */
      attributeChangedCallbackExtended(name, oldValue, newValue) {
      }
      render() {
        if (!this.#prepared) this.#prepareRender();
        this.beforeRender();
        destroySignalCache();
        this.replaceChildren(this.template());
        if (!this.isConnected && this.constructor._isPage) this.#pageContent.append(this);
        watchSignals();
        this.afterRender();
      }
      /** @private */
      _internalDisconnectedCallback() {
        destroySignalCache();
      }
      #prepareRender() {
        this.#prepared = true;
        if (this.constructor._isPage) {
          const title = document.documentElement.querySelector("title");
          title.textContent = this.constructor.title;
        }
        const templateString = this.constructor.htmlTemplate || this.template.toString().replace(/^[^`]*/, "").replace(/[^`]*$/, "").slice(1, -1);
        this.template = () => new Function("page", `return page.constructor._html\`${templateString}\`;`).call(this, this);
      }
      #attributeDescriptorTypeConverter(value, type) {
        switch (type) {
          case "boolean":
            return value !== null && `${value}` !== "false";
          case "int":
            const int = parseInt(value);
            return isNaN(int) ? "" : int;
          case "number":
            const num = parseFloat(value);
            return isNaN(num) ? "" : num;
          case "string":
            return value || "";
          case "event":
            return !value ? null : () => new Function("page", value).call(this, window.page);
          default:
            return value;
        }
      }
    };
  }
});

// src/client/router.js
function routes(config = [{
  component,
  path,
  notFound,
  hash
}]) {
  const invalid = config.find((r) => !r.component || !r.path);
  if (invalid) throw Error("Routes missing properties: { path, component }");
  let isCurrent = false;
  for (const c of config) {
    if (!app.paths.find((v) => v.path === c.path)) {
      app.paths.push(c);
      if (!isCurrent) isCurrent = location.pathname.match(c.regex) !== null;
    }
  }
  window.litheRoutes = app.paths;
  if (!window.__isBuilding && isCurrent) route(location, false, true);
}
function enableSPA() {
  document.addEventListener("click", (event) => {
    if (!event.target.matches("[href]")) return;
    if (event.target.getAttribute("href").includes("://")) return;
    event.preventDefault();
    route(new URL(event.target.href));
  }, false);
  let popPrevented = false;
  window.addEventListener("popstate", (event) => {
    if (popPrevented) return popPrevented = false;
    const beforeUnloadEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnloadEvent);
    if (beforeUnloadEvent.defaultPrevented && !confirm("Changes you made may not be saved.")) {
      popPrevented = true;
      history.go(1);
    } else route(new URL(event.currentTarget.location), true);
  });
}
async function route(locationObject, back = false, initial = false) {
  if (!initial && app.preventNavigation) return;
  let match = app.paths.find((v) => locationObject.pathname.match(v.regex) !== null);
  if (!match) match = app.paths.find((v) => v.notFound);
  if (!match) console.warn(`No page found for path: ${locationObject.pathname}`);
  if (!match.component._defined) {
    match.component = await Promise.resolve(match.component);
    if (typeof match.component !== "function") match.component = match.component.default;
    match.component._isPage = true;
    match.component._pagePathRegex = match.regex;
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
      if (!back) window.history.pushState({}, currentPage.constructor.title, `${locationObject.pathname}${locationObject.search}${locationObject.hash}`);
      if (!hashMatches) window.dispatchEvent(new Event("hashchange"));
      return;
    }
    if (currentPage) {
      currentPage._internalDisconnectedCallback();
      currentPage.remove();
    }
    const nextPage = new match.component();
    if (!back && !initial) window.history.pushState({}, nextPage.constructor.title, `${locationObject.pathname}${locationObject.search}${locationObject.hash}`);
    window.page = nextPage;
    if (!initial) {
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
    }
    nextPage.render();
    nextPage.connectedCallback();
  }
  queueMicrotask(() => {
    if (!initial) window.dispatchEvent(new Event("locationchange"));
    else window.dispatchEvent(new Event("locationchangeinitial"));
  });
}
var app;
var init_router = __esm({
  "src/client/router.js"() {
    app = {
      paths: [],
      componentModuleQueue: [],
      preventNavigation: false
    };
  }
});

// src/client/i18n.js
function i18n(key, ...variables) {
  const compute = new Compute(() => {
    const message = currentTranslations.messages[key];
    if (!message) {
      if (window.wfcDev) console.warn(`Cannot localize. Missing key: ${key}`);
      return key;
    }
    return message.replace(valueRegex, function(_, varIndex, formatterName, formatterVarIndex) {
      if (varIndex) {
        const variable = variables[parseInt(varIndex) - 1];
        if (isSignal(variable)) return variable.value;
        return variable;
      }
      if (formatterName && formatterVarIndex) {
        const formatMethod = translations[currentLocal].formatters[formatterName].method;
        const variable = variables[parseInt(formatterVarIndex) - 1];
        if (isSignal(variable)) return formatMethod(variable.value);
        return formatMethod(variable);
      }
      return "";
    });
  });
  signals.add(compute);
  return compute;
}
function buildFormatter(config, locale) {
  switch (config.type) {
    case "cardinal":
      config.method = (data) => {
        const cardinal = translations[locale].cardinalRules.select(parseInt(data));
        return config[cardinal] || config.other;
      };
      break;
    case "ordinal":
      config.method = (data) => {
        const ordinal = translations[locale].ordinalRules.select(parseInt(data));
        return config[ordinal] || config.other;
      };
      break;
    case "date":
      config.method = (data) => {
        return getDateFormatter(locale, config.options).format(data);
      };
      break;
    case "number":
      config.method = (data) => {
        return getNumberFormatter(locale, config.options).format(data);
      };
      break;
    case "relativeTime":
      config.method = (data) => {
        return getRelativeTimeFormatter(locale, config.options).format(data || "", config.unit);
      };
      break;
    default:
      config.method = (data) => data;
  }
  return config;
}
function getDateFormatter(locale, options) {
  const key = `${locale}${JSON.stringify(options || "")}`;
  if (!dateFormatters[key]) dateFormatters[key] = new Intl.DateTimeFormat(locale, options);
  return dateFormatters[key];
}
function getNumberFormatter(locale, options) {
  const key = `${locale}${JSON.stringify(options || "")}`;
  if (!numberFormatters[key]) numberFormatters[key] = new Intl.NumberFormat(locale, options);
  return numberFormatters[key];
}
function getRelativeTimeFormatter(locale, options) {
  const key = `${locale}${JSON.stringify(options || "")}`;
  if (!relativeTimeFormatters[key]) relativeTimeFormatters[key] = new Intl.RelativeTimeFormat(locale, options);
  return relativeTimeFormatters[key];
}
function languageChange() {
  setLocale(navigator.language);
}
var translations, signals, valueRegex, useCache, currentLocal, currentTranslations, dateFormatters, numberFormatters, relativeTimeFormatters;
var init_i18n = __esm({
  "src/client/i18n.js"() {
    init_signal();
    translations = {};
    signals = /* @__PURE__ */ new Set();
    valueRegex = /\$(\d)|\$(\w+)\(\$(\d)\)/g;
    useCache = false;
    currentLocal = Intl.getCanonicalLocales(navigator.language)[0].split("-")[0];
    window.addEventListener("languagechange", languageChange);
    i18n.setLocale = (locale) => {
      locale = Intl.getCanonicalLocales(locale)[0].split("-")[0];
      const changed = locale !== currentLocal;
      if (changed) {
        if (useCache) localStorage.setItem("wfc-locale", locale);
        currentLocal = locale;
        currentTranslations = translations[currentLocal];
        for (const signal of signals) {
          signal.updateValueVersion(true);
        }
      }
    };
    i18n.cache = () => {
      useCache = true;
      const storedMessages = localStorage.getItem("wfc-locale-messages");
      if (storedMessages) {
        for (const [_local, config] of Object.entries(JSON.parse(storedMessages))) {
          addTranslation(_local, config);
        }
      }
      const locale = localStorage.getItem("wfc-locale");
      if (locale) setLocale(locale);
    };
    i18n.format = (formatterName, value) => {
      const compute = new Compute(() => {
        const formatter = translations[currentLocal].formatters[formatterName];
        if (!formatter) {
          if (window.wfcDev) console.warn(`Cannot find formatter: ${formatterName}`);
          return "";
        }
        if (isSignal(value)) return formatter.method(value.value);
        return formatter.method(value);
      });
      signals.add(compute);
      return compute;
    };
    i18n.addTranslation = (locale, data) => {
      locale = Intl.getCanonicalLocales(locale)[0].split("-")[0];
      if (typeof data !== "object" || data === null) throw Error("data must be an object");
      translations[locale] = data;
      data.cardinalRules = new Intl.PluralRules(locale);
      data.ordinalRules = new Intl.PluralRules(locale, { type: "ordinal" });
      if (data.formatters) {
        for (const [key, value] of Object.entries(data.formatters)) {
          translations[locale].formatters[key] = buildFormatter(value, locale);
        }
      }
      if (locale === currentLocal) currentTranslations = translations[locale];
      if (useCache) {
        const current = JSON.parse(localStorage.getItem("wfc-locale-messages") || {});
        current[locale] = translations[locale];
        localStorage.setItem("wfc-locale-messages", JSON.stringify(current));
      }
    };
    dateFormatters = [];
    numberFormatters = [];
    relativeTimeFormatters = [];
  }
});

// index.js
var init_lithe = __esm({
  "index.js"() {
    init_signal();
    init_html();
    init_Component();
    init_router();
    init_i18n();
    window.html = html;
    window.i18n = i18n;
  }
});

// docs/routes/404/page.html
var page_default;
var init_page = __esm({
  "docs/routes/404/page.html"() {
    page_default = "<p>Not found</p>\n";
  }
});

// docs/routes/404/index.js
var __exports = {};
__export(__exports, {
  default: () => __default
});
var __default;
var init__ = __esm({
  "docs/routes/404/index.js"() {
    init_lithe();
    init_page();
    __default = class extends Component {
      static pageTitle = "Not found";
      static htmlTemplate = page_default;
      constructor() {
        super();
      }
    };
  }
});

// docs/routes/binding/page.html
var page_default2;
var init_page2 = __esm({
  "docs/routes/binding/page.html"() {
    page_default2 = `<h3 class="page-title">Signals and binding</h3>
<div class="page-subheader wfc-font-title-medium">Bind variables to templates using signals</div>


<section class="page-content-section">
  <nav class="links-nav" aria-label="page-content">
    <div class="wfc-font-headline-small page-secondary-header">Links</div>
    <ul class="links">
      <li><a href="#signal">Signal</a></li>
      <li><a href="#compute">Compute</a></li>
      <li><a href="#effect">Effect</a></li>
    </ul>
  </nav>

  <div class="page-content-container">
    <wfc-card id="signal">
      <div slot="headline">Signal</div>
      <div slot="supporting-text">A signal is a wrapper around a value that can notify interested consumers when that value changes</div>

      <wfc-textfield a class="wfc-raise-label" style="margin-top: 24px;" label="Type something" value="\${page.basicBind}"
        oninput="page.basicBind.value = this.value">
      </wfc-textfield>
      
      <div a style="margin-bottom: 12px; margin-left: 16px;">Value: \${page.basicBind}</div>
      
      <wfc-button onclick="page.updateValue()">Set value to Updated</wfc-button>
      
      <pre>
        <code class="language-html">
  \${\`<!-- Signals automatically update the HTML -->

  <wfc-textfield
    label="Type something"
    value="\\\${page.basicBind}"
    oninput="page.basicBind.value = this.value"
  ></wfc-textfield>

  <div>Value: \\\${page.basicBind}</div>
  <wfc-button onclick="page.updateValue()">Set value to Updated</wfc-button>\`}
        </code>
      </pre>
      <pre>
        <code class="language-javascript">
  \${\`import { Component, Signal } from '@thewebformula/lithe';
  import htmlTemplate from './page.html';

  export default class extends Component {
    static pageTitle = 'Signal';
    static htmlTemplate = htmlTemplate;
    
    basicBind = new Signal('');
    
    constructor() {
      super();
    }

    updateValue() {
      // HTML will automatically update
      this.basicBind.value = 'Updated';
    }
  }\`}
        </code>
      </pre>

      <pre>
        <code class="language-javascript">
  \${\`
  // quick example of using Signal, Compute, and effect
    
  import { Component, Signal, Compute, effect } from '@thewebformula/lithe';
  import htmlTemplate from './page.html';

  export default class extends Component {
    static pageTitle = 'Signal Compute effect';
    static htmlTemplate = htmlTemplate;
    
    one = new Signal(1);
    // Compute will run when first created
    two = new Compute(() => {
      return this.one.value * 2;
    });
    
    constructor() {
      super();

      // runs when any signals or computes contained inside change
      // effect will run when first created
      const dispose = effect(() => {
        if (this.two > 10) {
          // do some work
        }
      });

      // dispose effect
      dispose();
    }
  }\`}
        </code>
      </pre>
    </wfc-card>


    <wfc-card id="compute">
      <div slot="headline">Compute</div>
      <div slot="supporting-text">Compute provides a way to interact with multiple signals to provide a single value</div>
    
      <wfc-textfield b class="wfc-raise-label" type="number" style="margin-top: 24px;" label="Type something" value="\${page.number}"
        oninput="page.number.value = this.value">
      </wfc-textfield>
    
      <div b style="margin-bottom: 12px; margin-left: 16px;">Value: \${page.numberTimesTwo}</div>

      <pre>
        <code class="language-html">
  \${\`<!-- Computes automatically update the HTML -->
  
  <wfc-textfield
    type="number"
    label="Type something"
    value="\\\${page.number}"
    oninput="page.number.value = this.value">
  </wfc-textfield>

  <div>Value: \\\${page.numberTimesTwo}</div>\`}
        </code>
      </pre>
      <pre>
        <code class="language-javascript">
  \${\`import { Component, Signal, Compute } from '@thewebformula/lithe';
  import html from './page.html';

  export default class extends Component {
    static pageTitle = 'Compute';
    static htmlTemplate = html;
    
    number = new Signal(1);
    // Compute will run when first created
    numberTimesTwo = new Compute(() => {
      return this.number.value * 2;
    });
    
    constructor() {
      super();
    }
  }\`}
        </code>
      </pre>
    </wfc-card>


    <wfc-card id="effect">
      <div slot="headline">Effect</div>
      <div slot="supporting-text">Effects allows you to run code based on any changes for signals or computes it contains. The difference between effect and compute is that effects do not return values.</div>
    
      <pre>
        <code class="language-javascript">
  \${\`import { Component, Signal, effect } from '@thewebformula/lithe';
  import html from './page.html';

  export default class extends Component {
    static pageTitle = 'Effect';
    static htmlTemplate = html;
    
    one = new Signal(1);
    two = new Signal(2);
    
    constructor() {
      super();

      // runs when any signals or computes contained inside change
      // effect will run when first created
      const dispose = effect(() => {
        if (this.one.value < this.two.value) {
          // do some work
        }
      });

      // dispose effect
      dispose();
    }
  }\`}
        </code>
      </pre>
    </wfc-card>
  </div>
</section>
`;
  }
});

// docs/routes/binding/index.js
var binding_exports = {};
__export(binding_exports, {
  default: () => binding_default
});
var binding_default;
var init_binding = __esm({
  "docs/routes/binding/index.js"() {
    init_lithe();
    init_page2();
    binding_default = class extends Component {
      static pageTitle = "Signals and binding";
      static htmlTemplate = page_default2;
      basicBind = new Signal("");
      number = new Signal(1);
      numberTimesTwo = new Compute(() => {
        return this.number.value * 2;
      });
      one = new Signal("one");
      two = new Signal("two");
      constructor() {
        super();
      }
      updateValue() {
        this.basicBind.value = "Updated";
      }
    };
  }
});

// docs/routes/build/page.html
var page_default3;
var init_page3 = __esm({
  "docs/routes/build/page.html"() {
    page_default3 = `<h3 class="page-title">Build / Serve</h3>
<div class="page-subheader wfc-font-title-medium">Serve or build app with bundles optimized based on routes</div>

<section class="page-content-section">
  <div class="page-content-container">
    <wfc-card id="build">
      <div slot="headline">Build app</div>
      <div slot="supporting-text">No need for webpack or other bundlers. ESbuild is packed in and pre configured. Builds are
        also optimized based on route entry points.</div>
      <ul slot="supporting-text">
        <li>Minification</li>
        <li>Sourcemaps</li>
        <li>Dev server</li>
        <li>live relaoding</li>
        <li>Gzip content</li>
        <li>File copying</li>
      </ul>
      
      <pre>
        <code class="language-javascript">
  \${\`import build from '@thewebformula/lithe/build';

  /**
  * Basic
  * If using 'app/' as root folder then no config needed
  */
  build();
  

  /**
  * Full config options
  */
  build({
    // Enable spa routing : Default true
    spa: true,

    // folder that contains 'app.js' : Default 'app.js'
    basedir: 'app/',

    // folder that contains 'app.js' : Default 'dist/'
    outdir: 'dist/',

    /**
    * Default true
    * Split code using routes for optimal loading
    */
    chunks: true,

    /**
    * Minify code
    * Set to 'true' when 'NODE_ENV=production'
    *   otherwise it defaults to 'false'
    */
    minify: true,

    /**
    * Create source maps
    * Set to 'false' when 'NODE_ENV=production'
    *   otherwise it defaults to 'true'
    */
    sourcemaps: false,

    /**
    * Compress code
    * Set to 'true' when 'NODE_ENV=production'
    *   otherwise it defaults to 'false'
    */
    gzip: true,

    /**
    * Run dev server
    * Set to 'false' when 'NODE_ENV=production'
    * otherwise it defaults to 'true'
    */
    devServer: true,

    /**
    * Livereload
    * Simply use watch to enable 'node --watch build.js'
    * Set to 'false' when 'NODE_ENV=production'
    * otherwise it defaults to 'true'
    */
    devServerLiveReload: true,
    
    devServerPort: 3000,

    /**
    * devWarnings
    * Enable console warning
    * only html sanitization currently
    * otherwise it defaults to 'false'
    */
    devWarnings: false,

    // supports regex's with wildcards (*, **)
    copyFiles: [
      {
        from: 'app/image.jpg',
        to: 'dist/'
      },
      {
        from: 'app/routes/**/(?!page)*.html',
        to: 'dist/routes'
      },
      {
        from: 'app/code.js',
        to: 'dist/code.js',
        transform({ content, outputFileNames }) {
          // doo work
          return content;
        }
      }
    ],

    // callback before bundle
    onStart: () => {},

    // callback after bundle
    onEnd: () => {}
  });\`}
        </code>
      </pre>

      <div class="card-content" style="margin-top: 42px; margin-bottom: 12px;">
        <div style="font-size: 24px;">Native server</div>
      </div>
      <pre>
        <code class="language-javascript">
  \${\`import { createServer } from 'node:http';
  import { middlewareNode } from '@thewebformula/lithe/middleware';
  
  // same options as above
  const middleware = middlewareNode({
    basedir: 'docs/',
    outdir: 'dist/',
    copyFiles: [
      { from: 'docs/favicon.ico', to: 'dist/' }
    ]
  });
  
  createServer(async (req, res) => {
    const handled = await middleware(req, res);
    if (handled === true) return;
    
    // Do other stuff
  }).listen(3000);\`}
        </code>
      </pre>
      
      <div class="card-content" style="margin-top: 42px; margin-bottom: 12px;">
        <div style="font-size: 24px;">Express server</div>
      </div>
      <pre>
        <code class="language-javascript">
  \${\`import express from 'express';
  import { middlewareExpress } from '@thewebformula/lithe/middleware';
  
  const app = express();
  // same options as above
  app.use(middlewareExpress({
    basedir: 'docs/',
    outdir: 'dist/',
    copyFiles: [
      { from: 'docs/favicon.ico', to: 'dist/' }
    ]
  }));
  app.use(express.static('./docs'));
  app.listen(3000);\`}
        </code>
      </pre>


      <div class="card-content" style="margin-top: 42px; margin-bottom: 12px;">
        <div style="font-size: 24px;">Run commands</div>
      </div>
      <pre>
        <code class="language-bash">
  \${\`# Development run
  node build.js
  
  # Development run with watch to enable livereload
  node --watch-path=./app build.js
  
  # Production run. minifies, gzips, and writes files
  NODE_ENV=production node build.js\`}
        </code>
      </pre>
    </wfc-card>
  </div>
</section>
`;
  }
});

// docs/routes/build/index.js
var build_exports = {};
__export(build_exports, {
  default: () => build_default
});
var build_default;
var init_build = __esm({
  "docs/routes/build/index.js"() {
    init_lithe();
    init_page3();
    build_default = class extends Component {
      static pageTitle = "Build / serve";
      static htmlTemplate = page_default3;
      constructor() {
        super();
      }
    };
  }
});

// docs/routes/getting started/page.html
var page_default4;
var init_page4 = __esm({
  "docs/routes/getting started/page.html"() {
    page_default4 = `<h3 class="page-title">Getting started</h3>
<div class="page-subheader wfc-font-title-medium">Build a basic web application</div>

<section class="page-content-section">
  <nav class="links-nav" aria-label="page-content">
    <div class="wfc-font-headline-small page-secondary-header">Links</div>
    <ul class="links">
      <li><a href="#install">Install</a></li>
      <li><a href="#routing">Routing</a></li>
      <li><a href="#indexhtml">index.html</a></li>
      <li><a href="#appjs">app.js</a></li>
      <li><a href="#appcss">app.css</a></li>
      <li><a href="#pagejs">Page</a></li>
      <li><a href="#build">build</a></li>
      <li><a href="#middleware">Server middleware</a></li>
    </ul>
  </nav>

  <div class="page-content-container">
    <wfc-card id="install">
      <div slot="headline">Install</div>

      <pre>
        <code class="language-bash">
  \${\`npm install @thewebformula/lithe\`}
        </code>
      </pre>
    </wfc-card>


    <wfc-card id="routing">
      <div slot="headline">Routing</div>
      <div slot="supporting-text">@thewebformula/lithe uses directory based routing. All routes go in a 'routes' folder.</div>

      <pre>
        <code class="language-yaml">
  app/
  \u2514\u2500\u2500 routes/
      \u251C\u2500\u2500 index/
      \u2502   \u2514\u2500\u2500 index.js     # /
      \u251C\u2500\u2500 404/
      \u2502   \u2514\u2500\u2500 index.js     # /404 (or any url that is not found)
      \u251C\u2500\u2500 one/
      \u2502   \u2514\u2500\u2500 index.js     # one/
      \u251C\u2500\u2500 two[id?]/
      \u2502   \u2514\u2500\u2500 index.js     # two/:id?
      \u251C\u2500\u2500 three/
      \u2502   \u2514\u2500\u2500 [id]/
      \u2502       \u2514\u2500\u2500 index.js # three/:id
      \u2514\u2500\u2500 four/
          \u2514\u2500\u2500 [...all]/
              \u2514\u2500\u2500 index.js # four/* (four/a/b/)
        </code>
      </pre>

      <div style="margin: 18px">
        <div class="wfc-font-body-large route-list">app/routes/index/index.js \u2192 <span>/</span></div>
        <div class="wfc-font-body-large route-list">app/routes/one/index.js \u2192 <span>one</span></div>
        <div class="wfc-font-body-large route-list">app/routes/two[id?]/index.js \u2192 <span>two/:id?</span></div>
        <div class="wfc-font-body-large route-list">app/routes/three/[id]/index.js \u2192 <span>three/:id</span></div>
        <div class="wfc-font-body-large route-list">app/routes/four/[...rest]/index.js \u2192
          <span>four/*</span>
        </div>

        <div class="wfc-font-title-medium" style="margin-top: 24px; margin-bottom: 8px;">Directory route details</div>
        <div class="wfc-font-body-large route-list"><span>routes/index/index.js</span> Root page (/)</div>
        <div class="wfc-font-body-large route-list"><span>routes/404/index.js</span> Not found page. Auto redirect on non
          matching routes</div>
        <div class="wfc-font-body-large route-list"><span>index.js</span> Route component file</div>
        <div class="wfc-font-body-large route-list"><span>[id]</span> Directory that represents a url parameter</div>
        <div class="wfc-font-body-large route-list"><span>[id?]</span> Directory that represents an options url parameter
        </div>
        <div class="wfc-font-body-large route-list"><span>name[id?]</span> Inline url parameter to avoid sub folder</div>
        <div class="wfc-font-body-large route-list"><span>[...rest]</span> Directory that represents catch-all route</div>
        <div class="wfc-font-body-large route-list"><span>[...rest?]</span> Directory that represents optional catch-all
          route</div>
      </div>
    </wfc-card>


    <wfc-card id="indexhtml">
      <div slot="headline">index.html</div>
    
      <pre>
        <code class="language-html">
  \${\`<!doctype html>
    <html lang="en">
    
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="Cache-Control" content="no-store" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
      <title></title>
      
      <!-- app.js and app.css will automatically be updated to match bundle outputs -->
      <\\link href="app.css" rel="stylesheet">
      <\\script src="app.js" type="module"><\\/script>
    </head>
    
    <body>
      <!-- page template render into this element -->
      <page-content></page-content>

      <!-- Alternative using id attribute -->
      <div id="page-content"></div>
    </body>
  </html>\`}
        </code>
      </pre>
    </wfc-card>


    <wfc-card id="appjs">
      <div slot="headline">Main application file</div>
      <div slot="supporting-text">app.js</div>
      <div slot="supporting-text">Required: Automatically uses app.js as entry file for bundling</div>

      <pre>
        <code class="language-javascript">
  \${\`/* Main app file
  * you can import any code in here
  */
  
  import someModule from './someModule.js';
  
  // routes are automatically loaded\`}
        </code>
      </pre>

      <div style="margin-top: 42px; margin-bottom: 12px;">
        <div style="font-size: 16px;">Prevent navigation allows you to lock down the app for uses like authentication</div>
      </div>
      <pre>
        <code class="language-javascript">
  \${\`import { preventNavigation } from '@thewebformula/lithe';
  
  // if not authenticated redirect to login and prevent navigation
  if (!document.cookie.includes('authenticated=true')) {
    if (location.pathname !== '/login') location.href = '/login';
    preventNavigation(true);
  }\`}
        </code>
      </pre>
    </wfc-card>

    <wfc-card id="appcss">
      <div slot="headline">Main application Styles</div>
      <div slot="supporting-text">app.css</div>
      <div slot="supporting-text">Optional: Will bundle and minify into a single file</div>

      <pre>
        <code class="language-javascript">
  \${\`@import url('./other.css');

  body {
    background-color: white;
  }\`}
        </code>
      </pre>
    </wfc-card>


    <wfc-card id="pagejs">
      <div slot="headline">Page</div>
      <div slot="supporting-text">page.js and page.html</div>

      <pre>
        <code class="language-javascript" wfc-no-binding>
  \${\`import { Component, Signal, html } from '@thewebformula/lithe';
  import htmlTemplate from './page.html'; // automatically bundles
  
  export default class extends Component {
    // html page title
    static pageTitle = 'Page';

    /**
     * Pass in HTML string. Use for imported .HTML
     * Supports template literals: <div>\\\${this.var}</div>
     * @type {String}
     */
    static htmlTemplate = htmlTemplate;

    someVar = new Signal('Some var');
    clickIt_bound = this.clickIt.bind(this);
    
    
    constructor() {
      super();
    }
    
    connectedCallback() {
      console.log(this.urlParameters); // { id: 'value' }
      console.log(this.searchParameters); // { id: 'value' }
    }
    
    disconnectedCallback() { }
    
    // not called on initial render
    beforeRender() { }
    
    afterEnder() {
      this.querySelector('#event-listener-button').addEventListener('click', this.clickIt_bound);
    }
    
    clickIt() {
      console.log('clicked it!');
    }
    
    changeValue() {
      this.someVar.value = 'Value updated';
    }
    
    /**
    * Alternative method for html templates, instead of importing html file
    */
    template() {
      return html\\\`
        <div>Page Content</div>
        <div>\\\${this.someVar}</div>

        \\\${
          // nested html
          this.show ? html\\\`<div>Showing</div>\\\` : ''
        }

        <!--
          You can comment out expressions
          \${\`text\`}
        -->
        
        <!-- "page" will reference the current page class -->
        <button onclick="page.clickIt()">Click Method</button>
        <button id="event-listener-button">Event listener</button>
        <button onclick="page.changeValue()">Change value</button>
      \\\`;
    }
  }\`}
        </code>
      </pre>
    </wfc-card>

    <wfc-card id="build">
      <div slot="headline">Build app</div>
      <div slot="supporting-text">build.js</div>
      <div slot="supporting-text">No need for webpack or other bundlers. ESbuild is packed in and pre configured.
      </div>
      <a href="/build">Build config</a>

      <pre>
        <code class="language-javascript">
  \${\`import build from '@thewebformula/lithe/build';
  
  /**
  * runs dev server by default on port 3000 with livereload
  * basedir defaults to 'app/'
  */
  build({ basedir: 'app/' });\`}
      </code>
    </pre>

  <div style="margin-top: 42px; margin-bottom: 12px;">
    <div style="font-size: 24px;">Run commands</div>
  </div>
  <pre>
      <code class="language-bash">
  \${\`# Development run
  node build.js

  # Development run with watch to enable livereload
  node --watch-path=./app build.js

  # Production run. minifies and gzips
  NODE_ENV=production node build.js
  \`}
        </code>
      </pre>
    </wfc-card>

    <wfc-card id="middleware">
      <div slot="headline">Serve app</div>
      <div slot="supporting-text">server.js</div>
      <div slot="supporting-text">Handle routing and file serving with middleware. GZIP compression is automatically
        handled.</div>
      <a href="/serve">Serve config</a>

      <div class="card-content" style="margin-top: 42px; margin-bottom: 12px;">
        <div style="font-size: 24px;">Native server</div>
      </div>
      <pre>
        <code class="language-javascript">
  \${\`import { createServer } from 'node:http';
  import { middlewareNode } from '@thewebformula/lithe/middleware';
  
  const middleware = middlewareNode({
    basedir: 'docs/',
    outdir: 'dist/',
    copyFiles: [
      { from: 'docs/favicon.ico', to: 'dist/' }
    ]
  });
  
  createServer(async (req, res) => {
    const handled = await middleware(req, res);
    if (handled === true) return;
    
    // Do other stuff
  }).listen(3000);\`}
        </code>
      </pre>

      <div class="card-content" style="margin-top: 42px; margin-bottom: 12px;">
        <div style="font-size: 24px;">Express server</div>
      </div>
      <pre>
        <code class="language-javascript">
  \${\`import express from 'express';
  import { middlewareExpress } from '@thewebformula/lithe/middleware';
  
  const app = express();
  app.use(middlewareExpress({
    basedir: 'docs/',
    outdir: 'dist/',
    copyFiles: [
      { from: 'docs/favicon.ico', to: 'dist/' }
    ]
  }));
  app.use(express.static('./docs'));
  app.listen(3000);\`}
        </code>
      </pre>

      <div class="card-content" style="margin-top: 42px; margin-bottom: 12px;">
        <div style="font-size: 24px;">Livereload</div>
      </div>
      <pre>
        <code class="language-bash">
  \${\`# Simply use node --watch to enable livereload
  node --watch-path=./src --watch-path=./docs server.js\`}
        </code>
      </pre>
    </wfc-card>
  </div>
</section>
`;
  }
});

// docs/routes/getting started/index.js
var getting_started_exports = {};
__export(getting_started_exports, {
  default: () => getting_started_default
});
var getting_started_default;
var init_getting_started = __esm({
  "docs/routes/getting started/index.js"() {
    init_lithe();
    init_page4();
    getting_started_default = class extends Component {
      static pageTitle = "Getting started";
      static htmlTemplate = page_default4;
      constructor() {
        super();
      }
    };
  }
});

// docs/routes/routing/page.html
var page_default5;
var init_page5 = __esm({
  "docs/routes/routing/page.html"() {
    page_default5 = `<h3 class="page-title">Getting started</h3>
<div class="page-subheader wfc-font-title-medium">Build a basic web application</div>



<section class="page-content-section">
  <nav class="links-nav" aria-label="page-content">
    <div class="wfc-font-headline-small page-secondary-header">Links</div>
    <ul class="links">
      <li><a href="#routing">Directory routing</a></li>
      <li><a href="#pageexample">Page.js</a></li>
    </ul>
  </nav>

  <div class="page-content-container">
    <wfc-card id="routing">
      <div slot="headline">Routing</div>
      <div slot="supporting-text">@thewebformula/lithe uses directory based routing. All routes go in a 'routes' folder.</div>
    
      <pre>
        <code class="language-yaml">
  \${\`app/
  \u2514\u2500\u2500 routes/
      \u251C\u2500\u2500 index/
      \u2502   \u2514\u2500\u2500 index.js     # /
      \u251C\u2500\u2500 404/
      \u2502   \u2514\u2500\u2500 index.js     # /404 (or any url that is not found)
      \u251C\u2500\u2500 one/
      \u2502   \u2514\u2500\u2500 index.js     # one/
      \u251C\u2500\u2500 two[id?]/
      \u2502   \u2514\u2500\u2500 index.js     # two/:id?
      \u251C\u2500\u2500 three/
      \u2502   \u2514\u2500\u2500 [id]/
      \u2502       \u2514\u2500\u2500 index.js # three/:id
      \u2514\u2500\u2500 four/
          \u2514\u2500\u2500 [...all]/
              \u2514\u2500\u2500 index.js # four/*all (four/a/b/)\`}
        </code>
      </pre>
    
      <div style="margin: 18px">
        <div class="wfc-font-body-large route-list">app/routes/index/index.js \u2192 <span>/</span></div>
        <div class="wfc-font-body-large route-list">app/routes/one/index.js \u2192 <span>one</span></div>
        <div class="wfc-font-body-large route-list">app/routes/two[id?]/index.js \u2192 <span>two/:id?</span></div>
        <div class="wfc-font-body-large route-list">app/routes/three/[id]/index.js \u2192 <span>three/:id</span></div>
        <div class="wfc-font-body-large route-list">app/routes/four/[...rest]/index.js \u2192
          <span>four/*rest</span>
        </div>
    
        <div class="wfc-font-title-medium" style="margin-top: 24px; margin-bottom: 8px;">Directory route details</div>
        <div class="wfc-font-body-large route-list"><span>routes/index/index.js</span> Root page (/)</div>
        <div class="wfc-font-body-large route-list"><span>routes/404/index.js</span> Not found page. Auto redirect on non
          matching routes</div>
        <div class="wfc-font-body-large route-list"><span>index.js</span> Route component file</div>
        <div class="wfc-font-body-large route-list"><span>[id]</span> Directory that represents a url parameter</div>
        <div class="wfc-font-body-large route-list"><span>[id?]</span> Directory that represents an options url parameter
        </div>
        <div class="wfc-font-body-large route-list"><span>name[id?]</span> Inline url parameter to avoid sub folder</div>
        <div class="wfc-font-body-large route-list"><span>[...rest]</span> Directory that represents catch-all route</div>
        <div class="wfc-font-body-large route-list"><span>[...rest?]</span> Directory that represents optional catch-all
          route</div>
      </div>
    </wfc-card>
    
    <wfc-card id="pageexample">
      <div slot="headline">Page</div>
      <div slot="supporting-text">Accessing url parameters</div>
    
      <pre>
        <code class="language-javascript" wfc-no-binding>
  \${\`import { Component } from '@thewebformula/lithe';
  import html from './page.html'; // automatically bundles
  
  export default class extends Component {
    // html page title
    static pageTitle = 'Page';

    // hook up imported html. Supports template literals (\\\${this.someVar})
    static htmlTemplate = html;
    
    constructor() {
      super();
    }
    
    connectedCallback() {
      // one[id] one/:id one/value
      console.log(this.urlParameters); // { id: 'value' }

      // two[...rest] two/*rest two/a/b
      console.log(this.urlParameters); // { rest: 'a/b' }
    }
  }\`}
        </code>
      </pre>
    </wfc-card>
  </div>
</section>
`;
  }
});

// docs/routes/routing/index.js
var routing_exports = {};
__export(routing_exports, {
  default: () => routing_default
});
var routing_default;
var init_routing = __esm({
  "docs/routes/routing/index.js"() {
    init_lithe();
    init_page5();
    routing_default = class extends Component {
      static pageTitle = "Routing";
      static htmlTemplate = page_default5;
      constructor() {
        super();
      }
    };
  }
});

// docs/routes/multi language/page.html
var page_default6;
var init_page6 = __esm({
  "docs/routes/multi language/page.html"() {
    page_default6 = `<h3 class="page-title">Localization</h3>

<section class="page-content-section">
  <nav class="links-nav" aria-label="page-content">
    <div class="wfc-font-headline-small page-secondary-header">Links</div>
    <ul class="links">
      <li><a href="#Localization">Localization</a></li>
    </ul>
  </nav>

  <div class="page-content-container">
    <wfc-card id="Localization">
      <div slot="headline">Localization</div>
      <div slot="supporting-text">Localization allows to configure multiple locales with local message configurations</div>
      <ul slot="supporting-text">
        <li>Pluralization</li>
        <li>Date formatting</li>
        <li>Number formatting</li>
        <li>Relative time formatting</li>
      </ul>

      <wfc-switch \${page.languagesChecked ? 'checked' : '' } onchange="page.changeLanguage(this.checked)">en / es</wfc-switch>

      <div>\${i18n('About')}</div>
      <div>\${i18n('key_string')}</div>
      <div>\${page.count} \${i18n.format('itemPlural', page.count)}</div>
      <div>\${i18n('time_from_now', page.time)}</div>
      <div>\${i18n('date_key', page.date)}</div>
      <div>\${i18n('currency_key', page.currency)}</div>

      <div style="margin-top: 24px">
        <div class="wfc-font-title-medium">Dynamic pluralization with signals</div>
        <wfc-textfield label="\${i18n('Label days')}" type="number" value="\${page.days}" style="margin-top: 12px; margin-bottom: 12px;"
          oninput="page.days.value = this.value"></wfc-textfield>
        <div>\${i18n('relativeTime_key', page.days)}</div>
      </div>
    
      <pre>
        <code class="language-javascript" wfc-no-binding>
  \${\`import { i18n } from '@thewebformula/lithe';
  
  /* Set locale
   *   Defaults to browser if not set
   *   You can use language only locale 'en' and 'en-US'
   */
  i18n.setLocale('en-US');

  // turn on cache. This will load and save data to localStorage
  i18n.cache();

  // Load local messages
  i18n.addTranslation('en', en);
  i18n.addTranslation('es', es);\`}
        </code>
      </pre>

      <pre>
        <code class="language-html" wfc-no-binding>
  \${\`<!-- Use i18n method to translate keys -->
  <div>\\\${i18n('About')}</div>
  <div>\\\${i18n('key_string')}</div>

  <!-- Use i18n.format method to handle individual formatting -->
  <div>\\\${page.count} \\\${i18n.format('itemPlural', page.count)}</div>

  <!-- Use message variables and formatters: "time_from_now": "$1 $minutesCardinal($1) from now" -->
  <div>\\\${i18n('time_from_now', page.time)}</div>
  <div>\\\${i18n('date_key', page.date)}</div>
  <div>\\\${i18n('currency_key', page.currency)}</div>
  
  <div>
    <div class="wfc-font-title-medium">Dynamic pluralization with signals</div>
    <wfc-textfield label="\\\${i18n('Label days')}" type="number" value="\\\${page.days}"
      oninput="page.days.value = this.value"></wfc-textfield>
    <div>\\\${i18n('relativeTime_key', page.days)}</div>
  </div>
  
  <!-- Attribute binding -->
  <wfc-textfield i18n-attr="label" label="Label days" value="\\\${page.days}" oninput="page.days = this.value"></wfc-textfield>
  
  <!-- Attribute binding multiple -->
  <div i18n-attr="one,two" one="one" two="two"></div>\`}
        </code>
      </pre>


      <pre>
        <code class="language-json" wfc-no-binding>
  \${\`// en
  
  // type configuration
  { "formatters": {
    "itemPlural": {
      "type": "cardinal",
      "zero": "items",
      "one": "item",
      "two": "items",
      "few": "items",
      "many": "items",
      "other": "items" },
    "placeOrdinal": {
      "type": "ordinal",
      "one": "st",
      "two": "nd",
      "few": "rd",
      "other": "th" },
    "minutesCardinal": {
      "type": "cardinal",
      "one": "minute",
      "other": "minutes" },
    "dateFormat": {
      "type": "date",
      "options": {
        "dateStyle": "short",
        "timeStyle": "short" } },
    "currencyFormat": {
      "type": "number",
      "options": {
        "style": "currency",
        "currency": "USD" } },
    "relativeTimeFormat": {
      "type": "relativeTime",
      "unit": "day",
      "options": {
        "style": "short" } } },
  
  "messages": {
    "About": "About",
    "Label days": "Label days",
    "key_string": "This is a key string",
    "time_from_now": "$1 $minutesCardinal($1) from now",
    "date_key": "$dateFormat($1)",
    "item_count": "$1 $itemPlural($1)",
    "place_ordinal": "$1 $placeOrdinal($1)",
    "currency_key": "$currencyFormat($1)",
    "relativeTime_key": "$relativeTimeFormat($1)" } }\` }
        </code>
      </pre>

      <pre>
        <code class="language-json" wfc-no-binding>
  \${\`// es
  
  // type configuration
  { "formatters": {
    "itemPlural": {
      "type": "cardinal",
      "zero": "elementos",
      "one": "art\xEDculo",
      "two": "elementos",
      "few": "elementos",
      "many": "elementos",
      "other": "elementos" },
    "placeOrdinal": {
      "type": "ordinal",
      "one": "er",
      "two": "do",
      "few": "er",
      "other": "to" },
    "minutesCardinal": {
      "type": "cardinal",
      "one": "minuto",
      "other": "minutos" },
    "dateFormat": {
      "type": "date",
      "options": {
        "dateStyle": "short",
        "timeStyle": "short" } },
    "currencyFormat": {
      "type": "number",
      "options": {
        "style": "currency",
        "currency": "MXN" } },
    "relativeTimeFormat": {
      "type": "relativeTime",
      "unit": "day",
      "options": {
        "style": "short" } } },
  
  "messages": {
    "About": "Acerca de",
    "Label days": "D\xEDas de etiqueta",
    "key_string": "Esta es una cadena clave",
    "item_count": "$1 $itemPlural($1)",
    "place_ordinal": "$1 $placeOrdinal($1)",
    "time_from_now": "$1 $minutesCardinal($1) desde ahora",
    "date_key": "$dateFormat($1)",
    "currency_key": "$currencyFormat($1)",
    "relativeTime_key": "$relativeTimeFormat($1)" } }\` }
        </code>
      </pre>
    </wfc-card>
  </div>
</section>
`;
  }
});

// docs/locales/en.json
var en_default;
var init_en = __esm({
  "docs/locales/en.json"() {
    en_default = {
      formatters: {
        itemPlural: {
          type: "cardinal",
          zero: "items",
          one: "item",
          two: "items",
          few: "items",
          many: "items",
          other: "items"
        },
        placeOrdinal: {
          type: "ordinal",
          one: "st",
          two: "nd",
          few: "rd",
          other: "th"
        },
        minutesCardinal: {
          type: "cardinal",
          one: "minute",
          other: "minutes"
        },
        dateFormat: {
          type: "date",
          options: {
            dateStyle: "short",
            timeStyle: "short"
          }
        },
        currencyFormat: {
          type: "number",
          options: {
            style: "currency",
            currency: "USD"
          }
        },
        relativeTimeFormat: {
          type: "relativeTime",
          unit: "day",
          options: {
            style: "short"
          }
        }
      },
      messages: {
        About: "About",
        "Label days": "Label days",
        key_string: "This is a key string",
        time_from_now: "$1 $minutesCardinal($1) from now",
        date_key: "$dateFormat($1)",
        item_count: "$1 $itemPlural($1)",
        place_ordinal: "$1 $placeOrdinal($1)",
        currency_key: "$currencyFormat($1)",
        relativeTime_key: "$relativeTimeFormat($1)"
      }
    };
  }
});

// docs/locales/es.json
var es_default;
var init_es = __esm({
  "docs/locales/es.json"() {
    es_default = {
      formatters: {
        itemPlural: {
          type: "cardinal",
          zero: "elementos",
          one: "art\xEDculo",
          two: "elementos",
          few: "elementos",
          many: "elementos",
          other: "elementos"
        },
        placeOrdinal: {
          type: "ordinal",
          one: "er",
          two: "do",
          few: "er",
          other: "to"
        },
        minutesCardinal: {
          type: "cardinal",
          one: "minuto",
          other: "minutos"
        },
        dateFormat: {
          type: "date",
          options: {
            dateStyle: "short",
            timeStyle: "short"
          }
        },
        currencyFormat: {
          type: "number",
          options: {
            style: "currency",
            currency: "MXN"
          }
        },
        relativeTimeFormat: {
          type: "relativeTime",
          unit: "day",
          options: {
            style: "short"
          }
        }
      },
      messages: {
        About: "Acerca de",
        "Label days": "D\xEDas de etiqueta",
        key_string: "Esta es una cadena clave",
        item_count: "$1 $itemPlural($1)",
        place_ordinal: "$1 $placeOrdinal($1)",
        time_from_now: "$1 $minutesCardinal($1) desde ahora",
        date_key: "$dateFormat($1)",
        currency_key: "$currencyFormat($1)",
        relativeTime_key: "$relativeTimeFormat($1)"
      }
    };
  }
});

// docs/routes/multi language/index.js
var multi_language_exports = {};
__export(multi_language_exports, {
  default: () => multi_language_default
});
var multi_language_default;
var init_multi_language = __esm({
  "docs/routes/multi language/index.js"() {
    init_lithe();
    init_page6();
    init_lithe();
    init_en();
    init_es();
    multi_language_default = class extends Component {
      static pageTitle = "Multiple languages";
      static htmlTemplate = page_default6;
      languagesChecked = false;
      time = 30;
      date = /* @__PURE__ */ new Date();
      currency = "123.45";
      days = new Signal(3);
      count = new Signal(1);
      constructor() {
        super();
        i18n.addTranslation("en", en_default);
        i18n.addTranslation("es", es_default);
      }
      changeLanguage(checked) {
        this.languagesChecked = checked;
        i18n.setLocale(checked ? "es" : "en");
      }
      disconnectedCallback() {
        i18n.setLocale(navigator.language);
      }
    };
  }
});

// docs/routes/index/page.html
var page_default7;
var init_page7 = __esm({
  "docs/routes/index/page.html"() {
    page_default7 = '<h3 class="page-title">Lithe</h3>\n<div class="page-subheader wfc-font-title-medium">A lithe framework for the web</div>\n\n<div class="wfc-font-headline-small page-secondary-header">Highlights</div>\n<ul class="page-list">\n  <li>&#9889; <strong>Lightweight</strong> - <strong>5</strong><strong style="font-size: 17px;">KB</strong> compressed</li>\n  <li>&#9889; <strong>Fast</strong> - optimized FCP and low overhead</li>\n  <li>&#9889; <strong>Simple</strong> - No complex concepts</li>\n  <li>&#9889; <strong>Full featured</strong> - Signals, internationalization, routing, bundling</li>\n</ul>\n\n<div class="wfc-font-headline-small page-secondary-header">About</div>\n<div class="wfc-font-body-large"> \n  Browsers, javascript, css, and html provide a robust set of features these days. With the addition of a couple of\n  features like routing, we can build small performant applications without a steep learning curve. Webformula core\n  provides the tools to achieve this in a tiny package (5KB).\n</div>\n\n<div class="wfc-font-headline-small page-secondary-header" style="font-size: 20px;">SEO and SPA</div>\n<div class="wfc-font-body-large">\n  Applications are built with a separate pre-rendered HTML file for each page. This means search engines will be able to catalog your entire application.\n  While there is a separate HTML file for every page the application will still act like a SPA. It will download the entire application code and styles.\n  The application will also build everything so it can be statically loaded from a CDN. Alternatively you can use server middleware to serve the application.\n</div>\n\n<div class="wfc-font-headline-small page-secondary-header" style="font-size: 20px;">Links</div>\n<ul class="page-list">\n  <li>\n    <a class="github-link" href="https://github.com/TheWebFormula/lithe" target="_blank">\n      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">\n        <title>github-circle-black-transparent</title>\n        <path\n          d="M10 0C4.477 0 0 4.477 0 10c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V19c0 .27.16.59.67.5C17.14 18.16 20 14.42 20 10A10 10 0 0 0 10 0z"\n          fill="#444444" fill-rule="evenodd"></path>\n      </svg>\n      <span style="margin-left: 8px;">Lithe</span>\n    </a>\n  </li>\n  <li>\n    <a class="github-link" href="https://github.com/TheWebFormula/lithe/tree/main/docs" target="_blank">\n      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">\n        <title>github-circle-black-transparent</title>\n        <path\n          d="M10 0C4.477 0 0 4.477 0 10c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V19c0 .27.16.59.67.5C17.14 18.16 20 14.42 20 10A10 10 0 0 0 10 0z"\n          fill="#444444" fill-rule="evenodd"></path>\n      </svg>\n      <span style="margin-left: 8px;">Lithe example</span>\n    </a>\n  </li>\n</ul>\n';
  }
});

// docs/routes/index/index.js
var index_exports = {};
__export(index_exports, {
  default: () => index_default
});
var index_default;
var init_index = __esm({
  "docs/routes/index/index.js"() {
    init_lithe();
    init_page7();
    index_default = class extends Component {
      static pageTitle = "Home";
      static htmlTemplate = page_default7;
      constructor() {
        super();
      }
    };
  }
});

// docs/routes/fetcher/page.html
var page_default8;
var init_page8 = __esm({
  "docs/routes/fetcher/page.html"() {
    page_default8 = `<h3 class="page-title">Fetcher</h3>
<div class="page-subheader wfc-font-title-medium">Extension on fetch that includes interceptors</div>


<section class="page-content-section">
  <div class="page-content-container">
    <wfc-card id="pagejs">
      <div slot="headline">Fetcher</div>
    
      <pre>
        <code class="language-javascript">
  \${\`import { fetcher, createFetcher } from '@thewebformula/lithe';

  /** Main fetcher */
  
  // interceptors
  fetcher('/get', { interceptors: {
    // called on 401
    auth(config) {
      config.headers.Authorization = 'Bearer token';
      return config;
    },
    before(config) {
      // modify config
      return config;
    }
  });

  /** Example: JWT refresh access token on 401 */
  fetcher('/get', { interceptors: {
    async auth(config) {
      const refreshResponse = await fetcher('/refreshToken', {
        headers: { Authorization: 'Bearer refresh_token' }
      });
      config.headers.Authorization = await refreshResponse.text();
      return config;
    }
  });


  /** Fetcher instance */
  
  // global config for all instance requests
  const fetcherInstance = createFetcher({
    baseUrl: '',
    headers: {
      Authorization: 'Bearer token'
    },
    interceptors: {
      auth(config) {
        config.headers.Authorization = 'Bearer token';
        return config;
      },
      before(config) {
        // modify config
        return config;
      }
    }
  });
  
  fetcherInstance('/get');
  
  // request specific interceptors using an instance
  fetcherInstance('/get', {}, interceptors: {
    auth(config) {
      config.headers.Authorization = 'Bearer token';
      return config;
    },
    before(config) {
      config.headers.Authorization = 'Bearer token';
      return config;
    }
  });\`}
        </code>
      </pre>
    </wfc-card>
  </div>
</section>
`;
  }
});

// docs/routes/fetcher/index.js
var fetcher_exports = {};
__export(fetcher_exports, {
  default: () => fetcher_default
});
var fetcher_default;
var init_fetcher = __esm({
  "docs/routes/fetcher/index.js"() {
    init_lithe();
    init_page8();
    fetcher_default = class extends Component {
      static pageTitle = "Fetcher";
      static htmlTemplate = page_default8;
      constructor() {
        super();
      }
    };
  }
});

// docs/routes/templates/page.html
var page_default9;
var init_page9 = __esm({
  "docs/routes/templates/page.html"() {
    page_default9 = '<h3 class="page-title">Templates</h3>\n\n<section class="page-content-section">\n  <nav class="links-nav" aria-label="page-content">\n    <div class="wfc-font-headline-small page-secondary-header">Links</div>\n    <ul class="links">\n      <li><a href="#expressions">Expressions and bindings</a></li>\n      <li><a href="#templates">Templates</a></li>\n    </ul>\n  </nav>\n\n  <div class="page-content-container">\n    \n    <wfc-card id="expressions">\n      <div slot="headline">Expressions and bindings</div>\n      <div slot="supporting-text">Templates are simply Javascript template literals. This means building template expressions is familiar and strait forward. There is a <strong>html</strong> tag function for rendering text as html.</div>\n\n\n      <wfc-divider></wfc-divider>\n      <div class="wfc-font-title-medium" style="margin-bottom: 20px">Template html</div>\n\n      <div>Some plain text in a div</div>\n      <div><strong>Plain text variable</strong> ${page.plainText}</div>\n\n      <div style="margin: 42px 0px;">\n        <div class="wfc-font-title-large" style="margin-bottom: 8px;">Signal variable</div>\n\n        <wfc-textfield value="${page.signalVar}" oninput="page.signalVar.value = this.value" label="Update value" style="margin-bottom: 12px;"></wfc-textfield>\n        <div><strong style="color: #444">Bound</strong> ${page.signalVar}</div>\n      </div>\n\n\n      <div style="margin: 42px 0px;">\n        <div class="wfc-font-title-large" style="margin-bottom: 8px;">Dynamically computing HTML</div>\n        <wfc-switch checked="${page.showFirst}" onchange="page.showFirst.value = this.checked">Switch HTML</wfc-switch>\n        ${html(() => (\n          page.showFirst.value ?\n            html`<div>First</div>` :\n            html`<div>Second</div>`\n        ))}\n      </div>\n\n      <div style="margin: 42px 0px;">\n        <div class="wfc-font-title-large" style="margin-bottom: 8px;">Looping with Signals</div>\n        <wfc-textfield id="valueinput" placeholder="...value"></wfc-textfield>\n        <wfc-button onclick="page.addValue(valueinput.value);" style="margin-top: 8px;">Add value</wfc-button>\n        ${html(() => page.loopVar.value.map(item => html`<div>Value: ${item.value}</div>`))}\n      </div>\n\n      <!--\n        HTML comments work on expressions\n        ${`commented out ${page.plainText}`}\n      -->\n      \n      <pre>\n        <code class="language-html" wfc-no-binding>\n  ${`<!-- page.html -->\n  <wfc-divider></wfc-divider>\n  <div class="wfc-font-title-medium">Template html</div>\n\n  <div>Some plain text in a div</div>\n  <div><strong>Plain text variable</strong> \\${page.plainText}</div>\n\n  <div>\n    <div class="wfc-font-title-large">Signal variable</div>\n\n    <wfc-textfield value="\\${page.signalVar}" oninput="page.signalVar.value = this.value" label="Update value"></wfc-textfield>\n    <div><strong style="color: #444">Bound</strong> \\${page.signalVar}</div>\n  </div>\n\n\n  <div>\n    <div class="wfc-font-title-large">Dynamically computing HTML</div>\n    <wfc-switch checked="\\${page.showFirst}" onchange="page.showFirst.value = this.checked">Switch HTML</wfc-switch>\n    \\${html(() => (\n      page.showFirst.value ?\n        html\\`<div>First</div>\\` :\n        html\\`<div>Second</div>\\`\n    ))}\n  </div>\n\n  <div>\n    <div class="wfc-font-title-large">Looping with Signals</div>\n    <wfc-textfield id="valueinput" placeholder="...value"></wfc-textfield>\n    <wfc-button onclick="page.addValue(valueinput.value);">Add value</wfc-button>\n    \\${html(() => page.loopVar.value.map(item => html\\`<div>Value: \\${item.value}</div>\\`))}\n  </div>\n\n  <!--\n    HTML comments work on expressions\n    \\${\\`commented out \\${page.plainText}\\`}\n  -->`}\n        </code>\n      </pre>\n      <pre>\n        <code class="language-javascript" wfc-no-binding>\n  ${`// page.js\n  import { Component } from \'@thewebformula/lithe\';\n  import htmlTemplate from \'./page.html\';\n\n  export default class extends Component {\n    static pageTitle = \'Template html file\';\n\n    // Load HTML template file\n    static htmlTemplate = htmlTemplate;\n    \n\n    plainText = \'plainText value\';\n    signalVar = new Signal(\'signalVar value\');\n    loopVar = new Signal([\n      { value: \'One\' },\n      { value: \'Two\' },\n      { value: \'Three\' }\n    ]);\n    showFirst = new Signal(true);\n\n    \n    constructor() {\n      super();\n    }\n\n    addValue(value) {\n      if (!value) return;\n      this.loopVar.value = [...this.loopVar.value, {value}];\n    }\n  }`}\n        </code>\n      </pre>\n    </wfc-card>\n\n\n    <wfc-card id="templates">\n      <div slot="headline">Templates</div>\n      <div slot="supporting-text">There are two methods for including templates in pages and components</div>\n      <ul slot="supporting-text">\n        <li>HTML file</li>\n        <li>Page function</li>\n      </ul>\n      \n\n\n      <div style="margin-top: 42px; margin-bottom: -8px;">\n        <div style="font-size: 24px;">HTML file</div>\n      </div>\n      <pre>\n        <code class="language-html" wfc-no-binding>\n  ${`<!-- page.html -->\n  <h3>Page</h3>\n  <div>Content</div>`}\n        </code>\n      </pre>\n      <pre>\n        <code class="language-javascript" wfc-no-binding>\n  ${`// page.js\n  import { Component } from \'@thewebformula/lithe\';\n  import htmlTemplate from \'./page.html\';\n\n  export default class extends Component {\n    static pageTitle = \'Template html file\';\n\n    // Load HTML template file\n    static htmlTemplate = htmlTemplate;\n    \n    constructor() {\n      super();\n    }\n  }`}\n        </code>\n      </pre>\n\n      <div style="margin-top: 42px; margin-bottom: 12px;">\n        <div style="font-size: 24px;">Page function</div>\n      </div>\n\n      <pre>\n        <code class="language-javascript" wfc-no-binding>\n  ${`// page.js page function\n  import { Component, html } from \'@thewebformula/lithe\';\n\n  export default class extends Component {\n    static pageTitle = \'Template function\';\n\n    // Load HTML template file\n    static htmlTemplate = htmlTemplate;\n    \n    constructor() {\n      super();\n    }\n\n    // Template function\n    template() {\n      return html\\`\n        <h3>Page</h3>\n        <div>Content</div>\n      \\`;\n    }\n  }`}\n        </code>\n      </pre>\n    </wfc-card>\n  </div>\n</section>\n';
  }
});

// docs/routes/templates/index.js
var templates_exports = {};
__export(templates_exports, {
  default: () => templates_default
});
var templates_default;
var init_templates = __esm({
  "docs/routes/templates/index.js"() {
    init_lithe();
    init_page9();
    templates_default = class extends Component {
      static pageTitle = "Templates";
      static htmlTemplate = page_default9;
      plainText = "plainText value";
      signalVar = new Signal("signalVar value");
      loopVar = new Signal([
        { value: "One" },
        { value: "Two" },
        { value: "Three" }
      ]);
      showFirst = new Signal(true);
      constructor() {
        super();
      }
      addValue(value) {
        if (!value) return;
        this.loopVar.value = [...this.loopVar.value, { value }];
      }
    };
  }
});

// docs/routes/web component/page.html
var page_default10;
var init_page10 = __esm({
  "docs/routes/web component/page.html"() {
    page_default10 = `<h3 class="page-title">Web component</h3>
<div class="page-subheader wfc-font-title-medium">Webformula core provides a convenient way to build native web components</div>

<custom-button></custom-button>

<section class="page-content-section">
  <nav class="links-nav" aria-label="page-content">
    <div class="wfc-font-headline-small page-secondary-header">Links</div>
    <ul class="links">
      <li><a href="#pagejs">page.js</a></li>
      <li><a href="#componentjs">component.js</a></li>
      <li><a href="#nteracting">Interacting with components</a></li>
    </ul>
  </nav>

  <div class="page-content-container">
    <wfc-card id="pagejs">
      <div slot="headline">Page file</div>
      <div slot="supporting-text">page.js</div>
      <div slot="supporting-text">Web component is imported in this file</div>

      <pre>
        <code class="language-javascript">
  \${\`import { Component, html } from '@thewebformula/lithe';
  /* HTML imports will bundle with the build */
  import htmlTemplate from './page.html';

  // imported component
  import './component.js';
  
  export default class extends Component {
    // html page title
    static pageTitle = 'Page';

    // you can set the html from and import or use the template method (see below)
    static htmlTemplate = htmlTemplate;
    
    constructor() {
      super();
    }

    // this can be used in place of import the html file
    template() {
      return html\\\`\${\`
        <div>Page Content</div>

        <!-- custom component -->
        <custom-button>Click</custom-button>
      \`}\\\`;
    }
  }\`}
        </code>
      </pre>
    </wfc-card>

    <wfc-card id="componentjs">
      <div slot="headline">Component file</div>
      <div slot="supporting-text">component.js</div>
      
      <pre>
        <code class="language-html">
  \${\`<!-- component.html -->
  <button><slot></slot></button>\`}
        </code>
      </pre>
      
      <pre>
        <code class="language-javascript">
  \${\`import { Component } from '@thewebformula/lithe';
  import htmlTemplate from './component.html';
  
  class CustomButton extends Component {
    /**
      * Pass in HTML string. Use for imported .HTML
      * Supports template literals: <div>\${this.var}</div>
      * @type {String}
      */
    static htmlTemplate = htmlTemplate;


    /**
      * Hook up shadow root
      * @type {Boolean}
      */
    static useShadowRoot = false;

    
    /**
      * @type {Boolean}
      */
    static shadowRootDelegateFocus = false;


    /**
      * Pass in styles for shadow root.
      * Can use imported stylesheets: import styles from '../styles.css' assert { type: 'css' };
      * @type {CSSStyleSheet}
      */
    static shadowRootStyleSheets;


    /**
      * @typedef {String} AttributeType
      * @value '' default handling
      * @value 'string' Convert to a string. null = ''
      * @value 'number' Convert to a number. isNaN = ''
      * @value 'int' Convert to a int. isNaN = ''
      * @value 'boolean' Convert to a boolean. null = false
      * @value 'event' Allows code to be executed. Similar to onchange="console.log('test')"
      */
      /**
      * Enhances observedAttributes, allowing you to specify types
      * You can still use \\\`observedAttributes\\\` in stead of this.
      * @type {Array.<[name:String, AttributeType]>}
      */
    static get observedAttributesExtended() { return []; }; // static observedAttributesExtended = [['required', 'boolean']];
    

    /**
      * Use with observedAttributesExtended
      * You can still use \\\`attributeChangedCallback\\\` in stead of this.
      * @function
      * @param {String} name - Attribute name
      * @param {String} oldValue - Old attribute value
      * @param {String} newValue - New attribute value
      */
    attributeChangedCallbackExtended(name, oldValue, newValue) { }


    // need to bind events to access \\\`this\\\`
    #onClick_bound = this.#onClick.bind(this);

    
    constructor() {
      super();
    }

    /**
     * Method that returns a html template string. This is an alternative to use static htmlTemplate
     * @name template
     * @function
     * @return {String}
     */
    template() { return '<div></div>' }

    connectedCallback() {}
    disconnectedCallback() {}
    beforeRender() {}

    afterRender() {
      this.#root.querySelector('button').addEventListener('click', this.#onClick_bound);
    }
    
    disconnectedCallback() {
      this.#root.querySelector('button').removeEventListener('click', this.#onClick_bound);
    }

    #onClick() {
      console.log('Custom button component clicked!');
    }
  }
  
  // define web component
  customElements.define('custom-button', CustomButton);\`}
        </code>
      </pre>
    </wfc-card>


    <wfc-card id="nteracting">
      <div slot="headline">Interacting with component elements</div>
      
      <pre>
        <code class="language-html">
  \${\`<!-- index.html -->
  <body>
    <custom-webcomponent></custom-webcomponent>
  </body>\`}
        </code>
      </pre>

      <pre>
        <code class="language-html">
  \${\`<!-- component.html -->
  <button onclick="this.closest('custom-webcomponent').clickIt()">Click it direct</button>
  <button id="eventlistener-button">Click it event listener</button>\`}
        </code>
      </pre>
    
      <pre>
        <code class="language-javascript">
  \${\`import { Component } from '@thewebformula/lithe';
  import html from './component.html'; // automatically bundles
  
  class CustomWebcomponent extends Component {
    static htmlTemplate = html;

    // need to bind events to access \\\`this\\\`
    #onClick_bound = this.clickIt.bind(this);

    varOne = 'var one';

    
    constructor() {
      super();
    }

    afterRender() {
      this.#root.querySelector('#eventlistener-button').addEventListener('click', this.#onClick_bound);
    }
    
    disconnectedCallback() {
      this.#root.querySelector('#eventlistener-button').removeEventListener('click', this.#onClick_bound);
    }

    clickIt() {
      console.log('click it!');
    }
  }
  
  // define web component
  customElements.define('custom-webcomponent', CustomWebcomponent);\`}
        </code>
      </pre>
    </wfc-card>
  </div>
</section>
`;
  }
});

// docs/routes/web component/index.js
var web_component_exports = {};
__export(web_component_exports, {
  default: () => web_component_default
});
var web_component_default;
var init_web_component = __esm({
  "docs/routes/web component/index.js"() {
    init_lithe();
    init_page10();
    web_component_default = class extends Component {
      static pageTitle = "Web component";
      static htmlTemplate = page_default10;
      constructor() {
        super();
      }
    };
  }
});

// docs/app.js
init_lithe();

// ../../webformula/material/src/styles.css
var styles = new CSSStyleSheet();
styles.replaceSync(`:root{--wfc-primary: var(--wfc-primary-40);--wfc-primary-container: var(--wfc-primary-90);--wfc-on-primary: var(--wfc-primary-100);--wfc-on-primary-container: var(--wfc-primary-10);--wfc-primary-inverse: var(--wfc-primary-80);--wfc-primary-fixed: var(--wfc-primary-90);--wfc-primary-fixed-dim: var(--wfc-primary-80);--wfc-on-primary-fixed: var(--wfc-primary-10);--wfc-on-primary-fixed-variant: var(--wfc-primary-30);--wfc-secondary: var(--wfc-secondary-40);--wfc-secondary-container: var(--wfc-secondary-90);--wfc-on-secondary: var(--wfc-secondary-100);--wfc-on-secondary-container: var(--wfc-secondary-10);--wfc-secondary-fixed: var(--wfc-secondary-90);--wfc-secondary-fixed-dim: var(--wfc-secondary-80);--wfc-on-secondary-fixed: var(--wfc-secondary-10);--wfc-on-secondary-fixed-variant: var(--wfc-secondary-30);--wfc-tertiary: var(--wfc-tertiary-40);--wfc-tertiary-container: var(--wfc-tertiary-90);--wfc-on-tertiary: var(--wfc-tertiary-100);--wfc-on-tertiary-container: var(--wfc-tertiary-10);--wfc-tertiary-fixed: var(--wfc-tertiary-90);--wfc-tertiary-fixed-dim: var(--wfc-tertiary-80);--wfc-on-tertiary-fixed: var(--wfc-tertiary-10);--wfc-on-tertiary-fixed-variant: var(--wfc-tertiary-30);--wfc-error: var(--wfc-error-40);--wfc-error-container: var(--wfc-error-90);--wfc-on-error: var(--wfc-error-100);--wfc-on-error-container: var(--wfc-error-10);--wfc-neutral: var(--wfc-neutral-40);--wfc-neutral-variant: var(--wfc-neutral-variant-40);--wfc-surface: var(--wfc-neutral-98);--wfc-surface-dim: var(--wfc-neutral-87);--wfc-surface-bright: var(--wfc-neutral-98);--wfc-surface-container-lowest: var(--wfc-neutral-100);--wfc-surface-container-low: var(--wfc-neutral-96);--wfc-surface-container: var(--wfc-neutral-94);--wfc-surface-container-high: var(--wfc-neutral-92);--wfc-surface-container-highest: var(--wfc-neutral-90);--wfc-surface-variant: var(--wfc-neutral-variant-90);--wfc-on-surface: var(--wfc-neutral-10);--wfc-on-surface-variant: var(--wfc-neutral-variant-30);--wfc-surface-inverse: var(--wfc-neutral-20);--wfc-on-surface-inverse: var(--wfc-neutral-95);--wfc-surface-tint: var(--wfc-primary);--wfc-background: var(--wfc-neutral-98);--wfc-on-background: var(--wfc-neutral-10);--wfc-outline: var(--wfc-neutral-variant-50);--wfc-outline-variant: var(--wfc-neutral-variant-80);--wfc-shadow: var(--wfc-neutral-0);--wfc-scrim: var(--wfc-neutral-0);--wfc-state-layer-opacity-hover: .08;--wfc-state-layer-opacity-focus: .1;--wfc-state-layer-opacity-pressed: .1;--wfc-state-layer-opacity-dragged: .16;--wfc-shape-extra-small: 4px;--wfc-shape-extra-small-top: 4px 4px 0 0;--wfc-shape-small: 8px;--wfc-shape-medium: 12px;--wfc-shape-large: 16px;--wfc-shape-large-start: 16px 0 0 16px;--wfc-shape-large-end: 0 16px 16px 0;--wfc-shape-large-top: 16px 16px 0 0;--wfc-shape-extra-large: 28px;--wfc-shape-extra-large-top: 28px 28px 0 0;--wfc-shape-extra-large-bottom: 0 0 28px 28px;--wfc-shape-full: 50%;--wfc-navigation-rail-width: 88px;--wfc-navigation-drawer-width: 360px;--wfc-card-group-columns: 4;--wfc-side-sheet-width: 296px;--wfc-bottom-sheet-initial-position: 40%;--wfc-bottom-sheet-minimized-position: 64px;--wfc-motion-easing-standard: cubic-bezier(.2, 0, 0, 1);--wfc-motion-easing-standard-accelerate: cubic-bezier(.3, 0, 1, 1);--wfc-motion-easing-standard-decelerate: cubic-bezier(0, 0, 0, 1);--wfc-motion-easing-emphasized: cubic-bezier(.2, 0, 0, 1);--wfc-motion-easing-emphasized-accelerate: cubic-bezier(.3, 0, .8, .15);--wfc-motion-easing-emphasized-decelerate: cubic-bezier(.05, .7, .1, 1);--wfc-transition-bounce: cubic-bezier(.47, 1.64, .41, .8);--wfc-transition-overshoot: cubic-bezier(.175, .885, .32, 1.275);--wfc-motion-duration-short1: 50ms;--wfc-motion-duration-short2: .1s;--wfc-motion-duration-short3: .15s;--wfc-motion-duration-short4: .2s;--wfc-motion-duration-medium1: .25s;--wfc-motion-duration-medium2: .3s;--wfc-motion-duration-medium3: .35s;--wfc-motion-duration-medium4: .4s;--wfc-motion-duration-long1: .45s;--wfc-motion-duration-long2: .5s;--wfc-motion-duration-long3: .55s;--wfc-motion-duration-long4: .6s;--wfc-motion-duration-extra-long1: .7s;--wfc-motion-duration-extra-long2: .8s;--wfc-motion-duration-extra-long3: .9s;--wfc-motion-duration-extra-long4: 1s;--wfc-font-small-icon-size: 1.25rem;--wfc-font-medium-icon-size: 1.5rem;--wfc-font-large-icon-size: 2.25rem;--wfc-font-large-icon-size-extra: 3rem;--wfc-font-large-display-font: var(--wfc-font-brand, inherit);--wfc-font-large-display-size: 3.5625rem;--wfc-font-large-display-line-height: 4rem;--wfc-font-large-display-weight: 400;--wfc-font-large-display-tracking: -.015625rem;--wfc-font-medium-display-font: var(--wfc-font-brand, inherit);--wfc-font-medium-display-size: 2.8125rem;--wfc-font-medium-display-line-height: 3.25rem;--wfc-font-medium-display-weight: 400;--wfc-font-medium-display-tracking: 0rem;--wfc-font-small-display-font: var(--wfc-font-brand, inherit);--wfc-font-small-display-size: 2.25rem;--wfc-font-small-display-line-height: 2.75rem;--wfc-font-small-display-weight: 400;--wfc-font-small-display-tracking: 0rem;--wfc-font-large-headline-font: var(--wfc-font-brand, inherit);--wfc-font-large-headline-size: 2rem;--wfc-font-large-headline-line-height: 2.5rem;--wfc-font-large-headline-weight: 400;--wfc-font-large-headline-tracking: 0rem;--wfc-font-medium-headline-font: var(--wfc-font-brand, inherit);--wfc-font-medium-headline-size: 1.75rem;--wfc-font-medium-headline-line-height: 2.25rem;--wfc-font-medium-headline-weight: 400;--wfc-font-medium-headline-tracking: 0rem;--wfc-font-small-headline-font: var(--wfc-font-brand, inherit);--wfc-font-small-headline-size: 1.5rem;--wfc-font-small-headline-line-height: 2rem;--wfc-font-small-headline-weight: 400;--wfc-font-small-headline-tracking: 0rem;--wfc-font-large-title-font: var(--wfc-font-brand, inherit);--wfc-font-large-title-size: 1.375rem;--wfc-font-large-title-line-height: 1.75rem;--wfc-font-large-title-weight: 400;--wfc-font-large-title-tracking: 0rem;--wfc-font-medium-title-font: var(--wfc-font-brand, inherit);--wfc-font-medium-title-size: 1rem;--wfc-font-medium-title-line-height: 1.5rem;--wfc-font-medium-title-weight: 500;--wfc-font-medium-title-tracking: .009375rem;--wfc-font-small-title-font: var(--wfc-font-brand, inherit);--wfc-font-small-title-size: .875rem;--wfc-font-small-title-line-height: 1.25rem;--wfc-font-small-title-weight: 500;--wfc-font-small-title-tracking: .00625rem;--wfc-font-large-label-font: var(--wfc-font-plain, inherit);--wfc-font-large-label-size: .875rem;--wfc-font-large-label-line-height: 1.25rem;--wfc-font-large-label-weight: 500;--wfc-font-large-label-tracking: .00625rem;--wfc-font-medium-label-font: var(--wfc-font-plain, inherit);--wfc-font-medium-label-size: .75rem;--wfc-font-medium-label-line-height: 1rem;--wfc-font-medium-label-weight: 500;--wfc-font-medium-label-tracking: .03125rem;--wfc-font-small-label-font: var(--wfc-font-plain, inherit);--wfc-font-small-label-size: .6875rem;--wfc-font-small-label-line-height: 1rem;--wfc-font-small-label-weight: 500;--wfc-font-small-label-tracking: .03125rem;--wfc-font-large-body-font: var(--wfc-font-plain, inherit);--wfc-font-large-body-size: 1rem;--wfc-font-large-body-line-height: 1.5rem;--wfc-font-large-body-weight: 400;--wfc-font-large-body-tracking: .03125rem;--wfc-font-medium-body-font: var(--wfc-font-plain, inherit);--wfc-font-medium-body-size: .875rem;--wfc-font-medium-body-line-height: 1.25rem;--wfc-font-medium-body-weight: 400;--wfc-font-medium-body-tracking: .015625rem;--wfc-font-small-body-font: var(--wfc-font-plain, inherit);--wfc-font-small-body-size: .75rem;--wfc-font-small-body-line-height: 1rem;--wfc-font-small-body-weight: 400;--wfc-font-small-body-tracking: .025rem;--wfc-elevation-1: 0px 1px 2px 0px var(--wfc-shadow-alpha-30), 0px 1px 3px 1px var(--wfc-shadow-alpha-15);--wfc-elevation-2: 0px 1px 2px 0px var(--wfc-shadow-alpha-30), 0px 2px 6px 2px var(--wfc-shadow-alpha-15);--wfc-elevation-2-reverse: 0px -1px 2px 0px var(--wfc-shadow-alpha-30), 0px -2px 6px 2px var(--wfc-shadow-alpha-15);--wfc-elevation-3: 0px 1px 3px 0px var(--wfc-shadow-alpha-30), 0px 4px 8px 3px var(--wfc-shadow-alpha-15);--wfc-elevation-4: 0px 2px 3px 0px var(--wfc-shadow-alpha-30), 0px 6px 10px 4px var(--wfc-shadow-alpha-15);--wfc-elevation-5: 0px 4px 4px 0px var(--wfc-shadow-alpha-30), 0px 8px 12px 6px var(--wfc-shadow-alpha-15)}.wfc-theme-dark,:root.wfc-theme-dark{--wfc-primary: var(--wfc-primary-80);--wfc-primary-container: var(--wfc-primary-30);--wfc-on-primary: var(--wfc-primary-20);--wfc-on-primary-container: var(--wfc-primary-90);--wfc-primary-inverse: var(--wfc-primary-40);--wfc-secondary: var(--wfc-secondary-80);--wfc-secondary-container: var(--wfc-secondary-30);--wfc-on-secondary: var(--wfc-secondary-20);--wfc-on-secondary-container: var(--wfc-secondary-90);--wfc-tertiary: var(--wfc-tertiary-80);--wfc-tertiary-container: var(--wfc-tertiary-30);--wfc-on-tertiary: var(--wfc-tertiary-20);--wfc-on-tertiary-container: var(--wfc-tertiary-90);--wfc-error: var(--wfc-error-80);--wfc-error-container: var(--wfc-error-30);--wfc-on-error: var(--wfc-error-20);--wfc-on-error-container: var(--wfc-error-90);--wfc-neutral: var(--wfc-neutral-80);--wfc-neutral-variant: var(--wfc-neutral-variant-80);--wfc-surface: var(--wfc-neutral-6);--wfc-surface-dim: var(--wfc-neutral-6);--wfc-surface-bright: var(--wfc-neutral-24);--wfc-surface-container-lowest: var(--wfc-neutral-4);--wfc-surface-container-low: var(--wfc-neutral-10);--wfc-surface-container: var(--wfc-neutral-12);--wfc-surface-container-high: var(--wfc-neutral-17);--wfc-surface-container-highest: var(--wfc-neutral-22);--wfc-surface-variant: var(--wfc-neutral-variant-30);--wfc-on-surface: var(--wfc-neutral-90);--wfc-on-surface-variant: var(--wfc-neutral-variant-80);--wfc-surface-tint: var(--wfc-primary);--wfc-surface-inverse: var(--wfc-neutral-90);--wfc-on-surface-inverse: var(--wfc-neutral-20);--wfc-background: var(--wfc-neutral-6);--wfc-on-background: var(--wfc-neutral-90);--wfc-outline: var(--wfc-neutral-variant-60);--wfc-outline-variant: var(--wfc-neutral-variant-30);--wfc-shadow: var(--wfc-neutral-0);--wfc-scrim: var(--wfc-neutral-0)}:root{color-scheme:only light}:root.wfc-theme-dark{color-scheme:only dark}html{font-family:Roboto Flex,Roboto,sans-serif;font-size:16px;height:100%;overflow-anchor:none}input{font-family:Roboto Flex,Roboto,sans-serif}body{display:flex;min-height:100%;width:100%;margin:0;background-color:var(--wfc-background);color:var(--wfc-on-background)}body.has-navigation-bar:not(.navigation-bar-auto-hide),body.has-bottom-app-bar:not(.bottom-app-bar-auto-hide){padding-bottom:80px}body.has-top-app-bar{padding-top:64px}body.has-top-app-bar.top-app-bar-medium{padding-top:112px}body.has-top-app-bar.top-app-bar-large{padding-top:152px}body page-content,body #page-content{display:flex;flex-direction:column;flex:1;box-sizing:border-box;padding:12px;max-width:100dvw}.drag-active{user-select:none;-webkit-user-select:none}.prevent-user-selection{-webkit-user-select:none;user-select:none}h1{margin:0}h1,.wfc-font-display-large{font-family:var(--wfc-font-large-display-font);font-size:var(--wfc-font-large-display-size);line-height:var(--wfc-font-large-display-line-height);font-weight:var(--wfc-font-large-display-weight);letter-spacing:var(--wfc-font-large-display-tracking)}h2{margin:0}h2,.wfc-font-display-medium{font-family:var(--wfc-font-medium-display-font);font-size:var(--wfc-font-medium-display-size);line-height:var(--wfc-font-medium-display-line-height);font-weight:var(--wfc-font-medium-display-weight);letter-spacing:var(--wfc-font-medium-display-tracking)}h3{margin:0}h3,.wfc-font-display-small{font-family:var(--wfc-font-small-display-font);font-size:var(--wfc-font-small-display-size);line-height:var(--wfc-font-small-display-line-height);font-weight:var(--wfc-font-small-display-weight);letter-spacing:var(--wfc-font-small-display-tracking)}h4{margin:0}h4,.wfc-font-headline-large{font-family:var(--wfc-font-large-headline-font);font-size:var(--wfc-font-large-headline-size);line-height:var(--wfc-font-large-headline-line-height);font-weight:var(--wfc-font-large-headline-weight);letter-spacing:var(--wfc-font-large-headline-tracking)}h5{margin:0}h5,.wfc-font-headline-medium{font-family:var(--wfc-font-medium-headline-font);font-size:var(--wfc-font-medium-headline-size);line-height:var(--wfc-font-medium-headline-line-height);font-weight:var(--wfc-font-medium-headline-weight);letter-spacing:var(--wfc-font-medium-headline-tracking)}h6{margin:0}h6,.wfc-font-headline-small{font-family:var(--wfc-font-small-headline-font);font-size:var(--wfc-font-small-headline-size);line-height:var(--wfc-font-small-headline-line-height);font-weight:var(--wfc-font-small-headline-weight);letter-spacing:var(--wfc-font-small-headline-tracking)}.wfc-font-title-large{font-family:var(--wfc-font-large-title-font);font-size:var(--wfc-font-large-title-size);line-height:var(--wfc-font-large-title-line-height);font-weight:var(--wfc-font-large-title-weight);letter-spacing:var(--wfc-font-large-title-tracking)}.wfc-font-title-medium{font-family:var(--wfc-font-medium-title-font);font-size:var(--wfc-font-medium-title-size);line-height:var(--wfc-font-medium-title-line-height);font-weight:var(--wfc-font-medium-title-weight);letter-spacing:var(--wfc-font-medium-title-tracking)}.wfc-font-title-small{font-family:var(--wfc-font-small-title-font);font-size:var(--wfc-font-small-title-size);line-height:var(--wfc-font-small-title-line-height);font-weight:var(--wfc-font-small-title-weight);letter-spacing:var(--wfc-font-small-title-tracking)}.wfc-font-label-large{font-family:var(--wfc-font-large-label-font);font-size:var(--wfc-font-large-label-size);line-height:var(--wfc-font-large-label-line-height);font-weight:var(--wfc-font-large-label-weight);letter-spacing:var(--wfc-font-large-label-tracking)}.wfc-font-label-medium{font-family:var(--wfc-font-medium-label-font);font-size:var(--wfc-font-medium-label-size);line-height:var(--wfc-font-medium-label-line-height);font-weight:var(--wfc-font-medium-label-weight);letter-spacing:var(--wfc-font-medium-label-tracking)}.wfc-font-label-small{font-family:var(--wfc-font-small-label-font);font-size:var(--wfc-font-small-label-size);line-height:var(--wfc-font-small-label-line-height);font-weight:var(--wfc-font-small-label-weight);letter-spacing:var(--wfc-font-small-label-tracking)}.wfc-font-body-large{font-family:var(--wfc-font-large-body-font);font-size:var(--wfc-font-large-body-size);line-height:var(--wfc-font-large-body-line-height);font-weight:var(--wfc-font-large-body-weight);letter-spacing:var(--wfc-font-large-body-tracking)}p,.wfc-font-body-medium{font-family:var(--wfc-font-medium-body-font);font-size:var(--wfc-font-medium-body-size);line-height:var(--wfc-font-medium-body-line-height);font-weight:var(--wfc-font-medium-body-weight);letter-spacing:var(--wfc-font-medium-body-tracking)}.wfc-font-body-small{font-family:var(--wfc-font-small-body-font);font-size:var(--wfc-font-small-body-size);line-height:var(--wfc-font-small-body-line-height);font-weight:var(--wfc-font-small-body-weight);letter-spacing:var(--wfc-font-small-body-tracking)}a{position:relative;border:none;cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent;font-size:var(--wfc-font-large-label-size);font-weight:var(--wfc-font-large-label-weight);letter-spacing:var(--wfc-font-large-label-tracking);line-height:40px;color:var(--wfc-primary)}a:-webkit-any-link:active{color:inherit}a:focus{opacity:var(--wfc-state-layer-opacity-focus);background-color:var(--wfc-on-surface)}a:after{position:absolute;content:"";inset:0;border-radius:inherit}@media (hover: hover){a:hover:after{background-color:var(--wfc-primary);mix-blend-mode:color}}wfc-anchor-group{--wfc-navigation-drawer-group-height: 56px;position:relative;display:flex;flex-direction:column;flex-shrink:0;overflow:hidden;height:var(--wfc-navigation-drawer-group-height);width:100%;margin-left:-16px;padding-left:16px;padding-right:26px;transition:height 0ms;transition-timing-function:var(--wfc-motion-easing-standard-decelerate)}body.wfc-animation wfc-anchor-group{transition-duration:var(--wfc-motion-duration-short4)}wfc-anchor-group wfc-anchor:not([control]){margin-left:16px}wfc-navigation-drawer>wfc-anchor{width:100%}body:not(.wfc-animation) wfc-anchor:before,body:not(.wfc-animation) wfc-anchor:after{transition-duration:0s}wfc-anchor-group.has-current>wfc-anchor[control]:after{opacity:var(--wfc-state-layer-opacity-hover);background-color:var(--wfc-on-surface)}wfc-navigation-bar wfc-anchor,wfc-navigation-rail wfc-anchor{flex-direction:column;justify-content:center;margin:0 0 2px;width:100%;height:56px;font-size:var(--wfc-font-medium-label-size);font-weight:var(--wfc-font-medium-label-weight);letter-spacing:var(--wfc-font-medium-label-tracking);border-radius:var(--wfc-shape-extra-medium)}wfc-navigation-rail wfc-anchor::part(a){line-height:20px;flex-direction:column}wfc-navigation-bar wfc-anchor:before,wfc-navigation-rail wfc-anchor:before{left:unset;right:unset;top:3px;width:64px;height:32px;border-radius:var(--wfc-shape-extra-large)}wfc-navigation-bar wfc-anchor:after,wfc-navigation-rail wfc-anchor:after{left:unset;right:unset;top:3px;width:64px;height:32px;border-radius:var(--wfc-shape-extra-large)}wfc-navigation-bar wfc-anchor.current.animate:after,wfc-navigation-bar wfc-anchor.current.animate:before,wfc-navigation-rail wfc-anchor.current.animate:after,wfc-navigation-rail wfc-anchor.current.animate:before{transform:scale(0);transition-duration:0s}wfc-navigation-bar wfc-anchor:after,wfc-navigation-bar wfc-anchor:before,wfc-navigation-rail wfc-anchor:after,wfc-navigation-rail wfc-anchor:before{transition:transform;transition-duration:var(--wfc-motion-duration-medium1);transition-timing-function:var(--wfc-motion-easing-standard)}wfc-navigation-bar wfc-anchor.current:before,wfc-navigation-rail wfc-anchor.current:before{transform:scale(1)}wfc-navigation-rail wfc-anchor wfc-icon{margin-right:0;margin-top:3px;height:32px;line-height:32px}wfc-navigation-rail wfc-anchor.no-text wfc-icon{margin-top:12px}wfc-navigation-bar wfc-anchor.no-text:before,wfc-navigation-rail wfc-anchor.no-text:before{top:0;height:56px;width:56px;border-radius:var(--wfc-shape-full)}wfc-navigation-bar wfc-anchor.no-text:after,wfc-navigation-rail wfc-anchor.no-text:after{top:0;height:56px;width:56px;border-radius:var(--wfc-shape-full)}wfc-button wfc-badge{position:relative;order:100;margin-inline-start:0px;margin-block-start:0px;margin-block-end:0px;inset-inline-start:0}wfc-button wfc-badge.has-value:not([hide-value]){margin-block-end:3px}body.window-expanded.navigation-drawer-state-show wfc-bottom-app-bar{left:var(--wfc-navigation-drawer-width)}body:not(.window-compact) wfc-bottom-sheet{display:none;pointer-events:none}body:not(.window-compact) wfc-card.expanding[open]{transform:translateY(-6px)}wfc-card-group.reorder{cursor:pointer}wfc-card-group{gap:8px}wfc-card-group,wfc-card-group.grid{display:grid;grid-template-columns:repeat(var(--wfc-card-group-columns),1fr)}body.window-compact wfc-card-group:not(.grid),wfc-card-group.list{display:flex;flex-direction:column}wfc-card-group>wfc-card.card-grid-cell{height:fit-content}wfc-carousel{display:flex;background-color:var(--wfc-surface);margin:8px 16px;min-height:80px;overflow-x:auto;border-radius:var(--wfc-shape-extra-large);opacity:0}wfc-carousel::-webkit-scrollbar{width:0px;height:0px;background-color:transparent}wfc-carousel.loaded{opacity:1;transition:opacity .24s}wfc-carousel .carousel-front-padding,wfc-carousel .carousel-back-padding{flex-shrink:0}wfc-carousel-item{--wfc-carousel-item-text-opacity: 0;position:relative;display:flex;flex-shrink:0;justify-content:center;min-width:40px;flex-basis:40px;border-radius:var(--wfc-shape-extra-large);overflow:hidden;padding:0;margin:0 8px 0 0;background-color:var(--wfc-surface);pointer-events:none;user-select:none;-webkit-user-select:none}wfc-carousel-item:last-of-type{margin-right:0}wfc-carousel-item img{height:100%}wfc-carousel-item .text{position:absolute;width:inherit;overflow:hidden;bottom:14px;left:-14px;padding-left:28px;box-sizing:border-box;opacity:var(--wfc-carousel-item-text-opacity);color:var(--wfc-on-surface-inverse);text-shadow:1px 1px 6px var(--wfc-shadow)}wfc-divider{box-sizing:border-box;color:var(--wfc-outline-variant);display:flex;height:1px;width:100%}wfc-divider[inset],wfc-divider[inset-start]{padding-inline-start:16px}wfc-divider[inset],wfc-divider[inset-end]{padding-inline-end:16px}wfc-divider:before{background:currentColor;content:"";height:100%;width:100%}body.navigation-bar-auto-hide wfc-fab[fixed][position-bottom-right],body.navigation-bar-auto-hide wfc-fab[fixed][position-bottom-left]{transition:bottom;transition-duration:var(--wfc-motion-duration-short3);transition-timing-function:var(--wfc-motion-easing-standard)}body.navigation-bar-auto-hide wfc-fab[fixed][position-bottom-right][auto-hide-label],body.navigation-bar-auto-hide wfc-fab[fixed][position-bottom-left][auto-hide-label]{transition:max-width,color,bottom;transition-delay:0ms,60ms,0ms;transition-duration:var(--wfc-motion-duration-short3);transition-timing-function:var(--wfc-motion-easing-standard)}body.navigation-bar-auto-hide wfc-fab[fixed][position-bottom-right][auto-hide],body.navigation-bar-auto-hide wfc-fab[fixed][position-bottom-left][auto-hide]{transition:transform,bottom;transition-duration:var(--wfc-motion-duration-medium2),var(--wfc-motion-duration-short3);transition-timing-function:var(--wfc-motion-easing-standard)}body.has-navigation-bar:not(.navigation-bar-hide) wfc-fab[fixed][position-bottom-right],body.has-navigation-bar:not(.navigation-bar-hide) wfc-fab[fixed][position-bottom-left]{bottom:96px}body.navigation-bar-auto-hide.navigation-bar-hide:not(.bottom-app-bar-always-show) wfc-fab[fixed][position-bottom-right],body.navigation-bar-auto-hide.navigation-bar-hide:not(.bottom-app-bar-always-show) wfc-fab[fixed][position-bottom-left],body.navigation-bar-auto-hide.has-navigation-rail.window-medium:not(.bottom-app-bar-always-show) wfc-fab[fixed][position-bottom-right],body.navigation-bar-auto-hide.has-navigation-rail.window-medium:not(.bottom-app-bar-always-show) wfc-fab[fixed][position-bottom-left],body.navigation-bar-auto-hide.window-expanded:not(.bottom-app-bar-always-show) wfc-fab[fixed][position-bottom-right],body.navigation-bar-auto-hide.window-expanded:not(.bottom-app-bar-always-show) wfc-fab[fixed][position-bottom-left]{bottom:16px}wfc-icon-button[filled] wfc-icon,wfc-icon-button[filled-tonal] wfc-icon{font-variation-settings:"FILL" 1,"wght" 400,"GRAD" 0,"opsz" 48}wfc-chip wfc-menu-item{height:28px}body.has-navigation-rail.window-medium wfc-navigation-bar:not(.always-show),body.window-expanded wfc-navigation-bar:not(.always-show){display:none}body:not(.wfc-animation) wfc-navigation-bar{transition-duration:0ms!important}body.window-compact.has-bottom-app-bar wfc-navigation-rail,body.window-compact.has-navigation-bar wfc-navigation-rail{display:none}body.window-expanded:not(body.has-navigation-drawer) wfc-navigation-rail,body.navigation-drawer-state-hide:not(.window-compact) wfc-navigation-rail,body.window-medium wfc-navigation-rail,body:not(.window-compact):not(.has-navigation-drawer) wfc-navigation-rail{width:var(--wfc-navigation-rail-width)}
`);
var styles_default = styles;

// ../../webformula/material/src/core/theme.js
async function generateBrowser() {
  if (!document.body) await new Promise((resolve) => document.addEventListener("DOMContentLoaded", () => resolve()));
  const colorSchemePreferenceDisabled = document.querySelector('meta[name="wfc-theme-color-scheme-preference-disable"]');
  if (!colorSchemePreferenceDisabled) {
    const themePreferenceDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("wfc-theme-dark", themePreferenceDark);
    return;
  }
  const localStorageColorScheme = localStorage.getItem("wfc-color-scheme");
  const isDark = localStorageColorScheme === "dark" || document.documentElement.classList.contains("wfc-theme-dark");
  document.documentElement.classList.toggle("wfc-theme-dark", isDark);
}

// ../../webformula/material/src/components/HTMLComponentElement.js
document.adoptedStyleSheets = [...document.adoptedStyleSheets, styles_default];
generateBrowser();
var templateElements = {};
var dashCaseRegex2 = /-([a-z])/g;
var HTMLComponentElement = class extends HTMLElement {
  static tag = "none";
  /** if not using shadowRoot templates and rendering still work */
  static useShadowRoot = false;
  static shadowRootDelegateFocus = false;
  /** Use template element to clone from
   *   If your template uses dynamic variables you do not want to use this */
  static useTemplate = true;
  static styleSheets;
  static get observedAttributesExtended() {
    return [];
  }
  static get observedAttributes() {
    return this.observedAttributesExtended.map((a) => a[0]);
  }
  #root = this;
  #prepared = false;
  #attributeEvents = {};
  #attributesLookup;
  #templateElement;
  constructor() {
    super();
    this.#attributesLookup = Object.fromEntries(this.constructor.observedAttributesExtended);
    if (this.constructor.useShadowRoot) {
      this.attachShadow({ mode: "open", delegatesFocus: this.constructor.shadowRootDelegateFocus });
      this.#root = this.shadowRoot;
    }
  }
  // Return an HTML template string
  // If template is set then initial rendering will happen automatically
  // template(){ return"" }
  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    const type = this.#attributesLookup[name];
    name = name.replace(dashCaseRegex2, (_, s) => s.toUpperCase());
    if (type === "event") {
      if (this.#attributeEvents[name]) {
        this.removeEventListener(name.replace(/^on/, ""), this.#attributeEvents[name]);
        this.#attributeEvents[name] = void 0;
      }
      if (newValue) {
        this.#attributeEvents[name] = this.#attributeDescriptorTypeConverter(newValue, type);
        this.addEventListener(name.replace(/^on/, ""), this.#attributeEvents[name]);
      }
    } else {
      this.attributeChangedCallbackExtended(
        name,
        this.#attributeDescriptorTypeConverter(oldValue, type),
        this.#attributeDescriptorTypeConverter(newValue, type)
      );
    }
  }
  attributeChangedCallbackExtended() {
  }
  connectedCallback() {
  }
  disconnectedCallback() {
  }
  render() {
    if (typeof this.template !== "function") throw Error("Cannot render without a template method");
    if (!this.#prepared) this.#prepareRender();
    if (!this.constructor.useTemplate) this.#templateElement.innerHTML = this.template();
    this.#root.replaceChildren(this.#templateElement.content.cloneNode(true));
  }
  #prepareRender() {
    this.#prepared = true;
    if (this.constructor.useTemplate) {
      if (!templateElements[this.constructor.tag]) {
        templateElements[this.constructor.tag] = document.createElement("template");
        templateElements[this.constructor.tag].innerHTML = this.template();
      }
      this.#templateElement = templateElements[this.constructor.tag];
    } else {
      this.#templateElement = document.createElement("template");
    }
    if (this.constructor.useShadowRoot) {
      if (this.constructor.styleSheets instanceof CSSStyleSheet || this.constructor.styleSheets[0] instanceof CSSStyleSheet) {
        this.shadowRoot.adoptedStyleSheets.push(...[].concat(this.constructor.styleSheets));
      }
    }
  }
  #attributeDescriptorTypeConverter(value, type) {
    switch (type) {
      case "boolean":
        return value !== null && `${value}` !== "false";
      case "int":
        const int = parseInt(value);
        return isNaN(int) ? "" : int;
      case "number":
        const num = parseFloat(value);
        return isNaN(num) ? "" : num;
      case "string":
        return value || "";
      case "event":
        return !value ? null : () => new Function("page", value).call(this, window.$page);
        break;
      default:
        return value;
    }
  }
};

// ../../webformula/material/src/components/surface/component.css
var styles2 = new CSSStyleSheet();
styles2.replaceSync(`:host{position:relative;min-width:112px;display:contents}.surface{--wfc-surface-horizontal-position: 0px;--wfc-surface-vertical-position: 0px;--wfc-surface-close-delay: 0ms;--wfc-surface-translate-x: calc(var(--wfc-surface-width, inherit) * .35 * -1);--wfc-surface-offset-bottom: 0;position:absolute;border-radius:inherit;display:none;inset:auto;border:none;padding:0;overflow:visible;background-color:transparent;color:inherit;opacity:0;z-index:20;user-select:none;-webkit-user-select:none;max-height:inherit;height:inherit;width:inherit;min-width:inherit;max-width:inherit;visibility:hidden}.surface.always-visible{display:block;visibility:visible;opacity:1}.surface{max-height:var(--wfc-surface-height, inherit)}:host(.open) .surface,.animating.surface{display:block;opacity:1;visibility:visible}.surface::backdrop{display:none}:host(.fixed) .surface{position:fixed}.surface-content{display:block;list-style-type:none;margin:0;outline:none;box-sizing:border-box;background-color:inherit;border-radius:inherit;overflow:auto;height:inherit;max-height:inherit;min-width:inherit;max-width:inherit;overscroll-behavior:contain}.animating .surface-content{overflow:hidden}.predictive-back-icon{--wfc-predictive-back-stretch: 0px;position:absolute;left:12px;top:calc(50% - 18px);width:calc(28px + var(--wfc-predictive-back-stretch));height:32px;border-radius:18px;background-color:var(--wfc-scrim-alpha-76);transition:left,opacity;transition-duration:var(--wfc-motion-duration-medium1);opacity:1;pointer-events:none;color:var(--wfc-on-primary);align-items:center;justify-content:center}.predictive-back-icon svg{width:24px;height:24px;margin-left:6px}.predictive-back-icon.right{right:12px;left:unset;transition:right,opacity}.predictive-back-icon.right svg{rotate:180deg;margin-left:-8px}.predictive-back-icon.hide{left:-100%;opacity:0}.predictive-back-icon.right.hide{right:-100%}:host(.open.animation-fullscreen),:host(.closing.animation-fullscreen){position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:22}:host(.open.animation-fullscreen) .surface,:host(.closing.animation-fullscreen) .surface{position:absolute;top:0;left:0;width:100%;height:100%;max-height:100%}:host(.open.animation-fullscreen) .surface-content,:host(.closing.animation-fullscreen) .surface-content{width:100%;height:100%}:host(.open.animation-fullscreen) .item-padding{min-height:calc(100% - 82px)}:host(:not(.open).animation-fullscreen){transition:top,left,width,height,border-radius;transition-duration:var(--wfc-motion-duration-short3);transition-timing-function:var(--wfc-motion-easing-emphasized-accelerate);transition-delay:50ms}:host(.open.animation-fullscreen){transition-duration:var(--wfc-motion-duration-medium3);transition-timing-function:var(--wfc-motion-easing-emphasized)}:host(:not(.open).animation-fullscreen) .surface.animating{transition:opacity;transition-duration:var(--wfc-motion-duration-short2);transition-timing-function:var(--wfc-motion-easing-emphasized-accelerate)}:host(.open.animation-fullscreen) .surface.animating{transition-duration:var(--wfc-motion-duration-medium2);transition-timing-function:var(--wfc-motion-easing-emphasized)}:host(:not(.anchor).position-center) .surface,:host(:not(.anchor).position-center-center) .surface{--wfc-surface-horizontal-position: -50%;--wfc-surface-vertical-position: -50%;top:50%;left:50%}:host(:not(.anchor).position-center-left) .surface{--wfc-surface-horizontal-position: 0px;--wfc-surface-vertical-position: -50%;top:50%;left:0}:host(:not(.anchor).position-center-right) .surface{--wfc-surface-horizontal-position: 0px;--wfc-surface-vertical-position: -50%;top:50%;right:0}:host(:not(.anchor).position-top-center) .surface{--wfc-surface-horizontal-position: -50%;--wfc-surface-vertical-position: 0px;top:0;left:50%}:host(.position-top-left) .surface{--wfc-surface-horizontal-position: 0px;--wfc-surface-vertical-position: 0px;top:0;left:0}:host(:not(.anchor).position-top-left) .surface{--wfc-surface-horizontal-position: 0px;--wfc-surface-vertical-position: 0px;top:0;left:0}:host(:not(.anchor).position-top-right) .surface{--wfc-surface-horizontal-position: 0px;--wfc-surface-vertical-position: 0px;top:0;right:0}:host(:not(.anchor).position-bottom-center) .surface{--wfc-surface-horizontal-position: -50%;--wfc-surface-vertical-position: 0px;bottom:0;left:50%}:host(.position-bottom-left) .surface{--wfc-surface-horizontal-position: 0px;--wfc-surface-vertical-position: 0px;bottom:0;left:0}:host(:not(.anchor).position-bottom-left) .surface{--wfc-surface-horizontal-position: 0px;--wfc-surface-vertical-position: 0px;bottom:0;left:0}:host(:not(.anchor).position-bottom-right) .surface{--wfc-surface-horizontal-position: 0px;--wfc-surface-vertical-position: 0px;bottom:0;right:0}:host(:not(.anchor)) .surface{transform:translate(var(--wfc-surface-horizontal-position),var(--wfc-surface-vertical-position))}slot{display:block;height:inherit;max-height:inherit}:host(:not(.open):not(.animation-fullscreen)) .surface.animating{animation:none}:host(.open:not(.animation-fullscreen)) .surface.animating{animation:none}:host(:not(.open).animation-height) .surface.animating{animation:hide-max-height;animation-duration:var(--wfc-motion-duration-short3);animation-timing-function:var(--wfc-motion-easing-emphasized-accelerate);animation-delay:var(--wfc-surface-close-delay, 0ms)}:host(.open.animation-height) .surface.animating{animation:show-max-height;animation-duration:var(--wfc-motion-duration-medium3);animation-timing-function:var(--wfc-motion-easing-emphasized)}:host(:not(.open).animation-height) .surface.above.animating{animation:hide-max-height-above;animation-duration:var(--wfc-motion-duration-short3);animation-timing-function:var(--wfc-motion-easing-emphasized-accelerate);animation-delay:var(--wfc-surface-close-delay, 0ms)}:host(.open.animation-height) .surface.above.animating{animation:show-max-height-above;animation-duration:var(--wfc-motion-duration-medium3);animation-timing-function:var(--wfc-motion-easing-emphasized)}:host(:not(.open).animation-translate-left) .surface{transform:translate(calc(var(--wfc-surface-horizontal-position) + (var(--wfc-surface-translate-x) * -1)),var(--wfc-surface-vertical-position))}:host(:not(.open).animation-translate-left) .surface.animating{animation:hide-translate-left;animation-duration:var(--wfc-motion-duration-medium2);animation-timing-function:var(--wfc-motion-easing-standard)}:host(.open.animation-translate-left) .surface.animating{animation:show-translate-left;animation-duration:var(--wfc-motion-duration-medium3);animation-timing-function:var(--wfc-motion-easing-standard-decelerate)}:host(:not(.open).animation-translate-right) .surface{transform:translate(calc(var(--wfc-surface-horizontal-position) + var(--wfc-surface-translate-x)),var(--wfc-surface-vertical-position))}:host(:not(.open).animation-translate-right) .surface.animating{animation:hide-translate-right;animation-duration:var(--wfc-motion-duration-medium2);animation-timing-function:var(--wfc-motion-easing-standard)}:host(.open.animation-translate-right) .surface.animating{animation:show-translate-right;animation-duration:var(--wfc-motion-duration-medium3);animation-timing-function:var(--wfc-motion-easing-standard-decelerate)}:host(:not(.open).animation-height-center-to-opacity) .surface.animating{animation:hide-height-center-to-opacity;animation-duration:var(--wfc-motion-duration-short3);animation-timing-function:var(--wfc-motion-easing-emphasized-accelerate);animation-delay:var(--wfc-surface-close-delay, 0ms)}:host(.open.animation-height-center-to-opacity) .surface.animating{animation:show-height-center-to-opacity;animation-duration:var(--wfc-motion-duration-medium1);animation-timing-function:var(--wfc-motion-easing-emphasized)}:host(:not(.open).animation-opacity) .surface.animating{animation:hide-opacity;animation-duration:var(--wfc-motion-duration-short3);animation-timing-function:var(--wfc-motion-easing-emphasized-accelerate);animation-delay:var(--wfc-surface-close-delay, 0ms)}:host(.open.animation-opacity) .surface.animating{animation:show-opacity;animation-duration:var(--wfc-motion-duration-medium1);animation-timing-function:var(--wfc-motion-easing-emphasized)}:host(:not(.animation)),:host(:not(.animation)) .surface,:host(:not(.animation)) .surface-content{transition-duration:0ms!important;transition-delay:0ms!important;animation-duration:0ms!important;animation-delay:0ms!important}@keyframes show-max-height{0%{opacity:0;max-height:54px}50%{opacity:1}to{max-height:var(--wfc-surface-height)}}@keyframes hide-max-height{0%{display:block;opacity:1;visibility:visible;max-height:var(--wfc-surface-height)}50%{opacity:1}to{opacity:0;display:block;visibility:visible;max-height:calc(var(--wfc-surface-height) * .35)}}@keyframes show-max-height-above{0%{opacity:0;max-height:54px;transform:translate(var(--wfc-surface-translate-x),calc(-106px + var(--wfc-surface-offset-bottom)))}50%{opacity:1}to{max-height:var(--wfc-surface-height);transform:translate(var(--wfc-surface-translate-x),var(--wfc-surface-translate-y))}}@keyframes hide-max-height-above{0%{display:block;opacity:1;visibility:visible;max-height:var(--wfc-surface-height);transform:translate(var(--wfc-surface-translate-x),var(--wfc-surface-translate-y))}50%{opacity:1}to{opacity:0;display:block;visibility:visible;max-height:calc(var(--wfc-surface-height) * .35);transform:translate(var(--wfc-surface-translate-x),calc((var(--wfc-surface-translate-y) * .35) + (-24px + var(--wfc-surface-offset-bottom))))}}@keyframes show-translate-y{0%{opacity:0;transform:translate(var(--wfc-surface-horizontal-position),calc(var(--wfc-surface-vertical-position) - 50px))}60%{opacity:1}}@keyframes hide-translate-y{0%{display:block;opacity:1;visibility:visible}60%{opacity:1}to{opacity:0;display:block;visibility:visible;transform:translate(var(--wfc-surface-horizontal-position),calc(var(--wfc-surface-vertical-position) - 50px))}}@keyframes show-translate-left{0%{opacity:0;transform:translate(calc(var(--wfc-surface-horizontal-position) + (var(--wfc-surface-translate-x) * -1)),var(--wfc-surface-vertical-position))}40%{opacity:1}to{transform:translate(var(--wfc-surface-horizontal-position),var(--wfc-surface-vertical-position))}}@keyframes hide-translate-left{0%{display:block;opacity:1;visibility:visible;transform:translate(var(--wfc-surface-horizontal-position),var(--wfc-surface-vertical-position))}40%{opacity:1}to{opacity:0;display:block;visibility:visible;transform:translate(calc(var(--wfc-surface-horizontal-position) + (var(--wfc-surface-translate-x) * -1)),var(--wfc-surface-vertical-position))}}@keyframes show-translate-right{0%{opacity:0;transform:translate(calc(var(--wfc-surface-horizontal-position) + var(--wfc-surface-translate-x)),var(--wfc-surface-vertical-position))}40%{opacity:1}to{transform:translate(var(--wfc-surface-horizontal-position),var(--wfc-surface-vertical-position))}}@keyframes hide-translate-right{0%{display:block;opacity:1;visibility:visible;transform:translate(var(--wfc-surface-horizontal-position),var(--wfc-surface-vertical-position))}40%{opacity:1}to{opacity:0;display:block;visibility:visible;transform:translate(calc(var(--wfc-surface-horizontal-position) + var(--wfc-surface-translate-x)),var(--wfc-surface-vertical-position))}}@keyframes show-height-center-to-opacity{0%{opacity:0;max-height:calc(var(--wfc-surface-height) * .75);transform:translate(var(--wfc-surface-horizontal-position),calc(var(--wfc-surface-vertical-position) + (var(--wfc-surface-height) * .031)))}50%{opacity:1}to{max-height:var(--wfc-surface-height)}}@keyframes hide-height-center-to-opacity{0%{display:block;opacity:1;visibility:visible}50%{opacity:1}to{opacity:0;display:block;visibility:visible}}@keyframes show-opacity{0%{opacity:0}to{opacity:1}}@keyframes hide-opacity{0%{display:block;opacity:1;visibility:visible}to{opacity:0;display:block;visibility:visible}}.scrim{display:none}:host(.scrim) .scrim{display:block;position:absolute;inset:0;pointer-events:none;z-index:20;opacity:0;background-color:var(--wfc-scrim);transition:opacity var(--wfc-motion-duration-short4);transition-timing-function:var(--wfc-motion-easing-standard)}:host(.scrim.fixed) .scrim{position:fixed}:host(.open.scrim) .scrim{overscroll-behavior:contain;opacity:.16;pointer-events:all}
`);
var component_default = styles2;

// ../../webformula/material/src/core/util.js
var wfcUtil = new class WFCUtil {
  #uidCounter = 0;
  #textWidthCanvas;
  #lastScrollTop;
  #scrollCallbacks = [];
  #scrollCurrentDirection;
  #scrollDistanceFromDirectionChange;
  #pageScrollIsLocked = false;
  #pageScrollLockHTMLScrollTop;
  #pageScrollLockHTMLScrollMargin;
  #scrollHandler_bound = this.rafThrottle(this.#scrollHandler).bind(this);
  #initialWindowState_bound = this.#initialWindowState.bind(this);
  constructor() {
    window.addEventListener("wfcwindowstate", this.#initialWindowState_bound);
  }
  #initialWindowState() {
    this.#lastScrollTop = document.documentElement.scrollTop;
    window.removeEventListener("wfcwindowstate", this.#initialWindowState_bound);
  }
  uid() {
    this.#uidCounter += 1;
    return this.#uidCounter;
  }
  async nextAnimationFrameAsync() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 0);
      });
    });
  }
  async animationendAsync(element2) {
    return new Promise((resolve) => {
      function onAnimationend(e) {
        element2.removeEventListener("animationend", onAnimationend);
        element2.removeEventListener("animationcancel", onAnimationend);
        resolve();
      }
      element2.addEventListener("animationend", onAnimationend);
      element2.addEventListener("animationcancel", onAnimationend);
    });
  }
  async transitionendAsync(element2) {
    return new Promise((resolve) => {
      function onTransitionend() {
        element2.removeEventListener("transitionend", onTransitionend);
        element2.removeEventListener("transitioncancel", onTransitionend);
        resolve();
      }
      element2.addEventListener("transitionend", onTransitionend);
      element2.addEventListener("transitioncancel", onTransitionend);
    });
  }
  // <div>one<div></div></div> === one
  getTextFromNode(element2) {
    let nextNode;
    let hasHitTextNode = false;
    const textNodes = [...element2.childNodes].filter((node) => {
      const isTextNode = node.nodeType === 3;
      if (hasHitTextNode && !nextNode) nextNode = node;
      else if (isTextNode && !!node.textContent.trim()) hasHitTextNode = true;
      return isTextNode;
    });
    return textNodes.map((node) => node.data.replace(/\n/g, "").replace(/\s+/g, " ").trim()).join("").trim();
  }
  getTextWidth(element2, fontStyle = { fontWeight: "", fontSize: "", fontFamily: "", letterSpacing: "" }) {
    if (!this.#textWidthCanvas) this.#textWidthCanvas = document.createElement("canvas");
    const styles12 = window.getComputedStyle(element2);
    const context = this.#textWidthCanvas.getContext("2d");
    context.font = `${fontStyle.fontWeight || styles12.getPropertyValue("font-weight")} ${fontStyle.fontSize || styles12.getPropertyValue("font-size")} ${fontStyle.fontFamily || styles12.getPropertyValue("font-family")}`;
    context.letterSpacing = fontStyle.letterSpacing || styles12.getPropertyValue("letter-spacing");
    const metrics = context.measureText(this.getTextFromNode(element2));
    return Math.ceil(metrics.width);
  }
  getTextWidthFromInput(inputElement2) {
    if (!inputElement2 || inputElement2.nodeName !== "INPUT") throw Error("requires input element");
    if (!this.#textWidthCanvas) this.#textWidthCanvas = document.createElement("canvas");
    const styles12 = window.getComputedStyle(inputElement2);
    const context = this.#textWidthCanvas.getContext("2d");
    context.font = `${styles12.getPropertyValue("font-weight")} ${styles12.getPropertyValue("font-size")} ${styles12.getPropertyValue("font-family")}`;
    context.letterSpacing = styles12.getPropertyValue("letter-spacing");
    const metrics = context.measureText(inputElement2.value);
    return Math.ceil(metrics.width);
  }
  async wait(ms = 100) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
  throttle(fn, ms = 200) {
    let alreadyQueued;
    return function throttled() {
      const args = arguments;
      const context = this;
      if (!alreadyQueued) {
        alreadyQueued = true;
        fn.apply(context, args);
        setTimeout(() => {
          alreadyQueued = false;
        }, ms);
      }
    };
  }
  debounce(fn, wait) {
    let timer;
    return function debounced() {
      const args = arguments;
      const context = this;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = void 0;
        fn.apply(context, args);
      }, wait || 10);
    };
  }
  rafThrottle(fn) {
    let alreadyQueued;
    return function throttled() {
      const args = arguments;
      const context = this;
      if (!alreadyQueued) {
        alreadyQueued = true;
        fn.apply(context, args);
        requestAnimationFrame(() => {
          alreadyQueued = false;
        });
      }
    };
  }
  // helps prevent a layout calculation when using a bottom app bar
  #initialScroll = true;
  trackPageScroll(callback = () => {
  }) {
    if (this.#scrollCallbacks.length === 0) {
      if (!this.#initialScroll) this.#lastScrollTop = document.documentElement.scrollTop;
      else this.#initialScroll = false;
      window.addEventListener("scroll", this.#scrollHandler_bound);
    }
    this.#scrollCallbacks.push(callback);
  }
  untrackPageScroll(callback = () => {
  }) {
    this.#scrollCallbacks = this.#scrollCallbacks.filter((c) => c !== callback);
    if (this.#scrollCallbacks.length === 0) window.removeEventListener("scroll", this.#scrollHandler_bound);
  }
  // Track when scroll direction changes with buffer. Used for bottom app bar, fab, top app bar, page-content
  #scrollDistanceChangeCallbacks = [];
  trackScrollDirectionChange(callback = () => {
  }) {
    let lastDirectionChange;
    function wrapper({ direction, distanceFromDirectionChange }) {
      if (direction === -1 && lastDirectionChange !== direction && distanceFromDirectionChange > 20) {
        lastDirectionChange = direction;
        callback(-1);
      } else if (direction === 1 && lastDirectionChange !== direction && distanceFromDirectionChange < -10) {
        lastDirectionChange = direction;
        callback(1);
      }
    }
    ;
    this.#scrollDistanceChangeCallbacks.push([callback, wrapper]);
    this.trackPageScroll(wrapper);
  }
  untrackScrollDirectionChange(callback = () => {
  }) {
    const wrapper = this.#scrollDistanceChangeCallbacks.find((c) => c[0] === callback);
    if (!wrapper) return;
    this.#scrollDistanceChangeCallbacks = this.#scrollDistanceChangeCallbacks.filter((c) => c[0] !== callback);
    this.untrackPageScroll(wrapper[1]);
  }
  // can use array of strings ['one', 'two']
  // can also use array of objects with label property [{ label: 'one' }, { label: 'two' }] || [{ value: 'one' }, { value: 'two' }]
  fuzzySearch(searchTerm, items = [], distanceCap = 0.2) {
    items = items.filter((v) => !!v);
    if (items.length === 0) return [];
    const type = typeof items[0];
    if (!["string", "object"].includes(type)) throw Error("Incorrect items array");
    if (type === "object") {
      if (typeof items[0].label !== "string" && typeof items[0].value !== "string") throw Error("Items array with objects must contain a label or value property that is a string");
    }
    searchTerm = searchTerm.toLowerCase().trim();
    const filterArr = items.map((item) => {
      let label;
      if (type == "object") label = item.label || item.value;
      else label = item;
      return {
        label,
        distance: this.#calculateDistance(searchTerm, label.toLowerCase().trim()),
        item
      };
    });
    return filterArr.filter(({ distance }) => distance > distanceCap).sort((a, b) => a.distance - b.distance).map(({ item }) => item);
  }
  lockPageScroll() {
    if (this.#pageScrollIsLocked === true) return;
    this.#pageScrollIsLocked = true;
    const htmlElement = document.documentElement;
    this.#pageScrollLockHTMLScrollTop = htmlElement.scrollTop;
    this.#pageScrollLockHTMLScrollMargin = 0;
    htmlElement.style.overflow = "hidden";
    htmlElement.style.position = "relative";
    htmlElement.style.touchAction = "none";
    return this.#pageScrollLockHTMLScrollTop;
  }
  unlockPageScroll() {
    if (this.#pageScrollIsLocked === false) return;
    this.#pageScrollIsLocked = false;
    const htmlElement = document.documentElement;
    htmlElement.style.marginTop = "";
    htmlElement.style.overflow = "";
    htmlElement.style.position = "";
    htmlElement.style.touchAction = "";
    htmlElement.scrollTop = this.#pageScrollLockHTMLScrollTop;
  }
  #clickTimeoutListeners = [];
  addClickTimeoutEvent(element2, listener, options) {
    let timer;
    function pointerdown() {
      timer = setTimeout(end, 320);
      element2.addEventListener("pointerup", pointerup);
    }
    function pointerup(event) {
      end();
      listener(event);
    }
    function end() {
      element2.removeEventListener("pointerup", pointerup);
      clearTimeout(timer);
    }
    function remove() {
      clearTimeout(timer);
      element2.removeEventListener("pointerdown", pointerdown);
      element2.removeEventListener("pointerup", pointerup);
    }
    element2.addEventListener("pointerdown", pointerdown);
    if (options?.signal) options.signal.addEventListener("abort", remove);
    this.#clickTimeoutListeners.push({
      element: element2,
      listener,
      remove
    });
  }
  removeClickTimeoutEvent(element2, listener) {
    this.#clickTimeoutListeners = this.#clickTimeoutListeners.filter((v) => {
      if (v.element === element2 && v.listener === listener) {
        v.remove();
        return false;
      }
      return true;
    });
  }
  #longPressListeners = [];
  addLongPressListener(element2, listener, config = {
    ms: 400,
    disableMouseEvents: false,
    disableTouchEvents: false,
    once: false
  }) {
    let timeout;
    let textSelectionTimeout;
    let target;
    let startX;
    let startY;
    let lastEvent;
    let once = config.once === void 0 ? false : config.once;
    function remove(_event, destroy = false) {
      if (timeout) clearTimeout(timeout);
      if (textSelectionTimeout) clearTimeout(textSelectionTimeout);
      lastEvent = void 0;
      if (once || destroy) {
        element2.removeEventListener("mousedown", start);
        element2.removeEventListener("touchstart", start);
        element2.removeEventListener("contextmenu", preventContextMenu);
      }
      element2.removeEventListener("mouseup", remove);
      element2.removeEventListener("mousemove", move);
      element2.removeEventListener("touchend", remove);
      element2.removeEventListener("touchmove", move);
      window.removeEventListener("contextmenu", preventContextMenu);
      element2.classList.remove("prevent-user-selection");
    }
    function start(event) {
      if (event.ctrlKey || event.which === 3) return;
      target = event.target;
      timeout = setTimeout(() => {
        listener(lastEvent);
        remove();
      }, config.ms || 400);
      lastEvent = event;
      startX = event.changedTouches ? event.changedTouches[0].clientX : event.clientX;
      startY = event.changedTouches ? event.changedTouches[0].clientY : event.clientY;
      if (!config.disableMouseEvents) {
        element2.addEventListener("mouseup", remove);
        element2.addEventListener("mousemove", move);
      }
      if (!config.disableTouchEvents) {
        element2.addEventListener("touchend", remove);
        element2.addEventListener("touchmove", move);
        window.addEventListener("contextmenu", preventContextMenu);
      }
      textSelectionTimeout = setTimeout(() => {
        element2.classList.add("prevent-user-selection");
      }, 0);
    }
    function move(event) {
      lastEvent = event;
      const x = event.changedTouches ? event.changedTouches[0].clientX : event.clientX;
      const y = event.changedTouches ? event.changedTouches[0].clientY : event.clientY;
      const distanceX = x - startX;
      const distanceY = y - startY;
      const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
      if (distance > 3) remove();
    }
    function preventContextMenu(event) {
      event.preventDefault();
      return false;
    }
    if (!config.disableMouseEvents) element2.addEventListener("mousedown", start);
    if (!config.disableTouchEvents) element2.addEventListener("touchstart", start);
    this.#longPressListeners.push({
      element: element2,
      remove
    });
  }
  removeLongPressListener(element2) {
    this.#longPressListeners = this.#longPressListeners.filter((v) => {
      if (v.element === element2) {
        v.remove(null, true);
        return false;
      }
      return true;
    });
  }
  toggleColorScheme(scheme) {
    const isDark = ["dark", "light"].includes(scheme) ? scheme === "dark" : !document.documentElement.classList.contains("wfc-theme-dark");
    document.documentElement.classList.toggle("wfc-theme-dark", isDark);
    generateBrowser();
    return isDark ? "dark" : "light";
  }
  getFocusableElements(parent, excludeCB = () => {
  }) {
    const walker = document.createTreeWalker(parent, NodeFilter.SHOW_ELEMENT);
    let node;
    let elements = [];
    while (node = walker.nextNode()) {
      if (!excludeCB(node) && this.#isElementFocusable(node)) elements.push(node);
    }
    return elements;
  }
  #isElementFocusable(element2) {
    if (!element2) return false;
    return !element2.hasAttribute("disabled") && (element2.nodeName === "WFC-TEXTFIELD" || element2.role === "menuitem" || element2.role === "option" || element2.tabindex > -1);
  }
  #calculateDistance(searchTerm, target) {
    const distance = this.#jaroWinklerDistance(searchTerm, target);
    console.log(target, distance);
    return distance;
  }
  #levenshteinDistance(searchTerm, target) {
    if (!searchTerm.length) return target.length;
    if (!target.length) return searchTerm.length;
    const arr = [];
    for (let i = 0; i <= target.length; i++) {
      arr[i] = [i];
      for (let j = 1; j <= searchTerm.length; j++) {
        arr[i][j] = i === 0 ? j : Math.min(
          arr[i - 1][j] + 1,
          arr[i][j - 1] + 1,
          arr[i - 1][j - 1] + (searchTerm[j - 1] === target[i - 1] ? 0 : 1)
        );
      }
    }
    return arr[target.length][searchTerm.length];
  }
  #scrollHandler(event) {
    const distance = document.documentElement.scrollTop - this.#lastScrollTop;
    if (distance === 0) return;
    const direction = document.documentElement.scrollTop >= this.#lastScrollTop ? -1 : 1;
    if (direction !== this.#scrollCurrentDirection) this.#scrollDistanceFromDirectionChange = 0;
    this.#scrollCurrentDirection = direction;
    this.#scrollDistanceFromDirectionChange += distance;
    this.#lastScrollTop = document.documentElement.scrollTop;
    this.#scrollCallbacks.forEach((callback) => callback({
      event,
      isScrolled: document.documentElement.scrollTop > 0,
      scrollTop: document.documentElement.scrollTop,
      direction,
      distance,
      distanceFromDirectionChange: this.#scrollDistanceFromDirectionChange || 0
    }));
  }
  #jaroWinklerDistance(searchTerm, target) {
    target = target.replace(/\s/g, "");
    let jaro = this.#jaroDistance(searchTerm, target);
    if (jaro > 0.7) {
      let prefix = 0;
      const minLength = Math.min(searchTerm.length, target.length);
      for (let i = 0; i < minLength; i++) {
        if (searchTerm[i] == target[i]) prefix++;
        else break;
      }
      prefix = Math.min(4, prefix);
      jaro += 0.1 * prefix * (1 - jaro);
    }
    return jaro.toFixed(6);
  }
  #jaroDistance(searchTerm, target) {
    if (searchTerm == target) return 1;
    const len1 = searchTerm.length;
    const len2 = target.length;
    const max = Math.floor(Math.max(len1, len2) / 2) - 1;
    const hashSearchTerm = Array(searchTerm.length).fill(0);
    const hashTarget = Array(searchTerm.length).fill(0);
    let matchCount = 0;
    let i = 0;
    for (; i < len1; i++) {
      for (let j = Math.max(0, i - max); j < Math.min(len2, i + max + 1); j++) {
        if (searchTerm[i] == target[j] && hashTarget[j] == 0) {
          hashSearchTerm[i] = 1;
          hashTarget[j] = 1;
          matchCount++;
          break;
        }
      }
    }
    if (matchCount == 0) return 0;
    let transpositionCount = 0;
    let point = 0;
    for (i = 0; i < len1; i++) {
      if (hashSearchTerm[i]) {
        while (hashTarget[point] == 0) {
          point++;
        }
        if (searchTerm[i] != target[point++]) transpositionCount++;
      }
    }
    transpositionCount /= 2;
    return (matchCount / len1 + matchCount / len2 + (matchCount - transpositionCount) / matchCount) / 3;
  }
}();
window.wfcUtil = wfcUtil;
var util_default = wfcUtil;

// ../../webformula/material/src/core/device.js
var skipInitialSetWindow = true;
var wfcDevice = new class WFCDevice {
  #compactBreakpoint = 600;
  #mediumBreakpoint = 840;
  #lastState;
  #windowWidth;
  #windowHeight;
  #animationReady = false;
  #locale = navigator.language;
  #languageChange_bound = this.#languageChange.bind(this);
  // #resizeObserver = new ResizeObserver(() => {
  //   console.log('ro', window.visualViewport.width);
  //   if (!skipInitialSetWindow) this.#setWindow();
  //   else skipInitialSetWindow = false;
  // });
  constructor() {
    this.#setWindow();
    window.addEventListener("languagechange", this.#languageChange_bound);
    window.addEventListener("wfclanguagechange", this.#languageChange_bound);
    if (document.readyState !== "complete") {
      window.addEventListener("DOMContentLoaded", () => {
        this.#init();
      });
    } else {
      console.log(2);
      requestAnimationFrame(() => {
        this.#init();
      });
    }
  }
  #init() {
    document.documentElement.classList.add("wfc-initiated");
    window.visualViewport.addEventListener("resize", (e) => {
      if (!skipInitialSetWindow) this.#setWindow();
      else skipInitialSetWindow = false;
    });
  }
  get orientation() {
    if (screen?.orientation ? screen.orientation.type.startsWith("portrait") : Math.abs(window.orientation) !== 90) return "portrait";
    return "landscape";
  }
  // window.visualViewport.height and window.visualViewport.width show pixels converted based on density. This will give actual screen pixel count
  // get windowSizeActualPixels() {
  //   const pixelRatio = window.devicePixelRatio;
  //   return {
  //     width: window.visualViewport.width * pixelRatio,
  //     height: window.visualViewport.height * pixelRatio
  //   }
  // }
  get state() {
    if (this.windowWidth < this.#compactBreakpoint) return "compact";
    if (this.windowWidth < this.#mediumBreakpoint) return "medium";
    return "expanded";
  }
  get windowWidth() {
    return this.#windowWidth;
  }
  get windowHeight() {
    return this.#windowHeight;
  }
  get hasTouchScreen() {
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }
  get animationReady() {
    return this.#animationReady;
  }
  get hourCycle() {
    return Intl.DateTimeFormat(this.#locale, { hour: "numeric" }).resolvedOptions().hourCycle;
  }
  async #setWindow() {
    this.#windowWidth = window.visualViewport.width;
    this.#windowHeight = window.visualViewport.height;
    if (this.#windowWidth === 0) skipInitialSetWindow = false;
    if (window.__isBuilding) return;
    const state = this.state;
    document.body.classList.remove("window-compact");
    document.body.classList.remove("window-medium");
    document.body.classList.remove("window-expanded");
    switch (state) {
      case "compact":
        document.body.classList.add("window-compact");
        break;
      case "medium":
        document.body.classList.add("window-medium");
        break;
      case "expanded":
        document.body.classList.add("window-expanded");
        break;
    }
    if (!this.#lastState || state !== this.#lastState.state) {
      window.dispatchEvent(new CustomEvent("wfcwindowstate", { detail: {
        state,
        lastState: this.#lastState?.state
      } }));
    }
    if (!this.#lastState) {
      document.body.classList.add("wfc-animation");
      queueMicrotask(() => {
        this.#animationReady = true;
      });
    }
    this.#lastState = {
      state: this.state
    };
  }
  #languageChange() {
    this.#locale = window.wfcLanguage || navigator.language;
  }
}();
window.wfcDevice = wfcDevice;
var device_default = wfcDevice;

// ../../webformula/material/src/core/Drag.js
var defaultConfig = {
  disableMouseEvents: false,
  disableTouchEvents: !device_default.hasTouchScreen,
  lockScrollY: false,
  ignoreElements: [],
  swipeVelocityThreshold: 0.3,
  swipeDistanceThreshold: 10,
  horizontalOnly: false,
  reorder: false,
  reorderSwap: false,
  reorderHorizontalOnly: false,
  reorderVerticalOnly: false,
  reorderAnimation: true,
  reorderScrollDelayMS: 250,
  overflowDrag: false,
  scrollSnapPositions: []
};
var Drag = class {
  #element;
  #abortMain;
  #abortDrag;
  #trackingDetails;
  #overscrollTrackingDetails;
  #reorderElementsAndBounds;
  #enabled = false;
  #isDragging = false;
  #resetTrackingDetails = false;
  #swapOffsetY = 0;
  #swapOffsetX = 0;
  #swapLastClosestIndex;
  #reorderAnimateTimestamp;
  #dragOffsetPosition = 0;
  #overflowTimeConstant = 150;
  #stopOverscroll = false;
  #isSnapped = false;
  #stopSnapping = false;
  #listeners = {
    "wfcdragmove": [],
    "wfcdragstart": [],
    "wfcdragend": [],
    "drag-reordered": []
  };
  #drag_bound = this.#drag.bind(this);
  #start_bound = this.#start.bind(this);
  #end_bound = this.#end.bind(this);
  #disableMouseEvents = false;
  #disableTouchEvents = !device_default.hasTouchScreen;
  #lockScrollY = false;
  #ignoreElements = [];
  #swipeVelocityThreshold = 0.3;
  #swipeDistanceThreshold = 10;
  #horizontalOnly = false;
  #reorderSwap = false;
  #reorder = false;
  #reorderHorizontalOnly = false;
  #reorderVerticalOnly = false;
  #reorderAnimation = true;
  #reorderScrollDelayMS = 250;
  #overflowDrag = false;
  #scrollSnapPositions = [];
  #preventSwipeNavigation = false;
  constructor(element2, config = defaultConfig) {
    if (!(element2 instanceof HTMLElement)) throw Error("HTMLElement required");
    config = {
      ...defaultConfig,
      ...config
    };
    this.#element = element2;
    this.#disableMouseEvents = config.disableMouseEvents;
    this.#disableTouchEvents = config.disableTouchEvents;
    this.#lockScrollY = config.lockScrollY;
    this.#ignoreElements = config.ignoreElements;
    this.#swipeVelocityThreshold = config.swipeVelocityThreshold;
    this.#swipeDistanceThreshold = config.swipeDistanceThreshold;
    this.#horizontalOnly = config.horizontalOnly;
    this.#reorder = config.reorder;
    this.#reorderSwap = config.reorderSwap;
    this.reorderHorizontalOnly = config.reorderHorizontalOnly;
    this.reorderVerticalOnly = config.reorderVerticalOnly;
    this.#reorderAnimation = config.reorderAnimation;
    this.#reorderScrollDelayMS = config.reorderScrollDelayMS;
    this.#overflowDrag = config.overflowDrag;
    this.#scrollSnapPositions = config.scrollSnapPositions;
    this.#preventSwipeNavigation = config.preventSwipeNavigation;
  }
  get disableMouseEvents() {
    return this.#disableMouseEvents;
  }
  set disableMouseEvents(value) {
    this.#disableMouseEvents = !!value;
  }
  get disableTouchEvents() {
    return this.#disableTouchEvents;
  }
  set disableTouchEvents(value) {
    this.#disableTouchEvents = !!value;
  }
  get lockScrollY() {
    return this.#lockScrollY;
  }
  set lockScrollY(value) {
    this.#lockScrollY = !!value;
  }
  get horizontalOnly() {
    return this.#horizontalOnly;
  }
  set horizontalOnly(value) {
    this.#horizontalOnly = !!value;
  }
  get reorder() {
    return this.#reorder;
  }
  set reorder(value) {
    this.#reorder = !!value;
  }
  get reorderSwap() {
    return this.#reorderSwap;
  }
  set reorderSwap(value) {
    this.#reorderSwap = !!value;
  }
  get reorderHorizontalOnly() {
    return this.#reorderHorizontalOnly;
  }
  set reorderHorizontalOnly(value) {
    this.#reorderHorizontalOnly = !!value;
    if (this.#reorderHorizontalOnly) this.#reorderVerticalOnly = false;
  }
  get reorderVerticalOnly() {
    return this.#reorderVerticalOnly;
  }
  set reorderVerticalOnly(value) {
    this.#reorderVerticalOnly = !!value;
    if (this.#reorderVerticalOnly) this.#reorderHorizontalOnly = false;
  }
  get reorderAnimation() {
    return this.#reorderAnimation;
  }
  set reorderAnimation(value) {
    this.#reorderAnimation = !!value;
  }
  get reorderScrollDelayMS() {
    return this.#reorderScrollDelayMS;
  }
  set reorderScrollDelayMS(value) {
    this.#reorderScrollDelayMS = value;
  }
  get overflowDrag() {
    return this.#overflowDrag;
  }
  set overflowDrag(value) {
    this.#overflowDrag = !!value;
  }
  get scrollSnapPositions() {
    return this.#scrollSnapPositions;
  }
  set scrollSnapPositions(value) {
    if (Array.isArray(value)) this.#scrollSnapPositions = value;
    else this.#scrollSnapPositions = [];
  }
  get preventSwipeNavigation() {
    return this.#preventSwipeNavigation;
  }
  set preventSwipeNavigation(value) {
    this.#preventSwipeNavigation = !!value;
  }
  enable() {
    if (this.#enabled) return;
    this.#enabled = true;
    this.#abortMain = new AbortController();
    if (this.#reorder) {
      util_default.addLongPressListener(this.#element, this.#start_bound, {
        disableMouseEvents: this.#disableMouseEvents,
        disableTouchEvents: this.#disableTouchEvents
      });
    } else {
      if (!this.#disableMouseEvents) this.#element.addEventListener("mousedown", this.#start_bound, { signal: this.#abortMain.signal });
      if (!this.#disableTouchEvents) {
        this.#element.addEventListener("touchstart", this.#start_bound, { signal: this.#abortMain.signal });
      }
    }
  }
  disable() {
    if (this.#abortMain) this.#abortMain.abort();
    util_default.removeLongPressListener(this.#element, this.#start_bound);
    this.#enabled = false;
    this.cancel();
    if (this.#lockScrollY) util_default.unlockPageScroll();
  }
  cancel() {
    if (this.#abortDrag) this.#abortDrag.abort();
    this.#element.classList.remove("drag-active");
    this.#element.classList.remove("drag-reorder-active");
    this.#cleanupReorder();
    this.#isDragging = false;
    if (this.#lockScrollY) util_default.unlockPageScroll();
  }
  destroy() {
    this.disable();
    this.#element = void 0;
    this.#listeners = {};
  }
  resetTracking() {
    this.#resetTrackingDetails = true;
  }
  on(eventType, callback) {
    if (!this.#listeners[eventType]) throw Error("Invalid eventType. Valid events: wfcdragmove, wfcdragstart, wfcdragend, drag-reordered");
    this.#listeners[eventType].push(callback);
  }
  off(eventType, callback) {
    if (!this.#listeners[eventType]) throw Error("Invalid eventType. Valid events: wfcdragmove, wfcdragstart, wfcdragend, drag-reordered");
    if (this.#listeners[eventType].includes(callback)) this.#listeners[eventType].splice(this.#listeners[eventType].indexOf(callback), 1);
  }
  addIgnoreElement(element2) {
    this.#ignoreElements.push(element2);
  }
  emptyIgnoreElements() {
    this.#ignoreElements = [];
  }
  #trigger(event) {
    if (!this.#listeners[event.type]) return;
    this.#element.dispatchEvent(event);
    this.#listeners[event.type].forEach((callback) => callback(event));
  }
  #start(event) {
    this.#resetTrackingDetails = false;
    if (event.which === 3) {
      if (this.#isDragging) this.#end(event);
      return;
    }
    if (this.#ignoreElements.find((v) => v === event.target || v.contains(event.target))) return;
    this.#isSnapped = false;
    this.#stopOverscroll = true;
    this.#stopSnapping = true;
    this.#isDragging = false;
    if (this.#abortDrag) this.#abortDrag.abort();
    this.#abortDrag = new AbortController();
    this.#resetTrack(event);
    if (this.#reorder) this.#setupReorder();
    if (!this.#disableTouchEvents) {
      this.#element.addEventListener("touchend", this.#end_bound, { signal: this.#abortDrag.signal });
      this.#element.addEventListener("touchmove", this.#drag_bound, { passive: false, signal: this.#abortDrag.signal });
    }
    if (!this.#disableMouseEvents) {
      window.addEventListener("mouseup", this.#end_bound, { signal: this.#abortDrag.signal });
      window.addEventListener("mousemove", this.#drag_bound, { signal: this.#abortDrag.signal });
    }
    this.#isDragging = true;
    this.#element.classList.add("drag-active");
    const dragEvent = this.#track(event, "wfcdragstart");
    if (this.#lockScrollY && !this.horizontalOnly) util_default.lockPageScroll();
    if (this.preventSwipeNavigation && (event.pageX < 20 || event.pageX > window.innerWidth - 20)) {
      event.preventDefault();
    }
    this.#trigger(dragEvent);
  }
  #end(event) {
    if (this.#abortDrag) this.#abortDrag.abort();
    if (!this.#isDragging) return;
    if (this.#lockScrollY || this.#reorder) util_default.unlockPageScroll();
    const dragEvent = this.#track(event, "wfcdragend");
    if (this.#overflowDrag) this.#startOverscroll(dragEvent);
    else this.#endFinal(dragEvent);
  }
  #endFinal(event) {
    if (this.#scrollSnapPositions && this.#scrollSnapPositions.length > 0 && !this.#isSnapped) return this.#snap(event);
    this.#element.classList.remove("drag-active");
    if (this.#reorder) this.#endReorder();
    this.#isDragging = false;
    this.#trigger(event);
  }
  #drag(event) {
    if (this.#isDragging === false) return;
    if (this.#resetTrackingDetails) {
      this.#resetTrack(event);
      this.#resetTrackingDetails = false;
    }
    if (event.preventDefault && (this.#lockScrollY || this.#reorder)) event.preventDefault();
    const dragEvent = this.#track(event, "wfcdragmove");
    if (this.horizontalOnly && this.#lockScrollY) {
      if (Math.abs(dragEvent.distanceX) < 4) {
        if (Math.abs(dragEvent.distanceY) > 4) this.#end(event);
        return;
      }
      util_default.lockPageScroll();
    }
    if (this.#reorder) this.#reorderDrag(dragEvent);
    this.#trigger(dragEvent);
    return dragEvent;
  }
  #getClientPosition(event) {
    return {
      clientX: event.changedTouches ? event.changedTouches[0].clientX : event.clientX,
      clientY: event.changedTouches ? event.changedTouches[0].clientY : event.clientY
    };
  }
  // Note: distance and distanceDelta will always be positive because of squaring the x y distances
  #getDistance(x, y, previousX, previousY, initialX, initialY) {
    const distanceX = x - initialX;
    const distanceY = y - initialY;
    const distanceDeltaX = x - previousX;
    const distanceDeltaY = y - previousY;
    return {
      distanceX,
      distanceY,
      distance: Math.sqrt(distanceX * distanceX + distanceY * distanceY),
      distanceDeltaX,
      distanceDeltaY,
      distanceDelta: Math.sqrt(distanceDeltaX * distanceDeltaX + distanceDeltaY * distanceDeltaY)
    };
  }
  #getDirection({ distanceX, distanceY, distanceDeltaX, distanceDeltaY }) {
    let direction = "none";
    if (Math.abs(distanceX) > Math.abs(distanceY)) direction = distanceX < 0 ? "left" : "right";
    else direction = distanceY < 0 ? "up" : "down";
    let directionDelta = "none";
    if (Math.abs(distanceDeltaX) > Math.abs(distanceDeltaY)) directionDelta = distanceDeltaX < 0 ? "left" : "right";
    else directionDelta = distanceDeltaY < 0 ? "up" : "down";
    return {
      directionX: distanceX === 0 ? 0 : distanceX > 0 ? 1 : -1,
      directionY: distanceY === 0 ? 0 : distanceY > 0 ? 1 : -1,
      direction,
      directionDeltaX: distanceDeltaX === 0 ? 0 : distanceDeltaX > 0 ? 1 : -1,
      directionDeltaY: distanceDeltaY === 0 ? 0 : distanceDeltaY > 0 ? 1 : -1,
      directionDelta
    };
  }
  #getVelocity(distance, elapsedTime, elapsedTimeDelta, previousVelocityDeltaX, previousVelocityDeltaY, previousVelocityDelta) {
    const velocityX = distance.distanceX / elapsedTime;
    const velocityY = distance.distanceY / elapsedTime;
    const velocity = distance.distance / elapsedTime;
    const velocityDeltaX = 0.4 * (1e3 * distance.distanceDeltaX / (1 + elapsedTimeDelta)) + 0.2 * previousVelocityDeltaX;
    const velocityDeltaY = 0.4 * (1e3 * distance.distanceDeltaY / (1 + elapsedTimeDelta)) + 0.2 * previousVelocityDeltaY;
    const velocityDelta = 0.4 * (1e3 * distance.distanceDelta / (1 + elapsedTimeDelta)) + 0.2 * previousVelocityDelta;
    return {
      velocityX,
      velocityY,
      velocity,
      velocityDeltaX,
      velocityDeltaY,
      velocityDelta
    };
  }
  #getSwipe({
    pointers,
    distanceX,
    distanceY,
    distance,
    velocity,
    velocityX,
    velocityY
  }) {
    const hasPointer = pointers === 1;
    return {
      swipeX: hasPointer && Math.abs(distanceX) > this.#swipeDistanceThreshold && Math.abs(velocityX) > this.#swipeVelocityThreshold,
      swipeY: hasPointer && Math.abs(distanceY) > this.#swipeDistanceThreshold && Math.abs(velocityY) > this.#swipeVelocityThreshold,
      swipe: hasPointer && distance > this.#swipeDistanceThreshold && Math.abs(velocity) > this.#swipeVelocityThreshold
    };
  }
  #resetTrack(event = { clientX: 0, clientY: 0 }) {
    const client = this.#getClientPosition(event);
    this.#trackingDetails = {
      clientInitialX: client.clientX,
      clientInitialY: client.clientY,
      ...client,
      distanceX: 0,
      distanceY: 0,
      distance: 0,
      distanceDeltaX: 0,
      distanceDeltaY: 0,
      distanceDelta: 0,
      elapsedTime: 0,
      elapsedTimeDelta: 0,
      pointers: 0,
      timeStamp: Date.now(),
      timeStampDelta: Date.now(),
      velocityX: 0,
      velocityY: 0,
      velocity: 0,
      velocityDeltaX: 0,
      velocityDeltaY: 0,
      velocityDelta: 0
    };
  }
  #track(event, eventType) {
    const client = this.#getClientPosition(event);
    const clientInitialX = this.#trackingDetails.clientInitialX || client.clientX;
    const clientInitialY = this.#trackingDetails.clientInitialY || client.clientY;
    const distance = this.#getDistance(
      client.clientX,
      client.clientY,
      this.#trackingDetails.clientX,
      this.#trackingDetails.clientY,
      clientInitialX,
      clientInitialY
    );
    const direction = this.#getDirection(distance);
    const timeStampDelta = Date.now();
    const timeStamp = this.#trackingDetails.timeStamp || timeStampDelta;
    const elapsedTime = timeStampDelta - this.#trackingDetails.timeStamp;
    const elapsedTimeDelta = timeStampDelta - this.#trackingDetails.timeStampDelta;
    const pointers = event.changedTouches ? event.changedTouches.length : 1;
    const velocity = this.#getVelocity(
      distance,
      elapsedTime,
      elapsedTimeDelta,
      this.#trackingDetails.velocityDeltaX,
      this.#trackingDetails.velocityDeltaY,
      this.#trackingDetails.velocityDelta
    );
    this.#trackingDetails = {
      ...client,
      clientInitialX,
      clientInitialY,
      ...distance,
      ...direction,
      elapsedTime,
      elapsedTimeDelta,
      pointers,
      timeStamp,
      timeStampDelta,
      ...velocity
    };
    const dragEvent = new CustomEvent(eventType);
    dragEvent.clientX = this.#trackingDetails.clientX;
    dragEvent.clientY = this.#trackingDetails.clientY;
    dragEvent.distanceX = this.#trackingDetails.distanceX;
    dragEvent.distanceY = this.#trackingDetails.distanceY;
    dragEvent.distance = this.#trackingDetails.distance;
    dragEvent.distanceDeltaX = this.#trackingDetails.distanceDeltaX;
    dragEvent.distanceDeltaY = this.#trackingDetails.distanceDeltaY;
    dragEvent.distanceDelta = this.#trackingDetails.distanceDelta;
    dragEvent.directionX = this.#trackingDetails.directionX;
    dragEvent.directionY = this.#trackingDetails.directionY;
    dragEvent.direction = this.#trackingDetails.direction;
    dragEvent.directionDeltaX = this.#trackingDetails.directionDeltaX;
    dragEvent.directionDeltaY = this.#trackingDetails.directionDeltaY;
    dragEvent.directionDelta = this.#trackingDetails.directionDelta;
    dragEvent.velocityX = this.#trackingDetails.velocityX;
    dragEvent.velocityY = this.#trackingDetails.velocityY;
    dragEvent.velocity = this.#trackingDetails.velocity;
    dragEvent.velocityDeltaX = this.#trackingDetails.velocityDeltaX;
    dragEvent.velocityDeltaY = this.#trackingDetails.velocityDeltaY;
    dragEvent.velocityDelta = this.#trackingDetails.velocityDelta;
    dragEvent.elapsedTime = this.#trackingDetails.elapsedTime;
    dragEvent.elapsedTimeDelta = this.#trackingDetails.elapsedTimeDelta;
    if (eventType === "wfcdragend") {
      const swipes = this.#getSwipe(this.#trackingDetails);
      dragEvent.swipeX = swipes.swipeX;
      dragEvent.swipeY = swipes.swipeY;
      dragEvent.swipe = swipes.swipe;
    }
    if (event.preventDefault) dragEvent.preventDefault = () => event.preventDefault();
    return dragEvent;
  }
  #getDistanceBetweenBounds(b1, b2) {
    return Math.sqrt(Math.pow(b1.x + b1.width / 2 - (b2.x + b2.width / 2), 2) + Math.pow(b1.y + b1.height / 2 - (b2.y + b2.height / 2), 2));
  }
  // --- Reorder ----
  #setupReorder() {
    this.#element.classList.add("drag-reorder-active");
    util_default.lockPageScroll();
    this.#element.style.zIndex = 999;
    this.#reorderElementsAndBounds = [...this.#element.parentElement.children].map((element2, i) => ({
      element: element2,
      originalBounds: element2.getBoundingClientRect(),
      index: i,
      initialIndex: i
    }));
    this.#reorderElementsAndBounds.forEach(({ element: element2, index }) => element2.style.order = index);
    this.#animateReorderOffset();
  }
  #endReorder() {
    const dragged = this.#reorderElementsAndBounds.find((i) => i.dragged);
    const target = this.#reorderElementsAndBounds.find((i) => i.target);
    this.#cleanupReorder();
    if (!dragged || !target || dragged.index === target.index || dragged.index === dragged.initialIndex) return;
    const closestNextElement = target.element.nextElementSibling;
    if (this.#reorderSwap) {
      const elementNextElement = dragged.element.nextElementSibling;
      if (!elementNextElement) {
        this.#element.parentElement.append(target.element);
      } else {
        this.#element.parentElement.insertBefore(target.element, elementNextElement);
      }
      if (!closestNextElement) {
        this.#element.parentElement.append(dragged.element);
      } else {
        this.#element.parentElement.insertBefore(dragged.element, closestNextElement);
      }
    } else {
      if (dragged.index > target.index) {
        if (!closestNextElement) this.#element.parentElement.append(dragged.element);
        else this.#element.parentElement.insertBefore(dragged.element, closestNextElement);
      } else {
        this.#element.parentElement.insertBefore(dragged.element, target.element);
      }
    }
    this.#trigger(new Event("drag-reordered", { bubbles: true }));
  }
  #cleanupReorder() {
    (this.#reorderElementsAndBounds || []).forEach(({ element: element2 }) => {
      element2.style.order = "";
      element2.style.zIndex = "";
      element2.style.opacity = "";
      element2.style.transform = "";
      element2.style.transition = "";
      element2.style.transitionTimingFunction = "";
    });
    this.#reorderElementsAndBounds = [];
    this.#swapOffsetY = 0;
    this.#swapOffsetX = 0;
    this.#swapLastClosestIndex = void 0;
    this.#dragOffsetPosition = 0;
    this.#reorderAnimateTimestamp = void 0;
    this.#element.classList.remove("drag-reorder-active");
  }
  #reorderDrag(dragEvent) {
    const distanceX = this.#reorderVerticalOnly ? 0 : dragEvent.distanceX;
    const distanceY = this.#reorderHorizontalOnly ? 0 : dragEvent.distanceY;
    this.#element.style.transform = `translate(${distanceX + this.#swapOffsetX}px,${distanceY + this.#swapOffsetY}px) translate(-${this.#dragOffsetPosition}px, -${this.#dragOffsetPosition}px)`;
    const dragBounds = this.#element.getBoundingClientRect();
    const closestItem = this.#reorderElementsAndBounds.filter(({ originalBounds }) => {
      if (dragBounds.left >= originalBounds.right || originalBounds.left >= dragBounds.right) return false;
      if (dragBounds.top >= originalBounds.bottom || originalBounds.top >= dragBounds.bottom) return false;
      return true;
    }).reduce((previous, item) => {
      if (!previous) return item;
      return this.#getDistanceBetweenBounds(previous.originalBounds, dragBounds) < this.#getDistanceBetweenBounds(item.originalBounds, dragBounds) ? previous : item;
    }, void 0);
    if (!closestItem) return;
    const dragItem = this.#reorderElementsAndBounds.find(({ element: element2 }) => element2 === this.#element);
    this.#reorderElementsAndBounds.forEach((item) => {
      item.lastIndex = item.index;
      item.index = item.initialIndex;
      item.target = false;
    });
    dragItem.index = closestItem.initialIndex;
    dragItem.dragged = true;
    closestItem.target = true;
    if (this.#reorderSwap) {
      closestItem.index = dragItem.initialIndex;
    } else {
      const startIndex = dragItem.initialIndex > closestItem.initialIndex ? closestItem.initialIndex : dragItem.initialIndex + 1;
      const endIndex = dragItem.initialIndex > closestItem.initialIndex ? dragItem.initialIndex : closestItem.initialIndex + 1;
      this.#reorderElementsAndBounds.slice(startIndex, endIndex).forEach((item) => {
        if (dragItem.initialIndex > closestItem.initialIndex) item.index += 1;
        else item.index -= 1;
      });
    }
    if (this.#reorderAnimation) {
      this.#reorderElementsAndBounds.forEach((item) => {
        if (item.index === item.lastIndex || this.#element === item.element || item.inTransition) return;
        item.inTransition = true;
        item.previousBounds = item.element.getBoundingClientRect();
        requestAnimationFrame(() => {
          const currentBounds = item.element.getBoundingClientRect();
          const distance = this.#getDistanceBetweenBounds(item.previousBounds, currentBounds);
          item.element.style.transform = `translate(${item.previousBounds.x - currentBounds.x}px, ${item.previousBounds.y - currentBounds.y}px)`;
          if (!item.transitionStarted) {
            item.transitionStarted = true;
            requestAnimationFrame(() => {
              item.element.style.transition = `transform ${Math.abs(distance) * 1.5 + 200}ms`;
              item.element.style.transitionTimingFunction = "var(--wfc-motion-easing-standard-decelerate)";
              item.element.style.transform = "";
              util_default.transitionendAsync(item.element).then(() => {
                item.inTransition = false;
                item.transitionStarted = false;
                item.element.style.transition = "";
                item.element.style.transitionTimingFunction = "";
              });
            });
          }
        });
      });
    }
    this.#reorderElementsAndBounds.forEach((item) => {
      item.element.style.order = item.index;
    });
    if (this.#swapLastClosestIndex !== closestItem.initialIndex) {
      const newBounds = this.#element.getBoundingClientRect();
      this.#swapOffsetY += dragBounds.y - newBounds.y;
      this.#swapOffsetX += dragBounds.x - newBounds.x;
      this.#swapLastClosestIndex = closestItem.initialIndex;
      this.#element.style.transform = `translate(${distanceX + this.#swapOffsetX}px,${distanceY + this.#swapOffsetY}px) translate(-${this.#dragOffsetPosition}px, -${this.#dragOffsetPosition}px)`;
    }
  }
  // animate offset when dragging
  #animateReorderOffset() {
    if (!this.#reorderAnimateTimestamp) this.#reorderAnimateTimestamp = Date.now();
    requestAnimationFrame(() => {
      const timestamp = Date.now();
      const delta = timestamp - this.#reorderAnimateTimestamp;
      this.#reorderAnimateTimestamp = timestamp;
      this.#dragOffsetPosition += delta / 12;
      if (this.#dragOffsetPosition >= 4) this.#dragOffsetPosition = 4;
      this.#element.style.transform = `translate(${this.#trackingDetails.distanceX + this.#swapOffsetX}px,${this.#trackingDetails.distanceY + this.#swapOffsetY}px) translate(-${this.#dragOffsetPosition}px, -${this.#dragOffsetPosition}px)`;
      if (this.#dragOffsetPosition !== 4) this.#animateReorderOffset();
    });
  }
  // --- Overscroll ---
  #startOverscroll(event) {
    const overscrollX = this.#trackingDetails.velocityDeltaX > 10 || this.#trackingDetails.velocityDeltaX < -10;
    const overscrollY = this.#trackingDetails.velocityDeltaY > 10 || this.#trackingDetails.velocityDeltaY < -10;
    if (!overscrollX || !overscrollY) {
      this.#endFinal(event);
      return;
    }
    const amplitudeX = 0.8 * this.#trackingDetails.velocityDeltaX;
    const amplitudeY = 0.8 * this.#trackingDetails.velocityDeltaY;
    this.#overscrollTrackingDetails = {
      overscrollX,
      overscrollY,
      amplitudeX,
      amplitudeY,
      scrollTargetX: Math.round(this.#trackingDetails.clientX + amplitudeX),
      scrollTargetY: Math.round(this.#trackingDetails.clientY + amplitudeY),
      overscrollTimeStamp: Date.now()
    };
    this.#stopOverscroll = false;
    this.#overscroll(event);
  }
  #overscroll(event) {
    if (this.#stopOverscroll || !this.#element) return;
    const elapsed = Date.now() - this.#overscrollTrackingDetails.overscrollTimeStamp;
    const deltaX = -this.#overscrollTrackingDetails.amplitudeX * Math.exp(-elapsed / this.#overflowTimeConstant);
    const deltaY = -this.#overscrollTrackingDetails.amplitudeY * Math.exp(-elapsed / this.#overflowTimeConstant);
    const keepScrollingX = deltaX > 1 || deltaX < -1;
    const keepScrollingY = deltaY > 1 || deltaY < -1;
    if (!keepScrollingX && !keepScrollingY || !this.#scrollSnapPositions && this.#scrollSnapPositions.length === 0 && Math.abs(deltaX) < 140) {
      this.#endFinal(this.#track(event, "wfcdragend"));
      return;
    }
    const clientX = keepScrollingX ? this.#overscrollTrackingDetails.scrollTargetX + deltaX : this.#overscrollTrackingDetails.scrollTargetX;
    const clientY = keepScrollingY ? this.#overscrollTrackingDetails.scrollTargetY + deltaY : this.#overscrollTrackingDetails.scrollTargetY;
    const movementX = clientX - event.clientX;
    const movementY = clientY - event.clientY;
    const dragEvent = this.#drag({
      clientX: event.clientX + movementX,
      clientY: event.clientY + movementY
    });
    requestAnimationFrame(() => this.#overscroll(dragEvent));
  }
  // --- snap ---
  #snap(event) {
    this.#stopSnapping = false;
    const nextScrollLeft = this.#element.scrollLeft;
    const nextScrollTop = this.#element.scrollTop;
    const snapPosition = this.#getSnapPosition(nextScrollLeft, nextScrollTop, event.directionX, event.directionY);
    this.#snapMove(snapPosition, event, event.directionX, event.directionY);
  }
  #getSnapPosition(x, y, directionX, directionY) {
    const nearest = this.#scrollSnapPositions.reduce((a, b) => {
      if (!a) return b;
      const distanceAX = Math.abs(x - (a.x || 0)) * (directionX === 1 ? 0.76 : 0.24);
      const distanceAY = Math.abs(y - (a.y || 0)) * (directionY === 1 ? 0.76 : 0.24);
      const distanceBX = Math.abs(x - (b.x || 0)) * (directionX === 1 ? 0.76 : 0.24);
      const distanceBY = Math.abs(y - (b.y || 0)) * (directionY === 1 ? 0.76 : 0.24);
      const distanceA = Math.sqrt(distanceAX * distanceAX + distanceAY * distanceAY);
      const distanceB = Math.sqrt(distanceBX * distanceBX + distanceBY * distanceBY);
      return distanceA < distanceB ? a : b;
    }, void 0);
    return {
      x: nearest.x || 0,
      y: nearest.y || 0
    };
  }
  #snapMove(target, lastEvent, previousDirectionX, previousDirectionY) {
    if (this.#stopSnapping || !this.#element) return;
    const diffX = target.x - this.#element.scrollLeft;
    const diffY = target.y - this.#element.scrollTop;
    const isBounceBackX = previousDirectionX < 0 && diffX < 0 || previousDirectionX > 0 && diffX > 0;
    const isBounceBackY = previousDirectionY < 0 && diffX < 0 || previousDirectionY > 0 && diffX > 0;
    let percent = Math.exp(-(Date.now() - this.#trackingDetails.timeStampDelta) / this.#overflowTimeConstant) * 0.2;
    if (isBounceBackX || isBounceBackY) percent *= 0.5;
    const movementX = -diffX * percent;
    const movementY = -diffY * percent;
    const isMaxScrollX = this.#element.scrollWidth === this.#element.offsetWidth || this.#element.scrollWidth - this.#element.offsetWidth === this.#element.scrollLeft;
    const isMaxScrollY = this.#element.scrollHeight === this.#element.offsetHeight || this.#element.scrollHeight - this.#element.offsetHeight === this.#element.scrollTop;
    const keepScrollingX = (movementX > 1 || movementX < -1) && !isMaxScrollX;
    const keepScrollingY = (movementY > 1 || movementY < -1) && !isMaxScrollY;
    if (!keepScrollingX && !keepScrollingY) {
      this.#isSnapped = true;
      this.#endFinal(lastEvent);
      return;
    }
    const client = this.#getClientPosition(lastEvent);
    const dragEvent = this.#drag({
      clientX: client.clientX + movementX,
      clientY: client.clientY + movementY
    });
    requestAnimationFrame(() => this.#snapMove(target, dragEvent, previousDirectionX, previousDirectionY));
  }
};

// ../../webformula/material/src/components/surface/component.js
var animations = ["translate-y", "translate-left", "transition-right", "translate-right", "height", "height-center-to-opacity", "fullscreen", "opacity"];
var validPositionRegex = /^(?:position-)?(center|top|bottom)(?:[\s|-](center|left|right))?$/;
var WFCSurfaceElement = class extends HTMLComponentElement {
  static tag = "wfc-surface";
  static useShadowRoot = true;
  static useTemplate = true;
  #abort;
  #drag;
  #anchor;
  #anchorElement;
  #surfaceElement;
  #position = "center center";
  #positionMouse;
  #positionMouseOnly;
  #mouseX;
  #mouseY;
  #shrink = true;
  #fixed = false;
  #fixedAfter = false;
  #overlap = true;
  #animation = "height";
  #viewportBound = true;
  #alwaysVisible = false;
  #offsetTop = 0;
  #offsetBottom = 0;
  #closeDelay = 0;
  #scrim = false;
  #open = false;
  #initialOpen = false;
  #allowClose = false;
  #resizable = false;
  #swipeClose;
  #swipeCloseIconAuto;
  #mutationObserver;
  #predictiveBackIcon;
  #fullscreenScrollTop;
  #preFullscreenBounds;
  #fullscreenPlaceholder;
  #onChildrenChange_bound = this.#onChildrenChange.bind(this);
  #onClickOutside_bound = this.#onClickOutside.bind(this);
  #onEsc_bound = this.#onEsc.bind(this);
  #setMousePosition_bound = this.#setMousePosition.bind(this);
  #swipeCloseStart_bound = this.#swipeCloseStart.bind(this);
  #swipeCloseMove_bound = this.#swipeCloseMove.bind(this);
  #swipeCloseEnd_bound = this.#swipeCloseEnd.bind(this);
  #handleVirtualKeyboardHeight_bound = this.#handleVirtualKeyboardHeight.bind(this);
  #handleVirtualKeyboardScroll_bound = this.#handleVirtualKeyboardScroll.bind(this);
  constructor(callRender = true) {
    super();
    if (this.constructor.styleSheets) this.constructor.styleSheets = [].concat(...[component_default, this.constructor.styleSheets]);
    else this.constructor.styleSheets = [component_default];
    if (callRender) {
      this.render();
      this.#surfaceElement = this.shadowRoot.querySelector(".surface");
    }
  }
  /* Default template can be overridden
   * as long as you have .surface and .surface-content
   */
  template() {
    return (
      /*html*/
      `
      <div class="scrim"></div>
      <div class="surface">
        <div class="surface-content">
          <slot></slot>
        </div>
      </div>
    `
    );
  }
  connectedCallback() {
    if (!this.#surfaceElement) this.#surfaceElement = this.shadowRoot.querySelector(".surface");
    this.#abort = new AbortController();
    const positionClass = [...this.classList].find((v) => v.startsWith("position-"));
    if (positionClass) this.position = positionClass;
    if (this.#closeDelay) this.#surfaceElement.style.setProperty("--wfc-surface-close-delay", `${this.#closeDelay}ms`);
    this.#surfaceElement.classList.toggle("viewport-bound", this.#viewportBound);
    this.#surfaceElement.classList.toggle("always-visible", this.#alwaysVisible);
    if (device_default.hasTouchScreen && this.#swipeClose) {
      this.#drag = new Drag(this.#surfaceElement);
      this.#drag.horizontalOnly = true;
      this.#drag.preventSwipeNavigation = true;
      this.#drag.on("wfcdragstart", this.#swipeCloseStart_bound);
      this.#drag.on("wfcdragmove", this.#swipeCloseMove_bound);
      this.#drag.on("wfcdragend", this.#swipeCloseEnd_bound);
      this.#drag.enable();
      this.#predictiveBackIcon = this.shadowRoot.querySelector(".predictive-back-icon");
    }
    setTimeout(() => {
      this.classList.add("animation");
    }, 40);
  }
  #swipeCloseStart({ clientX }) {
    if (clientX < device_default.windowWidth / 2 && clientX > 30 || clientX > device_default.windowWidth / 2 && device_default.windowWidth - clientX > 50) {
      this.#drag.cancel();
    }
  }
  #swipeCloseMove({ distanceX, directionX }) {
    distanceX = Math.abs(distanceX);
    const scalePercent = Math.max(0, this.#easeInQuint(1 - distanceX / device_default.windowWidth));
    const scaleOffset = 0.02;
    const scale = 1 - scaleOffset + scalePercent * scaleOffset;
    const translatePercent = Math.min(1, this.#easeInQuart(distanceX / device_default.windowWidth));
    const translate = translatePercent * 3;
    this.#surfaceElement.style.transform = `translateX(${translate * directionX}px) scale(${scale})`;
    if (this.#swipeCloseIconAuto && directionX === 1) {
      this.#predictiveBackIcon.classList.remove("right");
      this.#predictiveBackIcon.classList.add("left");
    } else if (this.#swipeCloseIconAuto) {
      this.#predictiveBackIcon.classList.remove("left");
      this.#predictiveBackIcon.classList.add("right");
    }
    if (this.#predictiveBackIcon && distanceX > 50) {
      this.#predictiveBackIcon.classList.remove("hide");
      const stretch = Math.min(1, (distanceX - 45) / (device_default.windowWidth / 2));
      this.#predictiveBackIcon.style.setProperty("--wfc-predictive-back-stretch", `${stretch * 16}px`);
    } else {
      this.#predictiveBackIcon.classList.add("hide");
    }
  }
  #swipeCloseEnd({ distanceX }) {
    this.#surfaceElement.style.transform = "";
    this.#predictiveBackIcon.classList.add("hide");
    if (Math.abs(distanceX) > device_default.windowWidth / 4) this.close();
    this.dispatchEvent(new Event("predictive-back"));
  }
  #easeInQuart(x) {
    return x * x * x * x;
  }
  #easeInQuint(x) {
    return x * x * x * x * x;
  }
  disconnectedCallback() {
    if (this.#abort) this.#abort.abort();
    if (this.#mutationObserver) {
      this.#mutationObserver.disconnect();
      this.#mutationObserver = void 0;
    }
  }
  static get observedAttributesExtended() {
    return [["anchor", "string"]];
  }
  attributeChangedCallbackExtended(name, _oldValue, newValue) {
    this[name] = newValue;
  }
  get anchor() {
    return this.#anchor;
  }
  set anchor(value) {
    const anchorElement = document.querySelector(value);
    if (anchorElement) {
      this.#anchor = value;
      this.#anchorElement = anchorElement;
      this.classList.add("anchor");
    } else {
      this.classList.remove("anchor");
      this.#anchor = void 0;
      this.#anchorElement = void 0;
    }
  }
  get anchorElement() {
    return this.#anchorElement;
  }
  set anchorElement(value) {
    if (!value || !value.nodeName) {
      this.classList.remove("anchor");
      this.#anchorElement = void 0;
    } else {
      this.classList.add("anchor");
      this.#anchorElement = value;
    }
  }
  get animation() {
    return this.#animation;
  }
  set animation(value) {
    if (!animations.includes(value)) throw Error(`Invalid value. values = (${animations.join(", ")})`);
    this.#animation = value;
    this.classList.toggle("animation-height", value === "height");
    this.classList.toggle("animation-translate-left", value === "translate-left");
    this.classList.toggle("animation-translate-right", value === "translate-right");
    this.classList.toggle("animation-height-center-to-opacity", value === "height-center-to-opacity");
    this.classList.toggle("animation-fullscreen", value === "fullscreen");
    this.classList.toggle("animation-opacity", value === "opacity");
  }
  get viewportBound() {
    return this.#viewportBound;
  }
  set viewportBound(value) {
    this.#viewportBound = !!value;
    this.#surfaceElement.classList.toggle("viewportBound-bound", this.#viewportBound);
  }
  get scrim() {
    return this.#scrim;
  }
  set scrim(value) {
    this.#scrim = !!value;
    this.classList.toggle("scrim", this.#scrim);
  }
  get offsetBottom() {
    return this.#offsetBottom;
  }
  set offsetBottom(value) {
    this.#offsetBottom = parseInt(value);
  }
  get offsetTop() {
    return this.#offsetTop;
  }
  set offsetTop(value) {
    this.#offsetTop = parseInt(value);
  }
  get allowClose() {
    return this.#allowClose;
  }
  set allowClose(value) {
    this.#allowClose = !!value;
  }
  get shrink() {
    return this.#shrink;
  }
  set shrink(value) {
    this.#shrink = !!value;
  }
  get alwaysVisible() {
    return this.#alwaysVisible;
  }
  set alwaysVisible(value) {
    this.#alwaysVisible = !!value;
    this.#surfaceElement.classList.toggle("always-visible", this.#alwaysVisible);
  }
  get open() {
    return this.#open;
  }
  set open(value) {
    if (!!value) this.show();
    else this.close();
    this.toggleAttribute("open", !!value);
  }
  get initialOpen() {
    return this.#initialOpen;
  }
  set initialOpen(value) {
    this.#initialOpen = !!value;
    this.#open = true;
    this.classList.add("open");
  }
  get fixed() {
    return this.#fixed;
  }
  set fixed(value) {
    this.#fixed = !!value;
    this.classList.toggle("fixed", this.#fixed);
  }
  get fixedAfter() {
    return this.#fixedAfter;
  }
  set fixedAfter(value) {
    this.#fixedAfter = !!value;
  }
  get position() {
    return this.#position;
  }
  set position(value) {
    if (!value) return;
    const match = value.match(validPositionRegex);
    if (!match) {
      console.error("Invalid position");
      return;
    }
    this.#position = `${match[1]} ${match[2] || "center"}`;
    const positionClass = `position-${match[1]}${match[2] ? `-${match[2]}` : ""}`;
    if (!this.classList.contains(positionClass)) this.classList.add(positionClass);
  }
  get positionMouse() {
    return this.#positionMouse;
  }
  set positionMouse(value) {
    this.#positionMouse = !!value;
    if (this.#positionMouse) window.addEventListener("mousedown", this.#setMousePosition_bound, { signal: this.#abort.signal });
    else window.removeEventListener("mousedown", this.#setMousePosition_bound);
  }
  get positionMouseOnly() {
    return this.#positionMouseOnly;
  }
  set positionMouseOnly(value) {
    this.#positionMouseOnly = !!value;
    if (this.#positionMouseOnly) window.addEventListener("mousedown", this.#setMousePosition_bound, { signal: this.#abort.signal });
    else window.removeEventListener("mousedown", this.#setMousePosition_bound);
  }
  set mouseX(value) {
    this.#mouseX = value;
  }
  set mouseY(value) {
    this.#mouseY = value;
    if (this.open) this.#setMousePositionOnly();
  }
  get overlap() {
    return this.#overlap;
  }
  set overlap(value) {
    this.#overlap = !!value;
  }
  get closeDelay() {
    return this.#closeDelay;
  }
  set closeDelay(value) {
    this.#closeDelay = parseInt(value || 0);
    this.#surfaceElement.style.setProperty("--wfc-surface-close-delay", `${this.#closeDelay}ms`);
  }
  get resizable() {
    return this.#resizable;
  }
  set resizable(value) {
    this.#resizable = !!value;
    if (this.#resizable === true) {
      this.#mutationObserver = new MutationObserver(this.#onChildrenChange_bound);
    } else if (this.#mutationObserver) {
      this.#mutationObserver.disconnect();
      this.#mutationObserver = void 0;
    }
  }
  get swipeClose() {
    return this.#swipeClose;
  }
  set swipeClose(value) {
    this.#swipeClose = !!value;
  }
  get swipeCloseIconAuto() {
    return this.#swipeCloseIconAuto;
  }
  set swipeCloseIconAuto(value) {
    this.#swipeCloseIconAuto = !!value;
  }
  async show() {
    if (this.open) return;
    this.#open = true;
    this.onShowBefore();
    if (this.animation === "fullscreen") this.#preShowFullscreen();
    this.classList.add("open");
    if (this.#fixedAfter) this.classList.add("fixed");
    this.#setPosition();
    this.onShow();
    this.#surfaceElement.classList.add("animating");
    if (this.animation === "fullscreen") await util_default.transitionendAsync(this);
    else await util_default.animationendAsync(this.#surfaceElement);
    this.#surfaceElement.classList.remove("animating");
    this.#surfaceElement.style.removeProperty("--wfc-surface-height");
    this.#surfaceElement.style.removeProperty("--wfc-surface-width");
    if (this.#allowClose) {
      if (this.#scrim) this.shadowRoot.querySelector(".scrim").addEventListener("click", this.#onClickOutside_bound, { signal: this.#abort.signal });
      else window.addEventListener("click", this.#onClickOutside_bound, { signal: this.#abort.signal });
      window.addEventListener("keydown", this.#onEsc_bound, { signal: this.#abort.signal });
    }
    if (this.#resizable && this.#surfaceElement.classList.contains("above")) this.#mutationObserver.observe(this, { attributes: true, subtree: true });
    this.onShowEnd();
  }
  async close() {
    if (!this.open) return;
    this.#open = false;
    if (this.#resizable && this.#mutationObserver) this.#mutationObserver.disconnect();
    this.onHide();
    if (this.#allowClose) {
      if (this.#scrim) this.shadowRoot.querySelector(".scrim").removeEventListener("click", this.#onClickOutside_bound);
      else window.removeEventListener("click", this.#onClickOutside_bound);
      window.removeEventListener("keydown", this.#onEsc_bound);
    }
    if (this.animation === "height") {
      this.#surfaceElement.style.setProperty("--wfc-surface-height", `${this.#surfaceElement.offsetHeight}px`);
      this.#surfaceElement.style.setProperty("--wfc-surface-width", `${this.#surfaceElement.offsetWidth}px`);
    }
    if (this.animation === "fullscreen") this.#preClearFullScreen();
    this.#surfaceElement.classList.add("animating");
    this.classList.add("closing");
    this.classList.remove("open");
    if (this.animation === "fullscreen") this.#postHideFullscreen();
    if (this.animation === "fullscreen") await util_default.transitionendAsync(this);
    else await util_default.animationendAsync(this.#surfaceElement);
    this.#surfaceElement.classList.remove("above");
    this.#surfaceElement.classList.remove("animating");
    this.#surfaceElement.style.left = "";
    this.#surfaceElement.style.bottom = "";
    this.#surfaceElement.style.top = "";
    this.classList.remove("closing");
    if (this.animation === "fullscreen") {
      this.#clearFullScreen();
      this.#fullscreenPlaceholder.remove();
    }
    if (this.#fixedAfter) this.classList.remove("fixed");
    this.dispatchEvent(new Event("close"));
    this.onHideEnd();
  }
  toggle() {
    this.open = !this.open;
  }
  onShowBefore() {
  }
  onShow() {
  }
  onShowEnd() {
  }
  onHide() {
  }
  onHideEnd() {
  }
  #setPosition(maintainAbove = false) {
    if (this.#positionMouseOnly) this.#setMousePositionOnly();
    else if (this.#anchorElement || this.#positionMouse) this.#setAnchorPosition(maintainAbove);
    else this.#setNonAnchorPosition();
  }
  #setAnchorPosition(maintainAbove = false) {
    const overlapPadding = 16;
    const position = this.#position.split(" ");
    const alignTop = position[0] === "top";
    const alignRight = position[1] === "right";
    const { clientWidth, clientHeight, scrollTop } = document.documentElement;
    const width = this.#surfaceElement.offsetWidth;
    const anchorBounds = this.#anchorElement.getBoundingClientRect();
    let height = this.#surfaceElement.querySelector(".surface-content").scrollHeight;
    let translateY = !alignTop ? 0 + this.#offsetBottom : anchorBounds.height;
    let translateX = this.#positionMouse ? this.#mouseX - anchorBounds.left : alignRight ? anchorBounds.width - overlapPadding : 0;
    if (maintainAbove && !this.#surfaceElement.classList.contains("above")) maintainAbove = false;
    if (this.fixed) {
      translateY -= scrollTop;
      translateY += height / 2 + anchorBounds.height / 2;
    }
    if (this.#viewportBound) {
      const verticalStart = anchorBounds.bottom + this.#offsetBottom;
      const overlapBottom = clientHeight - (verticalStart + height + overlapPadding);
      const overlapRight = Math.min(0, clientWidth - (anchorBounds.left + width + translateX + overlapPadding));
      if (overlapBottom < 0 || maintainAbove) {
        const overlapTop = verticalStart - (height + overlapPadding);
        const overLapBottomLessThanHalfHeight = Math.abs(overlapBottom) <= height / 2;
        const enoughRoomToShiftUp = overlapTop + height >= Math.abs(overlapBottom);
        const canShiftUp = this.#overlap === true && overLapBottomLessThanHalfHeight && enoughRoomToShiftUp;
        if (canShiftUp && !maintainAbove) {
          translateY += overlapBottom;
        } else if (overlapTop >= 0 || maintainAbove) {
          translateY -= height;
          if (!this.#overlap) translateY -= anchorBounds.height;
          this.#surfaceElement.classList.add("above");
        } else if (this.#overlap && this.#shrink) {
          const newHeight = Math.min(height, clientHeight - overlapPadding * 2);
          translateY += overlapBottom + (height - newHeight);
          height = newHeight;
        } else {
          if (overlapBottom > overlapTop) {
            if (this.#shrink) height += overlapBottom - anchorBounds.height;
            translateY -= anchorBounds.height - anchorBounds.height;
          } else {
            if (this.#shrink) height += overlapTop - anchorBounds.height;
            translateY -= height + anchorBounds.height;
          }
        }
      }
      if (overlapRight) translateX += overlapRight;
    }
    this.#surfaceElement.classList.toggle("overlap", this.#overlap);
    this.#surfaceElement.style.setProperty("--wfc-surface-height", `${height}px`);
    this.#surfaceElement.style.setProperty("--wfc-surface-width", `${width}px`);
    this.#surfaceElement.style.setProperty("--wfc-surface-translate-x", `${translateX}px`);
    this.#surfaceElement.style.setProperty("--wfc-surface-translate-y", `${translateY}px`);
    this.#surfaceElement.style.setProperty("--wfc-surface-offset-bottom", `${this.#offsetBottom}px`);
    this.#surfaceElement.style.transform = "translate(var(--wfc-surface-translate-x), var(--wfc-surface-translate-y))";
  }
  #setMousePositionOnly() {
    this.#surfaceElement.style.left = `${this.#mouseX}px`;
    this.#surfaceElement.style.top = `${this.#mouseY}px`;
  }
  #setNonAnchorPosition() {
    this.#surfaceElement.style.setProperty("--wfc-surface-height", `${this.#surfaceElement.offsetHeight}px`);
    this.#surfaceElement.style.setProperty("--wfc-surface-width", `${this.#surfaceElement.offsetWidth}px`);
    if (this.animation === "fullscreen") this.#postShowFullscreen();
  }
  #preShowFullscreen() {
    if (!this.#fullscreenPlaceholder) {
      this.#fullscreenPlaceholder = document.createElement("div");
      this.#fullscreenPlaceholder.classList.add("wfc-surface-placeholder");
    }
    this.#preFullscreenBounds = this.getBoundingClientRect();
    this.#postHideFullscreen();
    this.#fullscreenPlaceholder.style.top = `${this.#preFullscreenBounds.top}px`;
    this.#fullscreenPlaceholder.style.left = `${this.#preFullscreenBounds.left}px`;
    this.#fullscreenPlaceholder.style.width = `${this.#preFullscreenBounds.width}px`;
    this.#fullscreenPlaceholder.style.height = `${this.#preFullscreenBounds.height}px`;
    this.insertAdjacentElement("afterend", this.#fullscreenPlaceholder);
  }
  #postShowFullscreen() {
    this.#fullscreenScrollTop = document.documentElement.scrollTop;
    this.style.top = "";
    this.style.left = "";
    this.style.width = "";
    this.style.height = "";
    this.style.height = `${visualViewport.height}px`;
    visualViewport.addEventListener("resize", this.#handleVirtualKeyboardHeight_bound, { signal: this.#abort.signal });
    visualViewport.addEventListener("scroll", this.#handleVirtualKeyboardScroll_bound, { signal: this.#abort.signal });
  }
  #postHideFullscreen() {
    this.style.top = `${this.#preFullscreenBounds.top}px`;
    this.style.left = `${this.#preFullscreenBounds.left}px`;
    this.style.width = `${this.#preFullscreenBounds.width}px`;
    this.style.height = `${this.#preFullscreenBounds.height}px`;
  }
  #preClearFullScreen() {
    visualViewport.removeEventListener("resize", this.#handleVirtualKeyboardHeight_bound);
    visualViewport.removeEventListener("scroll", this.#handleVirtualKeyboardScroll_bound);
    document.documentElement.scrollTop = this.#fullscreenScrollTop;
  }
  #clearFullScreen() {
    this.style.top = "";
    this.style.left = "";
    this.style.width = "";
    this.style.height = "";
  }
  // deal with virtual keyboard because css dvh does not!
  #handleVirtualKeyboardHeight() {
    this.style.height = `${visualViewport.height}px`;
  }
  // undo auto scroll from input being below virtual keyboard. This fixes fullscreen position
  #handleVirtualKeyboardScroll() {
    document.documentElement.scrollTop = 0;
  }
  #setMousePosition(event) {
    this.#mouseX = event.clientX;
    this.#anchorElement = event.target;
  }
  #onClickOutside(event) {
    if (event.target === this) return;
    if (!event.target.classList.contains("scrim") && this.contains(event.target)) return;
    this.close();
  }
  #onEsc(e) {
    if (e.code !== "Escape") return;
    this.close();
    e.preventDefault();
  }
  #onChildrenChange() {
    this.#setPosition(true);
  }
};
customElements.define(WFCSurfaceElement.tag, WFCSurfaceElement);

// ../../webformula/material/src/components/navigation-drawer/navigation-drawer.css
var styles3 = new CSSStyleSheet();
styles3.replaceSync(`:host{min-width:0px;height:100%;width:0px;transition:width;transition-duration:var(--wfc-motion-duration-medium2);transition-timing-function:var(--wfc-motion-easing-standard)}:host(.open:not(.modal)){width:var(--wfc-navigation-drawer-width);transition:width;transition-duration:var(--wfc-motion-duration-medium3);transition-timing-function:var(--wfc-motion-easing-standard-decelerate)}.placeholder{display:flex;flex-shrink:0;width:inherit}.surface{--wfc-surface-translate-x: var(--wfc-navigation-drawer-width);width:var(--wfc-navigation-drawer-width)}:host(.modal) .surface-content{border-radius:var(--wfc-shape-large-end)}:host(.modal) .surface:before{position:absolute;content:"";top:0;left:-40px;right:calc(100% - 1px);bottom:0;background-color:var(--wfc-surface-container-low)}.surface-content{background-color:var(--wfc-surface-container)}.surface-content:before{content:"";position:absolute;inset:0;border-radius:inherit}:host(.modal) .surface-content{animation:box-shadow-animation;animation-duration:var(--wfc-motion-duration-medium2);animation-timing-function:var(--wfc-motion-easing-standard)}:host(.modal.open) .surface-content{box-shadow:var(--wfc-elevation-2);animation:box-shadow-animation;animation-duration:var(--wfc-motion-duration-medium3);animation-timing-function:var(--wfc-motion-easing-standard-decelerate)}.item-padding{padding:12px 28px}slot[name=header]{display:flex;justify-content:space-between;opacity:1;padding-left:0;height:56px}::slotted(.headline),slot[name=header]::slotted(.headline){line-height:56px;height:56px;font-size:var(--wfc-font-small-title-size);font-weight:var(--wfc-font-small-title-weight);letter-spacing:var(--wfc-font-small-title-tracking);color:var(--wfc-on-surface-variant)}@keyframes box-shadow-animation{0%{box-shadow:var(--wfc-elevation-2)}to{box-shadow:var(--wfc-elevation-2)}}
`);
var navigation_drawer_default = styles3;

// ../../webformula/material/src/core/svgs.js
var expand_more_FILL0_wght400_GRAD0_opsz24 = '<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24"><path d="m12 15.375-6-6 1.4-1.4 4.6 4.6 4.6-4.6 1.4 1.4Z"/></svg>';
var arrow_back_ios_FILL1_wght300_GRAD0_opsz24 = '<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24"><path d="M10 21.65.35 12 10 2.35l1.425 1.425L3.175 12l8.25 8.225Z"/></svg>';
var menu_FILL1_wght400_GRAD0_opsz24 = '<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24"><path d="M3 18v-2h18v2Zm0-5v-2h18v2Zm0-5V6h18v2Z"/></svg>';
var menu_open_FILL1_wght400_GRAD0_opsz24 = '<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24"><path d="M3 18v-2h13v2Zm16.6-1-5-5 5-5L21 8.4 17.4 12l3.6 3.6ZM3 13v-2h10v2Zm0-5V6h13v2Z"/></svg>';
var error_FILL1_wght400_GRAD0_opsz24 = '<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24"><path d="M12 17q.425 0 .713-.288Q13 16.425 13 16t-.287-.713Q12.425 15 12 15t-.712.287Q11 15.575 11 16t.288.712Q11.575 17 12 17Zm-1-4h2V7h-2Zm1 9q-2.075 0-3.9-.788-1.825-.787-3.175-2.137-1.35-1.35-2.137-3.175Q2 14.075 2 12t.788-3.9q.787-1.825 2.137-3.175 1.35-1.35 3.175-2.138Q9.925 2 12 2t3.9.787q1.825.788 3.175 2.138 1.35 1.35 2.137 3.175Q22 9.925 22 12t-.788 3.9q-.787 1.825-2.137 3.175-1.35 1.35-3.175 2.137Q14.075 22 12 22Z"/></svg>';

// ../../webformula/material/src/components/navigation-drawer/navigation-drawer.js
var WFCNavigationDrawerElement = class extends WFCSurfaceElement {
  static tag = "wfc-navigation-drawer";
  static styleSheets = navigation_drawer_default;
  #locationchange_bound = this.#locationchange.bind(this);
  #windowStateChange_bound = this.#windowStateChange.bind(this);
  constructor() {
    super();
    this.role = "navigation";
    this.fixed = true;
    this.alwaysVisible = true;
    this.allowClose = false;
    this.viewportBound = false;
    this.animation = "translate-left";
    this.initialOpen = true;
    this.swipeClose = true;
    document.body.classList.add("has-navigation-drawer");
    document.body.classList.add("navigation-drawer-state-show");
    this.#locationchange();
    this.#windowStateChange({ detail: device_default });
  }
  template() {
    return (
      /*html*/
      `
      <div class="scrim"></div>
      <div class="placeholder"></div>
      <div class="surface">
        <div class="surface-content">
          <div class="item-padding">
            <slot name="header"></slot>
            <slot class="default-slot"></slot>
          </div>
        </div>
        <wfc-icon class="predictive-back-icon hide">${arrow_back_ios_FILL1_wght300_GRAD0_opsz24}</wfc-icon>
      </div>
    `
    );
  }
  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("locationchange", this.#locationchange_bound);
    window.addEventListener("wfcwindowstate", this.#windowStateChange_bound);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("locationchange", this.#locationchange_bound);
    window.removeEventListener("wfcwindowstate", this.#windowStateChange_bound);
  }
  onShow() {
    document.body.classList.remove("navigation-drawer-state-hide");
    document.body.classList.add("navigation-drawer-state-show");
  }
  onHide() {
    document.body.classList.add("navigation-drawer-state-hide");
    document.body.classList.remove("navigation-drawer-state-show");
  }
  #locationchange() {
    const path2 = `${location.pathname}${location.hash}${location.search}`;
    const current = this.querySelector(".current");
    if (current) {
      current.classList.remove("current");
      if (current.parentElement.nodeName === "WFC-ANCHOR-GROUP") {
        current.parentElement.open = false;
        current.parentElement.classList.remove("has-current");
      }
    }
    const match = this.querySelector(`[href="${path2}"]`) || this.querySelector(`[href="${path2.split("#")[0]}"]`);
    if (match) {
      match.classList.add("current");
      if (match.parentElement.nodeName === "WFC-ANCHOR-GROUP") {
        match.parentElement.open = true;
        match.parentElement.classList.add("has-current");
      }
      if (device_default.animationReady) {
        match.classList.add("animate");
        requestAnimationFrame(() => {
          match.classList.remove("animate");
        });
      }
    }
    if (this.open && device_default.state !== "expanded") this.close();
  }
  #windowStateChange({ detail }) {
    const isExpanded = detail.state === "expanded";
    this.open = isExpanded;
    this.classList.toggle("modal", !isExpanded);
    this.scrim = !isExpanded;
    this.allowClose = !isExpanded;
    this.alwaysVisible = isExpanded;
    if (!detail.lastState) this.#initialScrollTo();
  }
  #initialScrollTo() {
    requestAnimationFrame(() => {
      const current = this.querySelector(".current");
      if (!current) return;
      const surface = this.shadowRoot.querySelector(".surface");
      const height = device_default.windowHeight;
      let top = current.offsetTop + 56;
      if (current.parentElement.nodeName === "WFC-ANCHOR-GROUP") top += current.parentElement.offsetTop;
      if (top > height) {
        surface.querySelector(".surface-content").scrollTop = height / 2 + (top - height);
      }
    });
  }
};
customElements.define(WFCNavigationDrawerElement.tag, WFCNavigationDrawerElement);

// ../../webformula/material/src/components/icon-button/component.css
var styles4 = new CSSStyleSheet();
styles4.replaceSync(`:host{position:relative;display:inline-flex;flex-shrink:0;outline:none;-webkit-tap-highlight-color:transparent;height:40px;width:40px;justify-content:center;border-radius:var(--wfc-shape-full);color:var(--wfc-on-surface-variant)}:host(.selected){color:var(--wfc-primary)}:host([disabled]){pointer-events:none}button{place-items:center;background:none;border:none;box-sizing:border-box;cursor:pointer;display:flex;place-content:center;outline:none;padding:0;position:relative;text-decoration:none;user-select:none;-webkit-user-select:none;z-index:0;flex:1;border-radius:inherit;color:inherit}:host([filled]){color:var(--wfc-on-primary);background-color:var(--wfc-primary)}:host([filled][toggle]){color:var(--wfc-primary);background-color:var(--wfc-surface-container-highest)}:host([filled][toggle].selected){color:var(--wfc-on-primary);background-color:var(--wfc-primary)}:host([filled-tonal]){color:var(--wfc-on-secondary-container);background-color:var(--wfc-secondary-container)}:host([filled-tonal][toggle]){color:var(--wfc-on-surface-variant);background-color:var(--wfc-surface-container-highest)}:host([filled-tonal][toggle].selected){color:var(--wfc-on-secondary-container);background-color:var(--wfc-secondary-container)}:host([outlined]){border:1px solid var(--wfc-outline)}:host(.selected:not(.selected-icon)) ::slotted(wfc-icon){font-variation-settings:"FILL" 1,"wght" 400,"GRAD" 0,"opsz" 48!important}:host(.selected[filled]:not(.selected-icon)) ::slotted(wfc-icon),:host(.selected[filled-tonal]:not(.selected-icon)) ::slotted(wfc-icon){font-variation-settings:"FILL" 0,"wght" 400,"GRAD" 0,"opsz" 48!important}:host(.selected.selected-icon) slot.default-slot::slotted(wfc-icon),:host(.selected-icon) slot[name=selected]::slotted(wfc-icon){display:none}:host(.selected.selected-icon) slot[name=selected]::slotted(wfc-icon){display:block}wfc-state-layer{--wfc-state-layer-hover-color: var(--wfc-on-surface-variant);--wfc-state-layer-focus-color: var(--wfc-on-surface-variant);--wfc-state-layer-ripple-color: var(--wfc-on-surface-variant)}:host(.selected) wfc-state-layer{--wfc-state-layer-hover-color: var(--wfc-primary);--wfc-state-layer-focus-color: var(--wfc-primary);--wfc-state-layer-ripple-color: var(--wfc-primary)}:host([filled-tonal]) wfc-state-layer{--wfc-state-layer-hover-color: var(--wfc-on-secondary-container);--wfc-state-layer-focus-color: var(--wfc-on-secondary-container);--wfc-state-layer-ripple-color: var(--wfc-on-secondary-container)}:host([filled-tonal][toggle]) wfc-state-layer{--wfc-state-layer-hover-color: var(--wfc-on-surface-variant);--wfc-state-layer-focus-color: var(--wfc-on-surface-variant);--wfc-state-layer-ripple-color: var(--wfc-on-surface-variant)}:host([filled-tonal][toggle].selected) wfc-state-layer{--wfc-state-layer-hover-color: var(--wfc-on-secondary-container);--wfc-state-layer-focus-color: var(--wfc-on-secondary-container);--wfc-state-layer-ripple-color: var(--wfc-on-secondary-container)}:host([filled]) wfc-state-layer{--wfc-state-layer-hover-color: var(--wfc-on-primary);--wfc-state-layer-focus-color: var(--wfc-on-primary);--wfc-state-layer-ripple-color: var(--wfc-on-primary)}:host([filled][toggle]) wfc-state-layer{--wfc-state-layer-hover-color: var(--wfc-primary);--wfc-state-layer-focus-color: var(--wfc-primary);--wfc-state-layer-ripple-color: var(--wfc-primary)}:host([filled][toggle].selected) wfc-state-layer{--wfc-state-layer-hover-color: var(--wfc-on-primary);--wfc-state-layer-focus-color: var(--wfc-on-primary);--wfc-state-layer-ripple-color: var(--wfc-on-primary)}
`);
var component_default2 = styles4;

// ../../webformula/material/src/components/icon-button/component.js
var targetValues = ["_blank", "_parent", "_self", "_top"];
var WFCIconButtonElement = class extends HTMLComponentElement {
  static tag = "wfc-icon-button";
  static useShadowRoot = true;
  static useTemplate = true;
  static shadowRootDelegateFocus = true;
  static styleSheets = component_default2;
  #abort;
  #target;
  #href;
  #ariaLabel;
  #toggle = false;
  #checked = false;
  #onClick_bound = this.#onClick.bind(this);
  #slotChange_bound = this.#slotChange.bind(this);
  constructor() {
    super();
    this.role = "button";
    this.render();
  }
  static get observedAttributesExtended() {
    return [
      ["aria-label", "string"],
      ["href", "string"],
      ["target", "string"],
      ["toggle", "boolean"],
      ["checked", "boolean"]
    ];
  }
  attributeChangedCallbackExtended(name, _oldValue, newValue) {
    this[name] = newValue;
  }
  template() {
    return (
      /*html*/
      `
      <button>
        <slot class="default-slot"></slot>
        <slot name="selected"></slot>
      </button>
      <div class="spinner"></div>
      <wfc-state-layer ripple></wfc-state-layer>
    `
    );
  }
  connectedCallback() {
    this.#abort = new AbortController();
    this.shadowRoot.addEventListener("slotchange", this.#slotChange_bound, { signal: this.#abort.signal });
    if (this.toggle) this.addEventListener("click", this.#onClick_bound, { signal: this.#abort.signal });
  }
  disconnectedCallback() {
    if (this.#abort) this.#abort.abort();
  }
  get disabled() {
    return this.hasAttribute("disabled");
  }
  set disabled(value) {
    this.toggleAttribute("disabled", !!value);
  }
  get href() {
    return this.#href;
  }
  set href(value) {
    this.#href = value;
    if (!value) {
      this.removeAttribute("href");
    } else {
      this.setAttribute("href", value);
    }
  }
  get target() {
    return this.#target;
  }
  set target(value) {
    if (value && !targetValues.includes(value)) throw Error(`Invalid target value. Valid values ${targetValues.join(", ")}`);
    this.#target = value;
  }
  get toggle() {
    return this.#toggle;
  }
  set toggle(value) {
    this.#toggle = !!value;
  }
  get checked() {
    return this.#checked;
  }
  set checked(value) {
    this.#checked = !!value;
    this.classList.toggle("selected", this.#checked);
  }
  get ariaLabel() {
    return this.#ariaLabel;
  }
  set ariaLabel(value) {
    this.#ariaLabel = value;
    if (!value) this.shadowRoot.querySelector("button").removeAttribute("aria-label");
    else this.shadowRoot.querySelector("button").setAttribute("aria-label", value);
  }
  #onClick() {
    this.checked = !this.checked;
    this.dispatchEvent(new Event("change", { bubbles: true }));
  }
  #slotChange(event) {
    if (event.target.name === "selected") {
      this.classList.toggle("selected-icon", event.target.assignedElements().length > 0);
    }
  }
};
customElements.define(WFCIconButtonElement.tag, WFCIconButtonElement);

// ../../webformula/material/src/components/navigation-drawer/navigation-button.js
var WFCNavigationButtonElement = class extends WFCIconButtonElement {
  static tag = "wfc-navigation-button";
  #onclick_bound = this.#onclick.bind(this);
  #onNavigationState_bound = this.#onNavigationState.bind(this);
  constructor() {
    super();
    this.shadowRoot.querySelector("button").ariaLabel = "Navigation toggle";
  }
  get navigation() {
    return document.body.querySelector("wfc-navigation-drawer");
  }
  get open() {
    return document.body.querySelector("wfc-navigation-drawer").open;
  }
  set open(value) {
    document.body.querySelector("wfc-navigation-drawer").open = !!value;
  }
  connectedCallback() {
    super.connectedCallback();
    this.insertAdjacentHTML("afterbegin", `
      <wfc-icon>${menu_FILL1_wght400_GRAD0_opsz24}</wfc-icon>
      <wfc-icon slot="selected">${menu_open_FILL1_wght400_GRAD0_opsz24}</wfc-icon>
    `);
    this.addEventListener("click", this.#onclick_bound);
    this.navigation?.addEventListener("change", this.#onNavigationState_bound);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("click", this.#onclick_bound);
    this.navigation?.removeEventListener("change", this.#onNavigationState_bound);
  }
  toggle() {
    document.body.querySelector("wfc-navigation-drawer").toggle();
  }
  #onclick() {
    this.toggle();
  }
  #onNavigationState() {
    this.checked = !this.navigation?.open;
  }
};
customElements.define(WFCNavigationButtonElement.tag, WFCNavigationButtonElement);

// ../../webformula/material/src/components/navigation-bar/component.css
var styles5 = new CSSStyleSheet();
styles5.replaceSync(`:host{position:fixed;bottom:0;left:0;right:0;display:flex;flex-direction:row;padding:12px 16px 16px 4px;box-sizing:border-box;width:100%;height:80px;align-items:center;z-index:9;gap:8px;background-color:var(--wfc-surface-container);box-shadow:var(--wfc-elevation-2);margin-bottom:0;transition:margin-bottom;transition-duration:var(--wfc-motion-duration-short3);transition-timing-function:var(---wfc-motion-easing-standard)}:host(.hide){margin-bottom:-80px}::slotted(wfc-navigation-button){margin-left:12px}
`);
var component_default3 = styles5;

// ../../webformula/material/src/components/navigation-bar/index.js
var WFCNavigationBarElement = class extends HTMLComponentElement {
  static tag = "wfc-navigation-bar";
  static useShadowRoot = true;
  static useTemplate = true;
  static styleSheets = component_default3;
  #autoHide = false;
  #scrollDirectionChange_bound = this.#scrollDirectionChange.bind(this);
  #locationchange_bound = this.#locationchange.bind(this);
  constructor() {
    super();
    this.role = "navigation";
    this.render();
    this.#autoHide = this.classList.contains("auto-hide");
    document.body.classList.add("has-navigation-bar");
    if (this.#autoHide) document.body.classList.add("navigation-bar-auto-hide");
    this.#locationchange();
  }
  template() {
    return (
      /*html*/
      `
        <slot></slot>
    `
    );
  }
  connectedCallback() {
    window.addEventListener("locationchange", this.#locationchange_bound);
    if (this.#autoHide) util_default.trackScrollDirectionChange(this.#scrollDirectionChange_bound);
  }
  disconnectedCallback() {
    window.removeEventListener("locationchange", this.#locationchange_bound);
    if (this.#autoHide) util_default.untrackScrollDirectionChange(this.#scrollDirectionChange_bound);
  }
  #scrollDirectionChange(direction) {
    this.classList.toggle("hide", direction === -1);
    document.body.classList.toggle("navigation-bar-hide", direction === -1);
  }
  #locationchange() {
    const path2 = `${location.pathname}${location.hash}${location.search}`;
    const current = this.querySelector(".current");
    if (current) current.classList.remove("current");
    const match = this.querySelector(`[href="${path2}"]`);
    if (match) {
      match.classList.add("current");
      if (device_default.animationReady) {
        match.classList.add("animate");
        requestAnimationFrame(() => {
          match.classList.remove("animate");
        });
      }
    }
  }
};
customElements.define(WFCNavigationBarElement.tag, WFCNavigationBarElement);

// ../../webformula/material/src/components/anchor/anchor.css
var styles6 = new CSSStyleSheet();
styles6.replaceSync(`:host{position:relative;display:inline-flex;align-items:center;user-select:none;-webkit-user-select:none;border:none;cursor:pointer;white-space:nowrap;outline:none;-webkit-tap-highlight-color:transparent;height:56px;line-height:56px;padding-right:8px;margin-bottom:2px;font-size:var(--wfc-font-large-label-size);font-weight:var(--wfc-font-large-label-weight);letter-spacing:var(--wfc-font-large-label-tracking);border-radius:var(--wfc-shape-extra-large);color:var(--wfc-on-surface-variant);text-decoration:none}:host:before{content:"";position:absolute;left:-16px;top:0;right:-16px;height:56px;z-index:0;border-radius:var(--wfc-shape-extra-large)}:host(.current):before{pointer-events:none;background-color:var(--wfc-secondary-container)}a{display:flex;flex:1;align-items:center;font-size:inherit;font-weight:inherit;letter-spacing:inherit;border-radius:inherit;line-height:inherit;height:inherit;color:inherit;text-decoration:inherit;border:none;outline:none;z-index:0;-webkit-tap-highlight-color:transparent}.default-slot{display:block;flex:1;font-size:inherit;font-weight:inherit;letter-spacing:inherit;border-radius:inherit;line-height:inherit;height:inherit;color:inherit}:host(:-webkit-any-link:active){color:unset}:host:after{content:"";position:absolute;left:-16px;top:0;right:-16px;height:56px;pointer-events:none;border-radius:var(--wfc-shape-extra-large)}:host(.animate):after,:host(.animate):before{left:40%;right:40%;transition-duration:0s}:host:after,:host:before{transition:left,right;transition-duration:var(--wfc-motion-duration-medium1);transition-timing-function:var(--wfc-motion-easing-standard)}:host(:focus):after{opacity:var(--wfc-state-layer-opacity-focus);background-color:var(--wfc-on-surface)}:host(.current:focus):after{background-color:var(--wfc-on-secondary-container)}slot[name=leading-icon]::slotted(wfc-icon){pointer-events:none;margin-right:12px}::slotted(wfc-icon){z-index:1;color:var(--wfc-on-surface-variant)}:host(.current) ::slotted(wfc-icon){color:var(--wfc-on-secondary-container)}:host(:not(.current):focus) ::slotted(wfc-icon){color:var(--wfc-on-surface)}.badge-display{z-index:0;color:var(--wfc-on-surface-variant);font-size:var(--wfc-font-large-label-size);font-size:var(--wfc-font-large-label-weight);letter-spacing:var(--wfc-font-large-label-tracking)}@media (hover: hover){:host(:hover):after{opacity:var(--wfc-state-layer-opacity-hover);background-color:var(--wfc-on-surface)}:host(.current:hover):after{background-color:var(--wfc-on-secondary-container)}:host(:not(.current):hover) ::slotted(wfc-icon){color:var(--wfc-on-surface)}}.arrow{position:absolute;display:none;align-items:center;top:0;bottom:0;right:16px;transition:transform 0ms;transition-duration:var(--wfc-motion-duration-short3)}:host([control]) .arrow{display:flex}:host(.open) .arrow{transform:rotate(180deg)}
`);
var anchor_default = styles6;

// ../../webformula/material/src/components/anchor/anchor.js
var targetValues2 = ["_blank", "_parent", "_self", "_top"];
var WFCAnchorElement = class extends HTMLComponentElement {
  static tag = "wfc-anchor";
  static useShadowRoot = true;
  static useTemplate = true;
  static shadowRootDelegateFocus = true;
  static styleSheets = anchor_default;
  #link;
  #ariaLabelOriginal;
  #badge;
  #target;
  #blur_bound = this.#blur.bind(this);
  #focusKeydown_bound = this.#focusKeydown.bind(this);
  #focus_bound = this.#focus.bind(this);
  #slotChange_bound = this.#slotChange.bind(this);
  constructor() {
    super();
    this.role = "link";
    this.render();
    this.#link = this.shadowRoot.querySelector("a");
    this.#link.href = this.getAttribute("href");
  }
  static get observedAttributesExtended() {
    return [
      ["href", "string"],
      ["badge", "number"],
      ["target", "string"]
    ];
  }
  attributeChangedCallbackExtended(name, _oldValue, newValue) {
    this[name] = newValue;
  }
  template() {
    return (
      /*html*/
      `
      <a part="a">
        <slot name="leading-icon"></slot>
        <slot class="default-slot"></slot>
        <span class="badge-display"></span>
      </a>
      <span class="arrow">${expand_more_FILL0_wght400_GRAD0_opsz24}</span>
    `
    );
  }
  connectedCallback() {
    this.addEventListener("focusin", this.#focus_bound);
    this.shadowRoot.addEventListener("slotchange", this.#slotChange_bound);
  }
  disconnectedCallback() {
    this.removeEventListener("focusin", this.#focus_bound);
    this.removeEventListener("blur", this.#blur_bound);
    this.removeEventListener("keydown", this.#focusKeydown_bound);
    this.shadowRoot.removeEventListener("slotchange", this.#slotChange_bound);
  }
  get href() {
    return this.#link.href;
  }
  set href(value) {
    if (!value) {
      this.removeAttribute("href");
      this.#link.removeAttribute("href");
    } else {
      this.setAttribute("href", value);
      this.#link.setAttribute("href", value);
    }
  }
  get badge() {
    return this.#badge;
  }
  set badge(value) {
    if (value === 0) value = "";
    if (value > 999) value = "999+";
    this.#badge = value;
    this.shadowRoot.querySelector(".badge-display").innerText = value;
    if (!this.#ariaLabelOriginal) this.#ariaLabelOriginal = this.ariaLabel || util_default.getTextFromNode(this);
    if (!value) this.ariaLabel = this.#ariaLabelOriginal;
    else this.ariaLabel = `[${this.#ariaLabelOriginal}] ${value} New ${value === 1 ? "notification" : "notifications"}`;
  }
  get target() {
    return this.#target;
  }
  set target(value) {
    if (value && !targetValues2.includes(value)) throw Error(`Invalid target value. Valid values ${targetValues2.join(", ")}`);
    this.#target = value;
    this.#link.setAttribute("target", value);
  }
  #focus() {
    this.addEventListener("blur", this.#blur_bound);
    this.addEventListener("keydown", this.#focusKeydown_bound);
  }
  #blur() {
    this.removeEventListener("blur", this.#blur_bound);
    this.removeEventListener("keydown", this.#focusKeydown_bound);
  }
  #focusKeydown(e) {
    if (e.code === "Tab") {
      const pageContent = document.querySelector("#page-content") || document.querySelector("page-content");
      const firstFocusablePageContent = util_default.getFocusableElements(pageContent)[0];
      if (firstFocusablePageContent) firstFocusablePageContent.focus();
      e.preventDefault();
    }
    if (e.code === "Enter" || e.code === "Space") {
      this.click();
      this.blur();
      e.preventDefault();
    } else if (e.code === "ArrowDown") {
      this.#focusNext(e.target);
      e.preventDefault();
    } else if (e.code === "ArrowUp") {
      this.#focusPrevious(e.target);
      e.preventDefault();
    }
  }
  #focusNext(focusedElement) {
    const anchors = this.#anchorElements();
    const focusedIndex = anchors.findIndex((a) => a === focusedElement);
    let item = anchors[focusedIndex + 1];
    if (item && item.hasAttribute("control")) {
      item.parentElement.open = true;
      item = anchors[focusedIndex + 2];
    }
    if (item) item.focus();
  }
  #focusPrevious(focusedElement) {
    const anchors = this.#anchorElements();
    const focusedIndex = anchors.findIndex((a) => a === focusedElement);
    if (focusedIndex <= 0) return;
    let item = anchors[focusedIndex - 1];
    if (item && item.hasAttribute("control")) {
      item.parentElement.open = false;
      item = anchors[focusedIndex - 2];
    }
    if (item) item.focus();
  }
  #anchorElements() {
    let nav = this.parentElement;
    if (nav.nodeName === "WFC-ANCHOR-GROUP") nav = this.parentElement.parentElement;
    return [...nav.querySelectorAll("wfc-anchor")];
  }
  #slotChange(event) {
    if (event.target.classList.contains("default-slot") && ![...event.target.assignedNodes()].map((n) => n.data.trim()).join("")) {
      this.classList.add("no-text");
    }
  }
};
customElements.define(WFCAnchorElement.tag, WFCAnchorElement);

// ../../webformula/material/src/components/anchor/anchor-group.js
var WFCAnchorGroupElement = class extends HTMLComponentElement {
  static tag = "wfc-anchor-group";
  static useShadowRoot = false;
  #control;
  #open = false;
  #controlClick_bound = this.#controlClick.bind(this);
  constructor() {
    super();
  }
  connectedCallback() {
    this.#control = this.querySelector("wfc-anchor[control]");
    this.#control.addEventListener("click", this.#controlClick_bound);
    if (this.querySelector("wfc-anchor.current")) {
      this.classList.add("has-current");
      this.open = true;
    }
  }
  disconnectedCallback() {
    this.#control.removeEventListener("click", this.#controlClick_bound);
  }
  get open() {
    return this.#open;
  }
  set open(value) {
    if (this.#open === !!value) return;
    this.#open = !!value;
    if (this.#open) {
      this.#control.classList.add("open");
      if (!this.parentElement.classList.contains("wfc-state-rail")) this.style.setProperty("--wfc-navigation-drawer-group-height", `${this.#fullHeight}px`);
    } else {
      this.style.setProperty("--wfc-navigation-drawer-group-height", "56px");
      this.#control.classList.remove("open");
    }
  }
  get #fullHeight() {
    return [...this.querySelectorAll("wfc-anchor")].length * 58;
  }
  #controlClick(event) {
    this.open = !this.open;
    event.preventDefault();
    event.stopPropagation();
  }
};
customElements.define(WFCAnchorGroupElement.tag, WFCAnchorGroupElement);

// ../../webformula/material/src/components/state-layer/component.css
var styles7 = new CSSStyleSheet();
styles7.replaceSync(`:host{--wfc-state-layer-focus-color: var(--wfc-on-surface);--wfc-state-layer-hover-color: var(--wfc-on-surface);--wfc-state-layer-focus-indicator-color: var(--wfc-secondary);--wfc-state-layer-focus-indicator-thickness: 3px;--wfc-state-layer-focus-indicator-offset: 2px;--wfc-state-layer-box-shadow: none;--wfc-state-layer-focus-box-shadow: none;--wfc-state-layer-hover-box-shadow: none;--wfc-state-layer-ripple-color: var(--wfc-primary);display:block;position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-sizing:border-box;outline:none;box-shadow:var(--wfc-state-layer-box-shadow);transition:box-shadow;transition-duration:var(--wfc-motion-duration-short2);transition-timing-function:var(--wfc-motion-easing-emphasized)}.background{position:absolute;inset:0;border-radius:inherit;opacity:0;transition:outline-width,box-shadow;transition-duration:var(--wfc-motion-duration-short2);transition-timing-function:var(--wfc-motion-easing-emphasized)}:host(.focus) .background{opacity:var(--wfc-state-layer-opacity-focus);background-color:var(--wfc-state-layer-focus-color)}:host(.hover) .background{opacity:var(--wfc-state-layer-opacity-hover);background-color:var(--wfc-state-layer-hover-color)}:host(.focus){box-shadow:var(--wfc-state-layer-focus-box-shadow);outline:var(--wfc-state-layer-focus-indicator-thickness) solid var(--wfc-state-layer-focus-indicator-color);outline-offset:var(--wfc-state-layer-focus-indicator-offset)}:host(.hover){box-shadow:var(--wfc-state-layer-hover-box-shadow)}.ripple{overflow:hidden;border-radius:inherit;position:absolute;inset:0;pointer-events:none;.ripple-element{background-color:var(--wfc-state-layer-ripple-color)}}:host([outer-circle]) .ripple,:host([outer-circle]) .background{border-radius:50%;margin:-9px}
`);
var component_default4 = styles7;

// ../../webformula/material/src/core/Ripple.js
var Ripple = class {
  #rippleFaceInDuration = 280;
  #rippleFadeOutDuration = 150;
  #states = {
    FADING_IN: "FADING_IN",
    VISIBLE: "VISIBLE",
    FADING_OUT: "FADING_OUT",
    HIDDEN: "HIDDEN"
  };
  #element;
  #triggerElement;
  #ignoreElements = [];
  #centered = false;
  #color;
  #persistent = false;
  #radius;
  #speedFactor = 1;
  #activeRipples = /* @__PURE__ */ new Set();
  #isMousedown = false;
  #mouseDown_bound = this.#mouseDown.bind(this);
  #fadeOutAllRipples_bound = this.#fadeOutAllRipples.bind(this);
  #mouseLeave_bound = this.#mouseLeave.bind(this);
  constructor(params = {
    element,
    triggerElement,
    ignoreElements: [],
    centered: false,
    color: null,
    persistent: false,
    radius,
    speedFactor: 1
  }) {
    if (!params.element) throw Error("requires params.element");
    if (!params.triggerElement) throw Error("requires params.triggerElement");
    this.#element = params.element;
    this.#triggerElement = [].concat(params.triggerElement);
    this.#ignoreElements = [].concat(params.ignoreElements).filter((v) => !!v);
    this.#centered = params.centered !== void 0 ? params.centered : this.#centered;
    this.#color = params.color;
    this.#persistent = params.persistent !== void 0 ? params.persistent : this.#persistent;
    this.#radius = params.radius;
    this.#speedFactor = params.speedFactor !== void 0 ? params.speedFactor : this.#speedFactor;
    this.#triggerElement.forEach((element2) => {
      element2.addEventListener("pointerdown", this.#mouseDown_bound);
    });
  }
  destroy() {
    this.#triggerElement.forEach((element2) => {
      element2.removeEventListener("pointerdown", this.#mouseDown_bound);
      element2.removeEventListener("pointerup", this.#fadeOutAllRipples_bound);
      element2.removeEventListener("mouseleave", this.#mouseLeave_bound);
    });
  }
  addIgnoreElement(element2) {
    this.#ignoreElements.push(element2);
  }
  trigger() {
    const originalCenter = this.#centered;
    this.#centered = true;
    this.#fadeInRipple();
    this.#centered = originalCenter;
  }
  #mouseDown(event) {
    if (this.#ignoreElements.find((v) => v.contains(event.target))) return;
    this.#isMousedown = true;
    this.#triggerElement.forEach((element2) => {
      element2.addEventListener("pointerup", this.#fadeOutAllRipples_bound);
      element2.addEventListener("mouseleave", this.#mouseLeave_bound);
    });
    this.#fadeInRipple(event.pageX, event.pageY);
  }
  #mouseLeave() {
    if (this.#isMousedown) this.#fadeOutAllRipples();
  }
  #fadeOutAllRipples() {
    this.#isMousedown = false;
    this.#activeRipples.forEach((ripple) => {
      if (!ripple.persistent && ripple.state === this.#states.VISIBLE) ripple.fadeOut();
    });
    this.#triggerElement.forEach((element2) => {
      element2.removeEventListener("pointerup", this.#fadeOutAllRipples_bound);
      element2.removeEventListener("mouseleave", this.#mouseLeave_bound);
    });
  }
  #fadeInRipple(pageX, pageY) {
    const containerRect = this.#element.getBoundingClientRect();
    if (this.#centered) {
      pageX = containerRect.left + containerRect.width / 2;
      pageY = containerRect.top + containerRect.height / 2;
    } else {
      const scrollPosition = this.#getViewportScrollPosition();
      pageX -= scrollPosition.left;
      pageY -= scrollPosition.top;
    }
    const duration = this.#rippleFaceInDuration * (1 / this.#speedFactor);
    const offsetX = pageX - containerRect.left;
    const offsetY = pageY - containerRect.top;
    const radius2 = this.#radius || this.#distanceToFurthestCorner(pageX, pageY, containerRect);
    const ripple = this.#createRippleElement(offsetX, offsetY, radius2, duration);
    this.#element.appendChild(ripple);
    const reference = {
      element: ripple,
      persistent: this.#persistent,
      state: this.#states.FADING_IN,
      fadeOut: () => this.#fadeOutRipple(reference)
    };
    this.#activeRipples.add(reference);
    setTimeout(() => {
      ripple.style.transform = "scale(1)";
      setTimeout(() => {
        reference.state = this.#states.VISIBLE;
        if (!this.#persistent && !this.#isMousedown) reference.fadeOut();
      }, duration);
    }, 1);
  }
  #fadeOutRipple(reference) {
    if (!this.#activeRipples.delete(reference)) return;
    const ripple = reference.element;
    ripple.style.transitionDuration = `${this.#rippleFadeOutDuration}ms`;
    ripple.style.opacity = "0";
    reference.state = this.#states.FADING_OUT;
    setTimeout(() => {
      reference.state = this.#states.HIDDEN;
      ripple.remove();
    }, this.#rippleFadeOutDuration);
  }
  #getViewportScrollPosition() {
    const documentRect = document.documentElement.getBoundingClientRect();
    const top = -documentRect.top || document.body.scrollTop || window.scrollY || document.documentElement.scrollTop || 0;
    const left = -documentRect.left || document.body.scrollLeft || window.scrollX || document.documentElement.scrollLeft || 0;
    return { top, left };
  }
  #distanceToFurthestCorner(x, y, rect) {
    const distX = Math.max(Math.abs(x - rect.left), Math.abs(x - rect.right));
    const distY = Math.max(Math.abs(y - rect.top), Math.abs(y - rect.bottom));
    return Math.sqrt(distX * distX + distY * distY);
  }
  #createRippleElement(offsetX, offsetY, radius2, duration) {
    const ripple = document.createElement("div");
    ripple.classList.add("ripple-element");
    ripple.style.opacity = "0.16";
    ripple.style.left = `${offsetX - radius2}px`;
    ripple.style.top = `${offsetY - radius2}px`;
    ripple.style.height = `${radius2 * 2}px`;
    ripple.style.width = `${radius2 * 2}px`;
    ripple.style.position = "absolute";
    ripple.style.pointerEvents = "none";
    ripple.style.borderRadius = "50%";
    ripple.style.transition = "opacity, transform 0ms cubic-bezier(0, 0, 0.2, 1)";
    ripple.style.transform = "scale(0)";
    ripple.style.backgroundColor = this.#color;
    ripple.style.transitionDuration = `${duration}ms`;
    return ripple;
  }
};

// ../../webformula/material/src/components/state-layer/index.js
var WFCStateLayer = class extends HTMLComponentElement {
  static tag = "wfc-state-layer";
  static useShadowRoot = true;
  static useTemplate = true;
  static styleSheets = component_default4;
  #for;
  #forElement;
  #enabled = true;
  #ripple;
  #rippleEnabled;
  #preventFocus = false;
  #onFocus_bound = this.#onFocus.bind(this);
  #onBlur_bound = this.#onBlur.bind(this);
  #mouseEnter_bound = this.#mouseEnter.bind(this);
  #mouseLeave_bound = this.#mouseLeave.bind(this);
  #pointerDown_bound = this.#pointerDown.bind(this);
  #rippleEnterKey_bound = this.#rippleEnterKey.bind(this);
  constructor() {
    super();
    this.render();
    const rootNode = this.getRootNode();
    this.#forElement = rootNode instanceof ShadowRoot ? rootNode.host : rootNode;
  }
  static get observedAttributesExtended() {
    return [
      ["for", "string"],
      ["enabled", "boolean"],
      ["ripple", "boolean"]
    ];
  }
  attributeChangedCallbackExtended(name, _oldValue, newValue) {
    this[name] = newValue;
  }
  get for() {
    return this.#for;
  }
  set for(value) {
    this.#forElement = this.getRootNode().querySelector(value);
    this.#for = value;
  }
  get ripple() {
    return this.#rippleEnabled;
  }
  set ripple(value) {
    this.#rippleEnabled = !!value;
    if (!this.isConnected) return;
    if (this.#rippleEnabled && !this.#ripple) {
      this.#ripple = new Ripple({
        element: this.shadowRoot.querySelector(".ripple"),
        triggerElement: this.#forElement,
        centered: this.hasAttribute("ripple-centered")
      });
    } else if (!this.#rippleEnabled && this.#ripple) {
      this.#ripple.destroy();
      this.#ripple = void 0;
    }
  }
  get enabled() {
    return this.#enabled;
  }
  set enabled(value) {
    this.#enabled = !!value;
    if (!this.isConnected) return;
    if (this.#enabled) {
      this.#forElement.addEventListener("focusin", this.#onFocus_bound);
      if (!device_default.hasTouchScreen) this.#forElement.addEventListener("mouseenter", this.#mouseEnter_bound);
      this.#forElement.addEventListener("pointerdown", this.#pointerDown_bound);
    } else if (!this.#enabled) {
      this.disconnectedCallback();
    }
  }
  template() {
    return '<div class="background"></div><div class="ripple"></div>';
  }
  connectedCallback() {
    if (this.#enabled) {
      this.#forElement.addEventListener("focusin", this.#onFocus_bound);
      if (!device_default.hasTouchScreen) this.#forElement.addEventListener("mouseenter", this.#mouseEnter_bound);
      this.#forElement.addEventListener("pointerdown", this.#pointerDown_bound);
      if (this.classList.contains("hover")) {
        this.#forElement.addEventListener("mouseleave", this.#mouseLeave_bound);
      }
    }
    if (this.#rippleEnabled && !this.#ripple) {
      this.#ripple = new Ripple({
        element: this.shadowRoot.querySelector(".ripple"),
        triggerElement: this.#forElement,
        centered: this.hasAttribute("ripple-centered")
      });
      this.#forElement.addEventListener("keydown", this.#rippleEnterKey_bound);
    }
    this.#forElement.hideFocus = () => {
      this.#forElement.removeEventListener("focusout", this.#onBlur_bound);
      this.classList.remove("focus");
    };
  }
  disconnectedCallback() {
    this.#forElement.removeEventListener("focusin", this.#onFocus_bound);
    this.#forElement.removeEventListener("focusout", this.#onBlur_bound);
    this.#forElement.removeEventListener("mouseenter", this.#mouseEnter_bound);
    this.#forElement.removeEventListener("mouseleave", this.#mouseLeave_bound);
    this.#forElement.removeEventListener("pointerdown", this.#pointerDown_bound);
    this.#forElement.removeEventListener("keydown", this.#rippleEnterKey_bound);
    if (this.#ripple) this.#ripple.destroy();
  }
  #onFocus() {
    if (this.#preventFocus) {
      this.#preventFocus = false;
      return;
    }
    this.#forElement.addEventListener("focusout", this.#onBlur_bound);
    this.classList.add("focus");
  }
  #onBlur() {
    this.#forElement.removeEventListener("focusout", this.#onBlur_bound);
    this.classList.remove("focus");
  }
  #mouseEnter() {
    this.#forElement.addEventListener("mouseleave", this.#mouseLeave_bound);
    this.classList.add("hover");
  }
  #mouseLeave() {
    this.#forElement.removeEventListener("mouseleave", this.#mouseLeave_bound);
    this.classList.remove("hover");
  }
  // prevent focus on click
  #pointerDown() {
    this.#preventFocus = true;
  }
  #rippleEnterKey(e) {
    if (e.key === "Enter") this.#ripple.trigger();
  }
  triggerRipple() {
    this.#ripple.trigger();
  }
};
customElements.define(WFCStateLayer.tag, WFCStateLayer);

// ../../webformula/material/src/components/card/card.css
var styles8 = new CSSStyleSheet();
styles8.replaceSync(`:host{--wfc-card-swipe-action-position: 0;display:block;border-radius:var(--wfc-shape-medium);position:relative;width:inherit;left:var(--wfc-card-swipe-action-position);transition:left;transition-duration:var(--wfc-motion-duration-short3);outline:none}:host(.dragging){transition:none}:host([onclick]){cursor:pointer;user-select:none;-webkit-user-select:none}.container{position:relative;display:flex;flex-direction:column;background-color:var(--wfc-surface-container-low);color:var(--wfc-on-surface);box-sizing:border-box;border-radius:inherit;padding:16px;width:inherit}.content{position:relative}.default-slot{display:block;position:relative}.default-slot.has-content{margin-top:24px}:host([fullscreen][open]) .container{position:fixed}.placeholder{display:none}:host([fullscreen][open]) .placeholder{display:block}:host([outlined]) .container{background-color:var(--wfc-surface);outline:1px solid var(--wfc-outline)}:host([filled]) .container{color:var(--wfc-on-surface-variant);background-color:var(--wfc-surface-container-highest)}[name=headline]{display:block;margin-top:16px;font-size:var(--wfc-font-small-headline-size);font-weight:var(--wfc-font-small-headline-weight);line-height:var(--wfc-font-small-headline-line-height);letter-spacing:var(--wfc-font-small-headline-tracking);color:var(--wfc-on-surface)}[name=subhead]{font-size:var(--wfc-font-small-title-size);font-weight:var(--wfc-font-small-title-weight);line-height:var(--wfc-font-small-title-line-height);letter-spacing:var(--wfc-font-small-title-tracking);color:var(--wfc-on-surface-variant)}[name=supporting-text]{font-size:var(--wfc-font-medium-body-size);font-weight:var(--wfc-font-medium-body-weight);line-height:var(--wfc-font-medium-body-line-height);letter-spacing:var(--wfc-font-medium-body-tracking);color:var(--wfc-on-surface-variant)}[name=supporting-text].has-content{display:block;margin-top:12px}[name=image]{display:flex;align-items:center;justify-content:center;width:calc(100% + 32px);overflow:hidden;margin:-16px -16px 0;border-radius:var(--wfc-shape-medium) var(--wfc-shape-medium) 0 0}[name=image]::slotted(img){width:101%}[name=image]::slotted(img.rounded){border-radius:var(--wfc-shape-medium)}[name=image]::slotted(img.small){height:60px;transition:height;transition-duration:0s}[name=image]::slotted(img.medium){height:120px;transition:height;transition-duration:0s}[name=image]::slotted(img.large){height:180px;transition:height;transition-duration:0s}[name=action]{display:flex;gap:8px;justify-content:flex-end}[name=action]::slotted(*){margin-top:16px}:host(.expanding){transform:translateY(0);margin-bottom:0;transition:margin-bottom,transform;transition-duration:0ms;transition-duration:var(--wfc-motion-duration-short3)}:host(.expanding[open]){z-index:11}.expand-arrow{display:none;cursor:pointer;&.show{display:block;position:absolute;top:0;right:0;transform:translateY(20px);transition:transform;transition-duration:0ms;transition-duration:var(--wfc-motion-duration-short3)}}:host([open]) .expand-arrow.show{transform:rotate(180deg) translateY(-20px)}[name=expanded]{display:block;height:0;transform:translateY(0);overflow:hidden;pointer-events:none;background-color:inherit}:host(:not([fullscreen])) [name=expanded]{transition:height,transform;transition-duration:0ms;transition-duration:var(--wfc-motion-duration-short3)}:host([fullscreen]) .container{transition:top,left,width,height;transition-duration:0ms;transition-duration:var(--wfc-motion-duration-short3)}:host([fullscreen][open]) .container{z-index:21}:host([fullscreen][open]:not(.fullscreen-closing)) .container{border-radius:0}:host([fullscreen][open]) [name=expanded]{height:auto}:host([fullscreen][open].fullscreen-closing) [name=expanded]{height:0}:host([open]:not([fullscreen])) [name=expanded]{transform:translateY(16px);pointer-events:all;overflow:auto;overscroll-behavior:contain}.fullscreen-close{display:none}:host([fullscreen]) .fullscreen-close{display:inline-flex;position:absolute;top:16px;left:16px;cursor:pointer;pointer-events:none;opacity:0;transition:opacity;transition-duration:0ms;transition-duration:var(--wfc-motion-duration-short3)}:host([fullscreen]) .fullscreen-close svg{margin-left:4px}:host([fullscreen][open]) .fullscreen-close{opacity:1;pointer-events:auto}:host([fullscreen][open].fullscreen-closing) .fullscreen-close{opacity:0;pointer-events:none}:host([fullscreen]) [name=image]::slotted(img){transition:height,border-radius;transition-delay:0ms,var(--wfc-motion-duration-short1);transition-timing-function:var(--wfc-motion-easing-standard-accelerate);transition-duration:0ms,0ms;transition-duration:var(--wfc-motion-duration-short3),80ms}:host([fullscreen][open]) [name=image]::slotted(img){height:var(--wfc-card-fullscreen-img-height, 300px);transition:height,border-radius;transition-duration:0ms,0ms;transition-delay:0ms,var(--wfc-motion-duration-short3);transition-timing-function:var(--wfc-motion-easing-standard)}:host([fullscreen][open].fullscreen-closing) [name=image]::slotted(img){height:var(--wfc-card-fullscreen-img-height-previous)}:host([fullscreen][open].wfc-duration) [name=image]::slotted(img){transition-duration:var(--wfc-motion-duration-medium3),var(--wfc-motion-duration-short3)}:host([fullscreen]) [name=image]::slotted(img.rounded){border-radius:var(--wfc-shape-medium)}:host([fullscreen][open]:not(.fullscreen-closing)) [name=image]{overflow:visible;border-radius:0 0 var(--wfc-shape-medium) var(--wfc-shape-medium)}:host(.compact.grouped:not(.grid)),:host(.grid-list-item){flex-direction:row;height:80px;overflow:hidden}:host(.compact.grouped:not(.grid)) .container,:host(.grid-list-item) .container{flex-direction:row;height:80px;width:100%;overflow:hidden}:host(.compact.grouped:not(.grid)) .content,:host(.grid-list-item) .content{align-self:flex-end;margin-left:32px}:host(.compact.grouped:not(.grid)) [name=image],:host(.grid-list-item) [name=image]{z-index:1;width:80px;height:80px}:host(.compact.grouped:not(.grid):not(.has-image)) [name=image],:host(.grid-list-item.has-image) [name=image]{width:0}:host(.compact.grouped:not(.grid)) [name=image]::slotted(img),:host(.grid-list-item) [name=image]::slotted(img){width:unset;height:100%}:host(.compact.grouped:not(.grid)) [name=supporting-text],:host(.compact.grouped:not(.grid).card-list-item) [name=actions],:host(.grid-list-item) [name=supporting-text],:host(.grid-list-item.card-list-item) [name=actions]{display:none}[name=swipe-action]{display:none}[name=swipe-action].has-swipe-action{display:flex;flex-direction:column;position:absolute;top:1px;left:calc(var(--wfc-card-swipe-action-position) * -1);bottom:0;width:100px;padding-top:18px;padding-left:18px;z-index:0;border-radius:var(--wfc-shape-medium) 0 0 var(--wfc-shape-medium);box-sizing:border-box;background-color:var(--wfc-surface-tint-alpha-16);color:var(--wfc-on-surface-variant);transition:left,background-color;transition-duration:0ms,0ms;transition-duration:var(--wfc-motion-duration-short3),var(--wfc-motion-duration-short3)}:host([outlined]) [name=swipe-action]{top:-1px;bottom:-1px;border-left:1px solid var(--wfc-outline);border-top:1px solid var(--wfc-outline);border-bottom:1px solid var(--wfc-outline)}[name=swipe-action]::slotted(wfc-icon){pointer-events:none;font-variation-settings:"FILL" 0,"wght" 400,"GRAD" 0,"opsz" 48}:host(.dragging) [name=swipe-action]{transition:none}[name=swipe-action]:after{position:absolute;content:"";top:0;left:var(--wfc-card-swipe-action-position);width:101px;padding-top:18px;padding-left:18px;bottom:0;border-radius:var(--wfc-shape-medium) 0 0 var(--wfc-shape-medium);background-color:var(--wfc-surface);z-index:1;box-sizing:border-box;transition:left;transition-duration:0ms;transition-duration:var(--wfc-motion-duration-short3)}:host([filled]) [name=swipe-action]:after{background-color:var(--wfc-surface-variant)}:host(.dragging) [name=swipe-action]:after{transition:none}[name=swipe-action][checked]{background-color:var(--wfc-surface-tint-alpha-38)}[name=swipe-action][checked]::slotted(wfc-icon){font-variation-settings:"FILL" 1,"wght" 400,"GRAD" 0,"opsz" 48}wfc-state-layer{--wfc-state-layer-box-shadow: var(--wfc-elevation-1);--wfc-state-layer-hover-color: var(--wfc-on-surface);--wfc-state-layer-focus-color: var(--wfc-on-surface);--wfc-state-layer-ripple-color: var(--wfc-primary)}:host([filled]) wfc-state-layer{--wfc-state-layer-box-shadow: none;--wfc-state-layer-ripple-color: var(--wfc-primary)}:host(.expanding[open][filled]) wfc-state-layer{--wfc-state-layer-box-shadow: var(--wfc-elevation-1)}:host([outlined]) wfc-state-layer{--wfc-state-layer-box-shadow: none}:host(.actionable) wfc-state-layer{--wfc-state-layer-hover-box-shadow: var(--wfc-elevation-2);--wfc-state-layer-focus-box-shadow: var(--wfc-elevation-2)}:host(.drag-active) wfc-state-layer{--wfc-state-layer-hover-box-shadow: var(--wfc-elevation-4)}:host([filled].actionable) wfc-state-layer,:host([outlined].actionable) wfc-state-layer{--wfc-state-layer-hover-box-shadow: var(--wfc-elevation-1);--wfc-state-layer-focus-box-shadow: none}:host([filled].drag-active) wfc-state-layer,:host([outlined].drag-active) wfc-state-layer{--wfc-state-layer-hover-box-shadow: var(--wfc-elevation-3);--wfc-state-layer-focus-box-shadow: none}
`);
var card_default = styles8;

// ../../webformula/material/src/components/card/card.js
var WFCCardElement = class extends HTMLComponentElement {
  static tag = "wfc-card";
  static useShadowRoot = true;
  static useTemplate = true;
  static styleSheets = card_default;
  #abort;
  #drag;
  #dragSwipeAction;
  #reorder;
  #reorderSwap;
  #fullscreen;
  #dragSwipeActionStartPosition;
  #value = "";
  #swipeActionElement;
  #hasExpanded;
  #slotChange_bound = this.#slotChange.bind(this);
  #expandedClick_bound = this.#expandedClick.bind(this);
  #fullscreenClick_bound = this.#fullscreenClick.bind(this);
  #fullscreenCloseClick_bound = this.#fullscreenCloseClick.bind(this);
  #imgOnload_bound = this.#imgOnload.bind(this);
  #ondragSwipeAction_bound = this.#ondragSwipeAction.bind(this);
  #ondragSwipeActionStart_bound = this.#ondragSwipeActionStart.bind(this);
  #ondragSwipeActionEnd_bound = this.#ondragSwipeActionEnd.bind(this);
  #swipeActionClick_bound = this.#swipeActionClick.bind(this);
  #keydown_bound = this.#keydown.bind(this);
  #clickOutside_bound = this.#clickOutside.bind(this);
  #focus_bound = this.#focus.bind(this);
  #blur_bound = this.#blur.bind(this);
  #focusKeydown_bound = this.#focusKeydown.bind(this);
  constructor() {
    super();
    this.render();
    this.#swipeActionElement = this.shadowRoot.querySelector('[name="swipe-action"]');
    if (this.hasAttribute("onclick") || this.hasAttribute("reorder") || this.hasAttribute("reorder-swap")) {
      this.tabIndex = 0;
      this.classList.add("actionable");
    }
    if (this.parentElement.nodeName === "WFC-CARD-GROUP") {
      this.classList.add("grouped");
      if (this.parentElement.classList.contains("grid")) this.classList.add("grid");
    }
    if (device_default.state === "compact") {
      this.classList.add("compact");
    }
  }
  template() {
    return (
      /*html*/
      `
      <div class="placeholder"></div>
      <div class="container">
        <wfc-icon-button class="elevated fullscreen-close">
          <wfc-icon>${arrow_back_ios_FILL1_wght300_GRAD0_opsz24}</wfc-icon>
        </wfc-icon-button>
        <slot name="swipe-action"></slot>
        <slot name="image"></slot>
        <div class="content">
          <div class="expand-arrow">${expand_more_FILL0_wght400_GRAD0_opsz24}</div>
          <slot name="headline"></slot>
          <slot name="subhead"></slot>
          <slot name="supporting-text"></slot>
          <slot name="expanded"></slot>
          <slot class="default-slot"></slot>
          <slot name="action"></slot>
        </div>
        <wfc-state-layer ripple="false" enabled="false" class="temp"></wfc-state-layer>
      </div>
    `
    );
  }
  connectedCallback() {
    this.#abort = new AbortController();
    this.shadowRoot.addEventListener("slotchange", this.#slotChange_bound, { signal: this.#abort.signal });
    this.addEventListener("focus", this.#focus_bound, { signal: this.#abort.signal });
    if (this.classList.contains("actionable")) {
      const stateLayer = this.shadowRoot.querySelector("wfc-state-layer");
      stateLayer.enabled = true;
      if (this.hasAttribute("onclick")) stateLayer.ripple = true;
    }
    this.#calculateImgMaxHeightForFullscreen();
    if (this.#reorder || this.#reorderSwap) {
      this.#drag = new Drag(this, {
        reorder: true,
        reorderSwap: this.#reorderSwap,
        reorderAnimation: !this.parentElement.classList.contains("reorder-no-animation")
      });
      this.#drag.enable();
    }
  }
  disconnectedCallback() {
    this.#abort.abort();
    if (this.#drag) {
      this.#drag.destroy();
      this.#drag = void 0;
    }
    if (this.#dragSwipeAction) this.#dragSwipeAction.destroy();
    this.removeEventListener("click", this.#fullscreenClick_bound);
  }
  static get observedAttributesExtended() {
    return [
      ["fullscreen", "boolean"],
      ["reorder", "boolean"],
      ["reorder-swap", "boolean"]
    ];
  }
  attributeChangedCallbackExtended(name, _oldValue, newValue) {
    this[name] = newValue;
  }
  get fullscreen() {
    return this.#fullscreen;
  }
  set fullscreen(value) {
    this.#fullscreen = !!value;
    if (this.#fullscreen) this.addEventListener("click", this.#fullscreenClick_bound);
    else this.removeEventListener("click", this.#fullscreenClick_bound);
  }
  get reorder() {
    return this.#reorder;
  }
  set reorder(value) {
    this.#reorder = !!value;
  }
  get reorderSwap() {
    return this.#reorderSwap;
  }
  set reorderSwap(value) {
    this.#reorderSwap = !!value;
  }
  #slotChange(event) {
    const name = event.target.getAttribute("name");
    if (!this.#fullscreen && name === "expanded") {
      const hasExpanded = event.target.assignedElements().length > 0;
      this.#hasExpanded = hasExpanded;
      this.shadowRoot.querySelector(".expand-arrow").classList.toggle("show", hasExpanded);
      this.classList.toggle("expanding", hasExpanded);
      event.target.classList.toggle("has-content", hasExpanded);
      if (event.target.assignedElements().length > 0) {
        this.addEventListener("click", this.#expandedClick_bound, { signal: this.#abort.signal });
      } else {
        this.removeEventListener("click", this.#expandedClick_bound);
      }
    } else if (name === "supporting-text") {
      const hasContent = event.target.assignedElements().length > 0;
      event.target.classList.toggle("has-content", hasContent);
    } else if (name === "image") {
      const hasContent = event.target.assignedElements().length > 0;
      this.classList.toggle("has-image", hasContent);
    } else if (name === "swipe-action") {
      const hasSwipeAction = event.target.assignedElements().length > 0;
      event.target.classList.toggle("has-swipe-action", hasSwipeAction);
      if (hasSwipeAction) {
        this.#dragSwipeAction = new Drag(this, {
          disableMouseEvents: true,
          lockScrollY: true
        });
        this.#dragSwipeAction.on("wfcdragmove", this.#ondragSwipeAction_bound);
        this.#dragSwipeAction.on("wfcdragstart", this.#ondragSwipeActionStart_bound);
        this.#dragSwipeAction.on("wfcdragend", this.#ondragSwipeActionEnd_bound);
        this.#dragSwipeAction.enable();
        this.#swipeActionElement.addEventListener("click", this.#swipeActionClick_bound, { signal: this.#abort.signal });
        this.#swipeActionElement.assignedElements().forEach((el) => {
          if (el.hasAttribute("action")) {
            this.#swipeActionElement.setAttribute("action", el.getAttribute("action"));
            this.#swipeActionElement.toggleAttribute("action-remove", el.hasAttribute("action-remove"));
          }
        });
      }
    } else if (event.target.classList.contains("default-slot")) {
      event.target.classList.toggle("has-content", event.target.assignedElements().length > 0);
    }
  }
  #expandedClick() {
    const isCompact = device_default.state === "compact";
    const expanded = this.shadowRoot.querySelector('[name="expanded"]');
    if (!this.hasAttribute("open")) {
      const { clientHeight } = document.documentElement;
      const bounds = expanded.getBoundingClientRect();
      let height = expanded.scrollHeight + 16;
      if (height > 300) height = 300;
      if (bounds.top + height > clientHeight - 12) height = clientHeight - bounds.top - 12;
      if (height < 80) height = 80;
      expanded.style.height = `${height}px`;
      if (!isCompact) this.style.marginBottom = `${-height}px`;
      window.addEventListener("keydown", this.#keydown_bound, { signal: this.#abort.signal });
      window.addEventListener("click", this.#clickOutside_bound, { signal: this.#abort.signal });
    } else {
      expanded.style.height = "";
      if (!isCompact) this.style.marginBottom = "";
      window.removeEventListener("keydown", this.#keydown_bound);
      window.removeEventListener("click", this.#clickOutside_bound);
    }
    this.toggleAttribute("open");
  }
  #fullscreenClick() {
    if (this.hasAttribute("open")) return;
    this.style.setProperty("--wfc-card-fullscreen-img-height-previous", `${this.querySelector("img").offsetHeight}px`);
    const container = this.shadowRoot.querySelector(".container");
    const bounds = container.getBoundingClientRect();
    container.style.top = `${bounds.top}px`;
    container.style.left = `${bounds.left}px`;
    container.style.width = `${bounds.width}px`;
    container.style.height = `${bounds.height}px`;
    const placeholder = this.shadowRoot.querySelector(".placeholder");
    placeholder.style.width = `${bounds.width}px`;
    placeholder.style.height = `${bounds.height}px`;
    this.setAttribute("open", "");
    requestAnimationFrame(() => {
      container.style.top = "0px";
      container.style.left = "0px";
      container.style.width = "100%";
      container.style.height = "100%";
    });
    this.shadowRoot.querySelector(".fullscreen-close").addEventListener("click", this.#fullscreenCloseClick_bound, { signal: this.#abort.signal });
    window.addEventListener("keydown", this.#keydown_bound, { signal: this.#abort.signal });
  }
  async #fullscreenCloseClick() {
    this.shadowRoot.querySelector(".fullscreen-close").removeEventListener("click", this.#fullscreenCloseClick_bound);
    const container = this.shadowRoot.querySelector(".container");
    const placeholder = this.shadowRoot.querySelector(".placeholder");
    const bounds = placeholder.getBoundingClientRect();
    container.style.top = `${bounds.top}px`;
    container.style.left = `${bounds.left}px`;
    container.style.width = `${bounds.width}px`;
    container.style.height = `${bounds.height}px`;
    this.classList.add("fullscreen-closing");
    await util_default.transitionendAsync(container);
    container.style.top = "";
    container.style.left = "";
    container.style.width = "";
    container.style.height = "";
    this.classList.remove("fullscreen-closing");
    this.removeAttribute("open");
    window.removeEventListener("keydown", this.#keydown_bound);
  }
  // sets height for fullscreen view so image can expand
  #calculateImgMaxHeightForFullscreen() {
    const img = this.querySelector("img");
    if (!img) return;
    if (!img.height) img.addEventListener("load", this.#imgOnload_bound, { signal: this.#abort.signal });
    else {
      const maxHeight = Math.min(img.height, img.height / img.width * window.innerWidth);
      this.style.setProperty("--wfc-card-fullscreen-img-height", `${maxHeight}px`);
    }
  }
  #imgOnload() {
    [...this.querySelectorAll(":scope img")].forEach((el) => el.removeEventListener("load", this.#imgOnload_bound));
    this.#calculateImgMaxHeightForFullscreen();
  }
  #ondragSwipeActionStart() {
    this.classList.add("dragging");
    this.#dragSwipeActionStartPosition = parseInt(getComputedStyle(this).getPropertyValue("--wfc-card-swipe-action-position").replace("px", ""));
  }
  #ondragSwipeAction({ distanceX }) {
    let position = this.#dragSwipeActionStartPosition + distanceX;
    if (position > 60) position = 60;
    if (position < 0) position = 0;
    this.style.setProperty("--wfc-card-swipe-action-position", `${position}px`);
  }
  async #ondragSwipeActionEnd({ swipeX, direction }) {
    this.classList.remove("dragging");
    const position = parseInt(getComputedStyle(this).getPropertyValue("--wfc-card-swipe-action-position").replace("px", ""));
    if (swipeX) {
      if (direction === "right") this.style.setProperty("--wfc-card-swipe-action-position", `60px`);
      else this.style.setProperty("--wfc-card-swipe-action-position", `0px`);
    } else if (position < 30) this.style.setProperty("--wfc-card-swipe-action-position", `0px`);
    else this.style.setProperty("--wfc-card-swipe-action-position", `60px`);
  }
  #swipeActionClick() {
    if (this.querySelector('[slot="swipe-action"][toggle]')) {
      if (this.#swipeActionElement.hasAttribute("checked")) this.#swipeActionElement.removeAttribute("checked");
      else this.#swipeActionElement.setAttribute("checked", "");
    }
    const action = this.#swipeActionElement.getAttribute("action");
    const actionRemove = this.#swipeActionElement.hasAttribute("action-remove");
    if (action) {
      this.dispatchEvent(new CustomEvent("change", {
        detail: {
          action,
          value: this.#value,
          card: this,
          ...actionRemove && { remove: true }
        }
      }));
    }
    if (actionRemove) this.remove();
    setTimeout(() => {
      this.style.setProperty("--wfc-card-swipe-action-position", `0px`);
    }, 240);
  }
  #keydown(event) {
    if (event.code === "Escape") {
      if (this.#fullscreen) this.#fullscreenCloseClick();
      else if (this.#hasExpanded) this.#expandedClick();
    }
  }
  #clickOutside(event) {
    if (!this.contains(event.target)) {
      if (this.#hasExpanded) this.#expandedClick();
    }
  }
  #focus() {
    this.addEventListener("blur", this.#blur_bound);
    this.addEventListener("keydown", this.#focusKeydown_bound, { signal: this.#abort.signal });
  }
  #blur() {
    this.removeEventListener("blur", this.#blur_bound);
    this.removeEventListener("keydown", this.#focusKeydown_bound);
  }
  #focusKeydown(event) {
    let next;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowUp":
        next = this.previousElementSibling;
        break;
      case "ArrowRight":
      case "ArrowDown":
        next = this.nextElementSibling;
        break;
    }
    if (next) {
      event.preventDefault();
      next.focus();
    }
  }
};
customElements.define(WFCCardElement.tag, WFCCardElement);

// ../../webformula/material/src/components/card/group.js
var WFCCardGroupElement = class extends HTMLComponentElement {
  static tag = "wfc-card-group";
  #autoSpanRow = this.classList.contains("wfc-auto-span-row");
  #observer = new MutationObserver(this.#onMutation.bind(this));
  #handleWindowState_bound = this.#handleWindowState.bind(this);
  constructor() {
    super();
  }
  connectedCallback() {
    requestAnimationFrame(() => {
      this.#layout();
      requestAnimationFrame(() => {
        this.#layout();
        this.#observer.observe(this, { childList: true });
      });
    });
    window.addEventListener("wfcwindowstate", this.#handleWindowState_bound);
  }
  disconnectedCallback() {
    window.removeEventListener("wfcwindowstate", this.#handleWindowState_bound);
    this.#observer.disconnect();
  }
  get #isGrid() {
    return !this.classList.contains("list") && (this.classList.contains("grid") || !this.classList.contains("grid") && device_default.state !== "compact");
  }
  get autoSpanRow() {
    return this.#autoSpanRow();
  }
  set autoSpanRow(value) {
    this.#autoSpanRow = !!value;
    this.#layout();
  }
  #layout() {
    if (this.#isGrid) this.#layoutGrid();
    else this.#layoutList();
  }
  #layoutGrid() {
    this.classList.add("grid");
    this.classList.remove("list");
    const cards = [...this.querySelectorAll("wfc-card")].map((element2, i) => {
      element2.style.order = i;
      const innerContentHeight = [...element2.children].reduce((a, b) => {
        if (b.classList.contains("ripple")) return a;
        return a + b.offsetHeight;
      }, 0);
      return {
        order: i,
        height: parseInt(element2.style.height || innerContentHeight),
        element: element2
      };
    }).sort((a, b) => a.height - b.height);
    if (cards.length === 0) return;
    const baseHeight = cards[0].height;
    this.style.setProperty("--wfc-card-group-row-height", `${baseHeight}px`);
    cards.forEach(({ element: element2, height }) => {
      if (element2.classList.contains("show")) return;
      const span = Math.ceil(height / baseHeight);
      if (baseHeight > 1) element2.style.gridRowEnd = `span ${span}`;
    });
    const overFlow = this.scrollWidth - this.offsetWidth;
    if (overFlow > 0) {
      let cardWidth = 0;
      [...this.querySelectorAll("wfc-card")].forEach((card) => {
        if (card.offsetWidth > cardWidth) cardWidth = card.offsetWidth;
      });
      this.style.setProperty("--wfc-card-group-columns", Math.max(1, Math.floor(this.offsetWidth / cardWidth)));
    }
  }
  #layoutList() {
    this.classList.remove("grid");
  }
  #onMutation() {
    this.#observer.disconnect();
    this.#layout();
    this.#observer.observe(this, { childList: true });
  }
  #handleWindowState() {
    this.#observer.disconnect();
    this.#layout();
    this.#observer.observe(this, { childList: true });
  }
};
customElements.define(WFCCardGroupElement.tag, WFCCardGroupElement);

// ../../webformula/material/src/components/button/component.css
var styles9 = new CSSStyleSheet();
styles9.replaceSync(`:host{position:relative;display:inline-flex;border-radius:var(--wfc-shape-extra-large);box-sizing:border-box;cursor:pointer;outline:none;user-select:none;-webkit-user-select:none;text-overflow:ellipsis;text-wrap:nowrap;white-space:nowrap;-webkit-tap-highlight-color:transparent;place-content:center;place-items:center;gap:8px;height:40px;line-height:40px;font-size:var(--wfc-font-large-label-size);font-weight:var(--wfc-font-large-label-weight);letter-spacing:var(--wfc-font-large-label-tracking);color:var(--wfc-primary);vertical-align:top}:host([disabled]){cursor:default;color:var(--wfc-on-surface);opacity:.38;pointer-events:none}button{border-radius:inherit;cursor:inherit;display:inline-flex;align-items:center;justify-content:center;border:none;outline:none;-webkit-appearance:none;vertical-align:middle;background:transparent;text-decoration:none;width:100%;height:100%;font:inherit;color:inherit;gap:inherit;padding:0 16px}:host([disabled]) button{pointer-events:none}:host([filled]){color:var(--wfc-on-primary);background-color:var(--wfc-primary)}:host([disabled][filled]){background-color:var(--wfc-on-surface-alpha-12);color:var(--wfc-on-surface-alpha-38)}:host([elevated]){color:var(--wfc-primary);background-color:var(--wfc-surface-container-low)}:host([disabled][elevated]){background-color:var(--wfc-on-surface-alpha-12);color:var(--wfc-on-surface-alpha-38)}:host([filled-tonal]){color:var(--wfc-on-secondary-container);background-color:var(--wfc-secondary-container)}:host([disabled][filled-tonal]){background-color:var(--wfc-on-surface-alpha-12);color:var(--wfc-on-surface-alpha-38)}:host([outlined]){color:var(--wfc-primary);background-color:var(--wfc-button-outlined-container-color);border:1px solid var(--wfc-outline)}:host([disabled][outlined]){color:var(--wfc-on-surface-alpha-38);border:1px solid var(--wfc-on-surface-alpha-12)}::slotted(wfc-icon),slot[name=leading-icon]::slotted(wfc-icon){pointer-events:none;margin-right:-2px;margin-left:-2px;width:var(--wfc-font-small-icon-size);height:var(--wfc-font-small-icon-size);font-size:var(--wfc-font-small-icon-size);line-height:var(--wfc-font-small-icon-size)}wfc-state-layer{--wfc-state-layer-focus-color: var(--wfc-on-surface);--wfc-state-layer-hover-color: var(--wfc-primary);--wfc-state-layer-ripple-color: var(--wfc-primary)}:host([filled]) wfc-state-layer{--wfc-state-layer-focus-color: var(--wfc-on-primary);--wfc-state-layer-hover-color: var(--wfc-on-primary);--wfc-state-layer-ripple-color: var(--wfc-on-primary)}:host([filled-tonal]) wfc-state-layer{--wfc-state-layer-focus-color: var(--wfc-on-secondary-container);--wfc-state-layer-hover-color: var(--wfc-on-secondary-container);--wfc-state-layer-ripple-color: var(--wfc-on-secondary-container)}:host([elevated]) wfc-state-layer{--wfc-state-layer-focus-color: var(--wfc-button-elevate-state-layer-color);--wfc-state-layer-hover-color: var(--wfc-primary);--wfc-state-layer-ripple-color: var(--wfc-primary)}:host([outlined]) wfc-state-layer{--wfc-state-layer-focus-color: var(--wfc-primary);--wfc-state-layer-hover-color: var(--wfc-primary)}:host([filled]) wfc-state-layer,:host([filled-tonal]) wfc-state-layer{--wfc-state-layer-focus-box-shadow: var(--wfc-elevation-1);--wfc-state-layer-hover-box-shadow: var(--wfc-elevation-1)}:host([elevated]) wfc-state-layer{--wfc-state-layer-box-shadow: var(--wfc-elevation-1);--wfc-state-layer-focus-box-shadow: var(--wfc-elevation-2);--wfc-state-layer-hover-box-shadow: var(--wfc-elevation-2)}:host([disabled]) wfc-state-layer{--wfc-state-layer-box-shadow: none}.spinner{position:absolute;top:5px;--wfc-progress-circular-stroke-width: 6}:host(.async-pending){pointer-events:none}:host(.async-pending) button .default-slot{color:transparent}
`);
var component_default5 = styles9;

// ../../webformula/material/src/components/dialog/service.js
var wfcDialog = new class wfcDialog2 {
  #dialogStack = [];
  #idCounter = 0;
  async simple(params = {
    headline: "",
    icon: "",
    message: "",
    noScrim: false,
    allowClose: false,
    preventNavigation: false,
    actionConfirm: true,
    actionConfirmLabel: "OK",
    actionCancel: false,
    actionCancelLabel: "Cancel"
  }) {
    const actionConfirm = params.actionConfirm === void 0 ? true : params.actionConfirm;
    const actionCancel = params.actionCancel || false;
    const id = `wfc-dialog-${this.#idCounter++}`;
    document.body.insertAdjacentHTML("beforeend", `
      <wfc-dialog id="${id}" aria-label="[dialog] ${params.message}">
        ${!params.icon ? "" : `<wfc-icon slot="icon">${params.icon}</wfc-icon>`}
        ${!params.headline ? "" : `<div slot="headline">${params.headline}</div>`}
        <div slot="content">${params.message || ""}</div>
        ${actionConfirm === true ? `<wfc-button slot="actions" onclick="wfcDialog.close('confirm')">${params.actionConfirmLabel || "OK"}</wfc-button>` : ""}
        ${actionCancel === true ? `<wfc-button slot="actions" onclick="wfcDialog.close('cancel')">${params.actionCancelLabel || "Cancel"}</wfc-button>` : ""}
      </wfc-dialog>
    `);
    const element2 = document.body.querySelector(`#${id}`);
    element2.removeOnClose = true;
    element2.allowClose = params.allowClose;
    element2.noScrim = params.noScrim === void 0 ? false : params.noScrim;
    element2.preventNavigation = !!params.preventNavigation;
    await util_default.nextAnimationFrameAsync();
    return element2.show();
  }
  async template(params = {
    template,
    scrim: true,
    allowClose: false,
    preventNavigation: true
  }) {
    const id = `wfc-dialog-${this.#idCounter++}`;
    document.body.insertAdjacentHTML("beforeend", `
      <wfc-dialog id="${id}">
        ${params.template}
      </wfc-dialog>
    `);
    const element2 = document.body.querySelector(`#${id}`);
    element2.removeOnClose = true;
    element2.allowClose = params.allowClose;
    element2.scrim = params.scrim === void 0 ? true : params.scrim;
    element2.preventNavigation = !!params.preventNavigation;
    await util_default.nextAnimationFrameAsync();
    return element2.show();
  }
  async close(returnValue) {
    const currentDialog = this.#dialogStack.pop();
    if (!currentDialog) throw Error("No dialog to close");
    return currentDialog.close(returnValue);
  }
  track(dialogElement) {
    if (dialogElement.nodeName !== "WFC-DIALOG") throw Error("Can only track wfc-dialog elements");
    this.#dialogStack.push(dialogElement);
  }
  untrack(dialogElement) {
    const dialog = this.#dialogStack.find(({ element: element2 }) => element2 === dialogElement);
    if (!dialog) return;
    this.#dialogStack = this.#dialogStack.filter(({ element: element2 }) => element2 !== dialogElement);
  }
}();
window.wfcDialog = wfcDialog;
var service_default = wfcDialog;

// ../../webformula/material/src/components/button/index.js
var targetValues3 = ["_blank", "_parent", "_self", "_top"];
var WFCButtonElement = class extends HTMLComponentElement {
  static tag = "wfc-button";
  static useShadowRoot = true;
  static useTemplate = true;
  static shadowRootDelegateFocus = true;
  static styleSheets = component_default5;
  #abort;
  #target;
  #href;
  #type;
  #button;
  #value;
  #form;
  #formState;
  #onclickValue;
  #async = false;
  #focus_bound = this.#focus.bind(this);
  #blur_bound = this.#blur.bind(this);
  #asyncMouseup_bound = this.pending.bind(this);
  #formClick_bound = this.#formClick.bind(this);
  #formFocusIn_bound = this.#formFocusIn.bind(this);
  #focusKeydown_bound = this.#focusKeydown.bind(this);
  #formMouseDown_bound = this.#formMouseDown.bind(this);
  #formMouseUp_bound = this.#formMouseUp.bind(this);
  #hrefClick_bound = this.#hrefClick.bind(this);
  constructor() {
    super();
    this.role = "button";
    this.render();
    this.#button = this.shadowRoot.querySelector("button");
  }
  static get observedAttributesExtended() {
    return [
      ["href", "string"],
      ["target", "string"],
      ["type", "string"],
      ["value", "string"],
      ["form", "string"],
      ["async", "boolean"],
      ["disabled", "boolean"]
    ];
  }
  attributeChangedCallbackExtended(name, _oldValue, newValue) {
    this[name] = newValue;
  }
  template() {
    return (
      /*html*/
      `
      <button>
        <slot name="leading-icon"></slot>
        <slot class="default-slot"></slot>
      </button>
      <div class="spinner"></div>
      <wfc-state-layer ripple></wfc-state-layer>
    `
    );
  }
  connectedCallback() {
    this.#abort = new AbortController();
    if (this.#async) this.addEventListener("mouseup", this.#asyncMouseup_bound, { signal: this.#abort.signal });
    this.addEventListener("focus", this.#focus_bound, { signal: this.#abort.signal });
    if (this.#form) {
      this.addEventListener("click", this.#formClick_bound, { signal: this.#abort.signal });
      this.addEventListener("mousedown", this.#formMouseDown_bound, { signal: this.#abort.signal });
      this.addEventListener("mouseup", this.#formMouseUp_bound, { signal: this.#abort.signal });
      this.#form.addEventListener("focusin", this.#formFocusIn_bound, { signal: this.#abort.signal });
    }
  }
  disconnectedCallback() {
    if (this.#abort) this.#abort.abort();
    this.#onclickValue = void 0;
    this.removeEventListener("click", this.#hrefClick_bound);
  }
  get disabled() {
    return this.hasAttribute("disabled");
  }
  set disabled(value) {
    this.toggleAttribute("disabled", !!value);
    this.#button.toggleAttribute("disabled", !!value);
  }
  get href() {
    return this.#href;
  }
  set href(value) {
    this.#href = value;
    if (!value) {
      this.removeAttribute("href");
      this.removeEventListener("click", this.#hrefClick_bound);
    } else {
      this.setAttribute("href", value);
      this.addEventListener("click", this.#hrefClick_bound);
    }
  }
  get target() {
    return this.#target;
  }
  set target(value) {
    if (value && !targetValues3.includes(value)) throw Error(`Invalid target value. Valid values ${targetValues3.join(", ")}`);
    this.#target = value;
  }
  get type() {
    return this.#type;
  }
  set type(value) {
    this.#type = value;
    this.#button.setAttribute("type", value);
    if (["reset", "cancel", "submit"].includes(value) && !this.#form && this.parentElement.nodeName === "FORM") {
      this.#form = this.parentElement;
    }
  }
  get value() {
    return this.#value;
  }
  set value(value) {
    this.#value = value;
    this.#button.setAttribute("value", value);
  }
  get form() {
    return this.#form;
  }
  set form(value) {
    this.#form = document.querySelector(`form#${value}`);
  }
  get async() {
    return this.#async;
  }
  set async(value) {
    this.#async = !!value;
  }
  get formNoValidate() {
    return this.hasAttribute("formnovalidate");
  }
  set formNoValidate(value) {
    if (!!value) this.setAttribute("formnovalidate", "");
    else this.removeAttribute("formnovalidate");
  }
  pending() {
    this.classList.add("async-pending");
    this.shadowRoot.querySelector(".spinner").innerHTML = `
      <wfc-progress-circular style="width: 20px; height: 20px;" indeterminate class="${this.hasAttribute("filled") ? " on-filled" : ""}${this.hasAttribute("filled-tonal") ? " on-filled-tonal" : ""}"></wfc-progress-circular>
    `;
  }
  resolve() {
    this.classList.remove("async-pending");
    this.shadowRoot.querySelector(".spinner").innerHTML = "";
  }
  #focus() {
    this.addEventListener("blur", this.#blur_bound, { signal: this.#abort.signal });
    this.addEventListener("keydown", this.#focusKeydown_bound, { signal: this.#abort.signal });
  }
  #blur() {
    this.removeEventListener("blur", this.#blur_bound, { signal: this.#abort.signal });
    this.removeEventListener("keydown", this.#focusKeydown_bound, { signal: this.#abort.signal });
  }
  #focusKeydown(e) {
    if (e.key === "Enter") this.shadowRoot.querySelector("wfc-state-layer").triggerRipple();
  }
  // prevent onclick attribute from firing when form invalid
  #formMouseDown() {
    if (this.#type === "cancel" && this.onclick && this.#formState !== void 0 && this.#getFormState() !== this.#formState) {
      this.#onclickValue = this.onclick;
      this.onclick = void 0;
    }
  }
  #formMouseUp() {
    if (this.#type === "cancel" && this.#onclickValue) {
      setTimeout(() => {
        this.onclick = this.#onclickValue;
        this.#onclickValue = void 0;
      });
    }
  }
  async #formClick(event) {
    switch (this.#type) {
      case "reset":
        this.#form.reset();
        break;
      case "submit":
        if (!this.formNoValidate && !this.#form.hasAttribute("novalidate") && !this.#form.checkValidity()) {
          const formElements = [...this.#form.elements];
          formElements.forEach((element2) => element2.reportValidity());
          const firstInvalid = formElements.find((e) => !e.checkValidity());
          const bounds = firstInvalid.getBoundingClientRect();
          if (!(bounds.y >= 0 && bounds.y + bounds.height <= window.innerHeight)) {
            firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          firstInvalid.focus({ preventScroll: true });
        } else {
          this.#formRequestSubmit();
        }
        break;
      case "cancel":
        if (this.#formState !== void 0 && this.#getFormState() !== this.#formState) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          service_default.simple({
            message: "Discard changes?",
            actionConfirm: true,
            actionConfirmLabel: "Cancel",
            actionCancel: true,
            actionCancelLabel: "Discard"
          }).then((action) => {
            if (action !== "cancel") return;
            this.#formState = void 0;
            this.click();
          });
        }
        break;
      default:
        if (this.#form.method === "dialog") {
          this.#formRequestSubmit();
        }
    }
  }
  #formRequestSubmit() {
    const previousNoValidate = this.#form.noValidate;
    if (this.formNoValidate) this.#form.noValidate = true;
    this.#form.addEventListener("submit", (submitEvent) => {
      Object.defineProperty(submitEvent, "submitter", {
        configurable: true,
        enumerable: true,
        get: () => this
      });
    }, { capture: true, once: true });
    this.#form.requestSubmit();
    if (this.formNoValidate) this.#form.noValidate = previousNoValidate;
  }
  // used to track changes based on values
  #getFormState() {
    return [...this.#form.elements].map((e) => e.type === "checkbox" ? e.checked : e.value).toString();
  }
  #formFocusIn() {
    if (this.#formState === void 0) this.#formState = this.#getFormState();
  }
  #hrefClick() {
    if (!this.target || this.target === "_self") {
      location.href = this.href;
    } else {
      window.open(this.href, "_blank");
    }
  }
};
customElements.define(WFCButtonElement.tag, WFCButtonElement);

// ../../webformula/material/src/components/switch/component.css
var styles10 = new CSSStyleSheet();
styles10.replaceSync(`:host{display:inline-flex;outline:none;vertical-align:top;-webkit-tap-highlight-color:transparent;cursor:pointer;margin:9px 0;flex-grow:1}:host(.min-width){flex-grow:0}:host([disabled]){cursor:default}.container{align-items:center;display:inline-flex;flex-shrink:0;position:relative;min-width:52px;height:32px;border-radius:var(--wfc-shape-large)}input{appearance:none;height:48px;outline:none;margin:0;position:absolute;width:100%;z-index:1;cursor:inherit}.track{position:absolute;width:52px;height:100%;box-sizing:border-box;border-radius:inherit;display:flex;justify-content:center;align-items:center}.track:before{content:"";display:flex;position:absolute;height:100%;width:100%;border-radius:inherit;box-sizing:border-box;transition-property:opacity,background-color;transition-duration:var(--wfc-motion-duration-short1);background-color:var(--wfc-surface-container-highest);border:2px solid;border-color:var(--wfc-outline)}:host(.checked) .track:before{background-color:var(--wfc-primary)}:host(.invalid) .track:before{border-color:var(--wfc-error)}.track .thumb-container{display:flex;place-content:center;place-items:center;position:relative;margin-inline-end:20px;transition:margin;transition-duration:var(--wfc-motion-duration-medium2);transition-timing-function:var(--wfc-transition-overshoot)}:host(.checked) .track .thumb-container{margin-inline-end:unset;margin-inline-start:20px}.track .thumb{position:relative;border-radius:var(--wfc-shape-full);height:16px;width:16px;transform-origin:center;transition-property:height,width;transition-duration:var(--wfc-motion-duration-medium1),var(--wfc-motion-duration-medium1);transition-timing-function:var(--wfc-motion-easing-standard),var(--wfc-motion-easing-standard);z-index:0}:host(.unchecked-icon) .track .thumb,:host(.checked) .track .thumb{width:24px;height:24px}.track .thumb:before{content:"";display:flex;inset:0;position:absolute;border-radius:inherit;box-sizing:border-box;transition:background-color;transition-duration:var(--wfc-motion-duration-short1);background-color:var(--wfc-outline)}:host(.checked) .track .thumb:before{background-color:var(--wfc-on-primary)}:host(.invalid) .track .thumb:before{background-color:var(--wfc-error)}.label{display:inline-flex;flex-grow:inherit;user-select:none;-webkit-user-select:none;cursor:inherit;white-space:nowrap;height:32px;line-height:32px;margin-right:16px;font-size:var(--wfc-font-large-label-size);font-weight:var(--wfc-font-large-label-weight);letter-spacing:var(--wfc-font-large-label-tracking)}.label.hide{display:none}:host(.label-right) .label{justify-content:flex-end;order:1;margin-right:0;margin-left:16px}:host(.invalid) .label{color:var(--wfc-error)}:host([disabled]) .label{color:var(--wfc-on-surface);opacity:.38}.icon{position:absolute;inset:0;margin:auto;display:flex;align-items:center;justify-content:center;fill:currentColor;transition:fill 67ms linear,opacity 33ms linear,transform 167ms var(--wfc-motion-easing-standard);opacity:0}:host(.checked.checked-icon) .icon.icon-on{opacity:1}:host(:not(.checked).unchecked-icon) .icon.icon-off{opacity:1}.icon.icon-on{width:16px;height:16px;color:var(--wfc-primary)}.icon.icon-off{width:16px;height:16px;color:var(--wfc-surface-container-highest)}wfc-state-layer{--wfc-state-layer-hover-color: var(--wfc-on-surface);--wfc-state-layer-focus-color: var(--wfc-on-surface)}
`);
var component_default6 = styles10;

// ../../webformula/material/src/components/switch/index.js
var WFCSwitchElement = class extends HTMLComponentElement {
  static tag = "wfc-switch";
  static useShadowRoot = true;
  static useTemplate = true;
  static shadowRootDelegateFocus = true;
  static styleSheets = component_default6;
  static formAssociated = true;
  #internals;
  #input;
  #abort;
  #value = "on";
  #checked = false;
  #touched = false;
  #click_bound = this.#click.bind(this);
  #focus_bound = this.#focus.bind(this);
  #blur_bound = this.#blur.bind(this);
  #focusKeydown_bound = this.#focusKeydown.bind(this);
  #slotChange_bound = this.#slotChange.bind(this);
  constructor() {
    super();
    this.#internals = this.attachInternals();
    this.role = "switch";
    this.render();
    this.#input = this.shadowRoot.querySelector("input");
  }
  static get observedAttributesExtended() {
    return [
      ["aria-label", "string"],
      ["checked", "boolean"],
      ["disabled", "boolean"],
      ["readonly", "boolean"],
      ["value", "string"]
    ];
  }
  attributeChangedCallbackExtended(name, _oldValue, newValue) {
    this[name] = newValue;
  }
  template() {
    return (
      /*html*/
      `
      <slot class="label hide"></slot>
      <div class="container">
        <input type="checkbox" role="switch">
        <div class="track">
          <div class="thumb-container">
            <div class="thumb">
              <div class="icon icon-on">
                <svg viewBox="0 0 24 24">
                  <path d="M9.55 18.2 3.65 12.3 5.275 10.675 9.55 14.95 18.725 5.775 20.35 7.4Z" />
                </svg>
              </div>
              <div class="icon icon-off">
                <svg viewBox="0 0 24 24">
                  <path d="M6.4 19.2 4.8 17.6 10.4 12 4.8 6.4 6.4 4.8 12 10.4 17.6 4.8 19.2 6.4 13.6 12 19.2 17.6 17.6 19.2 12 13.6Z" />
                </svg>
              </div>

            <wfc-state-layer></wfc-state-layer>
            </div>
          </div>
        </div>
      </div>
    `
    );
  }
  connectedCallback() {
    this.#abort = new AbortController();
    this.#input.value = this.value;
    this.#input.checked = this.checked;
    this.#input.disabled = this.disabled;
    this.#input.required = this.required;
    this.setAttribute("aria-checked", this.#checked.toString());
    util_default.addClickTimeoutEvent(this, this.#click_bound, { signal: this.#abort.signal });
    this.addEventListener("focus", this.#focus_bound, { signal: this.#abort.signal });
    this.shadowRoot.addEventListener("slotchange", this.#slotChange_bound, { signal: this.#abort.signal });
    this.#updateValidity();
  }
  disconnectedCallback() {
    if (this.#abort) this.#abort.abort();
  }
  get value() {
    return this.#value;
  }
  set value(value) {
    this.#value = value;
    this.#input.value = this.#value;
    this.#internals.setFormValue(this.#checked ? this.#value : null, this.#checked ? "checked" : void 0);
  }
  get ariaLabel() {
    return this.#input.ariaLabel;
  }
  set ariaLabel(value) {
    this.#input.ariaLabel = value;
  }
  get checked() {
    return this.#checked;
  }
  set checked(value) {
    this.#checked = value;
    this.#input.checked = this.#checked;
    this.#internals.setFormValue(this.#checked ? this.value : null, this.#checked ? "checked" : void 0);
    this.classList.toggle("checked", this.#checked);
    this.setAttribute("aria-checked", this.#checked.toString());
  }
  get disabled() {
    return this.hasAttribute("disabled");
  }
  set disabled(value) {
    this.toggleAttribute("disabled", value);
    this.#input.toggleAttribute("disabled", value);
  }
  get required() {
    return this.hasAttribute("required");
  }
  set required(value) {
    this.toggleAttribute("required", value);
    this.#input.toggleAttribute("required", value);
  }
  get validationMessage() {
    return this.#internals.validationMessage;
  }
  get validity() {
    return this.#internals.validity;
  }
  get willValidate() {
    return this.#internals.willValidate;
  }
  reset() {
    this.#touched = false;
    this.value = this.getAttribute("value") ?? "";
    this.checked = this.getAttribute("checked");
  }
  formResetCallback() {
    this.reset();
  }
  checkValidity() {
    return this.#internals.checkValidity();
  }
  reportValidity() {
    this.#updateValidityDisplay();
    return this.checkValidity();
  }
  setCustomValidity(value = "") {
    this.#input.setCustomValidity(value);
    this.#updateValidityDisplay();
  }
  #click() {
    this.checked = !this.#checked;
    this.dispatchEvent(new Event("change", { bubbles: true }));
    this.#updateValidity();
    if (this.classList.contains("invalid")) this.#updateValidityDisplay();
  }
  #updateValidity() {
    this.#touched = true;
    this.#internals.setValidity(this.#input.validity, this.#input.validationMessage || "");
  }
  #updateValidityDisplay() {
    this.classList.toggle("invalid", !this.#input.validity.valid);
  }
  #focus() {
    this.addEventListener("blur", this.#blur_bound, { signal: this.#abort.signal });
    this.addEventListener("keydown", this.#focusKeydown_bound, { signal: this.#abort.signal });
  }
  #blur() {
    if (this.#touched) {
      this.#updateValidity();
      this.#updateValidityDisplay();
    }
    this.removeEventListener("blur", this.#blur_bound);
    this.removeEventListener("keydown", this.#focusKeydown_bound);
  }
  #focusKeydown(e) {
    if (e.code === "Space") {
      this.checked = !this.checked;
      if (this.classList.contains("invalid")) this.#updateValidityDisplay();
      this.dispatchEvent(new Event("change", { bubbles: true }));
      this.shadowRoot.querySelector("wfc-state-layer").triggerRipple();
      e.preventDefault();
    }
  }
  #slotChange(event) {
    event.target.classList.remove("hide");
    if (!this.ariaLabel) this.ariaLabel = this.innerText;
  }
};
customElements.define(WFCSwitchElement.tag, WFCSwitchElement);

// ../../webformula/material/src/components/textfield/component.css
var styles11 = new CSSStyleSheet();
styles11.replaceSync(`:host{display:inline-flex;position:relative;outline:none;resize:both;-webkit-tap-highlight-color:rgba(0,0,0,0);margin-bottom:36px}.text-field{display:inline-flex;position:relative;box-sizing:border-box;min-height:56px;padding:8px 16px;resize:inherit;width:100%}.text-field:after{content:"";position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;border-radius:var(--wfc-shape-extra-small-top);border-bottom:1px solid;border-bottom-color:var(--wfc-on-surface-variant);background-color:var(--wfc-surface-container-highest)}:host(:not(.outlined):focus) .text-field:after{height:calc(100% - 1px);border-bottom:2px solid;border-bottom-color:var(--wfc-primary)}.input{display:inline-flex;flex-grow:1;align-self:flex-end;min-height:28px;max-width:100%;min-width:0px;border:none;background:none;outline:none;z-index:1;padding:0;overflow-x:hidden;resize:inherit;text-align:inherit;text-decoration:inherit;text-transform:inherit;font-family:inherit;font-size:var(--wfc-font-large-body-size);font-weight:var(--wfc-font-large-body-weight);line-height:var(--wfc-font-large-body-line-height);letter-spacing:var(--wfc-font-large-body-tracking);color:var(--wfc-on-surface);caret-color:var(--wfc-primary);-webkit-appearance:none;-moz-appearance:none;appearance:none}textarea.input{align-self:auto;box-sizing:border-box;position:relative;min-height:24px;width:100%;margin-top:16px;max-height:100%;overflow:scroll}textarea[rows="1"]{height:24px}.text-field:not(.label) .input{align-self:center}.text-field .input[type=date]{min-width:120px}.text-field .prefix-text,.text-field .suffix-text{font-family:inherit;font-size:var(--wfc-font-large-body-size);font-weight:var(--wfc-font-large-body-weight);line-height:var(--wfc-font-large-body-line-height);letter-spacing:var(--wfc-font-large-body-tracking);color:var(--wfc-on-surface-variant);padding-inline-end:2px;align-self:flex-end;user-select:none;-webkit-user-select:none;opacity:0;text-wrap:nowrap;z-index:1;min-height:26px}.text-field .prefix-text{padding-inline-end:2px}.text-field .suffix-text{padding-inline-start:2px}:host(.raise-label) .prefix-text,:host(:focus) .prefix-text,:host(.has-value) .prefix-text,:host(.raise-label) .suffix-text,:host(:focus) .suffix-text,:host(.has-value) .suffix-text{opacity:1}.text-field .input::-webkit-search-decoration,.text-field .input::-webkit-search-cancel-button{display:none;-webkit-appearance:none}:host(:not(.outlined)) .text-field .input:-webkit-autofill,:host(:not(.outlined)) .text-field .input:-webkit-autofill:hover,:host(:not(.outlined)) .text-field .input:-webkit-autofill:focus,:host(:not(.outlined)) .text-field .input:-webkit-autofill:active{-webkit-box-shadow:0 0 0 30px var(--wfc-surface-variant) inset!important}:host(.outlined) .text-field .input:-webkit-autofill,:host(.outlined) .text-field .input:-webkit-autofill:hover,:host(.outlined) .text-field .input:-webkit-autofill:focus,:host(.outlined) .text-field .input:-webkit-autofill:active{transition:background-color 9999s ease-in-out 0s}.input{resize:none}:host(:not(.hide-date-icon)) .text-field:not(.has-picker) .input[type=date]::-webkit-calendar-picker-indicator,:host(:not(.hide-time-icon)) .text-field:not(.has-picker) .input[type=time]::-webkit-calendar-picker-indicator{width:20px;transform:translate(4px,-5px);opacity:0}:host(:not(.hide-date-icon)) .text-field:not(.has-picker) .input[type=date]:before,:host(:not(.hide-time-icon)) .text-field:not(.has-picker) .input[type=time]:before{content:"";position:absolute;top:16px;right:17px;width:24px;height:24px;mask-size:cover;background-color:var(--wfc-on-surface-variant)}:host(:not(.hide-date-icon)) .text-field:not(.has-picker) .input[type=date]:before{mask:url(data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20height%3D%2224%22%20viewBox%3D%220%20-960%20960%20960%22%20width%3D%2224%22%3E%3Cpath%20d%3D%22M200-80q-33%200-56.5-23.5T120-160v-560q0-33%2023.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33%200%2056.5%2023.5T840-720v560q0%2033-23.5%2056.5T760-80H200Zm0-80h560v-400H200v400Zm0-480h560v-80H200v80Zm0%200v-80%2080Z%22%2F%3E%3C%2Fsvg%3E)}:host(:not(.hide-time-icon)) .text-field:not(.has-picker) .input[type=time]:before{mask:url(data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20height%3D%2224%22%20viewBox%3D%220%20-960%20960%20960%22%20width%3D%2224%22%3E%3Cpath%20d%3D%22m612-292%2056-56-148-148v-184h-80v216l172%20172ZM480-80q-83%200-156-31.5T197-197q-54-54-85.5-127T80-480q0-83%2031.5-156T197-763q54-54%20127-85.5T480-880q83%200%20156%2031.5T763-763q54%2054%2085.5%20127T880-480q0%2083-31.5%20156T763-197q-54%2054-127%2085.5T480-80Zm0-400Zm0%20320q133%200%20226.5-93.5T800-480q0-133-93.5-226.5T480-800q-133%200-226.5%2093.5T160-480q0%20133%2093.5%20226.5T480-160Z%22%2F%3E%3C%2Fsvg%3E)}:host(.hide-date-icon) .input[type=date]::-webkit-clear-button,:host(.hide-date-icon) .input[type=date]::-webkit-calendar-picker-indicator,.has-picker .input[type=date]::-webkit-clear-button,.has-picker .input[type=date]::-webkit-calendar-picker-indicator,:host(.hide-time-icon) .input[type=time]::-webkit-clear-button,:host(.hide-time-icon) .input[type=time]::-webkit-calendar-picker-indicator,.has-picker .input[type=time]::-webkit-clear-button,.has-picker .input[type=time]::-webkit-calendar-picker-indicator{display:none}.text-field label{position:absolute;text-align:left;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;cursor:text;z-index:1;pointer-events:none;top:15px;max-width:calc(100% - 20px);font-size:var(--wfc-font-large-body-size);font-weight:var(--wfc-font-large-body-weight);line-height:var(--wfc-font-large-body-line-height);letter-spacing:var(--wfc-font-large-body-tracking);text-decoration:inherit;text-transform:inherit;color:var(--wfc-on-surface-variant);transform-origin:left top;animation:wfc-textfield-label-reverse;animation-duration:var(--wfc-motion-duration-short3);animation-timing-function:var(--wfc-motion-easing-standard)}.text-field.trailing-icon label,:host(.invalid) .text-field label{max-width:calc(100% - 52px)}.text-field.leading-icon label{max-width:calc(100% - 52px)}.text-field.leading-icon.trailing-icon label{max-width:calc(100% - 84px)}:host(:focus:not(.invalid)) .text-field label{color:var(--wfc-primary)}.text-field .input::placeholder{font-size:var(--wfc-font-large-body-size);font-weight:var(--wfc-font-large-body-weight);line-height:var(--wfc-font-large-body-line-height);letter-spacing:var(--wfc-font-large-body-tracking);color:var(--wfc-on-surface-variant-alpha-76)}:host(.raise-label) .text-field label,:host(:focus) .text-field label,.text-field .input:not([placeholder=" "])+label,.text-field .input:not(:placeholder-shown)+label{font-size:var(--wfc-font-small-body-size);top:4px;animation:wfc-textfield-label;animation-duration:var(--wfc-motion-duration-short3);animation-timing-function:var(--wfc-motion-easing-standard)}.text-field label.no-animation{animation-duration:0ms!important}:host .text-field slot[name=leading-icon]::slotted(wfc-icon){margin-right:16px;margin-left:-4px}:host .text-field slot[name=trailing-icon]::slotted(wfc-icon){margin-left:16px}::slotted(wfc-icon){z-index:1;color:var(--wfc-on-surface-variant);align-self:center}.text-field .invalid-icon{position:absolute;right:16px;width:24px;height:24px;z-index:1;align-self:center}.text-field.leading-icon .suggestion,.text-field.leading-icon label{margin-left:36px}.text-field .supporting-text{position:absolute;top:calc(100% + 4px);font-size:var(--wfc-font-small-body-size);font-weight:var(--wfc-font-small-body-weight);line-height:var(--wfc-font-small-body-line-height);letter-spacing:var(--wfc-font-small-body-tracking);color:var(--wfc-on-surface-variant);text-overflow:ellipsis;max-height:30px;overflow:hidden;-webkit-line-clamp:2;-webkit-box-orient:vertical;display:-webkit-box}.text-field .character-count{position:absolute;top:calc(100% + 4px);right:16px;font-size:var(--wfc-font-small-body-size);font-weight:var(--wfc-font-small-body-weight);line-height:var(--wfc-font-small-body-line-height);letter-spacing:var(--wfc-font-small-body-tracking);color:var(--wfc-on-surface-variant)}:host([disabled]),:host([readonly]) .text-field slot{pointer-events:none}:host([readonly]){pointer-events:initial}:host([disabled]) .text-field:after{height:100%;border-bottom:1px solid;border-bottom-color:var(--wfc-on-surface-alpha-38);background-color:var(--wfc-on-surface-alpha-4)}:host([disabled]) .text-field label,:host([disabled]) .text-field .input,:host([disabled]) .text-field .input::placeholder,:host([disabled]) .text-field .supporting-text{color:var(--wfc-on-surface-alpha-38)}:host([disabled]) slot::slotted(wfc-icon){color:var(--wfc-on-surface-variant-alpha-38)}.input[type=number]::-webkit-outer-spin-button,.input[type=number]::-webkit-inner-spin-button{display:none}:host(.outlined) .text-field:after{border-radius:var(--wfc-shape-extra-small);border:none;background-color:unset}:host(.outlined) .text-field .input{align-self:center}:host(.outlined) .text-field label{transform-origin:left top;animation:wfc-textfield-label-outlined-reverse var(--wfc-motion-duration-short3);animation-timing-function:var(--wfc-motion-easing-standard)}:host(.outlined.raise-label) .text-field label,:host(.outlined:focus) .text-field label,:host(.outlined) .text-field .input:not([placeholder=" "])+label,:host(.outlined) .text-field .input:not(:placeholder-shown)+label{font-size:var(--wfc-font-small-body-size);top:-12px;left:14px;animation:wfc-textfield-label-outlined var(--wfc-motion-duration-short3);animation-timing-function:var(--wfc-motion-easing-standard)}.text-field .outlined-border-container{display:flex;position:absolute;top:0;right:0;left:0;box-sizing:border-box;width:100%;max-width:100%;height:100%;text-align:left;pointer-events:none}.text-field .outlined-border-container .outlined-leading{box-sizing:border-box;border-radius:var(--wfc-shape-extra-small) 0 0 var(--wfc-shape-extra-small);border-left:1px solid;border-right:none;width:12px;height:99.2%;border-top:1px solid;border-bottom:1px solid;pointer-events:none;border-color:var(--wfc-outline)}.text-field .outlined-border-container .outlined-notch{box-sizing:border-box;flex:0 0 auto;max-width:0px;height:99.2%;border-bottom:1px solid;pointer-events:none;border-color:var(--wfc-outline);transition:max-width .12s;font-size:var(--wfc-font-small-body-size);font-weight:var(--wfc-font-large-body-weight);line-height:var(--wfc-font-large-body-line-height);letter-spacing:var(--wfc-font-large-body-tracking);text-decoration:inherit;text-transform:inherit;user-select:none;-webkit-user-select:none;color:transparent}.text-field .outlined-border-container .outlined-notch.no-animation{transition-duration:0ms!important}:host(.outlined.raise-label) .outlined-border-container .outlined-notch,:host(.outlined:focus) .outlined-border-container .outlined-notch,:host(.outlined) .text-field .input:not([placeholder=" "])~.outlined-border-container .outlined-notch,:host(.outlined) .text-field .input:not(:placeholder-shown)~.outlined-border-container .outlined-notch{max-width:calc(100% - 24px);padding-right:4px}.text-field .outlined-border-container .outlined-trailing{box-sizing:border-box;border-left:none;border-right:1px solid;border-radius:0 var(--wfc-shape-extra-small) var(--wfc-shape-extra-small) 0;flex-grow:1;height:99.2%;border-top:1px solid;border-bottom:1px solid;pointer-events:none;border-color:var(--wfc-outline)}:host(:focus) .text-field .outlined-border-container .outlined-leading,:host(:focus) .text-field .outlined-border-container .outlined-notch,:host(:focus) .text-field .outlined-border-container .outlined-trailing{border-width:2px;border-color:var(--wfc-primary)}.text-field.leading-icon .outlined-border-container .outlined-leading{width:47px}.text-field .suggestion{position:absolute;top:22px;left:0;box-sizing:border-box;border:none;background:none;outline:none;opacity:.5;z-index:1;pointer-events:none;user-select:none;-webkit-user-select:none;text-decoration:inherit;text-transform:inherit;font-size:var(--wfc-font-large-body-size);font-weight:var(--wfc-font-large-body-weight);line-height:var(--wfc-font-large-body-line-height);letter-spacing:var(--wfc-font-large-body-tracking)}:host(.invalid:not(:hover)) .text-field:after,:host(:not(.outlined).invalid:focus) .text-field:after{border-bottom-color:var(--wfc-error)}:host(.invalid:not(:hover)) .text-field .input,:host(.invalid:focus) .text-field .input{caret-color:var(--wfc-error);color:var(--wfc-on-surface)}:host(.invalid:not(:hover)) .text-field label,:host(.invalid:focus) .text-field label{color:var(--wfc-error)}:host(.invalid) .text-field .supporting-text{color:var(--wfc-error)}:host(:not(:hover)) .text-field .invalid-icon svg,:host(:focus) .text-field .invalid-icon svg{fill:var(--wfc-error)}:host(.invalid:not(:hover)) .text-field .outlined-border-container .outlined-leading,:host(.invalid:not(:hover)) .text-field .outlined-border-container .outlined-notch,:host(.invalid:not(:hover)) .text-field .outlined-border-container .outlined-trailing,:host(.invalid:focus) .text-field .outlined-border-container .outlined-leading,:host(.invalid:focus) .text-field .outlined-border-container .outlined-notch,:host(.invalid:focus) .text-field .outlined-border-container .outlined-trailing{border-color:var(--wfc-error)}:host(.invalid) .text-field slot[name=trailing-icon]{visibility:hidden}@keyframes wfc-textfield-label{0%{top:15px;font-size:var(--wfc-font-large-body-size);transform:scale(1)}to{top:7px;font-size:var(--wfc-font-large-body-size);transform:scale(.8)}}@keyframes wfc-textfield-label-reverse{0%{top:7px;font-size:var(--wfc-font-large-body-size);transform:scale(.8)}to{top:15px;font-size:var(--wfc-font-large-body-size);transform:scale(1)}}@keyframes wfc-textfield-label-outlined{0%{top:15px;left:16px;font-size:var(--wfc-font-large-body-size);transform:scale(1)}to{top:-9px;left:14px;font-size:var(--wfc-font-large-body-size);transform:scale(.8)}}@keyframes wfc-textfield-label-outlined-reverse{0%{top:-9px;left:14px;font-size:var(--wfc-font-large-body-size);transform:scale(.8)}to{top:15px;left:16px;font-size:var(--wfc-font-large-body-size);transform:scale(1)}}
`);
var component_default7 = styles11;

// ../../webformula/material/src/components/textfield/Formatter.js
var replaceStringGroupRegex = /(\$[\d\&])/;
var regexGroupMatcher = /(\((?:\?\<\w+\>)?([^\)]+)\)\??)/g;
var navigationKeys = [
  "Backspace",
  "Delete",
  "Shift",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Tab"
];
var Formatter = class {
  #textfield;
  #input;
  #rawValue = "";
  #displayValue = "";
  #formattedValue = "";
  #maskedValue = "";
  #patternString;
  #pattern;
  #partialParser;
  #parser;
  #format;
  #formatParts;
  #formatSplitter;
  #mask;
  #maskParts;
  #initialized = false;
  #disabled = true;
  #keyDown_bound = this.#keyDown.bind(this);
  #paste_bound = this.#paste.bind(this);
  #onBlur_bound = this.#onBlur.bind(this);
  #inputCallback;
  #patternRestrict = false;
  constructor(textfield) {
    this.#textfield = textfield;
    this.#initialize();
  }
  get value() {
    return this.#rawValue;
  }
  set value(value) {
    this.#rawValue = value;
    if (this.#disabled) return;
    this.#input.value = value;
    this.#updateValidity();
  }
  get formattedValue() {
    return this.#formattedValue;
  }
  get maskedValue() {
    return this.#maskedValue;
  }
  get displayValue() {
    return this.#displayValue;
  }
  get pattern() {
    return this.#patternString;
  }
  set pattern(value) {
    this.#patternString = value;
    this.#setPattern();
  }
  get patternRestrict() {
    return this.#patternRestrict;
  }
  set patternRestrict(value) {
    this.#patternRestrict = value;
  }
  parseStructureRegex(structureRegexString) {
    const simplifiedRegexString = this.simplifyGroupRegexString(structureRegexString);
    const regexString = `^${simplifiedRegexString}$`;
    const regex = new RegExp(regexString);
    const structureRegex = new RegExp(`^${structureRegexString}$`);
    return {
      regex,
      regexString,
      structureRegex,
      structureRegexString
    };
  }
  // remove new group matcher features that are not supported by all platforms
  simplifyGroupRegexString(regexString) {
    return regexString.replace(/\(\?\<\w+\>([^\)]+)\)/g, (_match, value) => {
      return `(${value})`;
    });
  }
  get format() {
    return this.#format;
  }
  set format(value) {
    this.#format = value;
    this.#buildFormat();
  }
  get mask() {
    return this.#mask;
  }
  set mask(value) {
    this.#mask = value;
    this.#buildMask();
  }
  set onInput(callback = () => {
  }) {
    if (typeof callback !== "function") this.#inputCallback = void 0;
    else this.#inputCallback = callback;
  }
  #onInput() {
    if (this.#inputCallback) this.#inputCallback();
  }
  async enable() {
    if (!this.#disabled) return;
    this.#disabled = false;
    if (!this.#format) return;
    if (!this.#pattern) throw Error("Must set pattern before enabling");
    this.#input.addEventListener("keydown", this.#keyDown_bound);
    this.#input.addEventListener("paste", this.#paste_bound);
    this.#textfield.addEventListener("blur", this.#onBlur_bound);
  }
  disable() {
    if (this.#disabled) return;
    this.#disabled = true;
    this.#input.removeEventListener("keydown", this.#keyDown_bound);
    this.#input.removeEventListener("paste", this.#paste_bound);
    this.#textfield.removeEventListener("blur", this.#onBlur_bound);
  }
  async #initialize() {
    if (this.#initialized) return;
    this.#initialized = true;
    this.#input = this.#textfield.shadowRoot.querySelector("input");
    this.#buildFormat();
    this.#buildMask();
    this.#setPattern();
    const that = this;
    const inputDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    Object.defineProperty(this.#input, "value", {
      get: function() {
        return that.#rawValue;
      },
      set: function(value) {
        value = that.#valueSetter(value);
        return inputDescriptor.set.call(this, value);
      }
    });
  }
  #buildFormat() {
    if (!this.#format) {
      this.#formatParts = void 0;
      this.#formatSplitter = void 0;
      return;
    }
    const formatParts = this.#format.split(replaceStringGroupRegex);
    if (this.#format[0] === "" && this.#format[0] !== formatParts[0]) formatParts.splice(0, 1);
    if (this.#format[this.#format.length - 1] !== formatParts[formatParts.length - 1]) formatParts.splice(-1);
    this.#formatParts = formatParts;
    this.#formatSplitter = formatParts.filter((v) => v.match(replaceStringGroupRegex)).join("_:_");
  }
  #buildMask() {
    this.#setPattern();
    if (!this.#mask) {
      this.#maskParts = void 0;
      return;
    }
    const maskParts = this.#mask.split(replaceStringGroupRegex);
    if (maskParts[0] === "" && this.#mask[0] !== maskParts[0]) maskParts.splice(0, 1);
    if (this.#mask[this.#mask.length - 1] !== maskParts[maskParts.length - 1]) maskParts.splice(-1);
    this.#maskParts = maskParts;
  }
  // add regex slashes and begin and end operators (/^ $/)
  #setPattern() {
    if (!this.#patternString) {
      this.#pattern = void 0;
      this.#parser = void 0;
      this.#partialParser = void 0;
      return;
    }
    if (!this.#mask) this.#input.pattern = this.#patternString;
    else this.#input.removeAttribute("pattern");
    this.#pattern = new RegExp(this.#patternString);
    let i = 0;
    const modified = this.#patternString.replace(regexGroupMatcher, (_match, value) => {
      if (i > 0 && value.slice(-1) !== "?") value += "?";
      i += 1;
      return value;
    });
    this.#parser = new RegExp(`^${modified.replace(/^\//, "").replace(/^\^/, "").replace(/(?<!\\)\$$/, "").replace(/\/$/, "")}`);
    this.#partialParser = this.#partialMatchRegex(this.#patternString);
  }
  // remove characters that do not match
  //  This uses a modified version of he regex that can check per character
  #stripInvalidCharacters(value, chars = "") {
    if (value.length === 0) return value;
    const valid = value.match(this.#partialParser);
    if (valid === null) return this.#stripInvalidCharacters(value.slice(0, value.length - 1), chars += value.slice(-1));
    return value;
  }
  #valueSetter(value) {
    value = value || "";
    if (!this.#parser || !this.#input) {
      this.#rawValue = value;
      return value;
    }
    if (this.#patternRestrict) {
      const stripped = this.#stripInvalidCharacters(value);
      value = stripped;
    }
    const parsed = value.match(this.#parser);
    if (!parsed && this.#mask && this.#checkIfValueIsMask(value)) {
      this.#rawValue = value;
      this.#formattedValue = value;
      this.#displayValue = value;
      return this.#displayValue;
    }
    if (!parsed || !this.#format) {
      this.#rawValue = value;
      this.#formattedValue = value;
      if (this.#mask) this.#maskedValue = this.#maskValue(value, false);
      this.#displayValue = this.#maskValue(value, false);
      return this.#displayValue;
    }
    this.#formattedValue = this.#formatValue(value);
    if (this.#mask) this.#maskedValue = this.#maskValue(this.#formattedValue);
    this.#displayValue = this.#maskedValue || this.#formattedValue;
    this.#rawValue = value;
    return this.#displayValue;
  }
  #checkIfValueIsMask(value) {
    if (!this.#mask) return false;
    if (value.length < this.#mask.length) return false;
    const nonGroupMatches = this.#maskParts.filter((v) => v.match(replaceStringGroupRegex) === null).filter((v) => !value.includes(v)).length;
    return nonGroupMatches === 0;
  }
  #maskValue(value, parsed = true) {
    if (!this.#mask) return value;
    if (!parsed) return this.#mask.slice(0, value.length);
    const masked = value.replace(this.#parser, this.#mask);
    if (masked.length > value.length) return masked.slice(0, value.length);
    return masked;
  }
  #formatValue(value) {
    const parsed = value.match(this.#parser);
    if (!parsed) return value;
    const matchedValue = parsed[0];
    let endMatches = false;
    let matchIndex = 0;
    const leftOvers = value.replace(matchedValue, "");
    const formatGroupMatches = matchedValue.replace(this.#parser, this.#formatSplitter).split("_:_");
    const formatted = this.#formatParts.map((v) => {
      if (endMatches) return;
      if (v.match(replaceStringGroupRegex)) {
        v = formatGroupMatches[matchIndex];
        matchIndex += 1;
        if (v === "") endMatches = true;
      }
      return v;
    }).join("");
    return `${formatted}${leftOvers}`;
  }
  #keyDown(event) {
    if (event.metaKey || event.getModifierState("OS") || event.getModifierState("Win")) return;
    if (event.key === "Enter") return;
    if (!navigationKeys.includes(event.key)) {
      const selection = this.#getSelection();
      const arr = this.#rawValue.split("");
      const start = arr.slice(0, selection.rawStart).join("");
      const end = arr.slice(selection.rawEnd).join("");
      this.#rawValue = `${start}${event.key}${end}`;
      event.target.value = this.#rawValue;
      event.preventDefault();
      if (selection.displayStart !== selection.displayEnd) {
        event.target.selectionStart = selection.displayStart + 1;
        event.target.selectionEnd = selection.displayStart + 1;
      } else if (!selection.isAtEnd) {
        event.target.selectionStart = selection.displayEnd + 1;
        event.target.selectionEnd = selection.displayEnd + 1;
      }
      this.#updateValidity();
      this.#onInput();
    } else if (event.key === "Backspace" || event.key === "Delete") {
      const selection = this.#getSelection();
      if (selection.rawStart !== selection.rawEnd) {
        const arr = this.#rawValue.split("");
        const start = arr.slice(0, selection.rawStart).join("");
        const end = arr.slice(selection.rawEnd).join("");
        this.#rawValue = `${start}${end}`;
      } else {
        this.#rawValue = `${this.#rawValue.slice(0, selection.rawStart - 1)}${this.#rawValue.slice(selection.rawEnd)}`;
      }
      event.target.value = this.#rawValue;
      event.preventDefault();
      if (selection.rawStart !== selection.rawEnd) {
        event.target.selectionStart = selection.displayStart;
        event.target.selectionEnd = selection.displayStart;
      } else {
        event.target.selectionStart = selection.displayStart - 1;
        event.target.selectionEnd = selection.displayStart - 1;
      }
      this.#updateValidity();
      this.#onInput();
    }
  }
  // return selection for display and raw values
  // the raw values length may not be the same as the display because of formatting
  #getSelection() {
    const displayStart = this.#input.selectionStart;
    const displayEnd = this.#input.selectionEnd;
    let rawStart = displayStart;
    let rawEnd = displayEnd;
    const isSelectionAtEnd = rawEnd === this.#displayValue.length;
    let rawIndex = 0;
    const selectCheckValue = this.#mask ? this.#formatValue(this.#rawValue) : this.#displayValue;
    selectCheckValue.slice(0, rawStart).split("").filter((c) => {
      if (c === this.#rawValue[rawIndex]) rawIndex += 1;
    });
    rawStart = rawIndex;
    rawIndex = 0;
    selectCheckValue.slice(0, rawEnd).split("").filter((c) => {
      if (c === this.#rawValue[rawIndex]) rawIndex += 1;
    });
    rawEnd = rawIndex;
    return {
      displayStart,
      displayEnd,
      rawStart,
      rawEnd,
      isAtEnd: isSelectionAtEnd
    };
  }
  #onBlur() {
    this.#updateValidity();
  }
  #paste(event) {
    event.preventDefault();
    const selection = this.#getSelection();
    if (!(event.clipboardData || window.clipboardData)) return;
    const paste = (event.clipboardData || window.clipboardData).getData("text");
    const arr = this.#rawValue.split("");
    const start = arr.slice(0, selection.rawStart).join("");
    const end = arr.slice(selection.rawEnd).join("");
    this.#rawValue = `${start}${paste}${end}`;
    event.target.value = this.#rawValue;
    const previousLength = start.length + end.length + paste.length;
    const lengthDifference = this.#displayValue.length - previousLength;
    event.target.selectionStart = selection.displayStart + paste.length + lengthDifference;
    event.target.selectionEnd = selection.displayStart + paste.length + lengthDifference;
    this.#updateValidity();
    this.#onInput();
  }
  #updateValidity() {
    const valid = this.#rawValue.match(this.#pattern) !== null;
    const hasPatternAttr = this.#input.hasAttribute("pattern");
    if (this.#mask && !hasPatternAttr && !this.#checkIfValueIsMask(this.#rawValue) && !valid) {
      this.#input.setAttribute("pattern", this.#patternString);
    } else if (valid && hasPatternAttr) {
      this.#input.removeAttribute("pattern");
    }
  }
  // build a version of the pattern regex that allows per character partial validation
  // Example: SSN
  //   ^([0-9]{3})[\\- ]?([0-9]{2})[\\- ]?([0-9]{4})$
  //   -> ^((?:[0-9]|$){3}|$)(?:[\- ]|$)?((?:[0-9]|$){2}|$)(?:[\- ]|$)?((?:[0-9]|$){4}|$)$
  #partialMatchRegex(source) {
    let results = "";
    let tmp;
    let i = 0;
    let iAdd;
    let sAdd;
    const bracketMatcher = /\[(?:\\.|.)*?\]/g;
    const curlyBracketMatcher = /\{\d+,?\d*\}/g;
    const p2 = performance.now();
    while (i < source.length) {
      switch (source[i]) {
        case "\\":
          switch (source[i + 1]) {
            case "c":
              iAdd = 3;
              sAdd = `(?:${source.slice(i, i + iAdd)}|$)`;
              break;
            case "x":
              iAdd = 4;
              sAdd = `(?:${source.slice(i, i + iAdd)}|$)`;
              break;
            case "u":
              if (source[i + 2] === "{") iAdd = source.indexOf("}", i) - i + 1;
              else iAdd = 6;
              sAdd = `(?:${source.slice(i, i + iAdd)}|$)`;
              break;
            case "p":
            case "P":
              iAdd = source.indexOf("}", i) - i + 1;
              sAdd = `(?:${source.slice(i, i + iAdd)}|$)`;
              break;
            case "k":
              iAdd = source.indexOf("}", i) - i + 1;
              sAdd = `(?:${source.slice(i, i + iAdd)}|$)`;
              break;
            default:
              iAdd = 2;
              sAdd = `(?:${source.slice(i, i + iAdd)}|$)`;
              break;
          }
          break;
        case "[":
          bracketMatcher.lastIndex = i;
          iAdd = bracketMatcher.exec(source)[0].length;
          sAdd = `(?:${source.slice(i, i + iAdd)}|$)`;
          break;
        case "{":
          curlyBracketMatcher.lastIndex = i;
          tmp = curlyBracketMatcher.exec(source);
          if (tmp) {
            iAdd = tmp[0].length;
            sAdd = source.slice(i, i + iAdd);
          } else {
            iAdd = 1;
            sAdd = `(?:${source.slice(i, i + iAdd)}|$)`;
          }
          break;
        case "(":
          if (source[i + 1] === "?") {
            switch (source[i + 2]) {
              case ":":
                sAdd = "(?:";
                iAdd = 3;
                tmp = this.#partialMatchRegex(source.slice(i + iAdd));
                iAdd += tmp.index;
                sAdd += tmp.results + "|$)";
                break;
              case "=":
                sAdd = "(?=";
                iAdd = 3;
                tmp = this.#partialMatchRegex(source.slice(i + iAdd));
                iAdd += tmp.index;
                sAdd += tmp.results + ")";
                break;
              case "!":
                iAdd = 3;
                iAdd += this.#partialMatchRegex(source.slice(i + iAdd)).index;
                sAdd = source.slice(i, i + iAdd);
                break;
              case "<":
                switch (source[i + 3]) {
                  case "=":
                  case "!":
                    iAdd = 4;
                    iAdd += this.#partialMatchRegex(source.slice(i + iAdd)).index;
                    sAdd = source.slice(i, i + iAdd);
                    break;
                  default:
                    iAdd = source.indexOf(">", i) - i + 1;
                    sAdd = source.slice(i, i + iAdd);
                    tmp = this.#partialMatchRegex(source.slice(i + iAdd));
                    iAdd += tmp.index;
                    sAdd += tmp.results + "|$)";
                    break;
                }
                break;
            }
          } else {
            sAdd = source[i];
            iAdd = 1;
            tmp = this.#partialMatchRegex(source.slice(i + iAdd));
            iAdd += tmp.index;
            sAdd += tmp.results + "|$)";
          }
          break;
        case ")":
          i += 1;
          return {
            results,
            index: i
          };
        default:
          sAdd = source[i];
          iAdd = 1;
          break;
      }
      i += iAdd;
      results += sAdd;
    }
    return new RegExp(results, "v");
  }
};

// ../../webformula/material/src/components/textfield/index.js
var isIncrementalSupported = "incremental" in document.createElement("input");
var inputElement = document.createElement("input");
inputElement.setAttribute("placeholder", " ");
inputElement.classList.add("input");
var textareaElement = document.createElement("textarea");
textareaElement.setAttribute("placeholder", " ");
textareaElement.classList.add("input");
var WFCTextfieldElement = class extends HTMLComponentElement {
  static tag = "wfc-textfield";
  static useShadowRoot = true;
  static useTemplate = true;
  static shadowRootDelegateFocus = true;
  static styleSheets = component_default7;
  static formAssociated = true;
  #internals;
  #input;
  #value;
  #abort;
  #characterCount;
  #errorText = "";
  #formatter;
  #incremental = false;
  #label = "";
  #rows = 1;
  #suggestion;
  #hasSuggestion;
  #supportingText = "";
  #type;
  #invalidIcon;
  #touched = false;
  #focusValue;
  #slotChange_bound = this.#slotChange.bind(this);
  #onInput_bound = this.#onInput.bind(this);
  #onBlur_bound = this.#onBlur.bind(this);
  #onFocus_bound = this.#onFocus.bind(this);
  #onSelect_bound = this.#onSelect.bind(this);
  #dispatchSearch_bound = this.#dispatchSearch.bind(this);
  #onKeydown_bound = this.#onKeydown.bind(this);
  #incrementalPolyfill_debounced = util_default.debounce(this.#dispatchSearch, 300).bind(this);
  constructor() {
    super();
    this.#internals = this.attachInternals();
    this.render();
    const type = this.getAttribute("type");
    const beforeElement = this.shadowRoot.querySelector(".prefix-text");
    if (type === "textarea") beforeElement.insertAdjacentElement("afterend", textareaElement.cloneNode());
    else {
      const el = inputElement.cloneNode();
      el.type = this.getAttribute("type");
      beforeElement.insertAdjacentElement("afterend", el);
    }
    this.#value = this.getAttribute("value");
    this.#input = this.shadowRoot.querySelector(".input");
  }
  static get observedAttributesExtended() {
    return [
      ["aria-label", "string"],
      ["autocomplete", "string"],
      ["character-count", "boolean"],
      ["disabled", "boolean"],
      ["error-text", "string"],
      ["format", "string"],
      ["incremental", "boolean"],
      ["label", "string"],
      ["mask", "string"],
      ["max", "string"],
      ["maxlength", "number"],
      ["min", "string"],
      ["minlength", "number"],
      ["multiple", "boolean"],
      ["pattern-restrict", "boolean"],
      ["pattern", "string"],
      ["placeholder", "string"],
      ["prefix-text", "string"],
      ["readonly", "boolean"],
      ["required", "boolean"],
      ["rows", "number"],
      ["step", "number"],
      ["suffix-text", "string"],
      ["suggestion", "string"],
      ["supporting-text", "string"],
      ["type", "string"],
      ["value", "string"]
    ];
  }
  attributeChangedCallbackExtended(name, _oldValue, newValue) {
    this[name] = newValue;
  }
  connectedCallback() {
    this.#abort = new AbortController();
    this.#input.value = this.value;
    this.#internals.setValidity(this.#input.validity, this.#input.validationMessage, this.#input);
    this.shadowRoot.addEventListener("slotchange", this.#slotChange_bound, { signal: this.#abort.signal });
    this.#input.addEventListener("input", this.#onInput_bound, { signal: this.#abort.signal });
    this.#input.addEventListener("select", this.#onSelect_bound, { signal: this.#abort.signal });
    this.addEventListener("focus", this.#onFocus_bound, { signal: this.#abort.signal });
    this.addEventListener("blur", this.#onBlur_bound, { signal: this.#abort.signal });
    this.addEventListener("keydown", this.#onKeydown_bound, { signal: this.#abort.signal });
    if (this.type === "search") this.#input.addEventListener("search", this.#dispatchSearch_bound, { signal: this.#abort.signal });
    this.#updateCharacterCount();
    this.#addFormatter();
    setTimeout(() => {
      this.shadowRoot.querySelector("label").classList.remove("no-animation");
      this.shadowRoot.querySelector(".outlined-notch").classList.remove("no-animation");
    }, 100);
  }
  disconnectedCallback() {
    if (this.#abort) this.#abort.abort();
  }
  template() {
    return (
      /*html*/
      `
      <div class="text-field">
        <slot name="leading-icon"></slot>
        <div class="prefix-text"></div>

        <label class="no-animation"></label>

        <div class="outlined-border-container">
          <div class="outlined-leading"></div>
          <div class="outlined-notch no-animation">${this.label}</div>
          <div class="outlined-trailing"></div>
        </div>

        <div class="suggestion"></div>
        <span class="suffix-text"></span>
        <slot name="trailing-icon"></slot>
        <div class="supporting-text"></div>
        <div class="character-count"></div>
        <slot name="picker"></slot>
      </div>
    `
    );
  }
  get ariaLabel() {
    return this.#input.ariaLabel;
  }
  set ariaLabel(value) {
    this.#input.ariaLabel = value;
  }
  get autocomplete() {
    return this.getAttribute("autocomplete");
  }
  set autocomplete(value) {
    if (value) this.setAttribute("autocomplete", value);
    else this.removeAttribute("autocomplete");
  }
  get characterCount() {
    return this.#characterCount;
  }
  set characterCount(value) {
    this.#characterCount = !!value;
  }
  get disabled() {
    return this.hasAttribute("disabled");
  }
  set disabled(value) {
    this.toggleAttribute("disabled", value);
    if (value) this.blur();
    this.#input.toggleAttribute("disabled", value);
  }
  get errorText() {
    return this.#errorText;
  }
  set errorText(value) {
    this.#errorText = value || "";
    if (!this.checkValidity()) {
      const el = this.shadowRoot.querySelector(".text-field .supporting-text");
      el.innerText = this.#errorText;
      el.setAttribute("title", this.#errorText);
    }
  }
  get form() {
    return this.#internals.form;
  }
  get format() {
    return this.getAttribute("format");
  }
  set format(value) {
    if (this.#formatter) this.#formatter.format = value;
    this.setAttribute("format", value);
  }
  get formattedValue() {
    return this.#formatter ? this.#formatter.formattedValue : this.value;
  }
  get incremental() {
    return this.#incremental;
  }
  set incremental(value) {
    this.#incremental = value;
    this.#input.incremental = this.#incremental;
  }
  get label() {
    return this.#label || (this.getAttribute("label") || "");
  }
  set label(value) {
    this.#label = value;
    this.shadowRoot.querySelector(".text-field").classList.toggle("label", !!this.#label);
    this.shadowRoot.querySelector("label").innerText = this.#label;
    if (this.classList.contains("outlined")) this.shadowRoot.querySelector(".outlined-notch").innerText = this.#label;
    if (!this.ariaLabel) this.ariaLabel = this.#label;
  }
  get mask() {
    return this.getAttribute("mask");
  }
  set mask(value) {
    if (this.#formatter) this.#formatter.mask = value;
    this.setAttribute("mask", value);
  }
  get maskedValue() {
    return this.#formatter ? this.#formatter.maskedValue : this.value;
  }
  get max() {
    return this.getAttribute("max");
  }
  set max(value) {
    this.setAttribute("max", value);
    this.#input.setAttribute("max", value);
  }
  get maxlength() {
    return this.getAttribute("maxlength");
  }
  set maxlength(value) {
    this.setAttribute("maxlength", value);
    this.#input.setAttribute("maxlength", value);
  }
  get min() {
    return this.getAttribute("min");
  }
  set min(value) {
    this.setAttribute("min", value);
    this.#input.setAttribute("min", value);
  }
  get minlength() {
    return this.getAttribute("minlength");
  }
  set minlength(value) {
    this.setAttribute("minlength", value);
    this.#input.setAttribute("minlength", value);
  }
  get multiple() {
    return this.hasAttribute("multiple");
  }
  set multiple(value) {
    this.toggleAttribute("multiple", value);
    this.#input.toggleAttribute("multiple", value);
  }
  get patternRestrict() {
    return this.getAttribute("pattern-restrict");
  }
  set patternRestrict(value) {
    if (this.#formatter) this.#formatter.patternRestrict = value;
    this.toggleAttribute("pattern", value);
  }
  get pattern() {
    return this.getAttribute("pattern");
  }
  set pattern(value) {
    if (this.#formatter) {
      if (value) {
        this.#formatter.pattern = value;
        this.#formatter.enable();
        this.#formatter.value = this.#value;
      } else this.#formatter.disable();
    }
    if (this.#formatter && !value) this.#formatter.disable();
    this.setAttribute("pattern", value);
    this.#input.setAttribute("pattern", value);
  }
  get placeholder() {
    return this.getAttribute("placeholder");
  }
  set placeholder(value) {
    if (value) this.setAttribute("placeholder", value);
    else this.removeAttribute("placeholder");
    this.#input.setAttribute("placeholder", value || " ");
  }
  get prefixText() {
    return this.getAttribute("prefix-text");
  }
  set prefixText(value) {
    this.setAttribute("prefix-text", value);
    this.shadowRoot.querySelector(".prefix-text").innerText = value || "";
  }
  get readonly() {
    return this.hasAttribute("readonly");
  }
  set readonly(value) {
    this.toggleAttribute("readonly", value);
    if (value) this.blur();
    this.#input.toggleAttribute("readonly", value);
  }
  get required() {
    return this.hasAttribute("required");
  }
  set required(value) {
    this.toggleAttribute("required", value);
    this.#input.toggleAttribute("required", value);
  }
  get rows() {
    return this.#rows;
  }
  set rows(value) {
    this.#rows = value;
    if (this.getAttribute("type") === "textarea") this.#input.setAttribute("rows", value || 1);
  }
  get selectionDirection() {
    return this.#input?.selectionDirection || 0;
  }
  set selectionDirection(value = 0) {
    this.#input.selectionDirection = value;
  }
  get selectionEnd() {
    return this.#input?.selectionEnd || 0;
  }
  set selectionEnd(value = 0) {
    this.#input.selectionEnd = value;
  }
  get selectionStart() {
    return this.#input?.selectionStart || 0;
  }
  set selectionStart(value = 0) {
    this.#input.selectionStart = value;
  }
  get step() {
    return this.getAttribute("step");
  }
  set step(value) {
    this.setAttribute("step", value);
    this.#input.setAttribute("step", value);
  }
  get suffixText() {
    return this.getAttribute("suffix-text");
  }
  set suffixText(value) {
    this.setAttribute("suffix-text", value);
    this.shadowRoot.querySelector(".suffix-text").innerText = value || "";
  }
  get suggestion() {
    return this.#suggestion;
  }
  set suggestion(value) {
    this.#suggestion = value;
    this.#setSuggestion();
  }
  get supportingText() {
    return this.#supportingText;
  }
  set supportingText(value) {
    this.#supportingText = value || "";
    if (!this.#errorText || this.checkValidity()) {
      const el = this.shadowRoot.querySelector(".text-field .supporting-text");
      el.innerText = this.#supportingText;
      el.setAttribute("title", this.#supportingText);
    }
  }
  get type() {
    return this.getAttribute("type");
  }
  set type(value) {
    this.#type = value;
    this.setAttribute("type", value);
    if (this.type === "search" && this.#abort) this.#input.addEventListener("search", this.#dispatchSearch_bound, { signal: this.#abort.signal });
  }
  get value() {
    if (this.#formatter) return this.#formatter.value;
    return this.#value;
  }
  set value(value) {
    if (this.#formatter) {
      this.#formatter.value = value;
      this.#value = this.#formatter.value;
    } else {
      this.#value = value;
      this.#input.value = this.#value;
    }
    this.#internals.setFormValue(this.#value);
    this.classList.toggle("has-value", !!this.#value);
    this.#updateCharacterCount();
  }
  get validationMessage() {
    return this.#internals.validationMessage;
  }
  get validity() {
    return this.#internals.validity;
  }
  get willValidate() {
    return this.#internals.willValidate;
  }
  clear() {
    this.value = "";
  }
  reset() {
    this.#touched = false;
    this.value = this.getAttribute("value") ?? "";
    this.#updateValidity();
    this.#updateValidityDisplay(true);
  }
  formResetCallback() {
    this.reset();
  }
  checkValidity() {
    return this.#internals.checkValidity();
  }
  reportValidity() {
    this.#updateValidityDisplay();
    return this.checkValidity();
  }
  updateValidity() {
    this.#updateValidity();
  }
  setCustomValidity(value = "") {
    this.#input.setCustomValidity(value);
    this.#updateValidityDisplay();
  }
  select() {
    this.#input.select();
  }
  setRangeText(replacement, start, end, selectMode) {
    this.#input.setRangeText(replacement, start, end, selectMode);
  }
  setSelectionRange(selectionStart, selectionEnd, selectionDirection) {
    this.#input.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
  }
  #updateValidity() {
    this.#touched = true;
    this.#internals.setFormValue(this.#input.value);
    this.#internals.setValidity(this.#input.validity, this.#input.validationMessage, this.#input);
  }
  #updateValidityDisplay(valid = this.#input.checkValidity()) {
    this.classList.toggle("invalid", !valid);
    if (!valid) {
      if (!this.#invalidIcon) {
        this.#invalidIcon = document.createElement("div");
        this.#invalidIcon.classList.add("invalid-icon");
        this.#invalidIcon.innerHTML = error_FILL1_wght400_GRAD0_opsz24;
      }
      this.shadowRoot.querySelector(".text-field").appendChild(this.#invalidIcon);
    } else if (this.#invalidIcon) {
      this.#invalidIcon.remove();
    }
    this.#setSupportingText(valid);
  }
  #setSupportingText(valid = this.checkValidity()) {
    const supportingTextElement = this.shadowRoot.querySelector(".text-field .supporting-text");
    const value = valid ? this.#supportingText : this.#errorText || this.#input.validationMessage;
    supportingTextElement.innerText = value;
    supportingTextElement.setAttribute("title", value);
  }
  #addFormatter() {
    if (!this.#formatter && this.pattern) {
      this.#formatter = new Formatter(this);
      this.#formatter.pattern = this.pattern;
      if (this.mask) this.#formatter.mask = this.mask;
      if (this.format) this.#formatter.format = this.format;
      this.#formatter.onInput = this.#onFormatterInput.bind(this);
      this.#formatter.patternRestrict = this.hasAttribute("pattern-restrict");
      this.#formatter.enable();
      this.#formatter.value = this.#value;
    }
  }
  #setSuggestion() {
    if (typeof this.#suggestion !== "string") return;
    const suggestionElement = this.shadowRoot.querySelector(".text-field .suggestion");
    const match = this.#suggestion.match(new RegExp(`^${this.#input.value}(.*)`, "i"));
    const value = !match || match[0] === match[1] ? "" : match[1];
    this.#hasSuggestion = !!value;
    suggestionElement.innerText = value;
    const offset = util_default.getTextWidthFromInput(this.#input);
    suggestionElement.style.left = `${offset + 16}px`;
  }
  #updateCharacterCount() {
    if (!this.#characterCount) return;
    const count = (this.#value || "").length;
    const display = !!this.maxlength ? `${count}/${this.maxlength}` : `${!count ? "" : count}`;
    this.shadowRoot.querySelector(".character-count").innerText = display;
  }
  #onKeydown(event) {
    const tab = event.code === "Tab";
    if (this.#hasSuggestion && tab) {
      this.value = this.#suggestion;
      this.#setSuggestion();
      event.preventDefault();
    }
  }
  #updateTextareaHeight() {
    this.#input.style.height = "auto";
    let height = this.#input.scrollHeight;
    if (height <= 40) height -= 28;
    this.#input.style.height = `${height}px`;
    if (this.#input.offsetHeight < this.#input.scrollHeight) this.#input.style.height = `${this.#input.offsetHeight - 16}px`;
  }
  #onFocus() {
    if (this.readonly) return;
    this.#focusValue = this.value;
  }
  #onBlur() {
    if (this.readonly) return;
    if (this.#touched) {
      this.#updateValidity();
      this.#updateValidityDisplay();
    }
    if (this.value !== this.#focusValue) this.dispatchEvent(new Event("change", { bubbles: true }));
    this.classList.toggle("has-value", !!this.value);
  }
  #onSelect() {
    this.dispatchEvent(new Event("select", { bubbles: true }));
  }
  #dispatchSearch() {
    this.dispatchEvent(new Event("search", {
      bubbles: true,
      composed: true
    }));
  }
  #slotChange(event) {
    if (event.target.name === "leading-icon") {
      const hasLeadingIcon = event.target.assignedElements({ flatten: true }).length > 0;
      this.shadowRoot.querySelector(".text-field").classList.toggle("leading-icon", hasLeadingIcon);
    }
    if (event.target.name === "trailing-icon") {
      const hasTrailingIcon = event.target.assignedElements({ flatten: true }).length > 0;
      this.shadowRoot.querySelector(".text-field").classList.toggle("trailing-icon", hasTrailingIcon);
    }
    if (event.target.name === "picker") {
      if ([...event.target.assignedElements()].find((e) => e.nodeName === "WFC-TIME-PICKER" || e.nodeName === "WFC-DATE-PICKER" || e.nodeName === "WFC-DATE-RANGE-PICKER")) {
        this.shadowRoot.querySelector(".text-field").classList.add("has-picker");
      }
    }
  }
  #onInput() {
    this.#value = this.#input.value;
    this.#setSuggestion();
    this.#updateValidity();
    this.#updateCharacterCount();
    if (this.type === "textarea") this.#updateTextareaHeight();
    if (this.classList.contains("invalid")) this.#updateValidityDisplay();
    if (this.#type === "search" && this.#incremental && !isIncrementalSupported) this.#incrementalPolyfill_debounced();
  }
  #onFormatterInput() {
    const changed = this.#value !== this.#formatter.value;
    this.#value = this.#formatter.value;
    this.#updateValidity();
    if (this.classList.contains("invalid")) this.#updateValidityDisplay();
    if (changed) this.dispatchEvent(new Event("input", { bubbles: true }));
  }
};
customElements.define(WFCTextfieldElement.tag, WFCTextfieldElement);

// docs/app.js
enableSPA();
var routeModule_404 = Promise.resolve().then(() => (init__(), __exports));
var routeModule_binding = Promise.resolve().then(() => (init_binding(), binding_exports));
var routeModule_build = Promise.resolve().then(() => (init_build(), build_exports));
var routeModule_gettingstarted = Promise.resolve().then(() => (init_getting_started(), getting_started_exports));
var routeModule_routing = Promise.resolve().then(() => (init_routing(), routing_exports));
var routeModule_multilanguage = Promise.resolve().then(() => (init_multi_language(), multi_language_exports));
var routeModule_index = Promise.resolve().then(() => (init_index(), index_exports));
var routeModule_fetcher = Promise.resolve().then(() => (init_fetcher(), fetcher_exports));
var routeModule_templates = Promise.resolve().then(() => (init_templates(), templates_exports));
var routeModule_webcomponent = Promise.resolve().then(() => (init_web_component(), web_component_exports));
routes([
  {
    path: "/404",
    regex: /^\/404(\?([^#]*))?(#(.*))?$/,
    hash: 1451689,
    component: routeModule_404,
    notFound: true
  },
  {
    path: "/binding",
    regex: /^\/binding(\?([^#]*))?(#(.*))?$/,
    hash: 199486326,
    component: routeModule_binding
  },
  {
    path: "/build",
    regex: /^\/build(\?([^#]*))?(#(.*))?$/,
    hash: 1439665055,
    component: routeModule_build
  },
  {
    path: "/getting started",
    regex: /^\/getting(?:[\s-]|%20)started(\?([^#]*))?(#(.*))?$/,
    hash: 2036554646,
    component: routeModule_gettingstarted
  },
  {
    path: "/routing",
    regex: /^\/routing(\?([^#]*))?(#(.*))?$/,
    hash: 1693359543,
    component: routeModule_routing
  },
  {
    path: "/multi language",
    regex: /^\/multi(?:[\s-]|%20)language(\?([^#]*))?(#(.*))?$/,
    hash: -1112805298,
    component: routeModule_multilanguage
  },
  {
    path: "/",
    regex: /^\/(\?([^#]*))?(#(.*))?$/,
    hash: 47,
    component: routeModule_index
  },
  {
    path: "/fetcher",
    regex: /^\/fetcher(\?([^#]*))?(#(.*))?$/,
    hash: -654472744,
    component: routeModule_fetcher
  },
  {
    path: "/templates",
    regex: /^\/templates(\?([^#]*))?(#(.*))?$/,
    hash: 1335527402,
    component: routeModule_templates
  },
  {
    path: "/web component",
    regex: /^\/web(?:[\s-]|%20)component(\?([^#]*))?(#(.*))?$/,
    hash: -1795164318,
    component: routeModule_webcomponent
  }
]);
window.litheRoutes = [{
  path: "/404",
  regex: /^\/404(\?([^#]*))?(#(.*))?$/,
  hash: 1451689,
  component: routeModule_404,
  notFound: true
}, {
  path: "/binding",
  regex: /^\/binding(\?([^#]*))?(#(.*))?$/,
  hash: 199486326,
  component: routeModule_binding
}, {
  path: "/build",
  regex: /^\/build(\?([^#]*))?(#(.*))?$/,
  hash: 1439665055,
  component: routeModule_build
}, {
  path: "/getting started",
  regex: /^\/getting(?:[\s-]|%20)started(\?([^#]*))?(#(.*))?$/,
  hash: 2036554646,
  component: routeModule_gettingstarted
}, {
  path: "/routing",
  regex: /^\/routing(\?([^#]*))?(#(.*))?$/,
  hash: 1693359543,
  component: routeModule_routing
}, {
  path: "/multi language",
  regex: /^\/multi(?:[\s-]|%20)language(\?([^#]*))?(#(.*))?$/,
  hash: -1112805298,
  component: routeModule_multilanguage
}, {
  path: "/",
  regex: /^\/(\?([^#]*))?(#(.*))?$/,
  hash: 47,
  component: routeModule_index
}, {
  path: "/fetcher",
  regex: /^\/fetcher(\?([^#]*))?(#(.*))?$/,
  hash: -654472744,
  component: routeModule_fetcher
}, {
  path: "/templates",
  regex: /^\/templates(\?([^#]*))?(#(.*))?$/,
  hash: 1335527402,
  component: routeModule_templates
}, {
  path: "/web component",
  regex: /^\/web(?:[\s-]|%20)component(\?([^#]*))?(#(.*))?$/,
  hash: -1795164318,
  component: routeModule_webcomponent
}];
if (typeof hljs === "undefined") {
  const hljsTag = document.querySelector("#hljsscript");
  hljsTag.onload = () => {
    initHLJS();
  };
} else {
  window.addEventListener("DOMContentLoaded", () => {
    initHLJS();
  });
}
function initHLJS() {
  hljs.configure({ ignoreUnescapedHTML: true });
  hljs.highlightAll();
}
window.addEventListener("load", () => {
  if (location.hash) handleHashAnchor(location.hash, false);
});
window.addEventListener("locationchange", () => {
  hljs.highlightAll();
  if (!location.hash) return;
  handleHashAnchor(location.hash, false);
});
window.addEventListener("hashchange", () => {
  if (!location.hash) return;
  handleHashAnchor(location.hash);
});
function handleHashAnchor(hash2, animate = true) {
  try {
    const element2 = document.querySelector(hash2);
    if (element2) {
      if (animate) document.documentElement.scroll({ top: element2.offsetTop, behavior: "smooth" });
      else document.documentElement.scroll({ top: element2.offsetTop });
    }
  } catch {
    console.log("error");
  }
}
