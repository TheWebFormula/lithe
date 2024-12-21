import { Component } from '@thewebformula/lithe';
import htmlTemplate from './page.html';

class WebComponentsPage extends Component {
  static title = 'Web component';
  static htmlTemplate = htmlTemplate;

  constructor() {
    super();
  }
}
customElements.define('web-components-page', WebComponentsPage);
