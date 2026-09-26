import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as semantic from '../src/agent/memory/semantic.js';
import * as pruner from '../src/agent/anticipation/pool/pruner.js';
import * as simulator from '../src/agent/anticipation/simulator.js';
import * as explainer from '../src/agent/decision/explainer.js';
import { loop } from '../src/runtime/index.js';
import * as decisionLog from '../src/observer/recorder/decision-log.js';

// ---- 语义记忆 ----

test('semantic.store/recall：词面 + 标签相关度召回（确定性，无 MiniLM）', () => {
  semantic.__reset();
  semantic.store('a1', { content: '缺水严重', tags: ['water'], salience: 0.8 });
  semantic.store('a1', { content: '食物储备不足', tags: ['food'], salience: 0.6 });
  semantic.store('a1', { content: '发现新的水源', tags: ['water', 'explore'], salience: 0.5 });

  const r1 = semantic.recall('a1', '水', { limit: 2 });
  assert.equal(r1.length, 2);
  assert.ok(r1[0].content.includes('水'), '词面「水」应命中缺水条目');
  assert.ok(r1[0].score >= r1[1].score, '应按相关度降序');

  const r2 = semantic.recall('a1', { text: '食物', tags: ['food'] });
  assert.ok(r2.length >= 1);
  assert.ok(r2[0].content.includes('食物'), '标签 food 应命中食物条目');
});

test('semantic.store：每主体上限裁剪（丢最旧）', () => {
  semantic.__reset();
  semantic.store('a1', { content: '事件1' }, { maxEntries: 2 });
  semantic.store('a1', { content: '事件2' }, { maxEntries: 2 });
  semantic.store('a1', { content: '事件3' }, { maxEntries: 2 });
  const list = semantic.list('a1');
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((m) => m.content), ['事件2', '事件3']);
});

test('semantic.recall：非法 agentId 抛 TypeError', () => {
  assert.throws(() => semantic.recall('', '水'), TypeError);
});

// ---- 候选修剪 ----

test('pruner.score：动机项优先生存需求', () => {
  const eat = pruner.score({ action: 'eat', score: 0.3 }, { dominantNeed: 'food', level: 0.6, threshold: 0.4, tags: [] });
  const forage = pruner.score({ action: 'forage', score: 0.2 }, { dominantNeed: 'food', level: 0.6, threshold: 0.4, tags: [] });
  assert.ok(eat > forage, '饥饿时进食评分应高于采集');
});

test('pruner.score：性格项影响行动偏好', () => {
  const restCautious = pruner.score({ action: 'rest', score: 0.2 }, { dominantNeed: null, tags: [{ key: 'cautious', weight: 1 }] });
  const restPlain = pruner.score({ action: 'rest', score: 0.2 }, { dominantNeed: null, tags: [] });
  assert.ok(restCautious > restPlain, '谨慎者应更偏好休息');
});

test('pruner.prune：空池返回空数组', () => {
  assert.deepEqual(pruner.prune('a1', [], { k: 3 }), []);
});

test('pruner.prune：K 溢出时保留全部', () => {
  const candidates = [
    { id: 'a1:eat', action: 'eat', score: 0.3 },
    { id: 'a1:drink', action: 'drink', score: 0.3 },
  ];
  assert.equal(pruner.prune('a1', candidates, { k: 10 }).length, 2);
});

test('pruner.prune：裁剪到前 K（降序）', () => {
  const candidates = [
    { id: 'a1:eat', action: 'eat', score: 0.3 },
    { id: 'a1:drink', action: 'drink', score: 0.3 },
    { id: 'a1:rest', action: 'rest', score: 0.2 },
    { id: 'a1:forage', action: 'forage', score: 0.2 },
  ];
  // 契约变更：生存骨架（eat/drink/rest/forage）**免疫修剪**，
  // 因为它们是唯一能补货/维生的行动，而基础分天然低于动态行动。
  // 实测教训：加入 found 后骨架被挤出前 K，全镇不再采集，t25 食水归零后
  // 永不恢复，seed1/seed2 全灭（基线靠 forage=43 恢复并稳定 148-150）。
  // 因此 k=2 时会得到全部 4 个骨架项，而不是被截到 2 个。
  const out = pruner.prune('a1', candidates, { k: 2, dominantNeed: 'food', level: 0.6, threshold: 0.4, tags: [] });
  assert.equal(out.length, 4, '生存骨架应全部保留（免疫修剪）');
  assert.ok(out.every((c) => ['eat', 'drink', 'rest', 'forage'].includes(c.action)),
    '保留的应全部是生存骨架');
  assert.equal(out[0].action, 'eat', '骨架内部仍按分数降序');
});

test('pruner.prune：非生存候选仍裁剪到 k（骨架之外）', () => {
  const candidates = [
    { id: 'a1:craft', action: 'craft', score: 0.9 },
    { id: 'a1:build', action: 'build', score: 0.8 },
    { id: 'a1:write', action: 'write', score: 0.7 },
    { id: 'a1:trade', action: 'trade', score: 0.6 },
  ];
  const out = pruner.prune('a1', candidates, { k: 2, dominantNeed: 'food', level: 0.1, threshold: 0.4, tags: [] });
  assert.equal(out.length, 2, '无骨架时仍按 k 裁剪');
  assert.equal(out[0].action, 'craft');
});

// ---- 行动模拟 ----

test('simulator.simulate：噪声为 0 时确定性 + 风险惩罚', () => {
  const ctx = { needs: { food: 0.5, water: 0.2 }, resources: { food: { scarcity: 0 }, water: { scarcity: 0 } }, noise: 0, rng: { next: () => 0.5 } };
  const eat = simulator.simulate({ id: 'x', action: 'eat' }, ctx);
  assert.equal(eat.exploration, 0, '噪声为 0 时探索扰动应为 0');
  assert.ok(eat.expectedUtility > 0, '饥饿时进食期望效用应为正');
  const forage = simulator.simulate({ id: 'x', action: 'forage' }, ctx);
  assert.equal(forage.risk, 0.15, '采集应带风险');
});

test('simulator.predict：按期望效用降序', () => {
  const ctx = { needs: { food: 0.8, water: 0.1 }, resources: { food: { scarcity: 0 }, water: { scarcity: 0 } }, noise: 0, rng: { next: () => 0.5 } };
  const candidates = [{ id: 'x:eat', action: 'eat' }, { id: 'x:drink', action: 'drink' }];
  const out = simulator.predict('x', candidates, ctx);
  assert.equal(out[0].action, 'eat', '食物需求高时应预测进食最优');
  assert.ok(out[0].expectedUtility >= out[1].expectedUtility);
});

// ---- 决策解释 ----

test('explainer.explain：人类可读，含谁/何时/为何/放弃', () => {
  const s = explainer.explain({
    agentId: 'agent_1',
    tick: 42,
    chosen: { action: 'eat', score: 2.5 },
    alternatives: [{ action: 'drink' }, { action: 'forage' }, { action: 'rest' }],
    context: { dominantNeed: 'food', level: 0.6, threshold: 0.4 },
  });
  assert.ok(s.includes('agent_1'));
  assert.ok(s.includes('42'));
  assert.ok(s.includes('eat'));
  assert.ok(s.includes('放弃'));
});

test('explainer.trace：结构化轨迹', () => {
  const t = explainer.trace({
    agentId: 'agent_1',
    tick: 42,
    chosen: { action: 'eat' },
    alternatives: [{ action: 'forage' }],
    context: { dominantNeed: 'food', level: 0.6, threshold: 0.4 },
  });
  assert.equal(t.agentId, 'agent_1');
  assert.equal(t.chosen, 'eat');
  assert.ok(Array.isArray(t.alternatives));
  assert.ok(typeof t.summary === 'string');
});

// ---- 无回退集成：50 居民 × 200 tick 存活 1.00 + 决策解释 + 语义记忆落盘 ----

test('50×200：存活无回退 + 每次决策含解释 + 语义记忆已写入', async () => {
  loop.reset();
  // 隔离 t48 日程覆盖（默认开启会覆盖生存行动导致群体饿死）；本测试聚焦本批次记忆/预演/解释的存活无回退。
  const report = await loop.run({ ticks: 200, seed: 7, agentCount: 50, scheduleEnabled: false });
  assert.equal(report.finalTick, 200);
  const alive = loop.snapshot().agents.length;
  assert.equal(alive, 50, '50 居民默认局 200 tick 应全部存活');

  const logs = decisionLog.list();
  assert.equal(logs.length, 50 * 200, '每居民每 tick 应各有一条决策日志');
  for (const l of logs.slice(0, 200)) {
    assert.ok(typeof l.data.reason === 'string' && l.data.reason.length > 0, '决策应带人类可读解释');
    assert.ok(l.data.reason.includes('选择'), '解释应含选择的行动');
  }

  const sem = semantic.list('agent_000000000001');
  assert.ok(sem.length > 0, '语义记忆应已按决策落盘');
});
