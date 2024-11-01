import { isSignal, Compute } from './signal.js';

const HTMLCOMPUTE = Symbol('HTMLCOMPUTE');
const htmlComputeString = '#htmlcompute#';
const htmlComputeComment = `<!--${htmlComputeString}-->`;
const attrString = '###';
const signalString = '#signal#';
const signalComment = `<!--${signalString}-->`;
const subTemplateString = '#template#';
const subTemplateComment = `<!--${subTemplateString}-->`;
const tagRegex = new RegExp(`<\\w+([^<>]*${signalComment}[^<\\/>]*)+\\/?>`, 'g');
const attrRegex = new RegExp(`(?:(\\s+[^\\s\\/>"=]+)\\s*=\\s*"([\\w\\s]*${signalComment}[\\w\\s]*)")|(\\s*${signalComment}\\s*)`, 'g');
const signalCommentRegex = new RegExp(signalComment, 'g');
const twoSpaceRegex = /\s\s/g;
const attrPlaceholderRegex = new RegExp(attrString, 'g');
const insideCommentRegex = /<!--(?![.\s\S]*-->)/;
const dangerousNodes = ['SCRIPT', 'IFRAME', 'NOSCRIPT'];
const dangerousAttributesLevel2 = ['src', 'href', 'xlink:href'];
const dangerousAttributesLevel1 = ['onload', 'onerror'];
const templateCache = new Map();
const signalCache = new WeakMap();
const signalsToWatch = new Set();
const securityLevels = [0, 1, 2];
let securityLevel = 1;



export function setSecurityLevel(level = 1) {
  if (!securityLevels.includes(level)) throw Error('Invalid security level. Valid values [0,1,2]')
  securityLevel = level;
}


export function html(strings, ...args) {
  if (typeof strings === 'function') return htmlCompute(strings);
  args.reverse();

  const signals = [];
  const subClonedNodes = [];
  let template = '';
  let i = 0;
  for (; i < strings.length - 1; i++) {
    template = template + strings[i];
    const arg = args.pop();

    // replace commented out expression
    if (template.match(insideCommentRegex)) {
      template += '\${commented expression}';


    } else if (isSignal(arg)) {
      signals.push(arg);
      if (!signalCache.has(arg)) {
        signalCache.set(arg, []);
        signalsToWatch.add(arg);
      }

      if (arg[HTMLCOMPUTE] === true) template += htmlComputeComment;
      else template += signalComment;


    } else if (Array.isArray(arg) ? arg[0] instanceof DocumentFragment : arg instanceof DocumentFragment) {
      subClonedNodes.push([].concat(arg));
      template += subTemplateComment;
    } else {
      template += escape(arg);
    }
  }
  template += strings[i];

  if (!templateCache.has(template)) templateCache.set(template, buildTemplateElement(template));
  return prepareTemplateElement(templateCache.get(template), signals, subClonedNodes);
}

function htmlCompute(callback) {
  const compute = new Compute(callback);
  compute[HTMLCOMPUTE] = true;
  return compute;
}

export function watchSignals() {
  queueMicrotask(() => {
    for (const sig of signalsToWatch) {
      sig.watch(signalChange);
    }
  });
}

// called from component
export function destroySignalCache() {
  // let signalCacheDestroyCheckList = [];
  templateCache.clear();

  for (const sig of signalsToWatch) {
    sig.unwatch(signalChange);
    // signalCacheDestroyCheckList.push(sig);
  }
  signalsToWatch.clear();

  // isSignalConnected(signalCacheDestroyCheckList);
}

// This does not seem to be needed. The weak reference seems to handle things
// function isSignalConnected(signalCacheDestroyCheckList) {
//   setTimeout(() => {
//     for (const sig of signalCacheDestroyCheckList) {
//       let cached = signalCache.get(sig);
//       for (let i = 0; i < cached.length; i++) {
//         if (!cached[i][0].isConnected) {
//           cached[i] = undefined;
//           cached.splice(i, 1);
//         }
//       }
//       if (cached.length === 0) {
//         signalCache.delete(sig);
//         console.log(sig);
//       }
//     }

//     signalCacheDestroyCheckList.length = 0;
//   });
// }






function signalChange(signal) {
  const signalItems = signalCache.get(signal);
  if (!signalItems) return;

  for (const item of signalItems) {
    if (item[0].nodeType === Node.ATTRIBUTE_NODE) {
      let i = 0;
      item[0].value = item[1].replace(attrString, function () {
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

function buildTemplateElement(template) {
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

function prepareTemplateElement(templateElement, args, subClonedNodes) {
  args.reverse();
  subClonedNodes.reverse();
  const clonedNode = templateElement.content.cloneNode(true);
  const nodes = document.createNodeIterator(
    clonedNode,
    NodeFilter.SHOW_ALL
  );

  let node = nodes.nextNode(); // first element is body. We do not want this
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
        let toRemove = []
        let toAdd = []
        let i = 0;

        for (; i < node.attributes.length; i++) {
          const attr = node.attributes[i];
          if (attr.value.includes(attrString)) {
            const signals = new Set();
            const expressions = [];
            const templateValue = attr.value;

            attr.value = templateValue.replace(attrPlaceholderRegex, function () {
              const arg = args.pop();
              expressions.push(arg)
              if (isSignal(arg)) {
                signals.add(arg);
                return arg.untrackValue;
              }
              return arg;
            });

            for (const sig of signals) {
              signalCache.get(sig).push([attr, templateValue, expressions]);
            }
            signals.clear();


            // handle expression attr <div ${this.var}>
            // TODO handle signals?
          } else if (attr.name.includes(attrString)) {
            const expressionValue = args.pop();
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
    }
  }

  return clonedNode;
}



/**
 * Escaped content not wrapped in html template tag ${`anything`}
 *   The sanitizeNode method will handle xss
 */
const escapeElement = document.createElement('p');
function escape(str) {
  escapeElement.textContent = str;
  return escapeElement.innerHTML;
}


/**
 * Provide basic protection from XSS
 *   This is meant as a safety net. This should not be relied on to prevent attacks.
 * 
 * TODO replace with HTML Sanitizer API when available. Currently still in working spec
 */
const dangerousAttributeValueRegex = /javascript:|eval\(|alert|document.cookie|document\[['|"]cookie['|"]\]|&\#\d/gi;
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

  if ((name.startsWith('on') || dangerousAttributesLevel2.includes(name))) shouldRemoveLevel2 = true;
  if (dangerousAttributesLevel1.includes(name)) shouldRemoveLevel1 = true;

  if (
    window.litheDev === true &&
    (securityLevel === 1 && shouldRemoveLevel2 && !shouldRemoveLevel1)
    || (window.litheDev === true && securityLevel === 0 && (!shouldRemoveLevel2 || !shouldRemoveLevel1))
  ) {
    console.warn(`Template sanitizer (WARNING): Potentially dangerous attribute NOT removed because of current level (${securityLevel}) "${name}: ${value}"`);
  }

  return (shouldRemoveLevel1 && securityLevel > 0) || (shouldRemoveLevel2 && securityLevel === 2);
}

const spaceRegex = /\s+/g;
function sanitizeAttributeValue(name, value) {
  value = value.replace(spaceRegex, '').toLowerCase();
  if (value.match(dangerousAttributeValueRegex) !== null) {
    if (window.litheDev === true && securityLevel === 0) {
      console.warn(`Template sanitizer (WARNING): Potentially dangerous attribute NOT removed because of current level (${securityLevel}) "${name}: ${value}"`);
    } else return true;
  }

  return false;
}
