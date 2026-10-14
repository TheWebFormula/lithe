import { Component, html } from '@thewebformula/lithe';
import { value } from './data.js';

class ValueInput extends Component {

  template() {
    return html`
      <div>
        <label for="input" style="margin-right: 12px;">Value input:</label>
        <input name="input" value=${value} oninput=${(e) => value.set(e.target.value)}>
      </div>
    `;
  }
}
customElements.define('value-input', ValueInput);
