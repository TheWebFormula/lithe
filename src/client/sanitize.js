const securityLevels = [0, 1, 2];
let securityLevel = 1;
const securityLevelMeta = document.querySelector('meta[name=lisecuritylevel]');
if (securityLevelMeta) setSecurityLevel(parseInt(securityLevelMeta.getAttribute('content')));

let devWarnings = false;
const devWarningsMeta = document.querySelector('meta[name=lidevwarnings]');
if (devWarningsMeta) devWarnings = true;

const dangerousNodes = ['SCRIPT', 'IFRAME', 'NOSCRIPT', 'OBJECT', 'APPLET', 'EMBBED', 'FRAMESET'];
const dangerousAttributesLevel1 = ['onload', 'onerror'];
let dangerousTagRegex = new RegExp(dangerousNodes.join('|'));
let dangerousAttributeRegex = new RegExp(dangerousAttributesLevel1.join('|'));
const dangerousAttributeValueRegex = /javascript:|eval\(|alert|document.cookie|document\[['|"]cookie['|"]\]|&\#\d/gi;
const attrAppValueRegex = /^(?:page\.|this\.)/;




export function setSecurityLevel(level = 1) {
  if (!securityLevels.includes(level)) throw Error('Invalid security level. Valid values [0,1,2]')
  securityLevel = level;
}

export function setDangerousTagRegex(tagNames = []) {
  dangerousTagRegex = new RegExp(tagNames.map(v => v.toUpperCase()).join('|'));
}

export function setDangerousAttributes(attributeNames = []) {
  dangerousAttributeRegex = new RegExp(attributeNames.join('|'));
}



/**
 * Provide basic protection from XSS
 *   This is meant as a safety net. This should not be relied on to prevent attacks.
 * 
 * TODO replace with HTML Sanitizer API when available. Currently still in working spec
 */
export function sanitizeNode(node) {
  let sanitized = false;

  if (dangerousTagRegex.test(node.nodeName)) {
    if (securityLevel === 0) {
      if (devWarnings === true) console.warn(`Template sanitizer (WARNING): Potentially dangerous node NOT removed because of current level (${securityLevel}) "${node.nodeName}"`);
    } else {
      if (devWarnings === true) console.warn(`Template sanitizer (INFO): A ${node.nodeName} tag was removed because of security level (${securityLevel})`);
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
    if (devWarnings === true) console.warn(`Template sanitizer (INFO): Attribute removed "${attr.name}: ${attr.value}"`);
    attr.ownerElement.removeAttribute(attr.name);
    return true;
  }
  return false;
}

function sanitizeAttributeName(name, value) {
  let shouldRemoveLevel2 = false;
  let shouldRemoveLevel1 = false;

  if (name.startsWith('on')) shouldRemoveLevel2 = true;
  if (dangerousAttributeRegex.test(name)) shouldRemoveLevel1 = true;
  
  // TODO validate this is a good approach to filter out values accessing app code
  const notValidAppValue = (shouldRemoveLevel2 || shouldRemoveLevel1) && !attrAppValueRegex.test(value);

  if (
    notValidAppValue &&
    devWarnings === true &&
    (securityLevel === 1 && shouldRemoveLevel2 && !shouldRemoveLevel1)
    || (devWarnings === true && securityLevel === 0 && (!shouldRemoveLevel2 || !shouldRemoveLevel1))
  ) {
    console.warn(`Template sanitizer (WARNING): Potentially dangerous attribute NOT removed because of current level (${securityLevel}) "${name}: ${value}"`);
  }
  return notValidAppValue && ((shouldRemoveLevel1 && securityLevel > 0) || (shouldRemoveLevel2 && securityLevel === 2));
}

const spaceRegex = /\s+/g;
function sanitizeAttributeValue(name, value) {
  value = value.replace(spaceRegex, '').toLowerCase();
  if (value.match(dangerousAttributeValueRegex) !== null) {
    if (devWarnings === true && securityLevel === 0) {
      console.warn(`Template sanitizer (WARNING): Potentially dangerous attribute NOT removed because of current level (${securityLevel}) "${name}: ${value}"`);
    } else return true;
  }

  return false;
}
