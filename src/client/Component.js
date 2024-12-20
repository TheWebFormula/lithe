import { html, watchSignals, destroySignalCache } from './html.js';

const dashCaseRegex = /-([a-z])/g;
const onRegex = /^on/;
let templates = new Map();

/**
 * Component class used for pages and web components
 * @extends HTMLElement
 */
export default class Component extends HTMLElement {
  // used for building and routing
  static _isPage = false;
  static _defined = false;
  static _isBuild = false;

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
  static htmlTemplate = '';

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
  static get observedAttributesExtended() { return []; };
  static get observedAttributes() { return this.observedAttributesExtended.map(a => a[0]); }

  /**
    * Use with observedAttributesExtended
    *   This automatically handles type conversions and duplicate calls from setting attributes
    * @name observedAttributesExtended
    * @function
    */
  // static get observedAttributesExtended() { }

  #attributeEvents = new Map();
  #attributesLookup;
  #prepared;
  #pageContent;

  constructor() {
    super();

    this.#attributesLookup = Object.fromEntries(this.constructor.observedAttributesExtended);
    if (this.constructor._isPage) {
      this.#pageContent = document.querySelector('#page-content');
      if (!this.#pageContent) throw Error('Could not find page-content');
      this.style.display = 'contents';
    }

    if (this.constructor.useShadowRoot) {
      this.attachShadow({ mode: 'open', delegatesFocus: this.constructor.shadowRootDelegateFocus });
    } else if (this.constructor.styleSheets[0] instanceof CSSStyleSheet) {
      document.adoptedStyleSheets.push(...this.constructor.styleSheets);
    }
  }

  connectedCallback() { }
  disconnectedCallback() { }

  /** Called before render */
  beforeRender() { }

  /** Called after render */
  afterRender() { }


  /**
   * Method that returns a html template string. This is an alternative to use static htmlTemplate
   *    template() {
   *       return `<div>${this.var}</div>`;
   *    }
   * @name template
   * @function
   * @return {String}
   */
  template() { }

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


  render() {
    if (!this.#prepared) this.#prepareRender();

    this.beforeRender();

    if (this.constructor._isPage) {
      destroySignalCache();
      this.replaceChildren(this.template());
      if (!this.isConnected) this.#pageContent.append(this);
      watchSignals();
    } else {
      if (this.constructor.useShadowRoot) this.shadowRoot.replaceChildren(this.template());
      else this.replaceChildren(this.template());
    }
    
    this.afterRender();
  }



  /** @private */
  _internalDisconnectedCallback() {
    destroySignalCache();
  }

  #prepareRender() {
    // set page title
    if (this.constructor._isPage) {
      const title = document.documentElement.querySelector('title');
      title.textContent = this.constructor.title;
    }

    // get or build template function
    let template = templates.get(this.constructor);
    if (!template) {
      const templateString = this.constructor.htmlTemplate || this.template.toString().replace(/^[^`]*/, '').replace(/[^`]*$/, '').slice(1, -1);
      template = new Function('page', `return page.constructor._html\`${templateString}\`;`);
      templates.set(this.constructor, template);
    }

    if (!this.constructor._isPage && this.constructor.useShadowRoot && this.constructor.styleSheets[0] instanceof CSSStyleSheet) {
      this.shadowRoot.adoptedStyleSheets = this.constructor.styleSheets;
    }

    // scope template function
    this.template = () => template.call(this, this);
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
