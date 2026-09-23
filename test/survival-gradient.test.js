import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loop } from '../src/runtime/index.js';
import * as survival from '../src/survival/index.js';

test('采集池按 tick 再生并封顶在容量', async () => {
  loop.reset();
  survival.resources.food.consume(1000); // 排空库存，使 produce 可观测
  survival.resources.water.consume(1000);
  const report = await loop.run({
    reset: false, ticks: 3, agentCount: 1, seed: 1, eventProbability: 0,
    needGrowth: { food: 0, water: 0 }, // 永不饥饿
    decay: { food: 0, water: 0 }, // 关闭自然损耗，精确断言采集量
    eatThreshold: 1, // 抬高进食阈值，强制采集
    forageYield: 10, foragePoolCapacity: 5, forageRegen: 2,
    phase2: false, phase3: false,
  });
  // tick1 满池 5 → 采 5；tick2/3 各再生 2 → 各采 2；合计 5+2+2=9
  assert.equal(report.resources.food.stockpile, 9);
  assert.equal(report.resources.water.stockpile, 9);
  assert.equal(loop.foragePoolRemaining(), 0, '每 tick 末都被采空');
});

test('池空时采集受限：实际获取 = min(forageYield, 池余量)', async () => {
  loop.reset();
  survival.resources.food.consume(1000);
  survival.resources.water.consume(1000);
  const report = await loop.run({
    reset: false, ticks: 1, agentCount: 1, seed: 1, eventProbability: 0,
    needGrowth: { food: 0, water: 0 },
    eatThreshold: 1,
    forageYield: 100, foragePoolCapacity: 3, forageRegen: 0,
    phase2: false, phase3: false,
  });
  // forageYield=100 但池余量仅 3 → 实际只采到 3
  assert.equal(report.resources.food.stockpile, 3);
  assert.equal(report.resources.water.stockpile, 3);
  assert.equal(loop.foragePoolRemaining(), 0);
});

test('资源随人口增长而紧张：固定采集池下人口越多库存越低', async () => {
  const cfg = {
    ticks: 40, seed: 5, eventProbability: 0,
    needGrowth: { food: 0.1, water: 0.1 },
    forageYield: 2, foragePoolCapacity: 15, forageRegen: 3,
    phase2: false, phase3: false,
  };
  loop.reset();
  const small = await loop.run({ ...cfg, agentCount: 3 });
  loop.reset();
  const big = await loop.run({ ...cfg, agentCount: 25 });
  assert.ok(
    big.resources.food.stockpile < small.resources.food.stockpile,
    '人口多时食物库存应更低（' + big.resources.food.stockpile + ' vs ' + small.resources.food.stockpile + '）',
  );
  assert.ok(
    big.resources.water.stockpile < small.resources.water.stockpile,
    '人口多时水源库存应更低（' + big.resources.water.stockpile + ' vs ' + small.resources.water.stockpile + '）',
  );
});
