import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as graph from '../src/infra/store/graph.js';
import * as identity from '../src/infra/identity.js';
import * as observer from '../src/observer/index.js';
import * as recorder from '../src/observer/recorder/index.js';
import * as civ from '../src/civilization/index.js';

function resetAll() {
  graph.__reset();
  identity.__reset();
  recorder.__reset();
}

function seedHistory() {
  observer.recorder.eventLog.record({ tick: 0, topic: 'economy.trade', payload: { price: 4 } });
  observer.recorder.eventLog.record({ tick: 1, topic: 'economy.trade', agentId: 'agent-1' });
  observer.recorder.eventLog.record({ tick: 2, topic: 'health.epidemic', agentId: 'agent-2' });
  observer.recorder.actionLog.record({ tick: 1, agentId: 'agent-1', action: 'craft:axe', outcome: 'ok' });
  observer.recorder.actionLog.record({ tick: 2, agentId: 'agent-2', action: 'build:barn', outcome: 'ok' });
  observer.recorder.actionLog.record({ tick: 3, agentId: 'agent-1', action: 'write_book', outcome: 'ok' });
}

test('legacy.graph.build 把编年志汇总为知识图谱并持久化', () => {
  resetAll();
  seedHistory();
  const g = civ.legacy.graph.build({ civilizationId: 'civ-test' });
  assert.equal(g.civilizationId, 'civ-test');
  assert.equal(g.counts.people, 2);
  assert.ok(g.counts.events >= 2);
  assert.ok(g.counts.deeds >= 3);
  assert.ok(g.nodes.some((n) => n.kind === 'person' && n.label === 'agent-1'));
  assert.ok(g.nodes.some((n) => n.kind === 'event'));
  assert.ok(g.nodes.some((n) => n.kind === 'deed'));
  assert.ok(g.edges.some((e) => e.kind === 'has_person'));
  assert.ok(g.edges.some((e) => e.kind === 'performed'));
  assert.ok(g.edges.some((e) => e.kind === 'involved_in'));

  const byCiv = civ.legacy.graph.query({ civilizationId: 'civ-test' });
  assert.equal(byCiv.length, 1);
  assert.equal(byCiv[0].graphId, g.graphId);
  const byId = civ.legacy.graph.query(g.graphId);
  assert.equal(byId.civilizationId, 'civ-test');
});

test('legacy.summary.extractor 提取关键事件/人物/成就', () => {
  resetAll();
  seedHistory();
  const g = civ.legacy.graph.build({ civilizationId: 'civ-x' });
  const facts = civ.legacy.summary.extractor.extract({ graph: g });
  assert.ok(facts.keyEvents.length >= 1);
  assert.ok(facts.keyPeople.length >= 1);
  assert.ok(facts.keyDeeds.length >= 1);
  assert.equal(facts.summary.peopleCount, 2);
  assert.ok(facts.summary.totalEntries >= 6);
  const evs = civ.legacy.summary.extractor.events({ graph: g });
  assert.ok(evs.length >= 1);
  assert.ok(evs.every((e) => typeof e.topic === 'string'));
});

test('legacy.summary.writer.generate 生成 200-500 字描述，constrain 约束长度', async () => {
  resetAll();
  seedHistory();
  const g = civ.legacy.graph.build({ civilizationId: 'civ-y' });
  const res = await civ.legacy.summary.writer.generate({ graph: g });
  assert.equal(res.withinRange, true);
  assert.ok(res.length >= 200 && res.length <= 500, '长度应在 [200,500]，实际 ' + res.length);
  assert.equal(typeof res.text, 'string');
  assert.ok(res.provider.length > 0);
  assert.ok(Array.isArray(res.sourceFacts.keyEvents));

  const short = civ.legacy.summary.writer.constrain({ text: '太短' });
  assert.equal(short.withinRange, false);
  assert.equal(short.length < 200, true);
  const long = civ.legacy.summary.writer.constrain({ text: 'x'.repeat(600) });
  assert.equal(long.truncated, true);
  assert.equal(long.length, 500);
  assert.equal(long.withinRange, true);
});

test('collapse.detector 检测灭绝/资源枯竭/危机升级', () => {
  const extinct = civ.collapse.detector.detect({ population: 0 });
  assert.equal(extinct.collapsed, true);
  assert.ok(extinct.reasons.includes('population_extinct'));

  const safe = civ.collapse.detector.detect({ population: 10, resourceRatio: 0.8, crisisLevel: 0.2 });
  assert.equal(safe.collapsed, false);

  const crisis = civ.collapse.detector.detect({ population: 5, resourceRatio: 0.05, crisisLevel: 0.8 });
  assert.equal(crisis.collapsed, true);
  assert.ok(crisis.reasons.includes('resource_exhausted'));
  assert.ok(crisis.reasons.includes('crisis_escalated'));

  const ind = civ.collapse.detector.indicators({ population: 3, resourceRatio: 0.5, crisisLevel: 0.4 });
  assert.ok(ind.find((i) => i.key === 'collapseScore').value >= 0);
  assert.ok(ind.find((i) => i.key === 'population').value === 3);
});

test('collapse.confirmer 确认崩溃/人工覆盖并写 observer 事件日志', () => {
  resetAll();
  const r = civ.collapse.confirmer.confirm({ population: 0, tick: 7 });
  assert.equal(r.confirmed, true);
  assert.equal(r.log.data.topic, 'civilization.collapse');

  const o = civ.collapse.confirmer.override({ tick: 8, reason: '测试人工覆盖' });
  assert.equal(o.overridden, true);
  assert.equal(o.log.data.topic, 'civilization.collapse');
  assert.equal(o.log.data.payload.reason, '测试人工覆盖');

  const before = observer.recorder.eventLog.list().length;
  const n = civ.collapse.confirmer.confirm({ population: 5, resourceRatio: 0.9, crisisLevel: 0.1, tick: 9 });
  assert.equal(n.confirmed, false);
  assert.equal(observer.recorder.eventLog.list().length, before, '未崩溃不应写日志');
});

test('civilization.restart 重启沙盘并把遗产注入下一代文明', async () => {
  resetAll();
  seedHistory();
  let resetCalled = false;
  const r = await civ.restart.execute({
    tick: 10,
    reset: () => { resetCalled = true; },
    civilizationId: 'civ-old',
    nextCivilizationId: 'civ-new',
  });
  assert.equal(resetCalled, true);
  assert.equal(r.civilizationId, 'civ-new');
  assert.equal(r.previousCivilizationId, 'civ-old');
  assert.equal(r.inherited, true);
  assert.ok(r.legacy.graph && r.legacy.facts && r.legacy.summary);
  assert.equal(r.legacy.summary.withinRange, true);

  const hers = civ.restart.heritage('civ-new');
  assert.equal(hers.length, 1);
  assert.equal(hers[0].legacy.graph.civilizationId, 'civ-old');

  const topics = observer.recorder.eventLog.list().map((n) => n.data.topic);
  assert.ok(topics.includes('civilization.restart'));
  assert.ok(topics.includes('civilization.heritage.inherited'));
});
