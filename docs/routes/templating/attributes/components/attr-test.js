import { Component, html, Cue } from '@thewebformula/lithe';


class AttrTest extends Component {
  _str = new Cue.State('value');
  _disabled = new Cue.State(false);
  _enable = new Cue.State(true);
  _counter = new Cue.State(1);
  _percent = new Cue.State(0.1);
  _data = new Cue.State({ one: 'one', two: 2 });
  _id = parseInt(Math.random() * 999999);


  static observedAttributesExtended = {
    str: { type: 'string' },
    disabled: { type: 'toggle' },
    enable: { type: 'boolean' },
    counter: { type: 'int' },
    percent: { type: 'number' },
    data: { type: 'object' }
  };

  attributeChangedCallbackExtended(name, oldValue, newValue) {
    this[name] = newValue;
  }

  get str() { return this._str.get(); }
  set str(value) { this._str.set(value); }

  get enable() { return this._enable.get(); }
  set enable(value) { this._enable.set(value); }

  get counter() { return this._counter.get(); }
  set counter(value) { this._counter.set(value); }

  get percent() { return this._percent.get(); }
  set percent(value) { this._percent.set(value); }

  get data() { return this._data.get(); }
  set data(value) { this._data.set(value); }

  get disabled() { return this._disabled.get(); }
  set disabled(value) { this._disabled.set(value); }

  constructor() {
    super();
  }


  #onInput(e) {
    this._str.set(e.target.get());
  }

  #disableChange(e) {
    const prev = this._disabled.get();
    this._disabled.set(!prev);
  }

  #enableChange(e) {
    const prev = this._enable.get();
    this._enable.set(!prev);
  }

  #onInputCounter(e) {
    this._counter.set(e.target.get());
  }

  #percentChange(e) {
    this._percent.set(e.target.get());
  }

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

            <mc-switch
              label="Enable (boolean)"
              checked=${this._enable}
              onchange=${(e) => this.#enableChange(e)}
            ></mc-switch>

            <mc-slider min="0" max="1" value="${this._percent}" step="0.1" onchange=${(e) => this.#percentChange(e)} >Percent (number)</mc-slider>
          </div>
        </div>
        <code-block language="html" placeholder>
          <pre></pre>
          <div placeholder>${html(() => {
            const str = this._str.get();
            const disabled = this._disabled.get();
            const enable = this._enable.get();
            const counter = this._counter.get();
            const percent = this._percent.get();
            return`<!-- HTML rendered -->
<attr-test
  str="${str}"
  ${disabled ? 'disabled' : ''}
  enable="${enable}"
  counter="${counter}"
  percent="${percent}"
  data
></attr-test>`;
      })}</div>
        </code-block>
      </div>
    `;
  }
}
customElements.define('attr-test', AttrTest);
