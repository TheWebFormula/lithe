import { Component, Signal, SignalObject, effect } from '@thewebformula/lithe';
import htmlTemplate from './page.html';

class TemplateListsPage extends Component {
  static title = 'Templating lists';
  static htmlTemplate = htmlTemplate;


  items = new Signal([
    { value: 'One' },
    { value: 'Two' },
    { value: 'Three' }
  ]);

  itemsObject = new SignalObject([
    { label: 'One', checked: false },
    { label: 'Two', checked: false },
    { label: 'Three', checked: true }
  ]);

  #disposeItemsObjectEffect;

  afterRender() {
    this.#disposeItemsObjectEffect = effect(() => {
      const element = this.querySelector('#selectall');
      const allChecked = this.itemsObject.value.every(item => item.checked);
      const someChecked = this.itemsObject.value.some(item => item.checked);
      element.indeterminate = !allChecked && someChecked;
      element.checked = allChecked;
    });
  }

  disconnectedCallback() {
    if (this.#disposeItemsObjectEffect) this.#disposeItemsObjectEffect();
  }


  addItem(value) {
    if (!value) return;
    this.items.value = [...this.items.value, { value }];
  }

  selectAll(event) {
    const value = !event.target.checked;
    event.target.value = value
    this.itemsObject.value.forEach(item => item.checked = value);
  }
}
customElements.define('template-lists-page', TemplateListsPage);
