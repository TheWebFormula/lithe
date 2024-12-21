import { Component } from '@thewebformula/lithe';

class CodeBlock extends Component {
  #language;
  #copyClick_bound = this.#copyClick.bind(this);

  constructor() {
    super();
    console.log('ok');
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
    this.insertAdjacentHTML('afterbegin', '<button>copy</button>');
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
