import { getSearchParameters, getUrlParameters } from './router.js';
import { html, activateComponent, deactivateComponent } from './html.js';
import { isCss } from './css.js';


const dashCaseRegex = /-([a-z])/g;
const camelCaseRegex = /([a-zA-Z])(?=[A-Z])/g;
const onRegex = /^on/;

/**
 * Component class used for pages and web components
 * @extends HTMLElement
 */
export default class Component extends HTMLElement {
  static _isPage = false;
  static _html = html;

  /**
   * Attach up shadow root
   * @type {Boolean}
   * @default false
   */
  static useShadowRoot = false;

  /**
   * Delegate focus for shadowRoot
   * @type {Boolean}
   * @default false
   */
  static shadowRootDelegateFocus = false;

  /**
   * Pass in HTML string. Use for imported .HTML
   *   Supports template literals: <div>${this.var}</div>
   *   alternative to using the template() method
   * @type {String}
   */
  static htmlTemplate = '';

  /**
   * Pass in styles.
   *   StyleSheetTemplate: Can use css tag: css`h1 { color: blue; }`
   *   CSSStyleSheet: Can use imported stylesheets: import styles from '../styles.css' assert { type: 'css' };
   * @type {CSSStyleSheet | StyleSheetTemplate | (CSSStyleSheet | StyleSheetTemplate)[]}
   */
  static styles = [];


  /**
   * Page title
   * @type {String}
   */
  static title;

  /**
   * @typedef {String} AttributeConfig
   * @value 'string' Convert to a string. null = ''
   * @value 'number' Convert to a number. isNaN = ''
   * @value 'int' Convert to a int. isNaN = ''
   * @value 'toggle' Add / remove attribute
   * @value 'boolean' Convert to a boolean. null = false
   * @value 'object' pass in an object. The attribute will have no value displayed in the DOM
   * @value 'event' Allows code to be executed. Similar to onchange="console.log('test')"
   */
  /**
    * @typedef {Object} AttributeConfig
    * @property {AttributeType} type - The parsed primitive type of the attribute
    * @property {Boolean} [reflect=true] - Whether the attribute should be reflected to the DOM (converted to dash case when reflected)
    */
  /**
    * Extended observedAttributes, allowing you to specify types
    * @static
    * @type {Record<string, AttributeConfig>}
    */
  static observedAttributesExtended = {};
  static _attrConfig;
  static get attrConfig() {
    if (!this._attrConfig) {
      let extendedAttrs = Object.entries(this.observedAttributesExtended);
      let attrs = extendedAttrs.length > 0 ? extendedAttrs : this.observedAttributes.map(v => ([v, { type: 'string', reflect: true }]));
      this._attrConfig = Object.fromEntries(attrs.map(a => {
        let type = a[1].type;
        let reflect = a[1].reflect === false ? false : true;
        if (!this.attributeTypes.includes(type)) {
          console.warn(`Incorrect attribute type ${type || 'none'} on ${this.tagName || this.name}[${a[0]}]. (${this.attributeTypes.join(', ')})`);
          type = 'string';
        }
        return [a[0], {
          name: a[0],
          type,
          reflect
        }];
      }));
    }

    return this._attrConfig;
  }

  static attributeTypes = ['string', 'toggle', 'boolean', 'int', 'number', 'object', 'event'];
  static get observedAttributes() { return Object.entries(this.observedAttributesExtended).map(a => a[0].replace(camelCaseRegex, '$1-').toLowerCase()); }

  /**
   * Use with observedAttributesExtended
   *   This automatically handles type conversions and duplicate calls from setting attributes
   * @name observedAttributesExtended
   * @function
   */
  // static get observedAttributesExtended() { }

  #attributeEvents = new Map();
  #prepared = false;
  #noTemplates = false;
  #currentTemplate;


  constructor() {
    super();

    // Check if a subclass overrides connectedCallback but fails to call super.connectedCallback
    if (this.constructor.prototype.hasOwnProperty('connectedCallback') && !this.constructor.prototype.connectedCallback.toString().includes('super.connectedCallback')) {
      console.error(`${this.constructor.name} overrides connectedCallback but fails to call super.connectedCallback(). You can use afterRender() also.`);
    }

    // Check if a subclass overrides disconnectedCallback but fails to call super.disconnectedCallback
    if (this.constructor.prototype.hasOwnProperty('disconnectedCallback') && !this.constructor.prototype.disconnectedCallback.toString().includes('super.disconnectedCallback')) {
      console.error(`${this.constructor.name} overrides disconnectedCallback but fails to call super.disconnectedCallback(). You can use afterRender() also.`);
    }

    if (this.constructor.useShadowRoot) {
      this.attachShadow({ mode: 'open', delegatesFocus: this.constructor.shadowRootDelegateFocus });
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;

    // placeholders can leak through on initial parse
    if (oldValue === '{_ex_}') oldValue = '';
    if (newValue === '{_ex_}') newValue = '';

    name = name.replace(dashCaseRegex, (_, s) => s.toUpperCase());
    const attrConfig = this.constructor.attrConfig[name];
    if (attrConfig?.type === 'event') {
      if (this.#attributeEvents.has(name)) {
        this.removeEventListener(name.replace(onRegex, ''), this.#attributeEvents.get(name));
        this.#attributeEvents.delete(name);
      }
      if (newValue) {
        this.#attributeEvents.set(name, this.#attributeDescriptorTypeConverter(newValue, attrConfig.type));
        this.addEventListener(name.replace(onRegex, ''), this.#attributeEvents.get(name));
      }
    } else {
      this.attributeChangedCallbackExtended(
        name,
        this.#attributeDescriptorTypeConverter(oldValue, attrConfig?.type),
        this.#attributeDescriptorTypeConverter(newValue, attrConfig?.type)
      );
    }
  }

  /**
   * Use with observedAttributesExtended
   * @function
   * @param {String} name - Attribute name (converted to camel case)
   * @param {String} oldValue - Old attribute value
   * @param {String} newValue - New attribute value
   */
  attributeChangedCallbackExtended(name, oldValue, newValue) { }

  /**
   * Returns an object with url search parameters
   * @returns {Object.<string, string>} Object with search parameters
   */
  get searchParameters() {
    return getSearchParameters();
  }

  /**
   * Returns an object with url parameters
   * @returns {Object.<string, string>} Object with url parameters
   */
  get urlParameters() {
    return getUrlParameters();
  }

  /**
   * Called when url changes for current page
   * This helps when a page uses optional parameters: /page[id?]
   * */
  urlChange() {}


  connectedCallback() { this._render(); }
  disconnectedCallback() {
    if (this.#currentTemplate) this.#currentTemplate.disconnect();
    if (!this.constructor.useShadowRoot) this.#removeDocumnetStyles();
  }

  /** Called before render */
  beforeRender() { }

  /** Called after render */
  afterRender() { }

  /**
   * Method that returns a html template string. This is an alternative to use static htmlTemplate
   *    template() {
   *       return html`<div>${this.var}</div>`;
   *    }
   * @name template
   * @function
   * @return {TemplateInstance}
   */
  template() { }

  _render() {
    if (!this.#prepared) this.#prepareRender();
    if (this.#noTemplates) return;

    this.beforeRender();

    if (this.constructor._isPage) this.style.display = 'contents';

    activateComponent();
    try {
      this.#currentTemplate = this.template();
      if (this.constructor.useShadowRoot) this.shadowRoot.appendChild(this.#currentTemplate.fragment);
      else this.appendChild(this.#currentTemplate.fragment);
    } catch (e) {
      console.error(e);
      console.error('There was an error processing the template for', this.constructor.name);
    }
    deactivateComponent();

    this.afterRender();
  }

  template2() { }

  #prepareRender() {
    // prevent rendering if there is no template
    this.#noTemplates = this.constructor.prototype.template === Component.prototype.template && this.constructor.htmlTemplate === Component.htmlTemplate;

    if (!this.#noTemplates) {
      this.#addStyles();
      if (typeof this.constructor.htmlTemplate === 'function') this.template = () => this.constructor.htmlTemplate(this);
    }

    this.#prepared = true;
  }

  #addStyles() {
    const styles = Array.isArray(this.constructor.styles) ? this.constructor.styles : [this.constructor.styles];
    const root = this.constructor.useShadowRoot ? this.shadowRoot : document;
    if (styles.length > 0) {
      for (let style of styles) {
        if (style instanceof CSSStyleSheet) {
          root.adoptedStyleSheets.push(style);
        } else if (isCss(style)) {
          root.adoptedStyleSheets.push(style.CSSStyleSheet);
        }
      }
    }
  }

  #removeDocumnetStyles() {
    const styles = Array.isArray(this.constructor.styles) ? this.constructor.styles : [this.constructor.styles];
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter(s => {
      for (let style of styles) {
        if (style instanceof CSSStyleSheet) {
          if (s === style) return false;
        } else if (isCss(style)) {
          if (s === style.CSSStyleSheet) return false;
        }
      }

      return true;
    })
  }

  #attributeDescriptorTypeConverter(value, type) {
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
        if (value === '' || value === undefined) return '';
        else if (typeof value === 'object') return value;
        return value;
        // return JSON.parse(value);
      case 'event':
        const that = this.constructor._isPage ? this : page || this;
        return !value ? null : () => new Function('page', value).call(that, that);
      default:
        return value;
    }
  }
}
