import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { graph, rng, pubsub } from '../src/infra/index.js';
import * as survival from '../src/survival/index.js';
import * as internalMedical from '../src/survival/health/_medical.js';
import { recorder } from '../src/observer/index.js';
import { loop, registry } from '../src/runtime/index.js';
import * as town from '../src/town/index.js';

function resetAll() {
  graph.__reset();
  rng.__reset();
  pubsub.__reset();
  survival.needs.meter.__reset();
  recorder.__reset();
  survival.resources.food.__reset();
  survival.resources.water.__reset();
  survival.resources.energy.__reset();
  survival.shelter.__reset();
  survival.goal.__reset();
  registry.__reset();
}

beforeEach(() => {
  resetAll();
});

test('energy: 默认库存 100/500，比食物更稀缺，produce/consume/query', () => {
  const q = survival.resources.energy.query();
  assert.equal(q.stockpile, 100);
  assert.equal(q.capacity, 500);
  assert.equal(q.scarcity, 0.8);

  const afterConsume = survival.resources.energy.consume(10);
  assert.equal(afterConsume.stockpile, 90);
  assert.equal(afterConsume.consumed, 10);

  const afterProduce = survival.resources.energy.produce(20);
  assert.equal(afterProduce.stockpile, 110);
  assert.equal(afterProduce.produced, 20);

  const clamp = survival.resources.energy.consume(9999);
  assert.equal(clamp.stockpile, 0);

  assert.throws(() => survival.resources.energy.consume(-1), /amount/);
  assert.throws(() => survival.resources.energy.produce(NaN), /amount/);
});

test('energy: civilization 内部 _energy 复用同一能源节点（避免两套库存）', async () => {
  const internal = await import('../src/civilization/tech/_energy.js');
  const before = survival.resources.energy.query().stockpile;
  internal.consume(5);
  assert.equal(survival.resources.energy.query().stockpile, before - 5);
});

test('medical: 薄门面复用 health/_medical 的同一库存节点', () => {
  const q = survival.resources.medical.query();
  assert.equal(typeof q.stockpile, 'number');

  const before = q.stockpile;
  internalMedical.consume(15);
  assert.equal(survival.resources.medical.query().stockpile, before - 15);

  survival.resources.medical.produce(5);
  assert.equal(internalMedical.query().stockpile, before - 10);
});

test('shelter: status/capacity/damage 完整度下降导致容量下降', () => {
  const st = survival.shelter.status();
  assert.equal(st.integrity, 100);
  assert.equal(st.capacity, 54);
  assert.equal(st.damaged, false);

  const d = survival.shelter.damage(20);
  assert.equal(d.integrity, 80);
  assert.equal(d.capacity, 43);
  assert.equal(d.damaged, true);
  assert.equal(d.damage, 20);
  assert.equal(survival.shelter.capacity(), 43);

  const d2 = survival.shelter.damage(999);
  assert.equal(d2.integrity, 0);
  assert.equal(d2.capacity, 0);

  assert.throws(() => survival.shelter.damage(-1), /amount/);
});

test('shelter: occupants 取全部住宅入住人数', () => {
  town.residence.move_in({ agentId: 'a1', residenceId: 'dorm_a' });
  town.residence.move_in({ agentId: 'a2', residenceId: 'dorm_a' });
  assert.equal(survival.shelter.status().occupants, 2);
});

test('crisis: detect 汇总饥饿与避难所损坏信号', () => {
  registry.register({ id: 'hungry', type: 'agent', data: { name: 'x' } });
  survival.needs.meter.update({ agentId: 'hungry', need: 'food', level: 0.95 });
  survival.shelter.damage(50);

  const det = survival.crisis.detect({ tick: 2 });
  assert.equal(det.tick, 2);
  assert.ok(det.reasons.includes('starvation'));
  assert.ok(det.reasons.includes('shelter_damage'));
  assert.equal(det.signals.hungerRate, 1);
  assert.ok(det.level >= 0 && det.level <= 1);
});

test('crisis: 空世界 level=0 非 critical；alert 仅在 critical 写事件', () => {
  const det = survival.crisis.detect({ tick: 1 });
  assert.equal(det.level, 0);
  assert.equal(det.critical, false);

  const alert = survival.crisis.alert({ tick: 1, thresholds: { critical: 0 } });
  assert.equal(alert.critical, true);
  const topics = recorder.eventLog.list().map((n) => n.data.topic);
  assert.ok(topics.includes('survival.crisis'));
});

test('goal: survive 记录起始 tick，elapsed 统计存活时长', () => {
  const s = survival.goal.survive({ tick: 3 });
  assert.equal(s.goal, '继续活下去');
  assert.equal(s.startTick, 3);

  const e = survival.goal.elapsed({ tick: 10 });
  assert.equal(e.elapsed, 7);
  assert.equal(e.alive, false);
  assert.equal(e.survivors, 0);

  registry.register({ id: 'alive1', type: 'agent', data: { name: 'a' } });
  const e2 = survival.goal.elapsed({ tick: 12 });
  assert.equal(e2.alive, true);
  assert.equal(e2.survivors, 1);
  assert.equal(e2.elapsed, 9);
});

test('批次1 不回归：默认参数 50 居民 × 200 tick 仍存活（phase2+phase3）', async () => {
  loop.reset();
  const report = await loop.run({ ticks: 200, agentCount: 50, seed: 1, phase2: true, phase3: true });

  const goal = report.world.survival.goal;
  assert.equal(goal.alive, true, '200 tick 后仍应存活');
  assert.equal(goal.elapsed, 200, '存活时长与主循环 tick 一致');
  assert.ok(goal.survivors >= 50, '至少 50 名初始居民存活');

  assert.equal(typeof report.world.resources.energy.stockpile, 'number');
  assert.equal(typeof report.world.resources.medical.stockpile, 'number');
  assert.equal(typeof report.world.shelter.integrity, 'number');
  assert.equal(typeof report.world.survival.crisis.level, 'number');
});

