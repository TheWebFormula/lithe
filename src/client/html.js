import { isSignal, isSignalObject, Compute, beginTemplating, endTemplating, HTMLCOMPUTE } from './signal.js';
import { policyHTML } from './policy.js';

// TODO Should i add auto setting of signals like value=${this.signal}

let stackSize = 0;
const maxStack = 10_000;
const expressionStr = '{_ex_}';
let templateCache = new Map();
let signalNodeRefs = new WeakMap();
let signalBooleanAttrNodeRefs = new Map();
let attributeAndCommentData = new WeakMap();
let signalNodeAttrBuilderRef = new WeakMap();
let signalsToWatch = new Set();
let computedHTMLSignalRefs = new WeakMap();
let customElementMeta = new Map();
let attributeMarkedForRemove = [];
let attributeMarkedForAdd = [];


export function activateComponent() {
  beginTemplating();
}

export function deactivateComponent() {
  endTemplating();
}

export function html(strings, ...values) {
  if (stackSize > maxStack) throw Error(`Maximum render stack reached (${maxStack}): possible recursive loop`);
  stackSize += 1;

  // if a function is used then handle under compute. <div>${html(() => this.isLoading.value ? 'Loading...' : '')}</div>
  if (typeof strings === 'function') return new Compute(strings, true);

  let joined = strings.join(expressionStr);
  let template = templateCache.get(joined);

  // preprocess template (breaking up text into nodes) and cache it
  if (!template) {
    template = document.createElement('template');
    template.innerHTML = policyHTML.createHTML(joined);
    buildTemplate(template);
    templateCache.set(joined, template);
  }

  // inject values into template clone
  const fragment = document.importNode(template.content, true);
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT);
  let valuesIndex = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode;

    if (node.nodeType === Node.ELEMENT_NODE) { // handle attribute nodes

      // grab needed info about component
      if (node.tagName.includes('-') && !customElementMeta.has(node.tagName)) {
        const ce = customElements.get(node.tagName.toLowerCase());
        const ceAttrs = ce?._attrs;
        if (ceAttrs) customElementMeta.set(node.tagName, { attrs: ceAttrs });
      }

      if (!node.hasAttributes()) continue;

      const attributes = node.attributes;
      for (let i = 0; i < attributes.length; i++) {
        const attribute = attributes.item(i);

        // full attribute match <div ${html(() => this.sig.value ? 'hidden' : '')} ></div>
        if (attribute.name === expressionStr) {
          // create template to pre render attribute string for copying
          let attrTemplate = document.createElement('template');

          // track signal references
          if (isSignal(values[valuesIndex])) {
            if (!signalNodeRefs.has(values[valuesIndex])) {
              signalNodeRefs.set(values[valuesIndex], []);
              signalsToWatch.add(values[valuesIndex]);
            }
            signalNodeRefs.get(values[valuesIndex]).push(new WeakRef(node));

            // render attributes into template and track for updates
            attrTemplate.innerHTML = `<ex ${values[valuesIndex].valueUntracked} ></ex>`;
            if (!signalNodeAttrBuilderRef.has(node)) signalNodeAttrBuilderRef.set(node, []);
            signalNodeAttrBuilderRef.get(node).push(attrTemplate);

            // set initial attributes
            buildAttrsAndMerge(node, attrTemplate, values[valuesIndex].valueUntracked);

          // directly add non signals since they do not change
          } else {
            attrTemplate.innerHTML = `<ex ${values[valuesIndex]} ></ex>`;
            for (let attr of attrTemplate.content.firstElementChild.attributes) {
              node.setAttribute(attr.name, attr.value);
            }
          }

          attrTemplate = undefined;
          valuesIndex += 1;
          continue;
        }


        // check for expressions in attribute values
        if (!attribute.value.includes(expressionStr)) continue;

        let items = [];
        let j = 0;
        const attributeStrings = attribute.value.trim().split(expressionStr);
        // the amount of expressions is 1 - split length
        // so we -1 from the length and add the last string at the end.
        for (; j < attributeStrings.length - 1; j += 1) {
          // add static part (only add actual value)
          if (attributeStrings[j] !== '') items.push(attributeStrings[j]);

          // add expression part
          items.push(values[valuesIndex]);

          // track and handle signal references
          if (isSignal(values[valuesIndex])) {

            /* TODO Can i solve this another way?
             * this is a hack to allow grabbing the entire SignalObject from value
             *   Case we are handling
             *      <div style="${this.styleObjSig}"></div>
             *   Not needed for direct property access
             *      <div style="color: ${this.styleObjSig.color}"></div>
             */
            if (isSignalObject(values[valuesIndex])) {
              if (!signalNodeRefs.has(values[valuesIndex].__signal)) {
                signalNodeRefs.set(values[valuesIndex].__signal, []);
                signalsToWatch.add(values[valuesIndex].__signal);
              }
              signalNodeRefs.get(values[valuesIndex].__signal).push(new WeakRef(attribute));
            } else {
              if (!signalNodeRefs.has(values[valuesIndex])) {
                signalNodeRefs.set(values[valuesIndex], []);
                signalsToWatch.add(values[valuesIndex]);
              }
              signalNodeRefs.get(values[valuesIndex]).push(new WeakRef(attribute));
            }
          }

          valuesIndex += 1;
        }

        // add last static part (only add actual value)
        if (attributeStrings[j] !== '')  items.push(attributeStrings[j]);

        // track attribute data for updates
        attributeAndCommentData.set(attribute, items);

        // set initial value
        setAttrValue(node, attribute, items);
      }

    // regular text
    } else if (node.nodeType === Node.TEXT_NODE && node.textContent === expressionStr) {

      // track and handle signal references
      if (isSignal(values[valuesIndex])) {
        if (!signalNodeRefs.has(values[valuesIndex])) {
          signalNodeRefs.set(values[valuesIndex], []);
          signalsToWatch.add(values[valuesIndex]);
        }
        signalNodeRefs.get(values[valuesIndex]).push(new WeakRef(node));


        /* Is a html compute tag that returns html
         *   <div>${html(() => html'<span>test</span>')}</div>
         *.  <div>${html(() => [1, 2].map(v => html'<span>${v}</span>'))}</div>
         */
        if (
          values[valuesIndex][HTMLCOMPUTE]
          && (
            values[valuesIndex].valueUntracked instanceof DocumentFragment
            || Array.isArray(values[valuesIndex].valueUntracked)
          )
        ) {
          // remove placeholder expressionStr
          node.textContent = '';

          // set initial value
          buildComputeHTML(values[valuesIndex], node);

        } else {
          // handle non html signals
          node.textContent = values[valuesIndex].valueUntracked;
        }

      // handle non signal values
      } else node.textContent = values[valuesIndex];

      valuesIndex += 1;

    // handle comments: similar to attribute values. You can use expressions inside comments
    } else if (node.nodeType === Node.COMMENT_NODE && node.textContent.includes(expressionStr)) {
      const strings = node.textContent.split(expressionStr);
      if (strings.length <= 1) continue;

      let items = [];
      let i = 0;
      for (; i < strings.length - 1; i += 1) {
        // add static part
        items.push(strings[i]);

        // add expression part
        items.push(values[valuesIndex]);

        //track signals
        if (isSignal(values[valuesIndex])) {
          if (!signalNodeRefs.has(values[valuesIndex])) {
            signalNodeRefs.set(values[valuesIndex], []);
            signalsToWatch.add(values[valuesIndex]);
          }
          signalNodeRefs.get(values[valuesIndex]).push(new WeakRef(node));
        }
        valuesIndex += 1;
      }
      // add last static part
      items.push(strings[i]);

      // track comment data for updates
      attributeAndCommentData.set(node, items);

      // set initial value
      setCommentAttrValue(node, items);
    }
  }

  for (let rm of attributeMarkedForRemove) {
    rm[1].removeAttributeNode(rm[0]);
  }
  attributeMarkedForRemove.length = 0;

  for (let rm of attributeMarkedForAdd) {
    rm[1].setAttributeNode(rm[0]);
  }
  attributeMarkedForAdd.length = 0;

  queueMicrotask(() => watch());
  return fragment;
}
globalThis.html = html;


// break up text into separate nodes for static and expression parts
function buildTemplate(template) {
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE) {
      const nodeText = node.nodeValue.split(expressionStr);
      if (nodeText.length <= 1) continue;

      // include last string part in node, this means creating 1 less text node
      node.textContent = nodeText[nodeText.length - 1];

      // insert value parts from expressions
      for (let i = 0; i < nodeText.length - 1; i++) {
        // inset static text
        if (nodeText[i] !== '') node.parentNode.insertBefore(new Text(nodeText[i]), node);

        // insert expression text placeholder
        node.parentNode.insertBefore(new Text(expressionStr), node);
      }
    }
  }
}


function setAttrValue(ownerNode, attrNode, items) {
  let data = buildAttrData(items, attrNode);

  if (data[1]?.type === 'object') {
    const name = data[1].name;
    const oldValue = ownerNode[name];
    ownerNode[name] = data[0];
    ownerNode.attributeChangedCallback(name, oldValue, data[0]);

  // directly set functions on valid event attributes
  } else if (htmlEventAttributes.includes(attrNode.nodeName) && typeof data[0] === 'function') {
    attrNode.value = '';
    ownerNode[attrNode.name] = data[0];

  // toggles attributes
  } else if (data[1]?.type === undefined && booleanAttributes.includes(attrNode.nodeName)) {
    attrNode.value = '';
    const enabled = data[0] === true;
    const has = ownerNode.hasAttribute(attrNode.nodeName);
    const hasSignal = items.some(item => isSignal(item));
    if (enabled && !has) {
      attributeMarkedForAdd.push([attrNode, ownerNode]);
      if (hasSignal) signalBooleanAttrNodeRefs.delete(attrNode);
    } else if (!enabled && has) {
      attributeMarkedForRemove.push([attrNode, ownerNode]);
      if (hasSignal) signalBooleanAttrNodeRefs.set(attrNode, ownerNode);
    }

  } else {
    attrNode.value = data[0];
  }
}

function setCommentAttrValue(ownerNode, items) {
  let data = buildAttrData(items);
  ownerNode.textContent = data[0];
}

const dashCaseRegex = /-([a-z])/g;
let capitalizedRegex = /[A-Z]/g;
function buildAttrData(items, attrNode) {
  let attrName = attrNode?.nodeName;

  // handle style object
  if (attrName === 'style') {
    let obj = items
      .map(item => isSignal(item) ? item.valueUntracked : item)
      .find(item => typeof item === 'object' && item !== null);
    if (obj) {
      return [
        Object.entries(obj).map(([key, value]) => {
          const dashKey = key.replace(capitalizedRegex, (match) => `-${match.toLowerCase()}`);
          return `${dashKey}: ${value};`;
        }).join(' '),
        'style'
      ];
    }
  }

  if (attrName?.includes('-')) attrName = attrName.replace(dashCaseRegex, (_, s) => s.toUpperCase());
  let ownerNode = attrNode?.ownerElement || signalBooleanAttrNodeRefs.get(attrNode);
  let attrConfig = attrNode && customElementMeta.get(ownerNode.tagName)?.attrs?.[attrName];
  let resultArr = [];

  for (let i = 0; i < items.length; i += 1) {
    let item = items[i];
    if (item === '') continue;

    if (isSignal(item)) resultArr.push(parseAttrValue(item.valueUntracked, attrConfig?.type));
    else resultArr.push(parseAttrValue(item, attrConfig?.type));
  }

  return [
    resultArr.length === 1 ? resultArr[0] : resultArr.join(''),
    attrConfig
  ];
}

function parseAttrValue(value, type) {
  switch (type) {
    case 'toggle':
    case 'boolean':
      return value !== null && `${value}` !== 'false';
    case 'int':
      const int = parseInt(value);
      return isNaN(int) ? '' : int;
    case 'number':
      const num = parseFloat(value);
      return isNaN(num) ? '' : num;
    case 'string':
      return value || '';
    case 'object':
      if (value === null || typeof value !== 'object') return '';
      return value;
    default:
      return value;
  }
}

function buildAttrsAndMerge(node, template, signalValue) {
  // capture the current attributes before overwriting
  let existingAttrs = [];
  let templateAttrs = template.content.firstElementChild.attributes;
  for (let attr of templateAttrs) {
    existingAttrs.push(attr.name);
  }
  templateAttrs = undefined;

  // overwrite / add attributes
  template.innerHTML = `<ex ${signalValue} ></ex>`;
  const newAttrs = template.content.firstElementChild.attributes;
  for (let attr of newAttrs) {
    node.setAttribute(attr.name, attr.value);
  }

  // remove any attributes that are no longer present
  for (let attrName of existingAttrs) {
    if (!newAttrs.getNamedItem(attrName)) {
      node.removeAttribute(attrName);
    }
  }
}

function buildComputeHTML(signal, node) {
  if (computedHTMLSignalRefs.has(signal)) {
    for (let nodeRef of computedHTMLSignalRefs.get(signal)) {
      let node = nodeRef.deref();
      if (node) {
        node.remove();
      }
    }
    computedHTMLSignalRefs.get(signal).length = 0;
  } else computedHTMLSignalRefs.set(signal, []);

  if (signal.error) {
    console.error(signal.error);
  } else {
    for (let frag of [].concat(signal.valueUntracked)) {
      for (let child of frag.childNodes) {
        computedHTMLSignalRefs.get(signal).push(new WeakRef(child));
      }
      node.parentElement.insertBefore(frag, node);
    }
  }
}

let watchRunning = false;
function watch() {
  if (watchRunning) return;
  watchRunning = true;
  queueMicrotask(() => {
    for (const sig of signalsToWatch) {
      if (sig.watch) sig.watch(signalChange);
      else console.warn('signal has no watch method', sig);
    }
    signalsToWatch.clear();
    watchRunning = false;

    // cleanup boolean attr refs. We need to have a non weakref mapped since these get pulled from the dom while false
    for (let item of signalBooleanAttrNodeRefs.entries()) {
      if (item[1].isConnected === false) signalBooleanAttrNodeRefs.delete(item[0]);
    }
  });
}


function signalChange(signal) {
  let nodes = signalNodeRefs.get(signal);
  if (!nodes) return;
  if (nodes.length === 0) {
    signalNodeRefs.delete(signal);
    return;
  }

  for (let i = 0; i < nodes.length; i++) {
    let node = nodes[i].deref();
    if (!node) {
      nodes.splice(i, 1);
      i -= 1;
      continue;
    }

    if (node.nodeType === Node.ATTRIBUTE_NODE) { // attribute values
      let attrData = attributeAndCommentData.get(node);
      let ownerElement = node.ownerElement || signalBooleanAttrNodeRefs.get(node);
      setAttrValue(ownerElement, node, attrData);

    } else if (node.nodeType === Node.ELEMENT_NODE) { // attribute nodes
      let attrTemplates = signalNodeAttrBuilderRef.get(node);
      for (let attrTemplate of attrTemplates) {
        buildAttrsAndMerge(node, attrTemplate, signal.valueUntracked);
      }

    } else if (node.nodeType === Node.COMMENT_NODE) {
      let commentText = attributeAndCommentData.get(node);
      setCommentAttrValue(node, commentText);

    }else if (signal[HTMLCOMPUTE] === true) {
      buildComputeHTML(signal, node);

    } else { // text nodes
      node.textContent = signal.valueUntracked;
    }
  }
}


const booleanAttributes = [
  'allowfullscreen', 'alpha', 'async', 'autofocus', 'autoplay',
  'checked', 'controls',
  'default', 'defer', 'disabled',
  'formnovalidate',
  'inert', 'ismap', 'itemscope',
  'loop',
  'multiple', 'muted',
  'nomodule', 'novalidate',
  'open',
  'playsinline',
  'readonly', 'required', 'reversed',
  'selected', 'shadowrootclonable', 'shadowrootcustomelementregistry', 'shadowrootdelegatesfocus', 'shadowrootserializable'
];


const htmlEventAttributes = [
  'onabort',
  'onafterprint',
  'onauxclick',
  'onbeforematch',
  'onbeforeprint',
  'onbeforetoggle',
  'onbeforeunload',
  'onblur',
  'oncancel',
  'oncanplay',
  'oncanplaythrough',
  'onchange',
  'onclick',
  'onclose',
  'oncontextlost',
  'oncontextmenu',
  'oncontextrestored',
  'oncopy',
  'oncuechange',
  'oncut',
  'ondblclick',
  'ondrag',
  'ondragend',
  'ondragenter',
  'ondragleave',
  'ondragover',
  'ondragstart',
  'ondrop',
  'ondurationchange',
  'onemptied',
  'onended',
  'onerror',
  'onfocus',
  'onformdata',
  'onhashchange',
  'oninput',
  'oninvalid',
  'onkeydown',
  'onkeypress',
  'onkeyup',
  'onlanguagechange',
  'onload',
  'onloadeddata',
  'onloadedmetadata',
  'onloadstart',
  'onmessage',
  'onmessageerror',
  'onmousedown',
  'onmouseenter',
  'onmouseleave',
  'onmousemove',
  'onmouseout',
  'onmouseover',
  'onmouseup',
  'onoffline',
  'ononline',
  'onpagehide',
  'onpageshow',
  'onpaste',
  'onpause',
  'onplay',
  'onplaying',
  'onpopstate',
  'onprogress',
  'onratechange',
  'onrejectionhandled',
  'onreset',
  'onresize',
  'onscroll',
  'onscrollend',
  'onsecuritypolicyviolation',
  'onseeked',
  'onseeking',
  'onselect',
  'onslotchange',
  'onstalled',
  'onstorage',
  'onsubmit',
  'onsuspend',
  'ontimeupdate',
  'ontoggle',
  'onunhandledrejection',
  'onunload',
  'onvolumechange',
  'onwaiting',
  'onwheel'
];
