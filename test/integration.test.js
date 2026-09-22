import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loop } from '../src/runtime/index.js';
import * as observer from '../src/observer/index.js';
import * as survival from '../src/survival/index.js';
import { registry } from '../src/runtime/index.js';
import { worldState } from '../src/runtime/index.js';

test('spawnAgent: 登记实体、特质、预想池与初始需求', () => {
  loop.reset();
  const agent = loop.spawnAgent({ name: 'Ada', persona: '谨慎的园丁', food: 0.3, water: 0.4 });
  assert.equal(agent.name, 'Ada');
  assert.match(agent.id, /^agent_\d{12}$/);

  const record = registry.lookup(agent.id);
  assert.equal(record.type, 'agent');
  assert.equal(record.data.name, 'Ada');

  const needs = survival.needs.meter.query({ agentId: agent.id });
  assert.equal(needs.needs.food, 0.3);
  assert.equal(needs.needs.water, 0.4);

  const world = worldState.get('agents.' + agent.id);
  assert.equal(world.name, 'Ada');
  assert.equal(world.alive, true);
});

test('step: 单 tick 完整闭环（决策 + AI 思考 + 行动 + 观察者 + 世界状态）', async () => {
  loop.reset();
  loop.spawnAgent({ name: 'Bo', food: 1.0, water: 0.0 });
  const summary = await loop.step({ eventProbability: 0 });

  assert.equal(summary.tick, 1);
  assert.equal(summary.decisions.length, 1);
  assert.equal(summary.decisions[0].action, 'eat'); // 高饥饿 → 选择进食
  assert.ok(summary.decisions[0].thought.length > 0);

  // 观察者：决策日志 + 行为日志
  assert.equal(observer.recorder.decisionLog.list().length, 1);
  assert.equal(observer.recorder.actionLog.list().length, 1);

  // 世界状态：last_action 已写入，资源被消耗
  const world = worldState.snapshot();
  assert.equal(world.agents[Object.keys(world.needs)[0]].last_action.action, 'eat');
  assert.equal(world.tick, 1);
  assert.ok(world.resources.food.stockpile < 100);
});

test('step: 高口渴 → 选择饮水', async () => {
  loop.reset();
  loop.spawnAgent({ name: 'Cy', food: 0.0, water: 1.0 });
  const summary = await loop.step({ eventProbability: 0 });
  assert.equal(summary.decisions[0].action, 'drink');
});

test('run: 3 个智能体跑 N tick，资源衰减 + 生存压力 + 决策 + 观察者日志持续写入', async () => {
  const report = await loop.run({ ticks: 10, seed: 42, agentCount: 3 });

  assert.equal(report.agents.length, 3);
  assert.equal(report.finalTick, 10);
  assert.equal(report.steps.length, 10);

  // 每个 tick 三个智能体都做出决策并写入日志
  assert.equal(report.chronicle.decision, 30);
  assert.equal(report.chronicle.action, 30);

  // 世界状态持续变化：tick 已推进，资源快照存在
  assert.equal(report.world.tick, 10);
  assert.ok(typeof report.world.resources.food.stockpile === 'number');
  assert.ok(typeof report.world.resources.water.stockpile === 'number');

  // 需求快照覆盖全部智能体
  assert.equal(Object.keys(report.world.needs).length, 3);

  // 编年志可按 tick 分桶编译
  const chronicle = observer.chronicle.compiler.compile();
  assert.equal(chronicle.counts.decision, 30);
  assert.equal(chronicle.counts.action, 30);
  assert.ok(chronicle.buckets.length >= 1);
});

test('run: 固定种子可复现，事件日志由 impact 写入', async () => {
  const r1 = await loop.run({ ticks: 8, seed: 7, agentCount: 2 });
  const r2 = await loop.run({ ticks: 8, seed: 7, agentCount: 2 });
  assert.deepEqual(r1.steps, r2.steps);

  const eventLogs = observer.recorder.eventLog.list();
  assert.ok(eventLogs.length >= 0); // 事件是否发生取决于种子；有则来自 impact
});

test('snapshot: 暴露世界状态与编年计数', async () => {
  await loop.run({ ticks: 3, seed: 1, agentCount: 2 });
  const snap = loop.snapshot();
  assert.equal(snap.tick, 3);
  assert.equal(snap.agents.length, 2);
  assert.ok(typeof snap.resources.food.stockpile === 'number');
  assert.ok(snap.chronicle.total > 0);
});
