let STYLE_SHEET_TEMPLATE = Symbol('STYLE_SHEET_TEMPLATE');
let cache = new Map();


export function isCss(value) {
  return value?.[STYLE_SHEET_TEMPLATE];
}

export function css(strings, ...values) {
  if (cache.has(strings)) return cache.get(strings);

  let joined = '';
  for (let i = 0; i < strings.length; i++) {
    let s = strings[i];
    if (i > 0) {
      let value = values[i - 1];
      if (value[STYLE_SHEET_TEMPLATE]) {
        joined += value.cssText;
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        joined += value;
      } else {
        throw Error(`Unsafe value passed in: ${(strings[i - 1] || '').split('\n').pop().trim()}"${value}" - only css function results, numbers, and booleans are allowed`);
      }
    }
    joined += s;
  }
  const template = new StyleSheetTemplate(joined);
  cache.set(strings, template);

  return template;
}

// This allows for nesting of css templates
class StyleSheetTemplate {
  [STYLE_SHEET_TEMPLATE] = true;

  #cssText;
  #styleSheet;

  constructor(cssText) {
    this.#cssText = cssText;
  }

  get cssText() {
    return this.#cssText;
  }

  get CSSStyleSheet() {
    if (!this.#styleSheet) {
      const styleSheet = new CSSStyleSheet();
      styleSheet.replaceSync(this.#cssText);
      this.#styleSheet = styleSheet;
    }
    return this.#styleSheet
  }
}
