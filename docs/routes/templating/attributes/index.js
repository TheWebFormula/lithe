import { Component, Cue } from '@thewebformula/lithe';
import htmlTemplate from './page.html';
import './components/attr-test.js';

class TemplateAttributesPage extends Component {
  static title = 'Templating attributes';
  static htmlTemplate = htmlTemplate;

  styleState = new Cue.State({
    color: 'white',
    backgroundColor: '#3f51b5',
    padding: '12px',
    borderRadius: '4px'
  });

  constructor() {
    super();
  }

  changeTextColor = color => {
    this.styleState.set({
      ...this.styleState.get(),
      color
    });
  }

  changeBackgroundColor = color => {
    this.styleState.set({
      ...this.styleState.get(),
      backgroundColor: color
    });
  }
}
customElements.define('template-attributes-page', TemplateAttributesPage);
