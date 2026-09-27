import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loop } from '../src/runtime/index.js';
import * as observer from '../src/observer/index.js';
import * as civilization from '../src/civilization/index.js';

function eventTopics() {
  return observer.recorder.eventLog.list().map((n) => n.data.topic);
}

test('phase3：派系冲突/规范仪式/心理崩溃/技术研究被每 tick 驱动并写 observer', async () => {
  loop.reset();
  const report = await loop.run({ phase3: true, ticks: 10, seed: 7, agentCount: 3 });

  // 一次性初始化
  assert.equal(report.phase3.seed.factions, 2, '应初始化 2 个派系');
  assert.equal(report.phase3.seed.norms, 2, '应定义 2 条社会规范');
  assert.equal(report.phase3.seed.ritual, true, '应注册仪式');
  assert.equal(report.phase3.seed.trauma, true, '应播种创伤');
  assert.equal(report.phase3.seed.research, 'water_purification', '应启动净水研究');

  // 每 tick 累计摘要
  const s = report.phase3.summary;
  assert.ok(s.lawsEnacted >= 1, '法律应生效');
  assert.ok(s.conflictsResolved >= 1, '派系冲突应解决');
  assert.ok(s.ritualsHeld >= 1, '仪式应举行');
  assert.ok(s.normsViolated >= 1, '规范应被违反');
  assert.ok(s.memesMutated >= 1, '模因应发生变异');
  assert.ok(s.breakdowns >= 1, '应发生心理崩溃');
  assert.ok(s.copings >= 1, '应发生应对疗愈');
  assert.ok(s.researchesCompleted >= 1, '应完成技术研究');

  // observer 事件主题
  const topics = eventTopics();
  for (const t of [
    'politics.faction.formed', 'politics.leader.elected', 'politics.law.enacted', 'politics.law.enforced',
    'politics.conflict.started', 'politics.conflict.resolved',
    'culture.norm.violated', 'culture.ritual.held', 'culture.meme.spread', 'culture.meme.mutate',
    'psyche.breakdown',
    'civilization.tech.research.start', 'civilization.tech.research.complete', 'civilization.tech.unlock',
  ]) {
    assert.ok(topics.includes(t), '应写事件主题 ' + t);
  }

  // 三类日志持续写入
  assert.ok(report.chronicle.decision > 0, '决策日志应写入');
  assert.ok(report.chronicle.action > 0, '行为日志应写入');
  assert.ok(report.chronicle.event > 0, '事件日志应写入');
});

test('phase3：技术研究解锁与失传（掌握者全亡时锁定）', async () => {
  loop.reset();
  const report = await loop.run({ phase3: true, ticks: 8, seed: 3, agentCount: 3, techLoss: true });

  assert.ok(report.phase3.summary.researchesCompleted >= 1, '应有技术研究完成');
  assert.ok(report.phase3.summary.techsLost >= 1, '应有技术失传');

  const topics = eventTopics();
  assert.ok(topics.includes('civilization.tech.unlock'), '应写技术解锁');
  assert.ok(topics.includes('civilization.tech.loss'), '应写技术失传');
  assert.ok(topics.includes('civilization.tech.lock'), '应写技术锁定');
});

test('phase3：文明崩溃 → 生成 200-500 字遗产并归档 → 重启注入下一代', async () => {
  loop.reset();
  const report = await loop.run({ phase3: true, ticks: 5, seed: 3, agentCount: 3, collapseForce: true });

  assert.equal(report.phase3.summary.collapses, 1, '应发生一次崩溃');
  assert.equal(report.phase3.summary.restarts, 1, '应执行一次重启');

  const topics = eventTopics();
  assert.ok(topics.includes('civilization.collapse'), '崩溃应写事件');
  assert.ok(topics.includes('civilization.restart'), '重启应写事件');
  assert.ok(topics.includes('civilization.heritage.inherited'), '遗产继承应写事件');

  // 遗产归档：历史图谱已持久化
  const graphs = civilization.legacy.graph.query();
  assert.ok(graphs.length >= 1, '应归档至少一张历史图谱');
  assert.ok(graphs[0].counts.people >= 1, '图谱应含人物节点');
  assert.ok(graphs[0].counts.events >= 1, '图谱应含事件节点');

  // 遗产注入下一代：继承记录 + 200-500 字描述
  const heritage = civilization.restart.heritage();
  assert.equal(heritage.length, 1, '应有一条遗产继承记录');
  assert.ok(heritage[0].civilizationId.startsWith('civ_next_'), '遗产应注入下一代文明');
  const summary = heritage[0].legacy.summary;
  assert.equal(summary.withinRange, true, '遗产描述应在 200-500 字区间');
  assert.ok(summary.length >= 200 && summary.length <= 500, '遗产描述长度 [200,500]');
});

test('观察者：回放因果链 + 反事实比较（只读，不改世界状态）', async () => {
  loop.reset();
  const report = await loop.run({ phase3: true, ticks: 10, seed: 7, agentCount: 3 });

  // 回放：按 seed 生成确定性 run id，读取完整因果链
  const replay = observer.experiment.replay.run({ seed: 'p3-smoke', fromTick: 0 });
  assert.ok(replay.replayId.startsWith('replay:'), '回放应生成 run id');
  assert.ok(replay.counts.total > 0, '回放因果链非空');
  assert.ok(Array.isArray(replay.entries) && replay.entries.length > 0, '回放条目非空');

  // 反事实：以一条真实决策为锚点创建分支并比较。
  //
  // 锚点不能直接用「找到的第一条决策的 tick」——那是**最旧**的一条，属于历史。
  // 反事实只能从**提交边界之后**的第一 tick 分叉（存档采集于完整提交边界，
  // 该 tick 已走过并写进日志，无法再替换）。这个换算必须交给
  // anchorPivotFor()：它同时回答「锚点是否真实存在」与「哪个 tick 才可替换」。
  const cf = observer.experiment.counterfactual;
  const decisions = observer.recorder.decisionLog.list();
  const anchor = decisions.find((n) => n.data && n.data.agentId && Number.isInteger(n.data.tick));
  assert.ok(anchor, '应有真实决策可作锚点');
  // 用 decisionId 精确锚定：同一 (agentId, tick) 在日志里可能有多条
  // （实测 tick 1 有两条：obs.decision.11 与 obs.decision.19），
  // 按 (agentId, tick) 只能定位到「该 tick 的最后一条」，无法指定是哪一条。
  const pivot = cf.anchorPivotFor({ decisionId: anchor.id });
  assert.ok(Number.isInteger(pivot.pivotTick) && pivot.pivotTick > 0,
    '锚点换算必须给出可替换的 tick，实际 ' + JSON.stringify(pivot.pivotTick));
  assert.equal(pivot.originalDecisionId, anchor.id, '换算必须锚定到选中的那条决策');
  assert.equal(pivot.anchorTick, anchor.data.tick, '锚点 tick 应等于选中决策的 tick');
  assert.equal(pivot.pivotTick, pivot.splitTick + 1,
    '替换点必须是提交边界之后的第一个 tick（提交边界 ' + pivot.splitTick + '）');
  // 替换点与锚点是否同一条决策要**如实报告**，不能假装换掉了原来那条。
  assert.equal(typeof pivot.replaysOriginalDecision, 'boolean');
  assert.equal(pivot.replaysOriginalDecision, pivot.pivotTick === pivot.anchorTick,
    'replaysOriginalDecision 必须等于「替换点就是锚点本身」');

  // 锚点必须真实存在：凭空指定一条不存在的决策应被拒绝，而不是造出一个世界。
  assert.throws(
    () => cf.anchorPivotFor({ agentId: anchor.data.agentId, tick: 999999 }),
    /未找到/, '不存在的锚点必须被拒绝',
  );

  // 候选集与「当时候选」相关，重演会覆盖日志，故先把原决策取下来再比较。
  const originalDecision = anchor.data.decision;
  const cmp = await cf.compare({
    agentId: pivot.agentId,
    tick: pivot.pivotTick,
    alternative: { action: 'rest', confidence: 0.9 },
  });
  assert.ok(cmp.branchId.startsWith('cf:'), '应生成反事实分支 id');
  assert.equal(cmp.tick, pivot.pivotTick, '比较必须落在换算出的替换点上');
  assert.equal(typeof cmp.diverged, 'boolean', '应给出是否分歧');
  // 真实重演给出的是**事实**，不是哈希分数（t10 已删除 project() 伪因果）。
  assert.equal(cmp.originalScore, undefined, '不得再产出哈希投影分数');
  assert.equal(cmp.alternativeScore, undefined, '不得再产出哈希投影分数');
  assert.equal(cmp.interventionApplied, true, '干预必须真实改写了那一个决策');
  assert.equal(cmp.pivotDivergence.changed, true, '替换点上的行动必须确实被改掉');
  assert.equal(cmp.pivotDivergence.branchAction, 'rest', '分支世界的替换点行动应为备选行动');
  assert.equal(cmp.preIntervention.identical, true, '替换点之前两条世界必须逐条一致');
  assert.ok(cmp.consequence.actionsChanged.length > 0, '应能指出哪些行动的分布变了');
  assert.equal(cmp.isolation.originalIntact, true, '分析结束后原世界必须逐位复原');
  assert.ok(Array.isArray(cmp.pivot.baseline?.options ?? []), '应能取回替换点的候选集');
  assert.ok(originalDecision !== undefined, '原决策应当可读（重演前取下）');

  // 只读保证：回放/反事实不推进世界状态。
  // 反事实内部会真实重演世界，但**必须**在结束时恢复到调用前的提交边界——
  // 否则「分析」会悄悄改变被分析的世界。
  assert.equal(report.finalTick, 10, '回放不得推进世界 tick');
  assert.equal(loop.tickStatus().tick, 10, '反事实分析结束后世界 tick 必须复原');
  assert.equal(loop.tickStatus().committedTick, 10, '提交边界必须复原');
  assert.equal(loop.tickStatus().inFlight, false, '分析结束后不得有 tick 在跑');
});
