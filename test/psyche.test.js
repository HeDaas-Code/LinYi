import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as graph from '../src/infra/store/graph.js';
import * as identity from '../src/infra/identity.js';
import * as observer from '../src/observer/index.js';
import * as survival from '../src/survival/index.js';
import * as tagsetStore from '../src/agent/traits/tagset/store.js';
import * as agent from '../src/agent/index.js';

const { trauma, coping, break: breakMod } = agent.psyche;

function resetAll() {
  graph.__reset();
  identity.__reset();
  observer.recorder.__reset();
  survival.needs.meter.__reset();
  coping.__reset();
  breakMod.__reset();
}

function eventTopics() {
  return observer.recorder.eventLog.list().map((n) => n.data.topic);
}

test('trauma: add 累积并夹在 [0,1]，query 可查，heal 可疗愈', () => {
  resetAll();
  assert.equal(trauma.query({ agentId: 'a' }).level, 0);
  assert.equal(trauma.add({ agentId: 'a', kind: 'famine', severity: 0.6 }).level, 0.6);
  assert.equal(trauma.add({ agentId: 'a', kind: 'conflict', severity: 0.5 }).level, 1.0);
  assert.equal(trauma.query({ agentId: 'a' }).level, 1.0);
  assert.equal(trauma.query({ agentId: 'a' }).events.length, 2);
  assert.equal(trauma.heal({ agentId: 'a', amount: 0.4 }).level, 0.6);
  assert.equal(trauma.query({ agentId: 'a' }).level, 0.6);
});

test('trauma: add 写入情景记忆（trauma 标签）', () => {
  resetAll();
  trauma.add({ agentId: 'a', kind: 'death', severity: 0.4, source: 'event' });
  const memories = agent.memory.episodic.store.list('a');
  assert.ok(memories.length >= 1, '应写入情景记忆');
  assert.ok(memories.some((m) => (m.tags ?? []).includes('trauma')), '记忆应带 trauma 标签');
});

test('trauma: accumulate 由生存压力累积创伤', () => {
  resetAll();
  survival.needs.meter.update({ agentId: 'a', need: 'food', level: 0.9 });
  survival.needs.meter.update({ agentId: 'a', need: 'water', level: 0.9 });
  const r = trauma.accumulate({ agentId: 'a', rate: 0.5 });
  assert.ok(r.pressure > 0, '压力评分应 > 0');
  assert.ok(r.added > 0, '应累积创伤');
  assert.equal(r.level, r.added, '首次累积 level 应等于 added');
});

test('trauma: 非法输入抛错', () => {
  resetAll();
  assert.throws(() => trauma.add({ agentId: '', kind: 'x' }), TypeError);
  assert.throws(() => trauma.add({ agentId: 'a', kind: '', severity: 0.1 }), TypeError);
  assert.throws(() => trauma.add({ agentId: 'a', kind: 'x', severity: NaN }), TypeError);
  assert.throws(() => trauma.heal({ agentId: 'a', amount: -1 }), TypeError);
});

test('coping: choose 依据特质选择应对方式', () => {
  resetAll();
  tagsetStore.upsert('a', [{ key: 'sociable', weight: 1 }]);
  tagsetStore.upsert('b', [{ key: 'cautious', weight: 1 }]);
  tagsetStore.upsert('c', [{ key: 'curious', weight: 1 }]);
  assert.equal(coping.choose({ agentId: 'a' }).strategy.id, 'socialize');
  assert.equal(coping.choose({ agentId: 'b' }).strategy.id, 'prayer');
  assert.equal(coping.choose({ agentId: 'c' }).strategy.id, 'writing');
});

test('coping: execute 疗愈创伤并写入记忆，记录为最近应对方式', () => {
  resetAll();
  trauma.add({ agentId: 'a', kind: 'famine', severity: 0.5 });
  const r = coping.execute({ agentId: 'a', strategyId: 'writing' });
  assert.equal(r.strategy.id, 'writing');
  assert.equal(r.traumaBefore, 0.5);
  assert.equal(r.traumaAfter, 0.3); // 0.5 - 0.2
  assert.ok(r.memoryId, '应写入应对记忆');
  const w = coping.decisionWeights({ agentId: 'a' });
  assert.equal(w.strategyId, 'writing');
  assert.equal(w.sourceWeights.pressure, 1.3);
});

test('coping: decisionWeights 无策略时默认压力权重 1.5 且无行动偏好', () => {
  resetAll();
  const w = coping.decisionWeights({ agentId: 'a' });
  assert.equal(w.strategyId, null);
  assert.equal(w.sourceWeights.pressure, 1.5);
  assert.deepEqual(w.actionBias, {});
});

test('coping: 未知应对方式抛错', () => {
  resetAll();
  assert.throws(() => coping.execute({ agentId: 'a', strategyId: 'nope' }), Error);
});

test('break: 低创伤不崩溃，高创伤自动触发崩溃', () => {
  resetAll();
  const low = breakMod.check({ agentId: 'a', threshold: 0.7 });
  assert.equal(low.broken, false);
  assert.equal(low.transition, null);

  trauma.add({ agentId: 'a', kind: 'famine', severity: 0.8 });
  const high = breakMod.check({ agentId: 'a', threshold: 0.7 });
  assert.equal(high.broken, true);
  assert.equal(high.transition, 'breakdown');
});

test('break: trigger 写 observer 事件日志 + 情景记忆，且幂等', () => {
  resetAll();
  trauma.add({ agentId: 'a', kind: 'conflict', severity: 0.9 });
  const r = breakMod.trigger({ agentId: 'a', tick: 3 });
  assert.equal(r.broken, true);
  assert.ok(r.episode, '应产生崩溃记忆');
  assert.ok(eventTopics().includes('psyche.breakdown'), '应写崩溃事件');
  const again = breakMod.trigger({ agentId: 'a', tick: 4 });
  assert.equal(again.episode, null, '重复触发应幂等');
  assert.equal(eventTopics().filter((t) => t === 'psyche.breakdown').length, 1);
});

test('break: recover 写恢复事件并清除崩溃标记', () => {
  resetAll();
  trauma.add({ agentId: 'a', kind: 'famine', severity: 0.9 });
  breakMod.trigger({ agentId: 'a', tick: 1 });
  const r = breakMod.recover({ agentId: 'a', tick: 2 });
  assert.equal(r.broken, false);
  assert.ok(eventTopics().includes('psyche.recovery'), '应写恢复事件');
  assert.equal(breakMod.decisionModifier({ agentId: 'a' }).broken, false);
});

test('break: 创伤缓解到恢复阈值后自动恢复', () => {
  resetAll();
  trauma.add({ agentId: 'a', kind: 'famine', severity: 0.8 });
  breakMod.check({ agentId: 'a', threshold: 0.7 });
  assert.equal(breakMod.decisionModifier({ agentId: 'a' }).broken, true);
  trauma.heal({ agentId: 'a', amount: 0.6 }); // level 0.2 < 0.7*0.5
  const after = breakMod.check({ agentId: 'a', threshold: 0.7 });
  assert.equal(after.broken, false);
  assert.equal(after.recovering, true);
  assert.equal(after.transition, 'recovery');
});

test('break: decisionModifier 崩溃时偏好异常行为并惩罚基础分', () => {
  resetAll();
  const normal = breakMod.decisionModifier({ agentId: 'a' });
  assert.equal(normal.broken, false);
  assert.equal(normal.scoreFn({ action: 'rest', score: 1.0 }), 1.0);

  breakMod.trigger({ agentId: 'a', tick: 1 });
  const broken = breakMod.decisionModifier({ agentId: 'a' });
  assert.equal(broken.broken, true);
  assert.equal(broken.confidencePenalty, 0.4);
  assert.ok(broken.scoreFn({ action: 'wander', score: 0.2 }) > broken.scoreFn({ action: 'rest', score: 0.3 }));
});

test('决策集成：coping 权重影响 decision.context.rank，break 影响 decision.selector.choose', () => {
  resetAll();
  const agentId = 'a';
  trauma.add({ agentId, kind: 'famine', severity: 0.4 });
  coping.execute({ agentId, strategyId: 'drink' });

  // 1) coping 权重 → decision.context.rank 的 sourceWeights
  const ctx = agent.decision.context.assemble({
    agentId,
    pressures: [{ id: 'food', need: 'food', level: 1.0 }],
  });
  const weights = coping.decisionWeights({ agentId }).sourceWeights;
  assert.equal(weights.pressure, 0.8);
  const ranked = agent.decision.context.rank(ctx, { sourceWeights: weights });
  const pressureItem = ranked.find((i) => i.source === 'pressure');
  assert.equal(pressureItem.weightedScore, 0.8);

  // 2) break 权重 → decision.selector.choose 的 scoreFn（异常行为胜出）
  breakMod.trigger({ agentId, tick: 1 });
  const modifier = breakMod.decisionModifier({ agentId });
  const choice = agent.decision.selector.choose({
    candidates: [
      { id: 'rest', action: 'rest', score: 0.3 },
      { id: 'wander', action: 'wander', score: 0.2 },
    ],
    scoreFn: modifier.scoreFn,
  });
  assert.equal(choice.action, 'wander');
});

test('端到端：压力累积创伤 → 崩溃 → 应对疗愈 → 恢复', () => {
  resetAll();
  const agentId = 'e2e';
  survival.needs.meter.update({ agentId, need: 'food', level: 1.0 });
  survival.needs.meter.update({ agentId, need: 'water', level: 1.0 });

  // 压力累积创伤
  for (let i = 0; i < 6; i += 1) trauma.accumulate({ agentId, rate: 0.5 });
  assert.ok(trauma.query({ agentId }).level >= 0.7, '累积创伤应达到崩溃阈值');

  // 崩溃
  const c = breakMod.check({ agentId, threshold: 0.7 });
  assert.equal(c.broken, true);

  // 应对疗愈
  coping.execute({ agentId, strategyId: 'drink' });
  coping.execute({ agentId, strategyId: 'writing' });
  trauma.heal({ agentId, amount: 0.5 });

  // 恢复
  const r = breakMod.check({ agentId, threshold: 0.7 });
  assert.equal(r.broken, false);
  assert.equal(r.recovering, true);

  // 事件日志覆盖崩溃与恢复
  const topics = eventTopics();
  assert.ok(topics.includes('psyche.breakdown'));
  assert.ok(topics.includes('psyche.recovery'));
});
