import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loop, registry } from '../src/runtime/index.js';
import * as observer from '../src/observer/index.js';
import * as survival from '../src/survival/index.js';

function eventTopics() {
  return observer.recorder.eventLog.list().map((n) => n.data.topic);
}

test('P0-3 scarcity 修正：初始稀缺度接近 0（capacity 口径修正）', () => {
  loop.reset();
  assert.equal(survival.resources.food.query().scarcity, 0, '初始食物稀缺度应为 0');
  assert.equal(survival.resources.water.query().scarcity, 0, '初始水源稀缺度应为 0');
  assert.equal(survival.resources.food.query().capacity, 100, '容量应修正为与初始库存一致');
});

test('P0-1 种子生效：不同种子产生结构性差异（交易数至少一项不同）', async () => {
  const tradesBySeed = [];
  for (const seed of [1, 2, 3]) {
    loop.reset();
    const r = await loop.run({ phase2: true, phase3: true, ticks: 30, agentCount: 8, seed });
    tradesBySeed.push(r.phase2.summary.trades);
  }
  assert.ok(
    new Set(tradesBySeed).size > 1,
    '不同种子应产生不同交易数（结构差异）: ' + JSON.stringify(tradesBySeed),
  );
});

test('P0-2 死亡机制：资源枯竭 → 需求空转不满足 → 饥饿持续 → 死亡并写 observer', async () => {
  loop.reset();
  const report = await loop.run({
    ticks: 40, seed: 5, agentCount: 4,
    decay: { food: 0.1, water: 0.1 },
    needGrowth: { food: 0.3, water: 0.3 },
    eventProbability: 0,
  });

  // 资源枯竭 + 空转满足修复 → 需求不降 → 死亡
  assert.equal(report.resources.food.stockpile, 0, '食物应枯竭');
  assert.ok(eventTopics().includes('agent.death'), '死亡应写 observer event-log');

  const worldAgents = report.world.agents ?? {};
  const dead = Object.values(worldAgents).filter((w) => w.alive === false);
  assert.ok(dead.length >= 1, '应有居民死亡');
  for (const w of dead) {
    assert.equal(w.alive, false, '死亡居民 alive 应为 false');
    assert.equal(typeof w.deathTick, 'number', '死亡居民应有 deathTick');
  }

  // 死亡居民从 registry 移除
  const alive = registry.lookup({ type: 'agent' });
  assert.ok(alive.length < 4, '死亡居民应从 registry 移除（alive=' + alive.length + '）');
});

test('P0-2 死亡事件载荷：标注死亡原因（饥饿/脱水）', async () => {
  loop.reset();
  await loop.run({
    ticks: 40, seed: 5, agentCount: 4,
    decay: { food: 0.1, water: 0.1 },
    needGrowth: { food: 0.3, water: 0.3 },
    eventProbability: 0,
  });
  const deathEvents = observer.recorder.eventLog.list().filter((n) => n.data.topic === 'agent.death');
  assert.ok(deathEvents.length >= 1, '应记录死亡事件');
  for (const n of deathEvents) {
    assert.ok(['starvation', 'dehydration'].includes(n.data.payload.cause), '死亡原因应合法: ' + n.data.payload.cause);
  }
});
