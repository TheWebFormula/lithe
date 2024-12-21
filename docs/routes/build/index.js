import { Component } from '@thewebformula/lithe';
import htmlTemplate from './page.html';

class BuildPage extends Component {
  static title = 'Build';
  static htmlTemplate = htmlTemplate;

  constructor() {
    super();
  }
}
customElements.define('build-page', BuildPage);
