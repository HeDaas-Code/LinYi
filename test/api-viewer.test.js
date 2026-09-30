import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as api from '../src/api/index.js';
import { CONTRACTS } from '../src/agent/decision/action-contract.js';

// 前端用 ACT_ZH 词表把行动标识翻成中文。词表是手写的，因此必须被钉在
// 权威行动集上：契约新增一个行动而词表没跟上时，这里要失败，
// 而不是等用户在界面上看到英文标识才发现。
test('前端 ACT_ZH 词表覆盖契约里的全部行动', async () => {
  const html = await readFile(new URL('../web/viewer.html', import.meta.url), 'utf8');
  const table = html.match(/const ACT_ZH=\{([\s\S]*?)\};/);
  assert.ok(table, 'viewer.html 必须定义 ACT_ZH 词表');
  const actions = Object.keys(CONTRACTS);
  assert.ok(actions.length > 0, '前置条件：契约里应有行动');
  for (const action of actions) {
    assert.match(table[1], new RegExp(`(^|[,{])\\s*${action}\\s*:`), `ACT_ZH 缺少行动「${action}」的中文名`);
  }
  // 反向：词表不得残留契约里已不存在的行动（改名的残影）。
  const listed = [...table[1].matchAll(/(?:^|[,{])\s*([a-z_]+)\s*:/g)].map((m) => m[1]);
  for (const name of listed) {
    assert.ok(actions.includes(name), `ACT_ZH 含契约里不存在的行动「${name}」`);
  }
});

test('GET /viewer returns the Chinese observer page', async () => {
  const { server, port } = await api.start(0);
  try {
    const response = await fetch('http://127.0.0.1:' + port + '/viewer');
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/html; charset=utf-8$/);
    assert.match(html, /杜鲁门小镇 \/\/ 状态控制台/);
    assert.match(html, /\/api\/v1\/world\/state/);
    assert.match(html, /决策链/);
    assert.match(html, /模型与 LAYA 链路/);
    assert.match(html, /系统日志/);
    assert.match(html, /资源历史/);
    assert.match(html, /data-tab="tab-decisions"/);
    assert.match(html, /data-action="start"/);
    assert.match(html, /data-action="step"/);
    assert.match(html, /\/api\/v1\/decisions\//);
    // 前端不得再直接吐出原始 JSON：详情区必须走解析后的结构化渲染。
    assert.match(html, /function renderJson/);
    assert.doesNotMatch(html, /textContent\s*=\s*JSON\.stringify/);
    assert.doesNotMatch(html, /<h1>TRUMAN TOWN/);
    const logs = await fetch('http://127.0.0.1:' + port + '/api/v1/sim/logs?limit=5');
    assert.equal(logs.status, 200);
    const logBody = await logs.json();
    assert.ok(Array.isArray(logBody.entries));
    assert.equal(typeof logBody.stats.level, 'string');
    const root = await fetch('http://127.0.0.1:' + port + '/');
    assert.equal(root.status, 200);
    assert.match(await root.text(), /状态控制台/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('fetch API supports pacing, background start, step, status, decisions and stages', async () => {
  const { server, port } = await api.start(0);
  const base = 'http://127.0.0.1:' + port;
  const get = (path) => fetch(base + path, { headers: { Accept: 'application/json' } });
  const post = (path, body = {}) => fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  try {
    const pacingGet = await get('/api/v1/sim/pacing');
    assert.equal(pacingGet.status, 200);
    const pacing = await pacingGet.json();
    assert.ok(Number.isFinite(pacing.speed));
    const pacingPost = await post('/api/v1/sim/pacing', { speed: 1 });
    assert.equal(pacingPost.status, 200);

    const started = await post('/api/v1/sim/start', { background: true, speed: 1, msPerTick: 1000 });
    assert.equal(started.status, 200);
    const before = await (await get('/api/v1/sim/status')).json();
    assert.equal(before.phase, 'running');
    assert.equal(typeof before.state, 'string');
    assert.equal(typeof before.driver, 'string');
    assert.equal(typeof before.background, 'boolean');
    assert.equal(before.background, true);
    assert.ok(before.pacing);

    const stepped = await post('/api/v1/sim/step', { eventProbability: 0 });
    assert.equal(stepped.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const after = await (await get('/api/v1/sim/status')).json();
    assert.ok(after.tick >= before.tick);
    assert.equal(typeof after.committedTick, 'number');

    const decisions = await get('/api/v1/sim/decisions?limit=20');
    assert.equal(decisions.status, 200);
    assert.ok(Array.isArray(await decisions.json()));
    const stages = await get('/api/v1/sim/stages?limit=30');
    assert.equal(stages.status, 200);
    const stageBody = await stages.json();
    assert.ok(Array.isArray(stageBody.recent));

    const paused = await post('/api/v1/sim/pause');
    assert.equal(paused.status, 200);
    assert.equal((await post('/api/v1/sim/resume')).status, 200);
    assert.equal((await post('/api/v1/sim/stop', { wait: true })).status, 200);
  } finally {
    await post('/api/v1/sim/stop', { wait: true }).catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
});