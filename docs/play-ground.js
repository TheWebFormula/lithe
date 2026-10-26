import { Component, html, css } from '@thewebformula/lithe';
import { loadSandpackClient } from "@codesandbox/sandpack-client";
import { basicEditor } from 'prism-code-editor/setups';
import "prism-code-editor/prism/languages/javascript";
import "prism-code-editor/prism/languages/xml";
import "prism-code-editor/prism/languages/css";
import "prism-code-editor/prism/languages/json";
import pn from './palenight.css' with { type: 'text' };
import { registerTheme } from "prism-code-editor/themes"
registerTheme("my-theme", () => Promise.resolve({ default: [...pn.rules].map(r => r.cssText).join('\n') }))

function debounce(fn, wait) {
  let timer;
  function debounced() {
    const args = arguments;
    const context = this
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn.apply(context, args);
    }, wait || 10);
  };
  debounced.destroy = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  return debounced;
}


class PlayGround extends Component {
  static useShadowRoot = true;
  static styles = css`
    :host {
      display: flex;
      gap: 2px;
      width: 100%;
      height: 100%;
      --max-height: 400px;
      max-height: var(--max-height);
      height: var(--max-height);
      overflow: hidden;

      --bg-bar: rgb(25, 27, 43);
      --bg-tab-active: #282e3e;
      --bg-tab-hover: rgba(100, 149, 237, 0.26);
      --text-color: #bec4e8;
      --view-split: 1;
      --adjustment: calc(0.5 - var(--view-split));
    }

    .ide {
      width: calc((0.5 - var(--adjustment)) * 100%);
      display: flex;
      flex-direction: column;
    }
    iframe {
      width: calc((0.5 + var(--adjustment)) * 100%);
      /*flex: var(--view-split);*/
    }

    .file-tabs {
      display: flex;
      gap: 6px;
      width: 100%;
      height: 34px;
      background-color: #1e222d;
    }

    .tab {
      position: relative;
      padding: 0 12px;
      line-height: 34px;
      height: 34px;
      border-top-left-radius: 8px;
      border-top-right-radius: 8px;
      font-size: 12px;
      cursor: pointer;
      transition: background-color 0.15s ease;
      color: var(--text-color);

      &:hover:not(.active)::after {
        content: "";
        position: absolute;
        top: 4px;
        left: 4px;
        right: 4px;
        bottom: 4px;
        border-radius: 6px;
        background-color: var(--bg-tab-hover);
      }

      &.active {
        background-color: var(--bg-tab-active);
        z-index: 2;

        &::before {
          content: "";
          position: absolute;
          left: -8px;
          bottom: 0;
          width: 8px;
          height: 8px;
          background-color: var(--bg-tab-active);
          border-top-left-radius: 8px;
          box-shadow: 4px 4px 0 0 var(--bg-tab-active);
          corner-shape: scoop;
        }

        &::after {
          content: "";
          position: absolute;
          right: -8px;
          bottom: 0;
          width: 8px;
          height: 8px;
          background-color: var(--bg-tab-active);
          border-top-right-radius: 8px;
          box-shadow: -4px 4px 0 0 var(--bg-tab-active);
          corner-shape: scoop;
        }
      }
    }

    iframe,
    #editor {
      /*width: 50%;*/
      height: 100%;
      border-radius: 0;
    }

    #editor {
      overflow: scroll;
      font-size: 13px;
    }

    iframe {
      /*flex: var(--view-split);*/
    }

    @supports (corner-shape: squircle) {
      :host {
        border-radius: 30px;
        corner-shape: squircle;
      }
    }
  `;

  static observedAttributesExtended = {
    files: { type: 'object' },
    openFile: { type: 'string' },
    entry: { type: 'string' },
    viewSplit: { type: 'number' },
    maxHeight: { type: 'string' },
  };

  attributeChangedCallbackExtended(name, oldValue, newValue) {
    if (name === 'files') this[name] = new Map(Object.entries(newValue));
    if (name === 'openFile') this.currentFile = newValue;
    if (name === 'entry') this.entry = newValue;
    if (name === 'viewSplit') this.style.setProperty('--view-split', newValue);
    if (name === 'maxHeight') this.style.setProperty('--max-height', newValue);
  }

  editor;
  changeListener;
  modelChanged = false;
  sandpackClient;
  entry = 'index.html';
  currentFile = 'app.js';
  codemirrorFileMap = new Map();
  files = new Map();


  connectedCallback() {
    super.connectedCallback();
    this.loadFile(this.currentFile);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.updateSandpack.destroy();
    this.updateSandpack = undefined;

    if (this.editor) {
      this.editor.textarea.removeEventListener('input', this.onFileChange);
      this.editor.destroy();
      this.editor = undefined;
    }
  }

  afterRender() {
    this.initSandpack();

    this.editor = basicEditor(this.shadowRoot.querySelector("#editor"), {
      language: "javascript",
      theme: "my-theme",
    }, () => {
      this.loadFile(this.currentFile);
      this.editor.on('change', this.onFileChange);
      this.editor.textarea.addEventListener('input', this.onFileChange);
    });
  }

  onFileChange = debounce(() => {
    console.log('change')
    let data = this.files.get(this.currentFile);
    data.code = this.editor.textarea.value;
    console.log('this.editor.textarea.value', this.editor.textarea.value)
    this.sandpackClient.updateSandbox({
      files: this.getFiles().sandpack,
      entry: this.entry,
      showLoadingScreen: true,
      dependencies: {
        "@thewebformula/lithe": "latest",
      }
    });
  }, 1000);

  async loadFile(name) {
    this.currentFile = name;
    let data = this.files.get(name);

    this.modelChanged = true;

    this.editor.setOptions({
      language: data.language,
      value: data.code
    });

    const active = this.shadowRoot.querySelector('.tab.active');
    if (active) active.classList.remove('active');
    this.shadowRoot.querySelector(`.tab[file="${name}"]`).classList.add('active');
  }

  getFiles() {
    const arr = this.files.entries().toArray();
    const obj = Object.fromEntries(this.files);
    const forTabs = arr.filter(v => v[0] !== 'package.json');
    const map = Object.fromEntries(forTabs.map(v => [v[0], v[1].code]));
    return {
      sandpack: obj,
      tabs: forTabs,
      map
    };
  }

  async initSandpack() {
    this.sandpackClient = await loadSandpackClient(
      this.shadowRoot.getElementById("sandpack-preview"),
      {
        files: this.getFiles().sandpack,
        environment: "vanilla",
      },
      { showOpenInCodeSandbox: false, experimental_enableServiceWorker: true }
    );
  }

  selectFile(target) {
    if (target.classList.contains('active')) return;
    this.loadFile(target.getAttribute('file'));
  }

  template() {
    return html`
      <div class="ide">
        <div class="file-tabs">
          ${this.getFiles().tabs.map(([name, data]) => html`
            <div class="tab" file=${name} onclick=${e => this.selectFile(e.target)}>${name}</div>
          `)}
        </div>
        <div id="editor">
        </div>
      </div>
      <iframe id="sandpack-preview"></iframe>
    `;
  }
}
customElements.define('play-ground', PlayGround);
