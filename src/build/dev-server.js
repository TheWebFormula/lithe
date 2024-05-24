import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';

export default function runServer(app, port = 3000) {
  createServer(async (req, res) => {

    if (req.url === '/livereload') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache'
        });
        res.write("retry: 500\n");
        return;
    }

    let file = await handleRoute(req.url, app);
    if (!file) file = await handleFiles(req.url, app);
    if (file) {
      const stream = createReadStream(file.filePath);
      stream.on('error', err => {
        console.log(err);
        res.end();
      });
      res.writeHead(200, file.headers);

      return new Promise((resolve, reject) => {
        stream.on('error', err => reject(err));
        stream.on('end', () => resolve(true));
        stream.pipe(res);
      });
    } 
  }).listen(port);
}


async function handleRoute(url, app) {
  if (getExtension(url)) return;

  let match = app.routes.find(v => url.match(v.regex) !== null);
  if (!match) {
    // assume 404 and load not found
    match = app.routes.find(v => v.notFound);
    if (!match) return false;
  }

  const headers = { 'Content-Type': 'text/html' };
  if (app.gzip) headers['Content-encoding'] = 'gzip';

  return {
    filePath: path.resolve('.', match.filePath),
    headers
  };
}


async function handleFiles(url, app) {
  if (!getExtension(url)) return;
  const match = app.files.find(v => v.filePath.endsWith(url.replace(/\%20/g, ' ')));
  const headers = {
    'Content-Type': getMimeType(url),
    'Cache-Control': 'max-age=604800'
  };
  let filePath;
  if (match) {
    filePath = path.resolve('.', match.filePath);
    const gzip = match.copiedFile ? match.gzip : app.gzip;
    if (gzip) headers['Content-encoding'] = 'gzip';
  } else {
    filePath = path.join(app.outdir, url);
    if (!(await access(filePath).then(() => true).catch(() => false))) return false;
  }

  return {
    filePath,
    headers
  };
}


function getExtension(url) {
  if (!url.includes('.')) return '';
  const split = url.split(/[#?]/)[0].split('.');
  let ext = split.pop().trim().toLowerCase();
  if (ext === 'gz') ext = split.pop();
  return ext;
}

function getMimeType(url) {
  switch (getExtension(url)) {
    case 'js':
      return 'application/javascript';
    case 'html':
      return 'text/html';
    case 'css':
      return 'text/css';
    case 'json':
      return 'text/json';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    case 'ico':
      return 'image/x-icon';
    case 'woff2':
      return 'font/woff2';
    case 'woff':
      return 'font/woff';
    case 'otf':
      return 'font/otf';
    case 'map':
      return 'application/json';
  }
}
