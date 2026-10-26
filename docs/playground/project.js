import { Component } from '@thewebformula/lithe';
import { wrap, proxy } from 'comlink';
import { messages, Deferred } from './helper.js';
import { PlaygroundBuilder } from './build.js';


const sessions = new Set();
function generateUniqueSessionId() {
  let sessionId;
  do {
    sessionId = crypto.getRandomValues(new Uint32Array(1))[0].toString(32);
  } while (sessions.has(sessionId));
  sessions.add(sessionId);
  return sessionId;
}

function endWithSlash(url) {
  return url.endsWith('/') ? url : `${url}/`;
}

// const sandboxBaseUrl = `https://unpkg.com/playground-elements@${npmVersion}/`;
const sandboxBaseUrl = `./`;
const serviceWorkerHash = '09cd6a4e'; // TODO


class PlaygroundProject extends Component {
  static useShadowRoot = true;

  #workerInitiated = false;
  #sessionId = generateUniqueSessionId();
  #files = [];
  #pristineFiles;
  #build;
  #modified;
  #slot;
  #defferreBuilddWorker = new Deferred();
  sandboxScope = `__playground_server_${serviceWorkerHash}/`;

  connectedCallback() {
    super.connectedCallback();
    this.#slot = this.shadowRoot.querySelector('slot');
    this.#slot.addEventListener('slotchange', this.slotChange);
  }


  get normalizedSandboxBaseUrl() {
    const url = new URL(sandboxBaseUrl, import.meta.url);
    url.pathname = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
    return url;
  }

  get serviceWorkerProxyIframeUrl() {
    return new URL(
      `project-service-worker.html#playground-session-id=${this.#sessionId}`,
      this.normalizedSandboxBaseUrl
    ).href;
  }

  get baseUrl() {
    if (this.#files === undefined) return undefined;
    const indexUrl = new URL(
      `${endWithSlash(this.sandboxScope)}${this.#sessionId}/`,
      this.normalizedSandboxBaseUrl
    );
    return indexUrl.href;
  }

  slotChange = async () => {
    for (const s of this.#slot.assignedElements({ flatten: true })) {
      const typeAttr = s.getAttribute('type');
      if (!typeAttr?.startsWith('sample/')) continue;

      const fileType = typeAttr.substring('sample/'.length);
      let content = s.textContent ?? '';
      if (fileType === 'html') {
        // Replace usages of `&lt;/script>` with `</script>`. Match against
        // `&lt;/` so that other usages of &lt; aren't replaced.
        content = content.replace(/&lt;\//g, '</');
      }
      // if (!s.hasAttribute('preserve-whitespace')) content = outdent(content);

      const name = s.getAttribute('filename');
      if (!name) continue;

      const selected = s.hasAttribute('selected');
      const contentType = typeEnumToMimeType(fileType);
      this.#files.push({
        name,
        hidden: s.hasAttribute('hidden'),
        content,
        contentType,
        selected
      });
    }

    await this.initWorker();
    this.save();
  }

  async initWorker() {
    if (this.#workerInitiated) return;
    this.#workerInitiated = true;

    const workerUrl = new URL('build-service-worker.js', import.meta.url);
    let worker;
    if (workerUrl.origin === window.location.origin) {
      worker = new Worker(workerUrl, {type: 'module'});
    } else {
      const resp = await fetch(workerUrl.href);
      const text = await resp.text();
      const blobUrl = URL.createObjectURL(new Blob([text], {type: 'application/javascript'}));
      worker = new Worker(blobUrl);
      URL.revokeObjectURL(blobUrl);
    }
    this.#defferreBuilddWorker.resolve(wrap(worker));
  }

  async save() {
    this.#build?.cancel();
    this.#build = new PlaygroundBuilder();
    this.dispatchEvent(new CustomEvent('compileStart'));
    const workerApi = await this.#defferreBuilddWorker.promise;
    if (this.#build.state !== 'active') return;

    const cdnBaseUrl = 'https://unpkg.com';
    workerApi.compileProject(this.#files, {
      importMap: {},
      cdnBaseUrl,
    }, proxy(result => this.#build.onOutput(result)));
    await this.#build.stateChange;
    if (this.#build.state !== 'done') return;
    this.dispatchEvent(new CustomEvent('compileDone'));
  }

  onServiceWorkerProxyIframeLoad() {
    const { port1, port2 } = new MessageChannel();
    port1.addEventListener('message', (event) => {
      if (event.data.type === messages.connectToWorker) {
        this.onNewServiceWorkerPort(event.data.port);
      }
    });
    port1.start();
    this.postMessageToServiceWorkerProxyIframe({
      type: messages.configureProxy,
      scope: this.sandboxScope,
      port: port2
    }, [port2]);
  }

  onNewServiceWorkerPort(port) {
    const onMessage = (e) => {
      if (e.data.type === messages.ack) {
        port.removeEventListener('message', onMessage);
        if (e.data.version === serviceWorkerHash) {
          this._serviceWorkerAPI = wrap(port);
          this._serviceWorkerAPI.setFileAPI(
            proxy({
              getFile: (name) => this.getFile(name)
            }),
            this.#sessionId
          );
        } else {
          console.info(
            `Playground service worker is outdated. ` +
              `Want ${serviceWorkerHash} but got ${e.data.version}. ` +
              `Waiting for update.`
          );
          this.postMessageToServiceWorkerProxyIframe({
            type: UPDATE_SERVICE_WORKER,
          });
        }
      }
    };
    port.addEventListener('message', onMessage);
    port.start();
  }

  postMessageToServiceWorkerProxyIframe(message, transfer) {
    const iframeWindow = this.shadowRoot.querySelector('iframe').contentWindow;
    if (!iframeWindow) {
      throw new Error(
        'Unexpected internal error: ' +
          '<playground-project> service worker proxy iframe had no contentWindow'
      );
    }
    iframeWindow.postMessage(message, '*', transfer);
  }

  async getFile(name) {
    if (this.#build === undefined) {
      return {
        status: /* Service Unavailable */ 503,
        body: 'Playground build not started',
      };
    }
    return this.#build.getFile(name);
  }

  // editFile(file, newContent) {
  //   // Note this method takes the file object itself rather than the name like
  //   // add/delete/rename, because edits happen at high frequency so we don't
  //   // want to be doing any searches.
  //   file.content = newContent;
  //   this.#modified = undefined;
  //   void this.saveDebounced();
  // }

  // async firstUpdated() {
  //   const typescriptWorkerScriptUrl = forceSkypackRawMode(
  //     new URL('./playground-typescript-worker.js', import.meta.url)
  //   );
  //   let worker;
  //   if (typescriptWorkerScriptUrl.origin === window.location.origin) {
  //     // Easy case.
  //     worker = new Worker(typescriptWorkerScriptUrl, {type: 'module'});
  //   } else {
  //     // If the worker script is different-origin, we need to fetch it ourselves
  //     // and create a blob URL.
  //     const resp = await fetch(typescriptWorkerScriptUrl.href);
  //     const text = await resp.text();
  //     const blobUrl = URL.createObjectURL(
  //       new Blob([text], {type: 'application/javascript'})
  //     );
  //     worker = new Worker(blobUrl);
  //     URL.revokeObjectURL(blobUrl);
  //   }
  //   this.#defferreBuilddWorker.resolve(wrap(worker));
  // }

  // afterRender() ???
//   async update(changedProperties) {
//     if (changedProperties.has('_source')) this._loadProjectFromSource();
//     if (
//       changedProperties.has('sandboxScope') ||
//       changedProperties.has('sandboxBaseUrl') ||
//       changedProperties.has('_serviceWorkerAPI')
//     ) {
//       this.dispatchEvent(new CustomEvent('urlChanged'));
//     }
//     if (
//       changedProperties.has('cdnBaseUrl') &&
//       // do not trigger a reload on first render
//       changedProperties.get('cdnBaseUrl') !== undefined
//     ) {
//       // needs to trigger a full reload and recompile as if we had made a file
//       // change
//       this.#modified = undefined;
//       this.saveDebounced();
//     }
//
//     super.update(changedProperties);
//   }
//

  template() {
    return html`
      <slot></slot>
      <iframe
        src=${this.serviceWorkerProxyIframeUrl}
        onload=${() => this.onServiceWorkerProxyIframeLoad()}
        style="display: none;"
      ></iframe>
    `;
  }
}
customElements.define('code-project', PlaygroundProject);



function typeEnumToMimeType(type) {
  if (!type) return;

  switch (type) {
    case 'ts':
      return 'video/mp2t';
    case 'js':
      return 'application/javascript; charset=utf-8';
    case 'json':
      return 'application/json; charset=utf-8';
    case 'jsx':
      return 'text/jsx; charset=utf-8';
    case 'tsx':
      return 'text/typescript-jsx; charset=utf-8';
    case 'html':
      return 'text/html; charset=utf-8';
    case 'css':
      return 'text/css; charset=utf-8';
    case 'svg':
      return 'image/svg+xml';
  }
};






// onst outdent = (str: string): string => {
//   // Remove leading/trailing empty lines (we don't use trim() because we don't
//   // want to remove leading whitespace on the first content line).
//   str = str.replace(/(^[\n\s]*\n)|(\n[\n\s]*$)/g, '');
//   let shortestIndent;
//   for (const line of str.split(/\n/g)) {
//     const indent = line.match(/^\s*/)![0].length;
//     if (shortestIndent === undefined || indent < shortestIndent) {
//       shortestIndent = indent;
//     }
//   }
//   return str.replace(RegExp(`^\\s{${shortestIndent ?? 0}}`, 'gm'), '');
// };
