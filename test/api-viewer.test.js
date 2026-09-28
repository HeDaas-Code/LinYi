import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/api/index.js';

test('GET /viewer returns the Chinese observer page', async () => {
  const { server, port } = await api.start(0);
  try {
    const response = await fetch('http://127.0.0.1:' + port + '/viewer');
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/html; charset=utf-8$/);
    assert.match(html, /世界观测/);
    assert.match(html, /\/api\/v1\/world\/state/);
    assert.match(html, /escapeHtml/);
    assert.match(html, /刷新/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
