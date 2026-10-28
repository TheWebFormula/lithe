import { messages } from './helper.js';
import { wrap, proxy } from 'comlink';

let registration;
let connected;
let channel;
let workerAPI;


export async function init() {
  if (registration) return;

  registration = await navigator.serviceWorker.register(`./${outputFileMap['webserver-service-worker']}`, { scope: '__playground_server/' });

//   registration.addEventListener('updatefound', () => {
//     console.log('updatefound')
//     // openChannel();
//   });
//
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.source !== connected)  return;
    if (event.data.type === messages.missingFile) {
      console.error('Missing file');
      // openChannel(true);
    }
  });
}

export async function connect(callback) {
  const sessionId = generateUniqueSessionId();
  await openChannel();

  workerAPI.setFileAPI(
    proxy({ getFile: name => callback(name) }),
    sessionId
  );

  return sessionId;
}

export function disconnect(sessionId) {
  workerAPI.disconnect(sessionId);
}

async function openChannel(force = false) {
  const sw = getNewestWorker();
  if (!force && sw === connected) return;
  connected = sw;
  await activated(sw);

  channel = new MessageChannel();

  return new Promise((resolve, reject) => {
    channel.port1.addEventListener('message', event => {
      if (event.data.type === messages.ack) {
        workerAPI = wrap(channel.port1);
        resolve();
      } else {
        reject(event)
      }
    }, { once: true });
    channel.port1.start();

    sw.postMessage({
      type: messages.connectPort
    }, [channel.port2]);
  });
}

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


function generateUniqueSessionId() {
  return crypto.getRandomValues(new Uint32Array(1))[0].toString(32);
}
