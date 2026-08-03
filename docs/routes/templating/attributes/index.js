import { Component, Signal } from '@thewebformula/lithe';
import htmlTemplate from './page.html';
import './components/attr-test.js';

class TemplateAttributesPage extends Component {
  static title = 'Templating attributes';
  static htmlTemplate = htmlTemplate;

  styleSignal = new Signal({
    color: 'white',
    backgroundColor: '#3f51b5',
    padding: '12px',
    borderRadius: '4px'
  });

  constructor() {
    super();
  }

  changeTextColor = color => {
    console.log(color);
    this.styleSignal.value = {
      ...this.styleSignal.value,
      color
    };
  }

  changeBackgroundColor = color => {
    this.styleSignal.value = {
      ...this.styleSignal.value,
      backgroundColor: color
    };
  }
}
customElements.define('template-attributes-page', TemplateAttributesPage);
