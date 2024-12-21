import { Component } from '@thewebformula/lithe';
import htmlTemplate from './page.html';

class HomePage extends Component {
  static title = 'Home';
  static htmlTemplate = htmlTemplate;

  constructor() {
    super();
  }
}
customElements.define('home-page', HomePage);
