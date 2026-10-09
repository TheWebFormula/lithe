import { Component, Cue } from '@thewebformula/lithe';
import htmlTemplate from './page.html';


class CueAndBindingPage extends Component {
  static title = 'Cue\'s and binding';
  static htmlTemplate = htmlTemplate;

  basicBind = new Cue.State('');
  number = new Cue.State(1);
  numberTimesTwo = new Cue.Compute(() => {
    return this.number.get() * 2;
  });
  obj = new Cue.Object({
    one: 'one',
    count: 1,
    nested: {
      two: 'two'
    }
  });

  itemsCheckList = new Cue.Array([
    { label: 'One', checked: false },
    { label: 'Two', checked: false },
    { label: 'Three', checked: true }
  ]);


  constructor() {
    super();
  }

  updateValue() {
    this.basicBind.set('Updated');
  }

  addToCheckList() {
    this.itemsCheckList.get().push({
      label: 'New Item',
      checked: false
    });
  }
}
customElements.define('cue-binding-page', CueAndBindingPage);
