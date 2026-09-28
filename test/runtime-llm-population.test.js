import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gateway } from '../src/ai/index.js';
import * as observer from '../src/observer/index.js';
import * as loop from '../src/runtime/orchestrator/loop.js';

test('loop: population requests models for multiple residents', async () => {
  loop.reset();
  gateway.__reset();
  gateway.registerProvider({
    name: 'population-stub',
    model: 'population-1',
    async complete({ messages }) {
      const user = messages[1]?.content ?? '';
      const match = user.match(/\b(foraging|forage|eat|drink|rest|sleep|work|build|craft|socialize|explore)\b/i);
      return { text: match?.[1] ?? 'rest' };
    },
    async embed({ texts }) { return texts.map(() => [0]); },
  });
  loop.spawnAgent({ name: '居民甲' });
  loop.spawnAgent({ name: '居民乙' });
  loop.spawnAgent({ name: '居民丙' });
  await loop.step({
    eventProbability: 0,
    scheduleEnabled: false,
    llmDecideEnabled: false,
    llmDecideMode: 'population',
    llmDecideMaxAgents: 2,
    llmDecidePopulationShare: 1,
    llmDecideConcurrency: 2,
  });
  const rows = observer.recorder.decisionLog.list().map((node) => node.data).filter((row) => row.tick === 1);
  const modeled = rows.filter((row) => row.model?.mode === 'population');
  assert.ok(modeled.length >= 2);
  assert.ok(modeled.some((row) => row.model.applied && row.model.provider === 'population-stub' && row.model.model === 'population-1'));
  const first = new Set(modeled.map((row) => row.agentId));
  await loop.step({ eventProbability: 0, scheduleEnabled: false, llmDecideMode: 'population', llmDecideMaxAgents: 2, llmDecidePopulationShare: 1, llmDecideConcurrency: 2 });
  const second = new Set(observer.recorder.decisionLog.list().map((node) => node.data).filter((row) => row.tick === 2 && row.model?.applied).map((row) => row.agentId));
  assert.notDeepEqual([...first].sort(), [...second].sort());
  loop.reset();
  gateway.__reset();
});


test('loop: invalid population model output falls back to rules; off mode does not call gateway', async () => {
  loop.reset(); gateway.__reset();
  let calls = 0;
  gateway.registerProvider({ name: 'invalid-population', model: 'fake', async complete() { calls += 1; return { text: 'not an action' }; }, async embed({ texts }) { return texts.map(() => [0]); } });
  loop.spawnAgent({ name: '居民' });
  await loop.step({ eventProbability: 0, scheduleEnabled: false, llmDecideMode: 'population', llmDecideMaxAgents: 1 });
  let row = observer.recorder.decisionLog.list().map((n) => n.data).find((r) => r.tick === 1);
  assert.equal(row.model.applied, false);
  assert.equal(row.final.source, 'rule');
  assert.ok(row.model.fallbackReason);
  loop.reset(); gateway.__reset(); calls = 0;
  loop.spawnAgent({ name: '关闭模型居民' });
  await loop.step({ eventProbability: 0, llmDecideMode: 'off' });
  row = observer.recorder.decisionLog.list().map((n) => n.data).find((r) => r.tick === 1);
  assert.equal(calls, 0);
  assert.equal(row.model.applied, false);
  loop.reset(); gateway.__reset();
});

test('loop: non-emergency schedule does not replace model result', async () => {
  loop.reset(); gateway.__reset();
  gateway.registerProvider({ name: 'schedule-stub', model: 'schedule-1', async complete() { return { text: 'rest' }; }, async embed({ texts }) { return texts.map(() => [0]); } });
  loop.spawnAgent({ name: '非紧急居民', food: 0.1, water: 0.1 });
  await loop.step({ eventProbability: 0, llmDecideMode: 'population', llmDecideMaxAgents: 1, scheduleEnabled: true, crisisNeedLevel: 0.99 });
  const row = observer.recorder.decisionLog.list().map((n) => n.data).find((r) => r.tick === 1);
  assert.equal(row.model.applied, true);
  assert.equal(row.final.source, 'model');
  assert.equal(row.final.action, 'rest');
  assert.equal(row.model.overriddenBy, undefined);
  loop.reset(); gateway.__reset();
});

test('loop: emergency schedule replaces model result and records overriddenBy', async () => {
  loop.reset(); gateway.__reset();
  gateway.registerProvider({ name: 'emergency-stub', model: 'emergency-1', async complete() { return { text: 'rest' }; }, async embed({ texts }) { return texts.map(() => [0]); } });
  loop.spawnAgent({ name: '紧急居民', food: 1, water: 0.1 });
  await loop.step({ eventProbability: 0, llmDecideMode: 'population', llmDecideMaxAgents: 1, scheduleEnabled: true, crisisNeedLevel: 0.4 });
  const row = observer.recorder.decisionLog.list().map((n) => n.data).find((r) => r.tick === 1);
  assert.equal(row.model.applied, true);
  assert.equal(row.schedule.trigger, 'emergency');
  assert.equal(row.final.source, 'schedule');
  assert.equal(row.model.overriddenBy, 'schedule');
  assert.notEqual(row.final.action, 'rest');
  loop.reset(); gateway.__reset();
});
