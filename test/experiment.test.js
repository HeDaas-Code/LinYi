import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import * as graph from '../src/infra/store/graph.js';
import * as identity from '../src/infra/identity.js';
import * as observer from '../src/observer/index.js';

const { recorder, experiment } = observer;
const { replay, counterfactual, compare } = experiment;
const { decisionLog, actionLog, eventLog } = recorder;

function resetAll() {
  graph.__reset();
  identity.__reset();
  recorder.__reset();
}

function seedHistory() {
  decisionLog.record({ tick: 1, agentId: 'a', decision: { type: 'eat' }, options: [{ type: 'eat' }, { type: 'drink' }], reason: 'hungry' });
  actionLog.record({ tick: 1, agentId: 'a', action: { type: 'eat', target: 'food' }, outcome: { ok: true } });
  eventLog.record({ tick: 2, topic: 'weather.rain', payload: { level: 1 } });
  decisionLog.record({ tick: 3, agentId: 'b', decision: { type: 'drink' } });
  actionLog.record({ tick: 3, agentId: 'b', action: { type: 'drink', target: 'water' } });
  decisionLog.record({ tick: 5, agentId: 'a', decision: { type: 'sleep' }, options: [{ type: 'sleep' }, { type: 'eat' }], reason: 'tired' });
  actionLog.record({ tick: 6, agentId: 'a', action: { type: 'sleep', target: 'bed' } });
}

beforeEach(resetAll);

test('replay: run 按 seed 生成确定性 run id 并返回有序因果链', () => {
  seedHistory();
  const r1 = replay.run({ seed: 's1' });
  const r2 = replay.run({ seed: 's1' });
  const r3 = replay.run({ seed: 's2' });
  assert.equal(r1.replayId, r2.replayId);
  assert.notEqual(r1.replayId, r3.replayId);
  assert.match(r1.replayId, /^replay:[0-9a-f]{8}$/);
  assert.equal(r1.entries.length, 7);
  assert.deepEqual(r1.counts, { decision: 3, action: 3, event: 1, total: 7 });
  const ticks = r1.entries.map((e) => e.tick);
  assert.deepEqual(ticks, [1, 1, 2, 3, 3, 5, 6]);
});

test('replay: query 支持 agentId 与 tick 区间过滤（只读）', () => {
  seedHistory();
  const byAgent = replay.query({ agentId: 'a' });
  assert.equal(byAgent.entries.length, 4);
  assert.deepEqual(byAgent.counts, { decision: 2, action: 2, event: 0, total: 4 });

  const byRange = replay.query({ fromTick: 2, toTick: 5 });
  assert.equal(byRange.entries.length, 4); // tick 2,3,3,5

  const none = replay.query({ agentId: 'zzz' });
  assert.equal(none.entries.length, 0);
});

test('replay: 非法区间抛错', () => {
  assert.throws(() => replay.run({ fromTick: 5, toTick: 1 }), TypeError);
});

test('counterfactual: branch 锚定已记录决策并返回原/备选', () => {
  seedHistory();
  const b = counterfactual.branch({ agentId: 'a', tick: 5, alternative: { type: 'eat' } });
  assert.equal(b.branchId, 'cf:a:5');
  assert.deepEqual(b.original, { type: 'sleep' });
  assert.deepEqual(b.alternative, { type: 'eat' });
  assert.ok(b.sourceDecisionId);
});

test('counterfactual: 未记录决策时 branch 抛错', () => {
  seedHistory();
  assert.throws(() => counterfactual.branch({ agentId: 'a', tick: 99 }), Error);
});

test('counterfactual: compare 给出分歧判定、投影与下游证据', () => {
  seedHistory();
  const c = counterfactual.compare({ agentId: 'a', tick: 5, alternative: { type: 'eat' } });
  assert.equal(c.branchId, 'cf:a:5');
  assert.equal(c.diverged, true);
  assert.ok(c.originalScore >= 0 && c.originalScore < 1);
  assert.ok(c.alternativeScore >= 0 && c.alternativeScore < 1);
  assert.notEqual(c.delta, 0);
  assert.equal(c.downstream.length, 1); // tick 6 的 sleep 行为
  assert.equal(c.downstream[0].action.type, 'sleep');
});

test('counterfactual: 备选等于原决策时不分歧', () => {
  seedHistory();
  const c = counterfactual.compare({ agentId: 'a', tick: 5, alternative: { type: 'sleep' } });
  assert.equal(c.diverged, false);
  assert.equal(c.delta, 0);
});

test('compare: civilizations 按存活时长降序读取存档', () => {
  resetAll();
  graph.write({ id: 'civ:1', type: 'civilization.archive', data: { civilizationId: 'c1', survivedTicks: 50, collapseMode: 'famine', legacy: '仓储技术' } });
  graph.write({ id: 'civ:2', type: 'civilization.archive', data: { civilizationId: 'c2', survivedTicks: 120, collapseMode: 'war', legacy: '灌溉系统' } });
  graph.write({ id: 'civ:3', type: 'civilization.archive', data: { civilizationId: 'c3', survivedTicks: 80, collapseMode: 'famine', legacy: '' } });

  const civs = compare.civilizations();
  assert.equal(civs.length, 3);
  assert.deepEqual(civs.map((c) => c.civilizationId), ['c2', 'c3', 'c1']);
  assert.equal(civs[0].survivedTicks, 120);
});

test('compare: metrics 聚合存活/崩溃/遗产统计', () => {
  const records = [
    { civilizationId: 'c1', survivedTicks: 50, collapseMode: 'famine', legacy: 'A' },
    { civilizationId: 'c2', survivedTicks: 120, collapseMode: 'war', legacy: 'B' },
    { civilizationId: 'c3', survivedTicks: 80, collapseMode: 'famine', legacy: '' },
  ];
  const m = compare.metrics(records);
  assert.equal(m.count, 3);
  assert.equal(m.avgSurvival, (50 + 120 + 80) / 3);
  assert.equal(m.maxSurvival, 120);
  assert.deepEqual(m.collapseModes, { famine: 2, war: 1 });
  assert.equal(m.withLegacy, 2);
});

test('compare: metrics 空数组与非数组', () => {
  assert.deepEqual(compare.metrics([]), { count: 0, avgSurvival: 0, maxSurvival: 0, collapseModes: {}, withLegacy: 0 });
  assert.throws(() => compare.metrics('nope'), TypeError);
});
