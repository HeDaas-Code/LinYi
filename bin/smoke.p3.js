#!/usr/bin/env node
/**
 * truman-town 第三阶段冒烟报告（t24）：用 N 名居民跑 M 个 tick 的 phase3 场景，
 * 输出派系/文化/心理/科技/遗产子系统摘要、日志计数、事件主题，并用观察者
 * 回放 + 反事实做只读验证。
 *
 *   node bin/smoke.p3.js --ticks 10 --agents 3 --seed 7
 */

import { loop, registry } from '../src/runtime/index.js';
import * as observer from '../src/observer/index.js';
import * as civilization from '../src/civilization/index.js';

function arg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) {
    const v = process.argv[idx + 1];
    const n = Number(v);
    return Number.isFinite(n) ? n : v;
  }
  return fallback;
}

const ticks = Math.max(1, Math.floor(arg('--ticks', 10)));
const agentCount = Math.max(2, Math.floor(arg('--agents', 3)));
const seed = arg('--seed', 7);

// 1) 主场景：派系/文化/心理/科技
const report = await loop.run({ phase3: true, ticks, seed, agentCount });
const agents = registry.lookup({ type: 'agent' });
const topics = [...new Set(observer.recorder.eventLog.list().map((n) => n.data.topic))];

console.log('==== truman-town 第三阶段冒烟报告 ====');
console.log('tick 数: ' + report.finalTick + ' / 居民: ' + agents.length + ' / 种子: ' + seed);
console.log('');

console.log('--- 第三阶段种子 ---');
const sd = report.phase3.seed;
console.log('  派系=' + sd.factions + ' 法律=' + sd.law + ' 规范=' + sd.norms + ' 仪式=' + sd.ritual + ' 模因=' + sd.meme + ' 创伤=' + sd.trauma + ' 研究=' + sd.research);
console.log('');

console.log('--- 第三阶段摘要（每 tick 驱动） ---');
const s = report.phase3.summary;
console.log('  法律生效=' + s.lawsEnacted + ' 冲突解决=' + s.conflictsResolved);
console.log('  仪式举行=' + s.ritualsHeld + ' 规范违规=' + s.normsViolated + ' 模因变异=' + s.memesMutated);
console.log('  心理崩溃=' + s.breakdowns + ' 心理恢复=' + s.recoveries + ' 应对疗愈=' + s.copings);
console.log('  研究启动=' + s.researchesStarted + ' 研究完成=' + s.researchesCompleted + ' 技术失传=' + s.techsLost);
console.log('  文明崩溃=' + s.collapses + ' 文明重启=' + s.restarts);
console.log('');

console.log('--- 日志计数（决策/行为/事件） ---');
console.log('  decision=' + report.chronicle.decision + ' action=' + report.chronicle.action + ' event=' + report.chronicle.event + ' total=' + report.chronicle.total);
console.log('  事件主题: ' + topics.join('、'));
console.log('');

// 2) 观察者回放 + 反事实（只读）
const replay = observer.experiment.replay.run({ seed: 'p3-report', fromTick: 0 });
console.log('--- 观察者回放 ---');
console.log('  replayId=' + replay.replayId + ' 区间=[' + replay.fromTick + ',' + replay.toTick + '] 条目=' + replay.entries.length + ' 计数=' + JSON.stringify(replay.counts));

const decisions = observer.recorder.decisionLog.list();
const anchor = decisions.find((n) => n.data && n.data.agentId && Number.isInteger(n.data.tick));
if (anchor) {
  const pivot = observer.experiment.counterfactual.anchorPivotFor({ decisionId: anchor.id });
  const cmp = await observer.experiment.counterfactual.compare({
    agentId: pivot.agentId,
    tick: pivot.pivotTick,
    alternative: { action: 'rest', confidence: 0.9 },
  });
  console.log('--- 观察者反事实 ---');
  console.log('  ' + cmp.branchId + ' tick=' + cmp.tick + ' 原决策=' + JSON.stringify(cmp.original) + ' 备选=' + JSON.stringify(cmp.alternative));
  console.log('  替换行动=' + cmp.pivotDivergence.branchAction + ' 分歧=' + cmp.diverged
    + ' 首个下游分歧=' + JSON.stringify(cmp.firstDivergence)
    + ' 行动分布变化=' + cmp.consequence.actionsChanged.join('、'));
}
console.log('');

// 3) 文明崩溃 → 遗产归档 + 重启注入下一代
const collapse = await loop.run({ phase3: true, ticks: 5, seed: 3, agentCount: 3, collapseForce: true });
console.log('--- 文明崩溃与遗产（200-500 字） ---');
console.log('  崩溃=' + collapse.phase3.summary.collapses + ' 重启=' + collapse.phase3.summary.restarts);
const graphs = civilization.legacy.graph.query();
console.log('  归档图谱=' + graphs.length + ' 张（节点=' + graphs[0].counts.people + ' 人 / ' + graphs[0].counts.events + ' 事件 / ' + graphs[0].counts.deeds + ' 成就）');
for (const h of civilization.restart.heritage()) {
  const sum = h.legacy.summary;
  console.log('  遗产注入 -> ' + h.civilizationId + ' 字数=' + sum.length + ' withinRange=' + sum.withinRange + ' model=' + sum.model);
  console.log('  描述开头: ' + sum.text.slice(0, 80) + ' ...');
}
console.log('');

// 4) 技术失传
const loss = await loop.run({ phase3: true, ticks: 8, seed: 3, agentCount: 3, techLoss: true });
console.log('--- 技术研究解锁与失传 ---');
console.log('  研究完成=' + loss.phase3.summary.researchesCompleted + ' 技术失传=' + loss.phase3.summary.techsLost);
console.log('');
console.log('==== 完成 ====');
