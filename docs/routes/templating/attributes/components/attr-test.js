import { Component, html, Signal } from '@thewebformula/lithe';
import styles from'./styles.css';

class AttrTest extends Component {
  static styleSheets = [styles];

  _str = new Signal('value');
  _disabled = new Signal(false);
  _enable = new Signal(true);
  _counter = new Signal(1);
  _percent = new Signal(0.1);
  _data = new Signal({ one: 'one', two: 2 });


  static get observedAttributesExtended() {
    return {
      str: { type: 'string' },
      disabled: { type: 'toggle' },
      enable: { type: 'boolean' },
      counter: { type: 'int' },
      percent: { type: 'number' },
      data: { type: 'object' }
    };
  }

  attributeChangedCallbackExtended(name, oldValue, newValue) {
    // this[name] = newValue;
  }

  get str() { return this._str.value; }
  set str(value) { this._str.value = value; }

  get enable() { return this._enable.value; }
  set enable(value) { this._enable.value = value; }

  get counter() { return this._counter.value; }
  set counter(value) { this._counter.value = value; }

  get percent() { return this._percent.value; }
  set percent(value) { this._percent.value = value; }

  get data() { return this._data.value; }
  set data(value) { this._data.value = value; }

  get disabled() { return this._disabled.value; }
  set disabled(value) { this._disabled.value = value; }

  constructor() {
    super();
  }

  connectedCallback() {
    this.render();
  }

  #onInput(e) {
    this._str.value = e.target.value;
  }

  #disableChange(e) {
    const prev = this._disabled.value;
    this._disabled.value = !prev;
  }

  #enableChange(e) {
    const prev = this._enable.value;
    this._enable.value = !prev;
  }

  #onInputCounter(e) {
    this._counter.value = e.target.value;
  }

  #percentChange(e) {
    this._percent.value = e.target.value;
  }

  // template() {
  //   return html`<mc-slider min="0" max="1" value="${this._percent}" step="0.1" onchange=${(e) => this.#percentChange(e)}>Percent (number)</mc-slider>`;
  // }

  template() {
    return html`
      <div>
        <div style="display: flex; gap: 12px;">
          <div style="display:flex; flex-direction: column; flex: 1 1 auto;">
            <mc-textfield
              label="Value (string)"
              value=${this._str}
              oninput=${(e) => this.#onInput(e)}
            ></mc-textfield>

            <mc-textfield
              label="Counter (int)"
              type="number"
              value=${this._counter}
              oninput=${(e) => this.#onInputCounter(e)}
            ></mc-textfield>
          </div>
          <div style="display:flex; flex-direction: column; flex: 1 1 auto;">

            <mc-switch
              label="disabled (toggle)"
              checked=${this._disabled}
              onchange=${(e) => this.#disableChange(e)}
            ></mc-switch>

            <div value=${true} ></div>

            <mc-switch
              label="Enable (boolean)"
              checked=${this._enable}
              onchange=${(e) => this.#enableChange(e)}
            ></mc-switch>

            <mc-slider min="0" max="1" value="${this._percent}" step="0.1" onchange=${(e) => this.#percentChange(e)} >Percent (number)</mc-slider>
          </div>
        </div>
      ${html(() => {
        const str = this._str.value;
        const disabled = this._disabled.value;
        const enable = this._enable.value;
        const counter = this._counter.value;
        const percent = this._percent.value;
        const data = JSON.stringify(this._data.value);
        
        return html`<code-block language="html">
          <pre>
${`<!-- HTML rendered -->
<attr-test
  str="${str}"
  ${disabled ? 'disabled' : ''}
  enable="${enable}"
  counter="${counter}"
  percent="${percent}"
  data
></attr-test>`}
          </pre>
        </code-block>`})}
      </div>
    `;
  }
}
customElements.define('attr-test', AttrTest);
