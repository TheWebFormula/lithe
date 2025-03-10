import { Component, Signal } from '@thewebformula/lithe';
import htmlTemplate from './page.html';

class TemplatesPage extends Component {
  static title = 'Templates';
  static htmlTemplate = htmlTemplate;

  plainText = 'some value';
  signalVar = new Signal('signalVar value');
  loopVar = new Signal([
    { value: 'One' },
    { value: 'Two' },
    { value: 'Three' }
  ]);
  showFirst = new Signal(true);

  constructor() {
    super();
  }

  addValue(value) {
    if (!value) return;
    this.loopVar.value = [...this.loopVar.value, {value}];
  }
}
customElements.define('templates-page', TemplatesPage);
