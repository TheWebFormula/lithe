import { Component, css } from '@thewebformula/lithe';

class PlaygroundPreview extends Component {
  static useShadowRoot = true;
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      background: white;
      font-family: sans-serif;
      height: 350px;
      position: relative; /* for the error message overlay */
    }

    #toolbar {
      flex: 0 0 var(--playground-bar-height, 40px);
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: var(--playground-border, solid 1px #ddd);
      font-size: 15px;
      color: var(--playground-preview-toolbar-foreground-color, #444);
      border-radius: inherit;
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
      background: var(--playground-preview-toolbar-background, white);
    }

    #location {
      margin: 0 10px;
    }

    #reload-button {
      --mdc-icon-button-size: 30px;
      --mdc-icon-size: 18px;
    }

    #content {
      max-height: 100%;
      position: relative;
      flex: 1;
    }

    #content.error {
      display: none;
    }

    #error {
      padding: 0 20px;
    }

    mwc-linear-progress {
      /* There is no way to directly specify the height of a linear progress
      bar, but zooming works well enough. It's 4px by default, and we want it to
      be 2px to match the tab bar indicator.*/
      zoom: 0.5;
      --mdc-linear-progress-buffer-color: transparent;
      position: absolute;
      top: -6px;
      width: 100%;
      --mdc-theme-primary: var(--playground-highlight-color, #6200ee);
    }

    iframe,
    slot {
      width: 100%;
      height: 100%;
    }

    iframe {
      border: none;
    }

    [hidden] {
      display: none;
    }
  `;

  static observedAttributesExtended = {
    project: { type: 'string' }
  };

  attributeChangedCallbackExtended(name, oldValue, newValue) {
    if (name === 'project') this[name] = newValue;
  }

  htmlFile = 'index.html';
  get indexUrl() {
    const base = this.#projectElement?.baseUrl;
    if (!base || !this.htmlFile) return '';
    const url = new URL(this.htmlFile, base);
    return url.toString();
  }

  #project;
  #projectElement;
  get project() { return this.#project; }
  set project(value) {
    this.#project = value;
  }

  connectedCallback() {
    super.connectedCallback();

    if (this.project) {
      this.#projectElement = document.querySelector(`#${this.project}`);
      // this.#projectElement.addEventListener('urlChanged', this.reload);
      this.#projectElement.addEventListener('compileDone', this.reload);
      // setTimeout(() => this.reload(), 5000);
    }
  }

  reload = () => {
    const iframe = this.shadowRoot.querySelector('iframe');

    // Reloading the iframe can cause a history entry to be added to the parent
    // window (on Chrome but not Firefox, and only when the parent/iframe origins
    // are different). Removing the iframe from the DOM while we initiate the
    // reload prevents a history entry from being added.
//     const { parentNode, nextSibling } = iframe;
//     if (parentNode) iframe.remove();
//
//     // Note we can't use contentWindow.location.reload() here, because the
//     // IFrame might be on a different origin.
    iframe.src = '';
    iframe.src = this.indexUrl;
    // if (parentNode) parentNode.insertBefore(iframe, nextSibling);

    this.loading = true;
    this.showLoadingBar = true;
  }

  onIframeLoad() {

  }

  location = '';
  template() {
    return html`
      <div id="toolbar" part="preview-toolbar">
        <span id="location" part="preview-location"> ${this.location}</span>
        <button
          id="reload-button"
          aria-label="Reload preview"
          onclick=${() => this.reload()}
        >
          <!-- Source: https://material.io/resources/icons/?icon=refresh&style=baseline -->
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentcolor"
            width="18px"
            height="18px"
          >
            <path
              d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
            />
          </svg>
        </button>
      </div>

      <div id="content">
        <!--<mwc-linear-progress
          aria-hidden=\${this._loading ? 'false' : 'true'}
          part="preview-loading-indicator"
          indeterminate
          ?closed=\${!this._showLoadingBar}
        ></mwc-linear-progress>-->

        ${this._loadedAtLeastOnce ? nothing : html`<slot></slot>`}

        <iframe
          title="Project preview"
          onload=${() => this.onIframeLoad()}
        ></iframe>
      </div>
    `;
  }
}
customElements.define('code-preview', PlaygroundPreview);
