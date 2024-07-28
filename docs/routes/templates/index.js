import { Component, Signal } from '@thewebformula/lithe';
import htmlTemplate from './page.html';

export default class extends Component {
  static title = 'Templates';
  static htmlTemplate = htmlTemplate;

  plainText = 'plainText value';
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
