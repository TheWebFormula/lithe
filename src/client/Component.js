import { html, watchSignals, destroySignalCache } from './html.js';


const dashCaseRegex = /-([a-z])/g;
const onRegex = /^on/;
let templates = new Map();

export default class Component extends HTMLElement {
  static useShadowRoot = false;
  static shadowRootDelegateFocus = false;

  static _html = html;
  static htmlTemplate = '';
  static styleSheets = [];

  static get observedAttributesExtended() { return []; };
  static get observedAttributes() { return this.observedAttributesExtended.map(a => a[0]); }

  #attributeEvents = new Map();
  #attributesLookup;
  #prepared = false;

  constructor() {
    super();

    this.#attributesLookup = Object.fromEntries(this.constructor.observedAttributesExtended);
    if (this.constructor.useShadowRoot) {
      this.attachShadow({ mode: 'open', delegatesFocus: this.constructor.shadowRootDelegateFocus });
    } else if (this.constructor.styleSheets[0] instanceof CSSStyleSheet) {
      document.adoptedStyleSheets.push(...this.constructor.styleSheets);
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    const type = this.#attributesLookup[name];
    name = name.replace(dashCaseRegex, (_, s) => s.toUpperCase());
    if (type === 'event') {
      if (this.#attributeEvents.has(name)) {
        this.removeEventListener(name.replace(onRegex, ''), this.#attributeEvents.get(name));
        this.#attributeEvents.delete(name);
      }
      if (newValue) {
        this.#attributeEvents.set(name, this.#attributeDescriptorTypeConverter(newValue, type));
        this.addEventListener(name.replace(onRegex, ''), this.#attributeEvents.get(name));
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
  attributeChangedCallbackExtended(name, oldValue, newValue) { }

  get searchParameters() {
    return Object.fromEntries([...new URLSearchParams(location.search).entries()]);
  }

  get urlParameters() {
    return location.pathname.match(this._pathRegex)?.groups;
  }

  render() {
    if (!this.#prepared) this.#prepareRender();

    destroySignalCache();
    if (this.constructor.useShadowRoot) this.shadowRoot.appendChild(this.template());
    else this.appendChild(this.template());
    watchSignals();
  }

  template() {}

  #prepareRender() {
    if (!templates.has(this.constructor)) {
      const templateString = this.constructor.htmlTemplate || this.template.toString().replace(/^[^`'"]*/, '').replace(/[^`'"]*$/, '').slice(1, -1);
      templates.set(this.constructor, new Function('page', `return page.constructor._html\`${templateString}\`;`));
    }
    
    if (this.constructor.useShadowRoot && this.constructor.styleSheets[0] instanceof CSSStyleSheet) {
      this.shadowRoot.adoptedStyleSheets = this.constructor.styleSheets;
    }

    // scope template function
    this.template = () => templates.get(this.constructor).call(this, this);
    this.#prepared = true;
  }

  #attributeDescriptorTypeConverter(value, type) {
    switch (type) {
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
      case 'event':
        return !value ? null : () => new Function('page', value).call(this, this);
      default:
        return value;
    }
  }
}
