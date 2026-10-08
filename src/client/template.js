import Cue from './Cue.js';
import { addToQueue } from './queue.js';
import { policyHTML } from './policy.js';


const TEMPLATE_VALUE = Symbol('TEMPLATE_VALUE');
const expressionStr = '{_ex_}';
const capitalizedRegex = /[A-Z]/g;
let walker = document.createTreeWalker(document, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT);
let templates = new Map();
let toRemove = [];
let bulkTextUpdate = [];
let bulkAttrUpdate = [];
let isTemplating = false;


export function getTemplate(strings, values) {
  let str = buildTemplateString(strings);
  if (!templates.has(str)) templates.set(str, new Template(str));
  let template = templates.get(str);
  return template.clone(values);
}


class Template {
  template;
  expressionParts = [];
  expressionNodes = [];
  currentNodes = [];
  instances = new Set();
  availableInstnaces = [];
  cleaned = true;


  constructor(templateStr) {
    let policyHtml = policyHTML.createHTML(templateStr);
    let built = buildTemplate(policyHtml);
    this.template = built[0];
    this.expressionParts = built[1];
  }

  clone(values) {
    if (!isTemplating) {
      addToQueue(cleanup, 1);
      isTemplating = true;
    }
    if (this.cleaned) {
      this.cleaned = false;
      this.availableInstnaces = this.instances.values().toArray().filter(i => i.disconnected).reverse();
    }

    let instance;
    if (this.availableInstnaces.length > 0) {
      instance = this.availableInstnaces.pop();
    } else {
      instance = new TemplateInstance(this.template, this.expressionParts);
      this.instances.add(instance);
    }

    return instance;
  }

  // remove any unused old instances and transfer active ones
  cleanup() {
    this.cleaned = true;
    for (let oldInstance of this.availableInstnaces) {
      oldInstance.destroy();
      this.instances.delete(oldInstance);
    }
    this.availableInstnaces.length = 0;

    for (let instance of this.instances) {
      if (!instance.isConnected) {
        instance.destroy();
        this.instances.delete(instance);
      }
    }
  }
}


class TemplateInstance {
  _fragment;
  elements = [];
  valueNodes = [];
  isDestroyed = false;
  _disconnected = false;


  constructor(template, expressionParts) {
    this._createElement(template, expressionParts);
  }

  get disconnected() {
    return this._disconnected;
  }

  get isConnected() {
    return this.elements.some(n => n.isConnected);
  }

  get fragment() {
    if (!this._fragment) this._fragment = document.createDocumentFragment();
    if (this._fragment.childNodes.length === 0) {
      for (let n of this.elements) {
        this._fragment.appendChild(n);
      }
    }
    return this._fragment;
  }

  connect(values) {
    this._disconnected = false;
    let valueIndex = 0;
    for (let i = 0; i < this.valueNodes.length; i++) {
      let part = this.valueNodes[i];
      for (let j = 0; j < part.valueCount; j++) {
        let value = values[valueIndex + j];
        part.addValue(value, j);
        valueIndex++;
      }
      part.update();
    }
  }

  disconnect() {
    this._disconnected = true;
    for (let vn of this.valueNodes) {
      vn.disconnect();
    }
  }

  destroy() {
    this.isDestroyed = true;
    for (let en of this.valueNodes) {
      en.destroy();
    }
    this.valueNodes.length = 0;

    toRemove.push(...this.elements);
    this.elements.length = 0;
    this._fragment = undefined;
  }

  _createElement(template, expressionParts) {
    const fragment = document.importNode(template.content, true);
    walker.currentNode = fragment;

    let node;
    let nodeIndex = -1;
    let expressionNodeIndex = 0;
    let expressionNodes = [];
    let expressionPart = expressionParts[0];
    while (expressionPart !== undefined) {
      if (expressionPart.nodeIndex === nodeIndex) {
        let part = new ValueNode(node, expressionPart);
        expressionNodes.push(part);
        expressionNodeIndex++;
        expressionPart = expressionParts[expressionNodeIndex];
      }

      if (expressionPart?.nodeIndex !== nodeIndex) {
        node = walker.nextNode();
        nodeIndex++;
      }
    }
    walker.currentNode = document;

    this.elements = [...fragment.childNodes];
    this.valueNodes = expressionNodes;
    this._fragment = fragment;
  }
}


class ValueNode {
  node;
  isAttr;
  attrName;
  attrType;
  attrIndex;
  isSignal = false;
  hasTemplate = false;
  templateData = [];
  values = [];
  valueCount = 0;
  initialized = false;
  destroyed = false;
  signals = [];
  templateInstances = [];


  constructor(node, data) {
    this.node = node;
    this.elements = [];
    this.isAttr = data.isAttr;
    this.attrName = data.attrName;
    this.attrIndex = data.attrIndex;
    this.hasTemplate = data.hasTemplate;
    this.templateData = data.parts;
    this.valueCount = data.valueCount;

    // pull attr config from component
    if (this.isAttr) {
      const config = this.attrType = node?.constructor?.attrConfig?.[this.attrName];
      if (config) this.attrType = config.type;
      else if (booleanAttributes.includes(this.attrName)) this.attrType = 'toggle';
      else if (htmlEventAttributes.includes(this.attrName)) this.attrType = 'event';
      else if (typeof value === 'object' && value !== null) this.attrType = 'object';
      else this.attrType = 'string';
    } else node.textContent = '';
  }

  addValue(value, index) {
    this.values.push(value);
    if (Cue.isCue(value)) {
      this.isSignal = true;
      this.signals.push(value);

      queueMicrotask(() => {
        value.watch(this.signalChange);
      });
    }
  }

  signalChange = (signal) => {
    if (!this.initialized) return;

    // if node is an html compute then a signal update means re rendering
    this.disconnectTemplateInstances();
    this.update(true);
  }


  update(isUpdate = this.initialized) {
    let value;
    if (this.hasTemplate === false) value = getValue(this.values[0]);
    else {
      let valueIndex = 0;
      value = this.templateData.map(v => {
        if (v !== TEMPLATE_VALUE) return v;
        return getValue(this.values[++valueIndex]);
      }).join('');
    }

    if (this.isAttr) setAttrValue(this.node, this.attrName, this.attrType, value, isUpdate);
    else if (Array.isArray(value) ? value[0] instanceof TemplateInstance : value instanceof TemplateInstance) {
      setNodeFragmentValue(value, this.node);
      this.templateInstances = Array.isArray(value) ? value : [value];
    } else {
      value = String(value);
      if (this.node.textContent !== value) this.node.textContent = value;
    }
    this.initialized = true;
  }

  disconnectTemplateInstances() {
    for (let instance of this.templateInstances) {
      instance.disconnect();
    }
  }

  disconnect() {
    for (let i = 0; i < this.signals.length; i++) {
      this.signals[i].unwatch(this.signalChange);
    }
    this.signals.length = 0;
    this.values.length = 0;
    this.isSignal = false;
    for (let instance of this.templateInstances) {
      instance.disconnect();
    }
  }

  destroy() {
    this.destroyed = true;
    this.node = undefined;
    for (let i = 0; i < this.signals.length; i++) {
      this.signals[i].unwatch(this.signalChange);
    }

    toRemove.push(...this.templateInstances);
    this.templateInstances.lengh = 0;
    this.values.length = 0;
    this.signals.length = 0;
    this.templateData.length = 0;
    this.isSignal = false;
    this.initialized = false;
  }
}



// Converts strings from template tag
function buildTemplateString(strings = []) {
  let joined = '';
  for (let i = 0; i < strings.length; i++) {
    let s = strings[i];
    if (i > 0) joined += expressionStr;
    joined += s;
  }
  return joined;
}

function buildTemplate(templateStr) {
  const element = document.createElement('template');
  element.innerHTML = templateStr;
  walker.currentNode = element.content;


  // build expression parts

  let node;
  let parts = [];
  let nodeIndex = -1;
  let inTable = false;

  while ((node = walker.nextNode()) !== null) {
    nodeIndex++;

    if (node.nodeType === Node.COMMENT_NODE) {
      let nodeData = node.data;
      let i = nodeData.indexOf(expressionStr);
      if (i === -1) continue;

      let lastIndex;
      while (i !== -1) {
        // non expression value
        let templateValue = nodeData.substring(0, i);
        if (!!templateValue) parts.push({ type: node.nodeType, nodeIndex, isTemplate: true, templateValue });

        // expression value
        parts.push({ type: node.nodeType, nodeIndex });
        lastIndex = i;
        i = nodeData.indexOf(expressionStr, i + expressionStr.length);
      }

      // trailing non expression value
      let trailing = nodeData.substring(lastIndex + expressionStr.length);
      if (trailing !== '') parts.push({ type: node.nodeType, nodeIndex, isTemplate: true, templateValue: trailing });

    } else if (node.nodeType === Node.TEXT_NODE) {
      const nodeText = node.textContent.split(expressionStr);
      if (nodeText.length <= 1) continue;

      // include last string part in node, this means creating 1 less text node
      node.textContent = nodeText[nodeText.length - 1];

      // insert value parts from expressions
      let length = nodeText.length - 1;
      for (let i = 0; i < length; i++) {
        // inset static text
        if (nodeText[i] !== '') {
          node.parentNode.insertBefore(new Text(nodeText[i]), node);
          nodeIndex++;
        }

        // insert expression text placeholder
        node.parentNode.insertBefore(new Text(expressionStr), node);
        parts.push({ type: node.nodeType, nodeIndex });
        nodeIndex++;
      }

    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const attributes = node.attributes;
      for (let i = 0; i < attributes.length; i++) {
        let attr = attributes[i];
        let attrValue = attr.value.trim();
        if (!attrValue.includes(expressionStr)) continue;

        let j = attrValue.indexOf(expressionStr);
        let lastIndex;
        while (j !== -1) {
          // non expression value
          let templateValue = attrValue.substring(0, j);
          if (!!templateValue) parts.push({ type: attr.nodeType, isAttr: true, nodeIndex, attrName: attr.name, attrIndex: i, isTemplate: true, templateValue });

          // expression value
          parts.push({ type: attr.nodeType, isAttr: true, nodeIndex, attrName: attr.name, attrIndex: i });
          lastIndex = j;
          j = attrValue.indexOf(expressionStr, j + expressionStr.length);
        }

        // trailing non expression value
        let trailing = attrValue.substring(lastIndex + expressionStr.length);
        if (trailing !== '') parts.push({ type: attr.nodeType, isAttr: true, nodeIndex, attrName: attr.name, attrIndex: i, isTemplate: true, templateValue: trailing });
      }
    }
  }
  walker.currentNode = document;


  // create expression parts
  // Example: <input name="${this.id}-${this.counter}" /> - this would be one node with 2 parts
  nodeIndex = -1;
  let nodeParts = new Map();
  for (let i = 0; i < parts.length; i++) {
    let part = parts[i];
    let partNodeKey = `${part.nodeIndex}${part.attrName || ''}`;
    if (partNodeKey !== nodeIndex) {
      nodeIndex = part.nodeIndex;
      nodeParts.set(partNodeKey, { nodeIndex: nodeIndex, isAttr: part.isAttr, attrName: part.attrName, attrIndex: part.attrIndex, hasTemplate: false, parts: [] });
    }
    let nodePart = nodeParts.get(partNodeKey);
    nodePart.parts.push(part);
    nodePart.type = part.type;
    nodePart.hasTemplate = part.isTemplate === true;
  }

  nodeParts = nodeParts.values().toArray();
  for (let i = 0; i < nodeParts.length; i++) {
    if (nodeParts[i].hasTemplate) {
      nodeParts[i].parts = nodeParts[i].parts.map(v => v.isTemplate === true ? v.templateValue : TEMPLATE_VALUE);
      nodeParts[i].valueCount = nodeParts[i].parts.filter(v => v === TEMPLATE_VALUE).length;
    } else {
      nodeParts[i].valueCount = 1;
      nodeParts[i].parts.length = 0;
    }
  }

  return [element, nodeParts];
}

function setNodeFragmentValue(value, node) {
  let combinedFrag;
  if (Array.isArray(value)) {
    combinedFrag = document.createDocumentFragment();
    for (let i = 0; i < value.length; i++) {
      combinedFrag.appendChild(value[i].fragment);
    }
  } else combinedFrag = value.fragment;

  node.parentElement.insertBefore(combinedFrag, node);
}

// TODO implament reflect and aria
function setAttrValue(ownerNode, attrName, attrType, value, update = false) {
  let attrNode = ownerNode.getAttributeNode(attrName);

  if (attrType === 'toggle') {
    if (update) { // we do not want to change the rendered state
      ownerNode[attrName] = value;
    } else {
      if (value === true && !!attrNode) ownerNode.setAttribute(attrName, '')
      else if (attrNode) ownerNode.removeAttributeNode(attrNode);
    }
  } else if (attrType === 'event' && typeof value === 'function') {
    if (attrNode.value !== '') attrNode.value = '';
    ownerNode[attrName] = value;
  } else if (attrType === 'object' || (attrName === 'style' && typeof value === 'object')) {
    if (attrName === 'style') {
      let style = '';
      for (let key in value) {
        const dashKey = key.replace(capitalizedRegex, m => `-${m.toLowerCase()}`);
        style += `${dashKey}: ${value[key]};`;
      }
      if (attrNode.value !== style) attrNode.value = style;
    } else {
      const oldValue = ownerNode[attrName];
      if (attrNode.value !== '') attrNode.value = '';
      if (typeof ownerNode.attributeChangedCallback == 'function') ownerNode.attributeChangedCallback(attrName, oldValue, value);
    }
  } else if (attrType === 'boolean') {
    value = Boolean(value).toString();
    if (attrNode.value !== value) attrNode.value = value;
  } else {
    value = String(value);
    if (attrNode.value !== value) attrNode.value = value;
  }
}


function getValue(value) {
  let isValueSignal = Cue.isCue(value);
  if (isValueSignal && value.error) {
    console.error(value.error);
    return '';
  }
  return isValueSignal ? value.getForTemplate() : value;
}


function cleanup() {
  let templateItems = templates.values().toArray();
  for (let i = 0; i < templateItems.length; i++) {
    templateItems[i].cleanup();
  }

  for (let i = 0; i < toRemove.length; i++) {
    if (typeof toRemove[i].remove === 'function') toRemove[i].remove();
  }
  toRemove.length = 0;

  isTemplating = false;
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
