import { Component } from '@thewebformula/lithe';
import htmlTemplate from './page.html';

class RouteingPage extends Component {
  static title = 'Routing';
  static htmlTemplate = htmlTemplate;

  constructor() {
    super();
  }
}
customElements.define('routing-page', RouteingPage);
