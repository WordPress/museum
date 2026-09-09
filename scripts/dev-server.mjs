import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { contentTypes, loadMuseums, root } from './museums.mjs';

export async function createPreviewServer({ directory = root, basePath = '/' } = {}) {
  const { files } = await loadMuseums();
  return createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-cache');
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD, OPTIONS' }).end();
      return;
    }

    let url, pathname;
    try {
      url = new URL(request.url, 'http://localhost');
      pathname = decodeURIComponent(url.pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }
    const relative = pathname.startsWith(basePath) ? pathname.slice(basePath.length) : null;
    if (relative !== null && files.has(`${relative}/index.html`)) {
      response.writeHead(301, { Location: `${url.pathname}/${url.search}` }).end();
      return;
    }
    const file = relative === '' || relative?.endsWith('/') ? `${relative}index.html` : relative;
    if (!files.has(file)) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader('Content-Type', contentTypes[path.extname(file)] ?? 'text/plain; charset=UTF-8');
    if (request.method === 'HEAD') {
      response.writeHead(200).end();
      return;
    }
    const stream = createReadStream(path.join(directory, file));
    stream.on('error', () => {
      if (response.headersSent) response.destroy();
      else response.writeHead(500).end();
    });
    stream.pipe(response);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 4173);
  const server = await createPreviewServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`WordPress Museum: http://127.0.0.1:${server.address().port}/`);
  });
}
