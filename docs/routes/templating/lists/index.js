import { Component, Signal, SignalObject, SignalArray, effect } from '@thewebformula/lithe';
import htmlTemplate from './page.html';

window.SignalArray = SignalArray;

class TemplateListsPage extends Component {
  static title = 'Templating lists';
  static htmlTemplate = htmlTemplate;


  items = new Signal([
    { value: 'One' },
    { value: 'Two' },
    { value: 'Three' }
  ]);

  itemsWithKey = new Signal([
    { value: 'One' },
    { value: 'Two' },
    { value: 'Three' }
  ]);

  itemsCheckList = new SignalArray([
    { label: 'One', checked: false },
    { label: 'Two', checked: false },
    { label: 'Three', checked: true }
  ]);

  #disposeItemsCheckListEffect;

  afterRender() {
    this.#disposeItemsCheckListEffect = effect(() => {
      const element = this.querySelector('#selectall');
      const allChecked = this.itemsCheckList.value.every(item => item.checked);
      const someChecked = this.itemsCheckList.value.some(item => item.checked);
      element.indeterminate = !allChecked && someChecked;
      element.checked = allChecked;
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    if (this.#disposeItemsCheckListEffect) this.#disposeItemsCheckListEffect();
  }


  addItem(value) {
    if (!value) return;
    this.items.value = [...this.items.value, { value }];
  }

  addItemWithKey(value) {
    if (!value) return;
    this.itemsWithKey.value = [...this.itemsWithKey.value, { value }];
  }

  selectAll(event) {
    const value = !event.target.checked;
    event.target.value = value
    for (let item of this.itemsCheckList.value) {
      item.checked = value;
    }
  }

  addToCheckList() {
    this.itemsCheckList.value.push({
      label: 'New Item',
      checked: false
    });
  }

  removeToCheckList() {
    this.itemsCheckList.value.pop();
  }

  current = 0;
  count = 10_000;
  count2 = 10;
  addLots() {
    let arr = [];
    for (let i = 0; i < this.count; i++) {
      arr.push({ value: this.current + i });
    }
    this.current += this.count;
    this.itemsWithKey.value = [...this.itemsWithKey.value, ...arr];
  }

  updateLots() {
    let arr = [];
    for (let i = 0; i < this.count2; i++) {
      arr.push({ value: this.current + i });
    }
    this.current += this.count2;
    this.itemsWithKey.value = [...this.itemsWithKey.value, ...arr];
  }

  setOrig() {
    this.itemsWithKey.value = [
      { value: 'One' },
      { value: 'Two' },
      { value: 'Three' }
    ];
  }
}
customElements.define('template-lists-page', TemplateListsPage);




// <mc-button onclick="page.addLots()">Add lots</mc-button>
// <mc-button onclick="page.updateLots()">update lots</mc-button>
// <mc-button onclick="page.setOrig()">Revert</mc-button>
// <div style="margin: 42px 0px;">
//   <div class="mc-font-title-large" style="margin-bottom: 8px;">Signal list with value as key</div>
//    <div class="mc-font-title-small" style="margin-bottom: 8px;">You cannot have 2 items with the same key</div>
//   <mc-textfield id="valueinputwithkey" placeholder="...value" style="margin-right: 9px"></mc-textfield>
//   <mc-button onclick="page.addItemWithKey(valueinputwithkey.value)" style="margin-top: 12px;">Add value</mc-button>
//   ${html(() => page.itemsWithKey.value.map(item => html`<div key="${item.value}">Value: ${item.value}</div>`))}
// </div>
