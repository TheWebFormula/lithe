import { Component } from '@thewebformula/lithe';
import htmlTemplate from './page.html';

class FetcherPage extends Component {
  static title = 'Fetcher';
  static htmlTemplate = htmlTemplate;

  constructor() {
    super();
  }
}
customElements.define('fetcher-page', FetcherPage);
