import { isSignal, Compute, beginTemplating, endTemplating, HTMLCOMPUTE } from './signal.js';
import { sanitizeNode } from './sanitize.js';


// const HTMLCOMPUTE = Symbol('HTMLCOMPUTE');
const insideCommentRegex = /<!--(?![.\s\S]*-->)/;
const twoSpaceRegex = /\s\s/g;
const attrString = '###';
const attrPlaceholderRegex = new RegExp(attrString, 'g');
const computeCommentPrefix = 'lcomp_';
const subTemplateCommentPrefix = 'lsubtemp_';
const signalCommentPrefix = 'lsig_';
const signalCommentRegexValue = '<!--lsig_\\d+-->';
const signalCommentRegex = new RegExp(signalCommentRegexValue, 'g');
const tagRegex = new RegExp(`<\\w+([^<>]*${signalCommentRegexValue}[^<\\/>]*)+\\/?>`, 'g');
const attrRegex = new RegExp(`(?:(\\s+[^\\s\\/>"=]+)\\s*=\\s*"([\\w\\s]*${signalCommentRegexValue}[\\w\\s]*)")|(\\s*${signalCommentRegexValue}\\s*)`, 'g');


let isObserving = false;
let currentComponent;
let signalCache = new Map();
let signalsToWatch = new Set();
let refCount = 0;
let signalNodeRef = new Map();
let compActiveNodesRef = new Map();
let attrExpressionRef = new Map();
let componentSigRef = new Map();


let removeObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
      if (mutation.removedNodes.length) cleanupComponents();
    }
  }
});

export function activateComponent(component) {
  if (currentComponent === component) return;

  if (componentSigRef.has(component)) cleanupComponents();
  componentSigRef.set(component, new Set());
  refCount += 1;

  if (!isObserving) {
    removeObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    isObserving = true;
  }

  currentComponent = component;
  beginTemplating();
}

export function deactivateComponent() {
  currentComponent = undefined;
  cleanupComponents()
  endTemplating();
}

export function cleanupComponents() {
  let i = 0;
  for (let comp of componentSigRef) {
    if (!comp[0].isConnected || comp[1].size === 0) {
      destroy(comp[0]);
      i += 1;
    }
  }

  refCount -= i;
  if (refCount < 0) {
    console.log('refCount less than 0', refCount);
    refCount = 0;
  }
  if (refCount === 0) disconnectObserver();
}

function destroy(component) {
  for (let sig of componentSigRef.get(component)) {
    if (signalNodeRef.has(sig.id)) {
      for (let node of signalNodeRef.get(sig.id)) {
        if (attrExpressionRef.has(node)) attrExpressionRef.delete(node);
      }
      signalNodeRef.get(sig.id)?.clear();
      signalNodeRef.delete(sig.id);
    }

    if (compActiveNodesRef.has(sig.id)) {
      compActiveNodesRef.get(sig.id)?.clear();
      compActiveNodesRef.delete(sig.id);
    }
  }
  componentSigRef.get(component).clear();
  componentSigRef.delete(component);
  signalCache.clear();
}


export function html(strings, ...args) {
  if (typeof strings === 'function') return new Compute(strings, true);

  args.reverse();

  let arg;
  let signals = [];
  const subClonedNodes = [];
  let template = '';
  let i = 0;
  for (; i < strings.length - 1; i++) {
    template = template + strings[i];
    arg = args.pop();

    // replace commented out expression
    if (template.match(insideCommentRegex)) {
      template += '\${commented expression}';
    } else if (isSignal(arg)) {
      signals.push(arg);

      if (!signalCache.has(arg.id)) {
        componentSigRef.get(currentComponent).add(arg);

        signalCache.set(arg.id, arg);
        signalsToWatch.add(arg);
      }

      if (arg[HTMLCOMPUTE] === true) template += `<!--${computeCommentPrefix}${arg.id}-->`;
      else template += `<!--${signalCommentPrefix}${arg.id}-->`;
    } else if (Array.isArray(arg) ? arg[0] instanceof DocumentFragment : arg instanceof DocumentFragment) {
      subClonedNodes.push([].concat(arg));
      template += `<!--${subTemplateCommentPrefix}-->`;
    } else {
      template += escape(arg);
    }
  }
  template += strings[i];

  queueMicrotask(() => watch());
  return buildTemplateElement(template, signals, subClonedNodes);
}
globalThis.html = html;



function buildTemplateElement(template, args, subClonedNodes) {
  args.reverse();
  subClonedNodes.reverse();
  template = adjustTemplateForAttributes(template);

  const templateElement = document.createElement('template');
  templateElement.innerHTML = template;

  const nodes = document.createNodeIterator(
    templateElement.content,
    NodeFilter.SHOW_ALL
  );

  let node = nodes.nextNode();
  while (node = nodes.nextNode()) {
    switch (node.nodeType) {
      // swap out placeholder for textNode to hold sig value
      case Node.COMMENT_NODE:
        if (node.data.startsWith(signalCommentPrefix)) {
          let sig = args.pop();
          if (!signalNodeRef.has(sig.id)) signalNodeRef.set(sig.id, new Set());
          const textNode = document.createTextNode(sig.valueUntracked);
          node.parentElement.replaceChild(textNode, node);
          signalNodeRef.get(sig.id).add(textNode);
          
        } else if (node.data === subTemplateCommentPrefix) {
          for (const frag of subClonedNodes.pop()) {
            node.parentElement.insertBefore(frag, node);
          }

        } else if (node.data.startsWith(computeCommentPrefix)) {
          let compute = args.pop();
          if (!signalNodeRef.has(compute.id)) signalNodeRef.set(compute.id, new Set());
          if (!compActiveNodesRef.has(compute.id)) compActiveNodesRef.set(compute.id, new Set()); 
          for (const frag of [].concat(compute.valueUntracked)) {
            for (let child of frag.childNodes) {
              compActiveNodesRef.get(compute.id).add(child);
            }
            node.parentElement.insertBefore(frag, node);
          }
          signalNodeRef.get(compute.id).add(node);
        }
        break;

      case Node.ELEMENT_NODE:
        sanitizeNode(node);

        let toRemove = []
        let toAdd = []
        let i = 0;
        for (; i < node.attributes.length; i++) {
          let attr = node.attributes[i];
          if (attr.value.includes(attrString)) {
            let signals = new Set();
            let expressions = [];
            let templateValue = attr.value;

            attr.value = templateValue.replace(attrPlaceholderRegex, function () {
              let arg = args.pop();
              if (isSignal(arg)) {
                signals.add(arg);
                expressions.push(arg.id);
                return arg.valueUntracked;
              }

              expressions.push(arg);
              return arg;
            });


            if (!attrExpressionRef.has(attr)) attrExpressionRef.set(attr, []);
            for (const sig of signals) {
              if (!signalNodeRef.has(sig.id)) signalNodeRef.set(sig.id, new Set());
              if (!signalNodeRef.get(sig.id).has(attr)) signalNodeRef.get(sig.id).add(attr);
              attrExpressionRef.get(attr).push([sig.id, templateValue, expressions]);
            }
            signals.clear();
            signals = undefined;


            // handle expression attr <div ${this.var}>
            // TODO handle signals?
          } else if (attr.name.includes(attrString)) {
            let expressionValue = args.pop();
            toAdd.push(document.createAttribute(expressionValue));
            toRemove.push(node.attributes[i]);
          }
        }

        // Add and remove after to prevent node attributes from being modified on parse
        for (i = 0; i < toAdd.length; i++) {
          node.setAttributeNode(toAdd[i]);
          node.removeAttributeNode(toRemove[i]);
        }

        toAdd = undefined;
        toRemove = undefined;
        break;
    }
  }
  
  return templateElement.content;
}


function adjustTemplateForAttributes(template) {
  return template.replace(tagRegex, function (all) {
    let attrNameCounter = 0; // ensures unique attr names <div ${page.disabled ? 'disabled' : ''}
    return all
      .replace(attrRegex, function (attr, _name, _value, expr) {
        if (expr) return attr.replace(signalCommentRegex, attrString + attrNameCounter++)
        return attr.replace(signalCommentRegex, attrString);
      }).replace(twoSpaceRegex, ' ');
  });
}

const escapeElement = document.createElement('p');
function escape(str) {
  escapeElement.textContent = str;
  return escapeElement.innerHTML;
}

let watchRunning = false;
function watch() {
  if (watchRunning) return;
  watchRunning = true;
  queueMicrotask(() => {
    for (const sig of signalsToWatch) {
      sig.watch(signalChange);
    }
    signalsToWatch.clear();
    watchRunning = false;
  });
}


let observerCheckRunning = false;
function disconnectObserver() {
  if (observerCheckRunning) return;
  observerCheckRunning = true;
  queueMicrotask(() => {
    if (componentSigRef.size === 0) {
      removeObserver.disconnect();
      isObserving = false;
    }
    observerCheckRunning = false;
  });
}


function signalChange(signal) {
  let nodes = signalNodeRef.get(signal.id);
  if (!nodes) return;

  for (let node of nodes) {
    if (node.nodeType === Node.ATTRIBUTE_NODE) {
      let i = 0;
      let expressions = attrExpressionRef.get(node).find(v => v[0] === signal.id);
      node.value = expressions[1].replace(attrString, function () {
        return signalCache.get(expressions[2][i++]).valueUntracked;
      });

    } else if (signal[HTMLCOMPUTE] === true) {
      for (let node of compActiveNodesRef.get(signal.id)) {
        node.remove();
      }

      compActiveNodesRef.get(signal.id).clear();
      if (signal.error) {
        console.error(signal.error);
      } else {
        for (let frag of [].concat(signal.valueUntracked)) {
          for (let child of frag.childNodes) {
            compActiveNodesRef.get(signal.id).add(child);
          }
          node.parentElement.insertBefore(frag, node);
        }
      }
    } else {
      node.textContent = signal.valueUntracked;
    }
  }
}
