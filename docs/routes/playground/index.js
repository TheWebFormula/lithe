import { Component } from '@thewebformula/lithe';
import htmlTemplate from './page.html';


class PlaygroundPage extends Component {
  static title = 'Home';
  static htmlTemplate = htmlTemplate;

  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback();
    document.body.classList.add('no-padding');
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.body.classList.remove('no-padding');
  }
}
customElements.define('playground-page', PlaygroundPage);
