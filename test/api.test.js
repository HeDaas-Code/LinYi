import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as control from '../src/api/control.js';
import * as observerApi from '../src/api/observer.js';
import * as api from '../src/api/index.js';
import { loop } from '../src/runtime/index.js';

function fresh() {
  loop.reset();
  control.__reset();
}

test('control: start 初始化 3 个智能体并进入 running', () => {
  fresh();
  const res = control.start({});
  assert.equal(res.phase, 'running');
  assert.equal(res.agentCount, 3);
  assert.equal(res.spawned, 3);
});

test('control: pause 进入 paused，start 从 paused 恢复 running', () => {
  fresh();
  control.start({});
  assert.equal(control.pause().phase, 'paused');
  assert.equal(control.start({}).phase, 'running');
});

test('control: step 推进一个 tick 并返回摘要', async () => {
  fresh();
  control.start({});
  const res = await control.step({ eventProbability: 0 });
  assert.equal(res.tick, 1);
  assert.equal(res.summary.decisions.length, 3);
});

test('observer: world/state 返回世界状态快照', async () => {
  fresh();
  control.start({ agentCount: 2 });
  await control.step({ eventProbability: 0 });
  const snap = observerApi.worldState();
  assert.equal(snap.tick, 1);
  assert.equal(snap.agents.length, 2);
  assert.ok(typeof snap.resources.food.stockpile === 'number');
});

test('observer: agent detail 返回详情 + 最近决策/行为', async () => {
  fresh();
  control.start({ agentCount: 2 });
  await control.step({ eventProbability: 0 });
  const agentId = loop.snapshot().agents[0].id;
  const detail = observerApi.agentDetail(agentId);
  assert.equal(detail.id, agentId);
  assert.equal(typeof detail.name, 'string');
  assert.ok(detail.recentDecisions.length >= 1);
  assert.ok(detail.recentActions.length >= 1);
});

test('observer: agent detail 对不存在 id 抛 404', () => {
  fresh();
  assert.throws(() => observerApi.agentDetail('agent_999999999999'), (e) => e.status === 404);
});

test('http: 端到端 start/step/world/agent/pause 经 HTTP 服务', async () => {
  fresh();
  const { server, port } = await api.start(0);
  const base = 'http://127.0.0.1:' + port;
  try {
    const startRes = await fetch(base + '/api/v1/sim/start', { method: 'POST' });
    assert.equal(startRes.status, 200);
    assert.equal((await startRes.json()).phase, 'running');

    const stepRes = await fetch(base + '/api/v1/sim/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventProbability: 0 }),
    });
    assert.equal(stepRes.status, 200);
    const stepBody = await stepRes.json();
    assert.equal(stepBody.tick, 1);

    const worldRes = await fetch(base + '/api/v1/world/state');
    assert.equal(worldRes.status, 200);
    const worldBody = await worldRes.json();
    assert.equal(worldBody.tick, 1);

    const agentId = worldBody.agents[0].id;
    const agentRes = await fetch(base + '/api/v1/agents/' + agentId);
    assert.equal(agentRes.status, 200);
    const agentBody = await agentRes.json();
    assert.equal(agentBody.id, agentId);
    assert.equal(typeof agentBody.name, 'string');

    const missingRes = await fetch(base + '/api/v1/agents/agent_000000000000');
    assert.equal(missingRes.status, 404);

    const pauseRes = await fetch(base + '/api/v1/sim/pause', { method: 'POST' });
    assert.equal(pauseRes.status, 200);
    assert.equal((await pauseRes.json()).phase, 'paused');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('control: start 幂等，不重复 spawn、不重置 tick', () => {
  fresh();
  const a = control.start({});
  const b = control.start({});
  assert.equal(a.agentCount, 3);
  assert.equal(b.agentCount, 3);
  assert.equal(b.tick, 0);
  assert.equal(loop.snapshot().agents.length, 3);
});

test('control: paused 时 step 拒绝推进（409），start 恢复后可继续', async () => {
  fresh();
  control.start({});
  control.pause();
  await assert.rejects(() => control.step({ eventProbability: 0 }), (e) => e.status === 409);
  assert.equal(loop.snapshot().tick, 0, 'pause 期间不得推进 tick');
  assert.equal(control.start({}).phase, 'running');
  const res = await control.step({ eventProbability: 0 });
  assert.equal(res.tick, 1);
});

test('control: 并发 step 被互斥拒绝（409），首个仍成功提交', async () => {
  fresh();
  control.start({});
  const first = control.step({ eventProbability: 0 });
  await assert.rejects(() => control.step({ eventProbability: 0 }), (e) => e.status === 409);
  const res = await first;
  assert.equal(res.tick, 1);
  assert.equal(res.committedTick, 1);
  assert.equal(res.inFlight, false);
});

test('control: step 完成后提交边界闭合，committedTick 与 tick 一致', async () => {
  fresh();
  control.start({});
  const res = await control.step({ eventProbability: 0 });
  assert.equal(res.committedTick, res.tick);
  assert.equal(res.inFlight, false);
  assert.equal(res.stageFailure, null);
});

function _unusedLastLine() { return "});"; }
