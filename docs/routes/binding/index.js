import { Component, Signal, Compute } from '@thewebformula/lithe';
import htmlTemplate from './page.html';


export default class extends Component {
  static title = 'Signals and binding';
  static htmlTemplate = htmlTemplate;

  basicBind = new Signal('');
  number = new Signal(1);
  numberTimesTwo = new Compute(() => {
    return this.number.value * 2;
  });
  one = new Signal('one');
  two = new Signal('two');


  constructor() {
    super();
  }

  updateValue() {
    this.basicBind.value = 'Updated';
  }
}
