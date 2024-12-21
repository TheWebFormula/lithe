import { Component } from '@thewebformula/lithe';
import htmlTemplate from './page.html';

class NotFoundPage extends Component {
  static title = 'Not found';
  static htmlTemplate = htmlTemplate;

  constructor() {
    super();
  }
}
customElements.define('not-found-page', NotFoundPage);
