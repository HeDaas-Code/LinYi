import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loop } from '../src/runtime/index.js';
import * as observer from '../src/observer/index.js';
import * as civilization from '../src/civilization/index.js';

function eventTopics() {
  return observer.recorder.eventLog.list().map((n) => n.data.topic);
}

test('phase3：治理/文化/心理/科技被每 tick 驱动并写 observer（默认关闭不破坏既有行为）', async () => {
  // 默认关闭：不带 phase3 运行时，报告不含 phase3 字段
  loop.reset();
  const base = await loop.run({ ticks: 3, seed: 1, agentCount: 3 });
  assert.equal(base.phase3, undefined, '默认运行不应包含 phase3 摘要');

  // 开启 phase3
  loop.reset();
  const report = await loop.run({ phase3: true, ticks: 10, seed: 7, agentCount: 3 });
  assert.ok(report.phase3, 'run 报告应包含 phase3 摘要');
  assert.equal(report.phase3.seed.factions, 2, '应初始化 2 个派系');
  assert.equal(report.phase3.seed.norms, 2, '应定义 2 条社会规范');
  assert.equal(report.phase3.seed.research, 'water_purification', '应启动净水研究');

  const summary = report.phase3.summary;
  assert.ok(summary.lawsEnacted >= 1, '法律应生效');
  assert.ok(summary.conflictsResolved >= 1, '冲突应解决');
  assert.ok(summary.ritualsHeld >= 1, '仪式应举行');
  assert.ok(summary.normsViolated >= 1, '规范应被违反');
  assert.ok(summary.breakdowns >= 1, '应发生心理崩溃');
  assert.ok(summary.researchesCompleted >= 1, '应完成技术研究');

  const topics = eventTopics();
  assert.ok(topics.includes('politics.faction.formed'), '派系成立应写 event-log');
  assert.ok(topics.includes('politics.leader.elected'), '领导选举应写 event-log');
  assert.ok(topics.includes('politics.law.enacted'), '法律通过应写 event-log');
  assert.ok(topics.includes('politics.law.enforced'), '法律执行应写 event-log');
  assert.ok(topics.includes('politics.conflict.started'), '冲突开启应写 event-log');
  assert.ok(topics.includes('politics.conflict.resolved'), '冲突解决应写 event-log');
  assert.ok(topics.includes('culture.norm.violated'), '规范违反应写 event-log');
  assert.ok(topics.includes('culture.ritual.held'), '仪式举行应写 event-log');
  assert.ok(topics.includes('culture.meme.spread'), '模因传播应写 event-log');
  assert.ok(topics.includes('psyche.breakdown'), '心理崩溃应写 event-log');
  assert.ok(topics.includes('civilization.tech.research.start'), '研究启动应写 event-log');
  assert.ok(topics.includes('civilization.tech.research.complete'), '研究完成应写 event-log');
  assert.ok(topics.includes('civilization.tech.unlock'), '技术解锁应写 event-log');
});

test('phase3：技术失传检测接入每 tick（掌握者全亡时锁定）', async () => {
  loop.reset();
  const report = await loop.run({ phase3: true, ticks: 8, seed: 3, agentCount: 3, techLoss: true });

  assert.ok(report.phase3.summary.techsLost >= 1, '应有技术失传');
  const topics = eventTopics();
  assert.ok(topics.includes('civilization.tech.loss'), '技术失传应写 event-log');
  assert.ok(topics.includes('civilization.tech.lock'), '技术锁定应写 event-log');
});

test('phase3：文明崩溃 → 遗产归档 + 重启注入下一代', async () => {
  loop.reset();
  const report = await loop.run({ phase3: true, ticks: 5, seed: 3, agentCount: 3, collapseForce: true });

  assert.equal(report.phase3.summary.collapses, 1, '应发生一次崩溃');
  assert.equal(report.phase3.summary.restarts, 1, '应执行一次重启');

  const topics = eventTopics();
  assert.ok(topics.includes('civilization.collapse'), '崩溃应写 event-log');
  assert.ok(topics.includes('civilization.restart'), '重启应写 event-log');
  assert.ok(topics.includes('civilization.heritage.inherited'), '遗产继承应写 event-log');

  const heritage = civilization.restart.heritage();
  assert.equal(heritage.length, 1, '应有一条遗产继承记录');
  assert.equal(heritage[0].legacy.summary.withinRange, true, '遗产描述应在 200-500 字区间');
  assert.ok(
    heritage[0].legacy.summary.length >= 200 && heritage[0].legacy.summary.length <= 500,
    '遗产描述长度应落在 [200,500]',
  );
});
