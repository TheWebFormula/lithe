import { Component, policyHTML } from '@thewebformula/lithe';
import Prism from 'prismjs';
import snackbarService from '@thewebformula/materially/services/snackbar';


class CodeBlock extends Component {
  #language;
  #buttonHTML = policyHTML.createHTML('<button>copy</button>');
  #copyClick_bound = this.#copyClick.bind(this);
  id = `code-block-${parseInt(Math.random() * 1000000)}`;

  constructor() {
    super();

    this.setAttribute('id', this.id);
  }

  static observedAttributesExtended = {
    language: { type: 'string' }
  };


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
    super.connectedCallback();

    const pre = this.querySelector('pre');
    const html = Prism.highlight(pre.textContent, Prism.languages[this.#language], this.#language);
    const trustedHTML = policyHTML.createHTML(html);
    pre.innerHTML = trustedHTML;

    if (!this.hasAttribute('linked')) {
      this.insertAdjacentHTML('afterbegin', this.#buttonHTML);
      this.querySelector('button').addEventListener('click', this.#copyClick_bound);
    }
  }

  disconnectedCallback() {
    let button = this.querySelector('button');
    if (button) button.removeEventListener('click', this.#copyClick_bound);
  }

  #copyClick() {
    let text = this.querySelector('pre').textContent.replace(/^\s*\n/, '').replace(/\n\s*$/, '');
    let linked = this.parentElement.querySelectorAll(`#${this.id} ~ [linked]`);
    linked.forEach(el => {
      text += `\n${el.textContent}`.replace(/\n\s*$/, '');
    });
    navigator.clipboard.writeText(text);
    snackbarService.show({
      message: 'Code copied to clipboard',
      classNames: 'snackbar-fix'
    });
  }
}
customElements.define('code-block', CodeBlock);
