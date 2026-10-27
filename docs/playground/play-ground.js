import { Component, html, css, Cue } from '@thewebformula/lithe';
import { wrap, proxy } from 'comlink';
import { messages } from './helper.js';
import { basicEditor } from 'prism-code-editor/setups';
import { renderCodeBlock } from "prism-code-editor/ssr";
import { addCopyButton, forEachCodeBlock } from "prism-code-editor/code-blocks"
import "prism-code-editor/copy-button.css";
import "prism-code-editor/prism/languages/javascript";
import "prism-code-editor/prism/languages/xml";
import "prism-code-editor/prism/languages/css";
import "prism-code-editor/prism/languages/json";
import "prism-code-editor/prism/languages/bash";
import pn from '../palenight.css' with { type: 'text' };
import { registerTheme } from "prism-code-editor/themes";


registerTheme('palenight', () => Promise.resolve({ default: [...pn.rules].map(r => r.cssText).join('\n') }))


const serviceWorkerHash = '09cd6a4e'; // TODO
const sessions = new Set();
function generateUniqueSessionId() {
  let sessionId;
  do {
    sessionId = crypto.getRandomValues(new Uint32Array(1))[0].toString(32);
  } while (sessions.has(sessionId));
  sessions.add(sessionId);
  return sessionId;
}

class PlayGround extends Component {
  static useShadowRoot = true;
  static styles = [css`
    :host {
      --bg-tab-bar: #1e222d;
      --bg-tab-active: #282e3e;
      --bg-tab-hover: rgba(100, 149, 237, 0.26);
      --text-color: #bec4e8;
      --view-split: 1;
      --adjustment: calc((var(--view-split) - 1) / 2);
      --max-height: 400px;
    }

    .ide {
      position: relative;
      display: flex;
      gap: 2px;
      width: 100%;
      height: var(--max-height);
      overflow: hidden;
      border-radius: 24px;
    }

    :host([preview][bottom]) {
      .ide {
        flex-direction: column;
        gap: 8px;
      }

      #editor {
        height: calc(100% * var(--view-split));
        overflow: hidden;
        flex: unset;
      }

      #preview {
        height: calc(100% * (1 - var(--view-split)));
        overflow: hidden;
        border-radius: 24px;
        flex: unset;
        padding: 12px;
      }
    }

    @supports (corner-shape: squircle) {
      .ide,
     :host([preview][bottom]) #preview,
     :host([preview][bottom]) #editor {
        border-radius: 34px;
        corner-shape: squircle;
      }
    }

    #editor {
      display: flex;
      flex-direction: column;
      flex: calc(0.5 - var(--adjustment));
    }

    .code-container {
      display: grid;
      height: 100%;
      font-size: 14px;
      background-color: var(--bg-tab-active);
      padding: 12px 0;
      box-sizing: border-box;
    }

    #preview {
      outline: 0;
      border: none;
      flex: calc(0.5 + var(--adjustment));
    }

    :host(.single-file) {
      .tab {
        pointer-events: none;
      }
    }

    :host(:not([preview])) {
      #preview {
        display: none;
      }

      #editor {
        flex: 1;
      }

      .code-container {
        padding: 0;
      }

      .prism-code-editor {
        overflow: auto;
        display: grid;
        background: var(--pce-bg);
        line-height: 1.4;
        --_pse: var(--padding-inline, 0.75em);
        --_ns: var(--number-spacing, 0.75em);
        --padding-left: var(--_pse);
        --_sp: 0px;
        scroll-padding: var(--_sp);
        -webkit-user-select: none;
        user-select: none;
        isolation: isolate;
        white-space: pre;

        .pce-overlays {
          position: absolute;
          top: 0;
          right: 12px;

          button.pce-copy {
            opacity: 1;
            background-color: rgba(0,0,0,0);
            border: none;
            cursor: pointer;
            display: block !important;
            pointer-events: all;
            transition: color 0.15s ease;

            &:active {
              color: rgba(255,255,255,0.6);
            }
          }
        }
      }

      .pce-line {
        padding: 0 var(--_pse) 0 var(--padding-left);
        position: relative;
      }

      .show-line-numbers {
        --padding-left: calc(var(--_pse) + var(--number-width) + var(--_ns));
        scroll-padding-left: calc(var(--padding-left) + var(--_sp));
        grid: 1fr / 0 1fr;
        counter-reset: line;
      }

      .show-line-numbers .pce-line:before {
        counter-increment: line;
        content: counter(line);
        display: inline-block;
        margin: 0 0 0 calc(-1 * var(--padding-left));
        padding: 0 var(--_ns) 0 0;
        box-sizing: border-box;
        color: var(--pce-line-number);
        text-align: end;
      }
      .show-line-numbers:before {
        content: "";
        background: inherit;
        pointer-events: none;
      }
      .show-line-numbers:before,
      .pce-line:before {
        position: sticky;
        height: 100%;
        z-index: 2;
        left: 0;
        width: var(--padding-left);
      }
      .show-line-numbers .pce-line:after {
        left: var(--padding-left);
      }
    }

    .file-tabs {
      display: flex;
      gap: 6px;
      width: 100%;
      height: 34px;
      background-color: var(--bg-tab-bar);
    }
    :host([no-line-numbers]) .file-tabs {
      display: none;
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
  `, pn];

  #sessionId = generateUniqueSessionId();
  #workerProxyUrl;
  #slot;
  #editor;
  #workerAPI;
  #projectIframe;
  #previewIframe;
  #worker;
  #showPreview = false;
  #bottomPreview = false;
  #files = new Map();
  #currentFile;
  #workerInitiated = false;
  #serverReady = false;
  #sandboxScope = `__playground_server_${serviceWorkerHash}/`;
  #tabs = new Cue.Array([]);
  #noTabBar = false;
  #noLineNumbers = false;

  constructor() {
    super();
    this.#workerProxyUrl = new URL(`project-service-worker.html#session=${this.#sessionId}`, import.meta.url).href;
  }

  static observedAttributesExtended = {
    preview: { type: 'toggle' },
    bottom: { type: 'toggle' },
    entry: { type: 'string' },
    viewSplit: { type: 'number' },
    maxHeight: { type: 'string' },
    noLineNumbers: { type: 'toggle' },
    noTabBar: { type: 'toggle' }
  };

  attributeChangedCallbackExtended(name, oldValue, newValue) {
    if (name === 'preview') this.#showPreview = newValue;
    if (name === 'bottom') this.#bottomPreview = newValue;
    if (name === 'entry') this.#currentFile = newValue;
    if (name === 'viewSplit') this.style.setProperty('--view-split', newValue);
    if (name === 'maxHeight') this.style.setProperty('--max-height', newValue);
    if (name === 'noLineNumbers') this.#noLineNumbers = newValue;
    if (name === 'noTabBar') this.#noTabBar = newValue;
  }

  get currentFile() {
    if (!this.#currentFile) this.#currentFile = this.#files.keys().toArray()[0];
    return this.#currentFile
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#slot.removeEventListener('slotchange', this.#slotChange);
    this.#onFileChange.destroy();
    this.#onFileChange = undefined;
    if (this.#worker) {
      // this.#worker.terminate();
      this.#worker = undefined;
    }
    this.#previewIframe = undefined;
    this.#projectIframe = undefined;
    if (this.#editor) {
      this.#editor.textarea.removeEventListener('input', this.#onFileChange);
      this.#editor.remove();
      this.#editor = undefined;
    }
  }

  afterRender() {
    if (this.#showPreview) {
      this.#previewIframe = this.shadowRoot.querySelector('iframe#preview');
      this.#projectIframe = this.shadowRoot.querySelector('iframe#project');
    }

    this.#slot = this.shadowRoot.querySelector('slot');
    this.#slot.addEventListener('slotchange', this.#slotChange);

    if (this.#showPreview) {
      this.#editor = basicEditor(this.shadowRoot.querySelector('.code-container'), {
        language: "javascript",
        theme: "palenight",
      }, () => {
        if (this.#showPreview) this.#editor.textarea.addEventListener('input', this.#onFileChange);
      });
    } else {
      this.#renderCodeBlock();
    }
  }

  #renderCodeBlock() {
    requestAnimationFrame(() => {
      const data = this.#files.get(this.currentFile);
      this.shadowRoot.querySelector('.code-container').innerHTML = renderCodeBlock({
        language: data.language,
        value: data.content,
        lineNumbers: !this.#noLineNumbers,
        lineNumberStart: 5,
        preserveIndent: false
      });
      this.style.setProperty('--max-height', '100%');

      if (!this.#noTabBar) {
        forEachCodeBlock(this.shadowRoot.querySelector('#editor'), codeBlock => {
          addCopyButton(codeBlock)
        });
      }
    });
  }

  #initPreview() {
    this.#previewIframe.src = new URL(`${this.#sandboxScope}${this.#sessionId}/`, import.meta.url).href;
  }

  #reload = () => {
    if (!this.#serverReady) return;
    this.#previewIframe.contentWindow.location.reload();
  }

  #onFileChange = debounce(() => {
    let data = this.#files.get(this.currentFile);
    data.content = this.#editor.textarea.value;
    this.#reload();
  }, 600);

  #slotChange = () => {
    for (const item of this.#slot.assignedElements({ flatten: true })) {
      const typeAttr = item.getAttribute('type');
      if (!typeAttr?.startsWith('play/')) continue;

      const fileType = typeAttr.substring('play/'.length);
      let content = item.textContent ?? '';
      if (fileType === 'html') content = content.replace(/&lt;\//g, '</');
      content = outdent(content);

      const name = item.getAttribute('filename');
      this.#files.set(name, {
        name,
        content,
        contentType: typeEnumToMimeType(fileType),
        language: getLanguage(fileType)
      });
    }

    this.classList.toggle('single-file', this.#files.size < 2);

    this.#initWorker();

    // TODO figure out why this is needed, when page is re-navigated to the tabs change does not trigger render update
    setTimeout(() => {
      this.#tabs.get().push(...this.#files.keys());
      this.#loadFile();
    }, 0)
  }

  async #initWorker() {
    if (!this.#showPreview || this.#workerInitiated) return;
    this.#workerInitiated = true;

    const workerUrl = new URL('build-service-worker.js', import.meta.url);
    if (workerUrl.origin === window.location.origin) {
      this.#worker = new Worker(workerUrl, {type: 'module'});
    } else {
      const resp = await fetch(workerUrl.href);
      const text = await resp.text();
      const blobUrl = URL.createObjectURL(new Blob([text], {type: 'application/javascript'}));
      this.#worker = new Worker(blobUrl);
      URL.revokeObjectURL(blobUrl);
    }
  }

  async #loadFile(name = this.currentFile) {
    this.#currentFile = name;

    if (this.#editor) {
      let data = this.#files.get(name);
      this.#editor.setOptions({
        language: data.language,
        value: data.content
      });
    } else {
      this.#renderCodeBlock();
    }

    if (this.#files.size < 2) return;
    requestAnimationFrame(() => {
      const active = this.shadowRoot.querySelector('.tab.active');
      if (active) active.classList.remove('active');
      this.shadowRoot.querySelector(`.tab[file="${name}"]`)?.classList?.add('active');
    });
  }

  #selectFile(target) {
    if (!target) return;
    if (target.classList.contains('active')) return;
    this.#loadFile(target.getAttribute('file'));
  }

  #getFileForBuild(name) {
    let file = this.#files.get(name);

    if (name === 'index.html') {
      file = {
        ...file,
        content: this.#prepIndexHtmlForBuild(file.content)
      };
    }

    return file;
  }

  #prepIndexHtmlForBuild(content) {
    content = content.replace('</title>', `</title>

  <script type="importmap">
    { "imports": {
      "@thewebformula/lithe": "https://unpkg.com/@thewebformula/lithe@latest"
    } }
  </script>
`);

  content = content.replace('<body>', `<body>

  <li-route path="/${this.#sandboxScope}${this.#sessionId}/" component="home-page"></li-route>
`);
    return content;
  }

  #onNewServiceWorkerPort = (port) => {
    const onMessage = (e) => {
      if (e.data.type !== messages.ack) return;

      port.removeEventListener('message', onMessage);
      if (e.data.version === serviceWorkerHash) {
        this.#workerAPI = wrap(port);
        this.#workerAPI.setFileAPI(
          proxy({
            getFile: name => this.#getFileForBuild(name)
          }),
          this.#sessionId
        );
      }
      // else {
      //   console.info(
      //     `Playground service worker is outdated. ` +
      //       `Want ${serviceWorkerHash} but got ${e.data.version}. ` +
      //       `Waiting for update.`
      //   );
      //   this.#postMessageToServiceWorkerProxyIframe({ type: messages.workerUpdate });
      // }
    };
    port.addEventListener('message', onMessage);
    port.start();
  }

  #postMessageToServiceWorkerProxyIframe = (message, transfer) => {
    const iframeWindow = this.#projectIframe.contentWindow;
    if (!iframeWindow) {
      throw new Error(
        'Unexpected internal error: ' +
          '<playground-project> service worker proxy iframe had no contentWindow'
      );
    }
    iframeWindow.postMessage(message, '*', transfer);
  }


  #onWorkerIframeLoad() {
    if (!this.#showPreview) return;

    const { port1, port2 } = new MessageChannel();
    port1.addEventListener('message', event => {
      if (event.data.type === messages.connectToWorker) {
        this.#onNewServiceWorkerPort(event.data.port);
        this.#serverReady = true;
        this.#initPreview();
      }
    });
    port1.start();

    this.#postMessageToServiceWorkerProxyIframe({
      type: messages.configureProxy,
      scope: this.#sandboxScope,
      port: port2
    }, [port2]);
  }


  template() {
    return html`
      <slot></slot>

      ${!this.#showPreview ? '' : html`
        <iframe
          id="project"
          src=${this.#workerProxyUrl}
          onload=${() => this.#onWorkerIframeLoad()}
          style="display: none;"
        ></iframe>
      `}

      <div class="ide">
        <div id="editor">
          <div class="file-tabs">
            ${this.#tabs.map(name => html`
              <div class="tab" file=${name} onclick=${e => this.#selectFile(e.target)}>${name}</div>
            `)}
          </div>
          <div class="code-container"></div>
        </div>

        ${!this.#showPreview ? '' : html`
          <iframe
            id="preview"
            title="Project preview"
          ></iframe>
        `}
      </div>
    `;
  }
}
customElements.define('play-ground', PlayGround);


function typeEnumToMimeType(type) {
  if (!type) return;
  switch (type) {
    case 'bash':
      return 'text/x-shellscript';
    case 'js':
    case 'javascript':
      return 'application/javascript; charset=utf-8';
    case 'json':
      return 'application/json; charset=utf-8';
    case 'html':
      return 'text/html; charset=utf-8';
    case 'css':
      return 'text/css; charset=utf-8';
  }
}

function getLanguage(type) {
  switch (type) {
    case 'bash':
      return 'bash';
    case 'js':
    case 'javascript':
      return 'javascript';
    case 'json':
      return 'json';
    case 'html':
      return 'xml';
    case 'css':
      return 'css';
  }
}

function outdent(str) {
  const matches = str.match(/^[ \t]*(?=\S)/gm);
  if (!matches) return 0;
  let shortest = Math.min(...matches.map(match => match.length));

  return str.split('\n').map(line => line.slice(shortest)).join('\n').trim();
}

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
