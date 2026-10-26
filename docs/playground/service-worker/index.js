import { messages } from '../helper.js';


try {
  parent.window.console.warn(
    'Playground sandbox is executing with the same origin as its parent.',
    'This is a security risk.',
    'https://github.com/google/playground-elements#sandbox-security'
  );
} catch { }


const { scope, port: parentPort } = await new Promise(resolve => {
  const listener = event => {
    if (event.data.type === messages.configureProxy) {
      window.removeEventListener('message', listener);
      resolve(event.data);
    }
  };
  window.addEventListener('message', listener);
});

const registration = await navigator.serviceWorker.register(new URL('../../webserver-service-worker.js', import.meta.url).href, { scope });
function getNewestWorker() {
  return registration.installing ?? registration.waiting ?? registration.active;
}

async function activated(sw) {
  if (sw.state === 'activated') return;

  return new Promise(resolve => {
    const aborter = new AbortController();
    sw.addEventListener('statechange', () => {
      if (sw.state === 'activated') {
        resolve();
        aborter.abort();
      }
    }, { signal: aborter.signal });
  });
}

let connected;

async function connectToNewest(force = false) {
  const sw = getNewestWorker();
  if (!force && sw === connected) return;

  connected = sw;
  if (sw === null) {
    console.error('No playground service worker found.');
    return;
  }

  await activated(sw);
  if (sw !== connected) return;

  const { port1, port2 } = new MessageChannel();
  const projectMessage = {
    type: messages.connectToWorker,
    port: port1
  };
  parentPort.postMessage(projectMessage, [port1]);
  const swMessage = {
    type: messages.connectToProject,
    port: port2
  };
  sw.postMessage(swMessage, [port2]);
}
connectToNewest();


registration.addEventListener('updatefound', () => {
  connectToNewest();
});


navigator.serviceWorker.addEventListener('message', (event) => {
  if (event.source !== connected)  return;
  if (event.data.type === messages.missingFile) {
    connectToNewest(true);
  }
});

window.addEventListener('message', async (event) => {
  if (event.data.type === messages.workerUpdate) {
    const newestBefore = getNewestWorker();
    await registration.update();
    if (getNewestWorker() === newestBefore) {
      console.error('Playground service worker update failed.');
    }
  }
});
