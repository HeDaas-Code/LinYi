import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { graph, rng, pubsub } from '../src/infra/index.js';
import * as survival from '../src/survival/index.js';
import { recorder } from '../src/observer/index.js';

const { resources, needs, events } = survival;
const { food, water } = resources;
const { meter, pressure } = needs;
const { scorer, ranker } = pressure;
const { generator, impact } = events;
const { roller, selector } = generator;

const DEFAULT_SCARCITY = 1 - 100 / 100; // 0（capacity 修正后初始即满）

function resetAll() {
  graph.__reset();
  rng.__reset();
  pubsub.__reset();
  meter.__reset();
  recorder.__reset();
  food.__reset();
  water.__reset();
  impact.__reset();
}

beforeEach(() => {
  resetAll();
});

test('food: produce 增产、consume 消耗并夹在 [0, capacity]', () => {
  assert.equal(food.query().stockpile, 100);

  const afterConsume = food.consume(30);
  assert.equal(afterConsume.stockpile, 70);
  assert.equal(afterConsume.consumed, 30);

  const afterProduce = food.produce(20);
  assert.equal(afterProduce.stockpile, 90);
  assert.equal(afterProduce.produced, 20);

  const clamp = food.consume(9999);
  assert.equal(clamp.stockpile, 0);
  assert.equal(clamp.consumed, 90);
  assert.equal(food.query().stockpile, 0);
});

test('food: scarcity 随库存变化，capacity 限制上限', () => {
  assert.equal(food.query().scarcity, DEFAULT_SCARCITY);

  const capped = food.produce(9999);
  assert.equal(capped.stockpile, 100);
  assert.equal(capped.produced, 0);
  assert.equal(capped.scarcity, 0);

  const depleted = food.consume(90);
  assert.equal(depleted.stockpile, 10);
  assert.equal(depleted.scarcity, 0.9);
});

test('food: decay 按比例自然损耗', () => {
  const r = food.decay(0.1);
  assert.equal(r.decayed, 10);
  assert.equal(r.stockpile, 90);
});

test('water: 独立于 food 的库存语义', () => {
  water.consume(10);
  water.produce(5);
  assert.equal(water.query().stockpile, 95);
  assert.equal(food.query().stockpile, 100);
});

test('resources: 非法 amount/rate 抛出 TypeError', () => {
  assert.throws(() => food.consume(-1), /amount/);
  assert.throws(() => food.produce(NaN), /amount/);
  assert.throws(() => food.decay(1.5), /rate/);
  assert.throws(() => water.decay(-0.1), /rate/);
});

test('meter: update 设置绝对水平并夹在 [0,1]', () => {
  const r = meter.update({ agentId: 'a1', need: 'food', level: 0.7 });
  assert.equal(r.level, 0.7);
  assert.equal(r.prev, 0);

  assert.equal(meter.update({ agentId: 'a1', need: 'food', level: 2 }).level, 1);
  assert.equal(meter.update({ agentId: 'a1', need: 'food', level: -3 }).level, 0);
});

test('meter: update 用 delta 相对调整', () => {
  meter.update({ agentId: 'a1', need: 'water', level: 0.3 });
  const r = meter.update({ agentId: 'a1', need: 'water', delta: 0.2 });
  assert.equal(r.level, 0.5);
  assert.equal(r.prev, 0.3);
});

test('meter: query 单人与全员，挂接 food/water 稀缺度', () => {
  meter.update({ agentId: 'a1', need: 'food', level: 0.5 });
  meter.update({ agentId: 'b2', need: 'water', level: 0.2 });

  const single = meter.query({ agentId: 'a1' });
  assert.equal(single.agentId, 'a1');
  assert.equal(single.needs.food, 0.5);
  assert.equal(single.needs.water, 0);
  assert.equal(single.scarcity.food, DEFAULT_SCARCITY);
  assert.equal(single.scarcity.water, DEFAULT_SCARCITY);

  const all = meter.query();
  assert.deepEqual(all.map((x) => x.agentId), ['a1', 'b2']);
});

test('meter: 非法输入抛出 TypeError', () => {
  assert.throws(() => meter.update({ agentId: '', need: 'food', level: 1 }), /agentId/);
  assert.throws(() => meter.update({ agentId: 'a', need: '', level: 1 }), /need/);
  assert.throws(() => meter.update({ agentId: 'a', need: 'food' }), /level 或 delta/);
});

test('scorer.factor: level × (1 + scarcity) × weight', () => {
  assert.equal(scorer.factor({ level: 0.5, scarcity: 0.8 }), 0.9);
  assert.equal(scorer.factor({ level: 0.5, scarcity: 0, weight: 2 }), 1);
  assert.equal(scorer.factor({ level: 0 }), 0);
});

test('scorer.score: 从 meter 汇总需求缺口与稀缺度', () => {
  meter.update({ agentId: 'a1', need: 'food', level: 0.5 });
  meter.update({ agentId: 'a1', need: 'water', level: 1 });
  const s = scorer.score({ agentId: 'a1' });

  assert.equal(s.agentId, 'a1');
  assert.equal(s.factors.food, 0.5); // 0.5 × (1 + 0)
  assert.equal(s.factors.water, 1.0); // 1.0 × (1 + 0)
  assert.equal(s.score, 1.5);
  assert.equal(s.normalized, 1.5 / 4);
});

test('scorer.score: 支持显式 needs/scarcity，不需 agentId', () => {
  const s = scorer.score({ needs: { food: 0.4 }, scarcity: { food: 0 } });
  assert.equal(s.score, 0.4);
  assert.equal(s.factors.food, 0.4);
});

test('scorer.score: 缺少 agentId 且无 needs/scarcity 时抛错', () => {
  assert.throws(() => scorer.score({}), /agentId/);
});

test('ranker.rank: 按 score 降序稳定排序，同分按 agentId 升序', () => {
  const rows = ranker.rank([
    { agentId: 'a', score: 1 },
    { agentId: 'b', score: 3 },
    { agentId: 'c', score: 2 },
  ]);
  assert.deepEqual(rows.map((r) => r.agentId), ['b', 'c', 'a']);

  const tied = ranker.rank([{ agentId: 'z', score: 1 }, { agentId: 'a', score: 1 }]);
  assert.deepEqual(tied.map((r) => r.agentId), ['a', 'z']);
});

test('ranker.top: 取前 N 名并标注 highRisk', () => {
  const top2 = ranker.top([
    { agentId: 'a', score: 0.9 },
    { agentId: 'b', score: 0.3 },
    { agentId: 'c', score: 0.8 },
  ], { n: 2, threshold: 0.5 });
  assert.deepEqual(top2.map((r) => r.agentId), ['a', 'c']);
  assert.deepEqual(top2.map((r) => r.highRisk), [true, true]);

  const top1 = ranker.top([{ agentId: 'b', score: 0.3 }], { n: 1, threshold: 0.5 });
  assert.equal(top1[0].highRisk, false);
});

test('ranker: 非法输入抛出 TypeError', () => {
  assert.throws(() => ranker.rank({}), /数组/);
  assert.throws(() => ranker.top([], { n: -1 }), /n/);
});

test('roller: seed 复现、roll(1) 必真、roll(0) 必假', () => {
  roller.seed('truman');
  const a = [roller.roll(0.5), roller.roll(0.5), roller.roll(0.5)];
  roller.seed('truman');
  const b = [roller.roll(0.5), roller.roll(0.5), roller.roll(0.5)];
  assert.deepEqual(a, b);
  assert.equal(roller.roll(1), true);
  assert.equal(roller.roll(0), false);
});

test('selector.weigh: 归一化并按类型倍率缩放权重', () => {
  const out = selector.weigh([
    { id: 'e1', type: 'storm', weight: 1 },
    { id: 'e2', type: 'quake', weight: 2 },
  ], { weights: { quake: 10 } });
  assert.equal(out.length, 2);
  assert.equal(out[0].weight, 1);
  assert.equal(out[1].weight, 20);
  assert.equal(typeof out[0].effects, 'object');
});

test('selector.select: 按权重抽取，唯一正权事件必中', () => {
  const picked = selector.select([
    { id: 'only', type: 'storm', weight: 1 },
    { id: 'zero', type: 'quake', weight: 0 },
  ]);
  assert.equal(picked.id, 'only');
});

test('selector.select: 空候选返回 null，全零权退化为等概率', () => {
  assert.equal(selector.select([]), null);
  const picked = selector.select([{ id: 'a', weight: 0 }, { id: 'b', weight: 0 }]);
  assert.ok(picked.id === 'a' || picked.id === 'b');
});

test('impact.apply: 施加资源与避难所影响并记录事件日志', () => {
  const r = impact.apply({
    id: 'storm',
    type: 'storm',
    effects: { foodDelta: -10, waterDelta: -5, shelterDamage: 8 },
  }, { tick: 3 });

  assert.equal(r.applied, true);
  assert.equal(food.query().stockpile, 90);
  assert.equal(water.query().stockpile, 95);
  assert.equal(r.changes.shelter.integrity, 92);
  assert.equal(r.changes.shelter.damage, 8);

  const logs = recorder.eventLog.list();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].data.tick, 3);
  assert.equal(logs[0].data.topic, 'survival.storm');
  assert.equal(logs[0].data.payload.eventId, 'storm');
});

test('impact.resolve: 解决事件链并按声明顺序施加', () => {
  const r = impact.resolve({
    id: 'quake',
    type: 'quake',
    effects: { shelterDamage: 5 },
    chain: [
      { id: 'aftershock', type: 'aftershock', effects: { foodDelta: -2 } },
    ],
  }, { tick: 7 });

  assert.equal(r.resolved, 2);
  assert.deepEqual(r.results.map((x) => x.event.id), ['quake', 'aftershock']);
  assert.equal(food.query().stockpile, 98);
  assert.equal(r.results[0].changes.shelter.integrity, 95);
  assert.equal(recorder.eventLog.list().length, 2);
});

test('impact: 非法事件对象抛错', () => {
  assert.throws(() => impact.apply(null), /event/);
  assert.throws(() => impact.apply('x'), /event/);
});
