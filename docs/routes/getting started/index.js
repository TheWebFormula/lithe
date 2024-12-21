import { Component } from '@thewebformula/lithe';
import htmlTemplate from './page.html';

class GettingStartedPage extends Component {
  static title = 'Getting started';
  static htmlTemplate = htmlTemplate;

  constructor() {
    super();
  }
}
customElements.define('getting-started-page', GettingStartedPage);
