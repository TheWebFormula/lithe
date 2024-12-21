import { Component } from '@thewebformula/lithe';
import htmlTemplate from './page.html';

class ViewTransitionsPage extends Component {
  static title = 'View transitions';
  static htmlTemplate = htmlTemplate;

  constructor() {
    super();
  }
}
customElements.define('view-transitions-page', ViewTransitionsPage);
