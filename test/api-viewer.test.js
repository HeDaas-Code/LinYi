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

test('HTTP controls complete start -> step -> pause -> resume -> stop', async () => {
  const { server, port } = await api.start(0);
  const base = 'http://127.0.0.1:' + port;
  const post = (action, body = {}) => fetch(base + '/api/v1/sim/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  try {
    const started = await post('start');
    assert.equal(started.status, 200);
    const before = await (await fetch(base + '/api/v1/sim/status')).json();

    const stepped = await post('step', { eventProbability: 0 });
    assert.equal(stepped.status, 200);
    const stepBody = await stepped.json();
    assert.ok(stepBody.tick > before.tick);
    const after = await (await fetch(base + '/api/v1/sim/status')).json();
    assert.ok(after.tick > before.tick);

    const paused = await post('pause');
    assert.equal(paused.status, 200);
    const resumed = await post('resume');
    assert.equal(resumed.status, 200);
    const stopped = await post('stop', { wait: true });
    assert.equal(stopped.status, 200);
  } finally {
    await post('stop', { wait: true }).catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
});