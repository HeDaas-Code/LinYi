import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { HttpError } from './http.js';

const pagePath = fileURLToPath(new URL('../../web/viewer.html', import.meta.url));

async function viewerPage({ res }) {
  try {
    const html = await readFile(pagePath, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(html),
    });
    res.end(html);
  } catch {
    throw new HttpError(500, 'viewer page unavailable');
  }
}

export const routes = [
  { method: 'GET', path: '/viewer', stream: true, handler: viewerPage },
];
