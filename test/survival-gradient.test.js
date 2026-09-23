import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loop } from '../src/runtime/index.js';
import * as survival from '../src/survival/index.js';

test('采集池按 tick 再生并封顶在容量', async () => {
  loop.reset();
  survival.resources.food.consume(1000);
  survival.resources.water.consume(1000);
  const report = await loop.run({
    reset: false, ticks: 3, agentCount: 1, seed: 1, eventProbability: 0,
    needGrowth: { food: 0, water: 0 },
    decay: { food: 0, water: 0 },
    eatThreshold: 1,
    forageYield: 10, foragePoolCapacity: 5, forageRegen: 2,
    foragePoolPerCapita: 0, forageRegenPerCapita: 0,
    phase2: false, phase3: false,
  });
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
    foragePoolPerCapita: 0, forageRegenPerCapita: 0,
    phase2: false, phase3: false,
  });
  assert.equal(report.resources.food.stockpile, 3);
  assert.equal(report.resources.water.stockpile, 3);
  assert.equal(loop.foragePoolRemaining(), 0);
});

test('资源随人口增长而紧张：固定采集池下人口越多库存越低', async () => {
  const cfg = {
    ticks: 40, seed: 5, eventProbability: 0,
    needGrowth: { food: 0.1, water: 0.1 },
    forageYield: 2, foragePoolCapacity: 15, forageRegen: 3,
    foragePoolPerCapita: 0, forageRegenPerCapita: 0,
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

test('采集池按人口缩放：总量随人口递增但人均递减', async () => {
  const runCfg = (n) => loop.run({
    ticks: 1, agentCount: n, seed: 1, eventProbability: 0,
    needGrowth: { food: 0, water: 0 },
    phase2: false, phase3: false,
  });
  loop.reset();
  const small = await runCfg(20);
  const smallRegen = small.world.resources.foragePool.regen;
  const smallCap = small.world.resources.foragePool.capacity;
  loop.reset();
  const big = await runCfg(50);
  const bigRegen = big.world.resources.foragePool.regen;
  const bigCap = big.world.resources.foragePool.capacity;
  assert.ok(bigRegen > smallRegen, 'regen 应随人口递增（' + bigRegen + ' vs ' + smallRegen + '）');
  assert.ok(bigCap > smallCap, 'capacity 应随人口递增（' + bigCap + ' vs ' + smallCap + '）');
  assert.ok(bigRegen / 50 < smallRegen / 20, '人均 regen 应随人口递减（' + (bigRegen / 50).toFixed(3) + ' vs ' + (smallRegen / 20).toFixed(3) + '）');
});
