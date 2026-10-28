import { expose } from 'comlink';
import { messages, Deferred } from '../helper.js';


let fileApis = new Map();
const workerAPI = {
  setFileAPI(fileAPI, sessionID) {
    let deferred = fileApis.get(sessionID);
    if (deferred === undefined || deferred.settled) {
      deferred = new Deferred();
      fileApis.set(sessionID, deferred);
    }
    deferred.resolve(fileAPI);
  },
  disconnect(sessionId) {
    fileApis.delete(sessionId);
  }
};

function onInstall() {
  self.skipWaiting();
}

function onActivate(event) {
  event.waitUntil(self.clients.claim());
}

function onFetch(event) {
  const url = event.request.url;
  if (url.startsWith(self.registration.scope)) {
    const { filePath, sessionId } = parseUrl(url);
    if (sessionId !== undefined) event.respondWith(getFile(event, filePath, sessionId));
  }
}

let appPort;
function onMessage(event, data) {
  if (event.data.type === messages.connectPort) {
    event.ports[0].postMessage({
      type: messages.ack
    });
    expose(workerAPI, event.ports[0]);
  }
}

function parseUrl(url) {
  const sessionAndPath = url.substring(self.registration.scope.length).split('?')[0];
  const slashIndex = sessionAndPath.indexOf('/');
  let sessionId;
  let filePath;

  if (slashIndex === -1) console.warn(`Invalid sample file URL: ${url}`);
  else {
    sessionId = sessionAndPath.slice(0, slashIndex);
    filePath = sessionAndPath.slice(slashIndex + 1);
  }

  return {
    sessionId,
    filePath,
  };
}

async function getFile(event, path, sessionId) {
  if (!path) path = 'index.html';
  const fileAPI = await getFileApi(sessionId);
  if (fileAPI === undefined) return new Response('Playground project not available', { status: 503 });

  const fileOrError = await fileAPI.getFile(path);
  if ('status' in fileOrError) {
    const { body, status } = fileOrError;
    return new Response(body, { status });
  }

  const { content, contentType } = fileOrError;
  const headers = new Headers();
  headers.set('Origin-Agent-Cluster', '?1');
  if (contentType) headers.set('Content-Type', contentType);

  return new Response(content, { headers });
}

async function getFileApi(sessionId) {
  let deferred = fileApis.get(sessionId);
  if (deferred !== undefined) return deferred.promise;

  const client = await findSessionProxyClient(sessionId);
  if (client === undefined) return;

  deferred = new Deferred();
  fileApis.set(sessionId, deferred);
  const missingMessage = { type: messages.missingFile };
  client.postMessage(missingMessage);
  return deferred.promise;
}

async function findSessionProxyClient(id) {
  let clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) {
    const hash = new URL(client.url).hash;
    const hashParams = new URLSearchParams(hash.slice(1));
    if (hashParams.get('session') === id) return client;
  }
}


self.addEventListener('fetch', onFetch);
self.addEventListener('activate', onActivate);
self.addEventListener('install', onInstall);
self.addEventListener('message', onMessage);
