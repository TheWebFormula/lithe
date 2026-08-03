import { Component, Signal } from '@thewebformula/lithe';
import htmlTemplate from './page.html';

class TemplateOverviewPage extends Component {
  static title = 'Templating overview';
  static htmlTemplate = htmlTemplate;

  constructor() {
    super();
  }
}
customElements.define('template-overview-page', TemplateOverviewPage);
