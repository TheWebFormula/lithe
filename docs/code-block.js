import { Component, policyHTML } from '@thewebformula/lithe';
import hljs from 'highlight.js/lib/core';
import jsln from 'highlight.js/lib/languages/javascript';
import cssln from 'highlight.js/lib/languages/css';
import htmlln from 'highlight.js/lib/languages/xml';
import bashln from 'highlight.js/lib/languages/bash';
import yamlln from 'highlight.js/lib/languages/yaml';

hljs.registerLanguage('javascript', jsln);
hljs.registerLanguage('html', htmlln);
hljs.registerLanguage('css', cssln);
hljs.registerLanguage('bash', bashln);
hljs.registerLanguage('yaml', yamlln);
hljs.configure({ ignoreUnescapedHTML: true, cssSelector: 'code-block pre' });

class CodeBlock extends Component {
  #language;
  #buttonHTML = policyHTML.createHTML('<button>copy</button>');
  #copyClick_bound = this.#copyClick.bind(this);

  constructor() {
    super();
  }

  static get observedAttributesExtended() {
    return [
      ['language', 'string']
    ];
  }

  attributeChangedCallbackExtended(name, _oldValue, newValue) {
    this[name] = newValue;
  }

  get language() {
    return this.#language;
  }

  set language(value) {
    this.#language = value;
    this.querySelector('pre').classList.add(`language-${value}`);
  }

  connectedCallback() {
    const pre = this.querySelector('pre');
    pre.classList.add('hljs');
    const highlighted = hljs.highlightAuto(pre.textContent);
    const trustedHTML = policyHTML.createHTML(highlighted.value);
    pre.innerHTML = trustedHTML;
    this.insertAdjacentHTML('afterbegin', this.#buttonHTML);
    this.querySelector('button').addEventListener('click', this.#copyClick_bound);
  }

  disconnectedCallback() {
    let button = this.querySelector('button');
    if (button) button.removeEventListener('click', this.#copyClick_bound);
  }

  #copyClick() {
    let text = this.querySelector('pre').textContent.replace(/^\s*\n/, '').replace(/\n\s*$/, '');
    navigator.clipboard.writeText(text);
  }
}
customElements.define('code-block', CodeBlock);
