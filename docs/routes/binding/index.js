import { Component, Signal, Compute, SignalObject } from '@thewebformula/lithe';
import htmlTemplate from './page.html';


class SignalsAndBindingPage extends Component {
  static title = 'Signals and binding';
  static htmlTemplate = htmlTemplate;

  basicBind = new Signal('');
  number = new Signal(1);
  numberTimesTwo = new Compute(() => {
    return this.number.value * 2;
  });
  obj = new SignalObject({
    one: 'one',
    count: 1,
    nested: {
      two: 'two'
    }
  });


  constructor() {
    super();
  }

  updateValue() {
    this.basicBind.value = 'Updated';
  }
}
customElements.define('signals-binding-page', SignalsAndBindingPage);
