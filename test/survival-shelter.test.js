import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { graph, rng, pubsub } from '../src/infra/index.js';
import * as survival from '../src/survival/index.js';
import { recorder } from '../src/observer/index.js';
import { loop, registry } from '../src/runtime/index.js';
import { runBench } from '../bin/bench.js';

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

test('shelter: repair 提升完整度、容量回升且封顶 100（t43 D2-2 修复路径）', () => {
  survival.shelter.damage(50); // integrity 50 → capacity floor(54*0.5)=27
  assert.equal(survival.shelter.capacity(), 27);

  const r = survival.shelter.repair(20); // integrity 70 → capacity 37
  assert.equal(r.integrity, 70);
  assert.equal(r.capacity, 37);
  assert.equal(r.repaired, 20);
  assert.equal(r.damaged, true);

  const r2 = survival.shelter.repair(999); // 封顶 100
  assert.equal(r2.integrity, 100);
  assert.equal(r2.capacity, 54);
  assert.equal(r2.damaged, false);
  assert.equal(r2.repaired, 30);

  assert.throws(() => survival.shelter.repair(-1), /amount/);
});

test('crisis: 危机触发 → 修复 → 恢复（level 可升降、critical 转 false）', () => {
  // 无居民：hunger/thirst/infection 均为 0，level 由避难所损坏信号主导
  survival.shelter.damage(100); // integrity 0 → shelterDamageLevel 1.0
  let det = survival.crisis.detect({ tick: 1 });
  assert.equal(det.level, 1.0);
  assert.equal(det.critical, true);
  assert.ok(det.reasons.includes('shelter_damage'));

  survival.shelter.repair(60); // integrity 60 → shelterDamageLevel 0.4
  det = survival.crisis.detect({ tick: 2 });
  assert.ok(det.level < 1.0);
  assert.equal(det.critical, false);

  survival.shelter.repair(40); // integrity 100 → damaged=false → 0
  det = survival.crisis.detect({ tick: 3 });
  assert.equal(det.level, 0);
  assert.equal(det.critical, false);
  assert.equal(det.signals.shelterDamageLevel, 0);
  assert.ok(!det.reasons.includes('shelter_damage'));
});

test('capacity rejection: capacity=0 时居民不得居住（超员逐出 + 暴露）', async () => {
  resetAll();
  loop.reset(); // 全量复位（clock/registry/graph/shelter...）
  survival.shelter.damage(100); // integrity 0 → capacity 0（复刻 t41 的 capacity=0 场景）
  const report = await loop.run({ reset: false, agentCount: 5, ticks: 1, phase2: true, seed: 1 });

  const res = report.steps[0].phase2.residence;
  assert.equal(res.evicted.length, 5, '5 名居民应被逐出（capacity=0 不得继续居住）');
  assert.equal(res.exposed.length, 5, '被逐出者应暴露于环境');
  assert.equal(survival.shelter.status().occupants, 0, 'occupants 应为 0（<= capacity 0）');
});

test('default 50×200×3: 存活率不回归 1.00（t33 基线硬约束）', async () => {
  const result = await runBench({ ticks: 200, agents: 50, seeds: [1, 2, 3], phase2: true });
  assert.equal(result.runs.length, 3);
  for (const r of result.runs) {
    assert.equal(r.survivalRate, 1.0, 'seed ' + r.seed + ' 存活率应 1.00');
    assert.equal(r.collapses, 0, 'seed ' + r.seed + ' 不应发生文明崩溃');
  }
});

