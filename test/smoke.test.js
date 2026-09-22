import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loop, worldState } from '../src/runtime/index.js';
import * as observer from '../src/observer/index.js';
import * as survival from '../src/survival/index.js';

/** 由 run 报告计算每个智能体的存活时长（存活 tick 数）。 */
function survivalReport(report) {
  const table = {};
  for (const spawned of report.agents) {
    const world = report.world.agents ? report.world.agents[spawned.id] : undefined;
    table[spawned.id] = {
      id: spawned.id,
      name: spawned.name,
      bornTick: world ? world.bornTick : null,
      alive: world ? world.alive : false,
      survivedTicks: world && typeof world.bornTick === 'number' ? report.finalTick - world.bornTick : null,
    };
  }
  return table;
}

test('smoke: 3 智能体 × 20 tick 完整闭环，验证衰减/压力/决策/AI/日志/世界状态并记录存活时长', async () => {
  const N = 20;
  const report = await loop.run({ ticks: N, seed: 42, agentCount: 3 });

  // 1) 资源衰减：水源只减不增（decay + drink，无增产），食物库存可观测
  assert.equal(report.agents.length, 3);
  assert.ok(
    report.resources.water.stockpile < 100,
    '水源应随 tick 衰减（初始 100），实际 ' + report.resources.water.stockpile,
  );
  assert.ok(report.resources.water.totalConsumed >= 0);
  assert.ok(typeof report.resources.food.stockpile === 'number');
  assert.ok(report.resources.food.totalProduced >= 0 && report.resources.food.totalConsumed >= 0);

  // 2) 生存压力产生：需求被追踪，压力可评分并排序
  const pressureScores = [];
  for (const spawned of report.agents) {
    const meter = survival.needs.meter.query({ agentId: spawned.id });
    assert.ok(typeof meter.needs.food === 'number' && typeof meter.needs.water === 'number');
    const score = survival.needs.pressure.scorer.score({ agentId: spawned.id });
    assert.ok(score.normalized >= 0 && score.normalized <= 1);
    assert.ok(Object.keys(score.factors).length >= 2);
    pressureScores.push({ agentId: spawned.id, score: score.score, normalized: score.normalized });
  }
  const ranked = survival.needs.pressure.ranker.rank(pressureScores);
  assert.equal(ranked.length, 3);
  assert.ok(ranked[0].score >= ranked[ranked.length - 1].score);

  // 3) 智能体决策：每个 tick × 3 智能体都做出决策并派发行为
  assert.equal(report.chronicle.decision, N * 3);
  assert.equal(report.chronicle.action, N * 3);

  // 4) AI 返回结果：每条决策伴随非空思考
  assert.equal(report.steps.length, N);
  let thoughtCount = 0;
  for (const step of report.steps) {
    assert.equal(step.decisions.length, 3);
    for (const d of step.decisions) {
      assert.equal(typeof d.thought, 'string');
      assert.ok(d.thought.length > 0, 'AI 应返回非空思考');
      thoughtCount += 1;
    }
  }
  assert.equal(thoughtCount, N * 3);

  // 5) 观察者日志持续写入：决策/行为日志逐 tick 追加，事件日志可空但可观测
  assert.equal(observer.recorder.decisionLog.list().length, N * 3);
  assert.equal(observer.recorder.actionLog.list().length, N * 3);
  assert.ok(Array.isArray(observer.recorder.eventLog.list()));
  const chronicle = observer.chronicle.compiler.compile();
  assert.equal(chronicle.counts.decision, N * 3);
  assert.equal(chronicle.counts.action, N * 3);
  assert.ok(chronicle.buckets.length >= 1);

  // 6) 世界状态推进
  assert.equal(report.finalTick, N);
  assert.equal(report.world.tick, N);

  // 7) 记录存活时长：3 个居民全程存活，存活时长 = finalTick - bornTick = N
  const table = survivalReport(report);
  assert.equal(Object.keys(table).length, 3);
  for (const entry of Object.values(table)) {
    assert.equal(entry.alive, true);
    assert.equal(entry.bornTick, 0);
    assert.equal(entry.survivedTicks, N);
  }
  console.log('[smoke] 存活时长记录: ' + JSON.stringify(table));
});

test('smoke: 世界状态随 tick 持续变化', async () => {
  loop.reset();
  loop.spawnAgent({ name: '甲', food: 0.5, water: 0.5 });
  loop.spawnAgent({ name: '乙', food: 0.5, water: 0.5 });
  loop.spawnAgent({ name: '丙', food: 0.5, water: 0.5 });

  const before = worldState.snapshot();
  for (let i = 0; i < 6; i += 1) {
    await loop.step({ eventProbability: 0 });
  }
  const after = worldState.snapshot();

  assert.equal(after.tick, 6);
  const changes = worldState.diff(before, after);
  assert.ok(changes.length > 0, '世界状态应产生变化');
  assert.ok(
    changes.some((c) => c.path.startsWith('resources.') || c.path.startsWith('needs.') || c.path.startsWith('agents.')),
    '变化应涉及资源/需求/智能体',
  );
});
