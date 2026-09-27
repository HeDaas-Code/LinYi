import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import * as graph from '../src/infra/store/graph.js';
import * as identity from '../src/infra/identity.js';
import * as observer from '../src/observer/index.js';

const { recorder, experiment } = observer;
const { replay, counterfactual, compare } = experiment;
const { decisionLog, actionLog, eventLog } = recorder;

function resetAll() {
  graph.__reset();
  identity.__reset();
  recorder.__reset();
}

function seedHistory() {
  decisionLog.record({ tick: 1, agentId: 'a', decision: { type: 'eat' }, options: [{ type: 'eat' }, { type: 'drink' }], reason: 'hungry' });
  actionLog.record({ tick: 1, agentId: 'a', action: { type: 'eat', target: 'food' }, outcome: { ok: true } });
  eventLog.record({ tick: 2, topic: 'weather.rain', payload: { level: 1 } });
  decisionLog.record({ tick: 3, agentId: 'b', decision: { type: 'drink' } });
  actionLog.record({ tick: 3, agentId: 'b', action: { type: 'drink', target: 'water' } });
  decisionLog.record({ tick: 5, agentId: 'a', decision: { type: 'sleep' }, options: [{ type: 'sleep' }, { type: 'eat' }], reason: 'tired' });
  actionLog.record({ tick: 6, agentId: 'a', action: { type: 'sleep', target: 'bed' } });
}

beforeEach(resetAll);

test('replay: run 按 seed 生成确定性 run id 并返回有序因果链', () => {
  seedHistory();
  const r1 = replay.run({ seed: 's1' });
  const r2 = replay.run({ seed: 's1' });
  const r3 = replay.run({ seed: 's2' });
  assert.equal(r1.replayId, r2.replayId);
  assert.notEqual(r1.replayId, r3.replayId);
  assert.match(r1.replayId, /^replay:[0-9a-f]{8}$/);
  assert.equal(r1.entries.length, 7);
  assert.deepEqual(r1.counts, { decision: 3, action: 3, event: 1, total: 7 });
  const ticks = r1.entries.map((e) => e.tick);
  assert.deepEqual(ticks, [1, 1, 2, 3, 3, 5, 6]);
});

test('replay: query 支持 agentId 与 tick 区间过滤（只读）', () => {
  seedHistory();
  const byAgent = replay.query({ agentId: 'a' });
  assert.equal(byAgent.entries.length, 4);
  assert.deepEqual(byAgent.counts, { decision: 2, action: 2, event: 0, total: 4 });

  const byRange = replay.query({ fromTick: 2, toTick: 5 });
  assert.equal(byRange.entries.length, 4); // tick 2,3,3,5

  const none = replay.query({ agentId: 'zzz' });
  assert.equal(none.entries.length, 0);
});

test('replay: 非法区间抛错', () => {
  assert.throws(() => replay.run({ fromTick: 5, toTick: 1 }), TypeError);
});

test('counterfactual: branch 锚定已记录决策并返回原/备选', () => {
  seedHistory();
  const b = counterfactual.branch({ agentId: 'a', tick: 5, alternative: { type: 'eat' } });
  assert.equal(b.branchId, 'cf:a:5');
  assert.deepEqual(b.original, { type: 'sleep' });
  assert.deepEqual(b.alternative, { type: 'eat' });
  assert.ok(b.sourceDecisionId);
});

test('counterfactual: 未记录决策时 branch 抛错', () => {
  seedHistory();
  assert.throws(() => counterfactual.branch({ agentId: 'a', tick: 99 }), Error);
});

test('counterfactual: 废止哈希投影——compare 不再产出伪因果分数', () => {
  // t10：旧 compare 用 hashHex(agentId:tick:choice) 生成 originalScore/alternativeScore，
  // 再以两者之差冒充"反事实因果效应"。那是**伪因果**：差值纯由字符串决定，
  // 与资源、需求、后续行为无关，世界根本没被模拟过。
  // 本用例把"不得回归"钉死：任何重新引入哈希分数的实现都会在这里失败。
  seedHistory();
  // 旧实现的伪因果入口必须彻底消失。
  assert.equal(counterfactual.project, undefined, '哈希投影 project() 必须被删除');
  assert.equal(counterfactual.compare.constructor.name, 'AsyncFunction',
    'compare 必须是 async——真实重演不可能同步算出结果');

  const b = counterfactual.branch({ agentId: 'a', tick: 5, alternative: { type: 'eat' } });
  assert.equal(b.branchId, 'cf:a:5');
  assert.deepEqual(b.original, { type: 'sleep' });
  assert.deepEqual(b.alternative, { type: 'eat' });
  assert.ok(b.sourceDecisionId);
  // 备选必须标明是否在当时候选集内：不可达的备选不构成反事实。
  assert.equal(b.alternativeAdmissible, true);
  assert.deepEqual(b.availableActions, ['sleep', 'eat']);
  // 不在候选集里的备选必须被判为不可达。
  assert.equal(
    counterfactual.branch({ agentId: 'a', tick: 5, alternative: { type: 'fly' } }).alternativeAdmissible,
    false,
  );
});

test('counterfactual: compare 拒绝在错误的 tick 上分叉（反事实只能从提交边界分叉）', async () => {
  seedHistory();
  // 替换点必须是"分叉后的第一 tick"。给历史 tick 时显式报错，
  // 而不是悄悄跑出一个起点并不自洽的世界。
  await assert.rejects(
    () => counterfactual.compare({ agentId: 'a', tick: 5, alternative: 'eat', ticks: 1 }),
    /必须等于分叉后的第一 tick/,
  );
});

test('counterfactual: pivotTickFor 给出可替换的 tick（分叉后的第一 tick）', () => {
  // 反事实只能替换**存档之后**的第一 tick：存档采集于完整提交边界，
  // 该 tick 已经走过并写进日志，属于历史。这个换算收在库内，避免调用方推错
  // （推错的表现是"干预静默不生效"，不崩不报错）。
  assert.equal(typeof counterfactual.pivotTickFor, 'function');
});

test('counterfactual: 世界指纹可用于证明原世界未被污染', () => {
  seedHistory();
  const f = counterfactual.worldFingerprint();
  for (const k of ['tick', 'agents', 'alive', 'rng', 'world']) {
    assert.ok(Object.prototype.hasOwnProperty.call(f, k), '指纹应包含 ' + k);
  }
});

test('compare: civilizations 按存活时长降序读取存档', () => {
  resetAll();
  graph.write({ id: 'civ:1', type: 'civilization.archive', data: { civilizationId: 'c1', survivedTicks: 50, collapseMode: 'famine', legacy: '仓储技术' } });
  graph.write({ id: 'civ:2', type: 'civilization.archive', data: { civilizationId: 'c2', survivedTicks: 120, collapseMode: 'war', legacy: '灌溉系统' } });
  graph.write({ id: 'civ:3', type: 'civilization.archive', data: { civilizationId: 'c3', survivedTicks: 80, collapseMode: 'famine', legacy: '' } });

  const civs = compare.civilizations();
  assert.equal(civs.length, 3);
  assert.deepEqual(civs.map((c) => c.civilizationId), ['c2', 'c3', 'c1']);
  assert.equal(civs[0].survivedTicks, 120);
});

test('compare: metrics 聚合存活/崩溃/遗产统计', () => {
  const records = [
    { civilizationId: 'c1', survivedTicks: 50, collapseMode: 'famine', legacy: 'A' },
    { civilizationId: 'c2', survivedTicks: 120, collapseMode: 'war', legacy: 'B' },
    { civilizationId: 'c3', survivedTicks: 80, collapseMode: 'famine', legacy: '' },
  ];
  const m = compare.metrics(records);
  assert.equal(m.count, 3);
  assert.equal(m.avgSurvival, (50 + 120 + 80) / 3);
  assert.equal(m.maxSurvival, 120);
  assert.deepEqual(m.collapseModes, { famine: 2, war: 1 });
  assert.equal(m.withLegacy, 2);
});

test('compare: metrics 空数组与非数组', () => {
  assert.deepEqual(compare.metrics([]), { count: 0, avgSurvival: 0, maxSurvival: 0, collapseModes: {}, withLegacy: 0 });
  assert.throws(() => compare.metrics('nope'), TypeError);
});

// ---- t24：反事实锚点必须经 pivotTickFor/提交边界换算，不得直接取最旧日志 ----

test('counterfactual: anchorPivotFor 把历史决策换算成提交边界之后的可替换 tick', () => {
  seedHistory();
  // 调用方手上通常只有一条历史决策（例如 decisionLog.list().find(...) 拿到的**最旧**那条）。
  // 直接把它丢给 compare() 会撞上提交边界契约；这里必须给出可替换的 tick。
  const anchor = decisionLog.list().find((n) => n.data && n.data.agentId && Number.isInteger(n.data.tick));
  const pivot = counterfactual.anchorPivotFor({ agentId: anchor.data.agentId, tick: anchor.data.tick });
  assert.equal(pivot.anchorTick, anchor.data.tick, '锚点 tick 应等于选中决策的 tick');
  assert.equal(pivot.agentId, anchor.data.agentId);
  assert.ok(Number.isInteger(pivot.pivotTick), '必须给出可替换的 tick');
  assert.equal(pivot.pivotTick, pivot.splitTick + 1,
    '替换点必须是提交边界之后的第一个 tick（存档采集于完整提交边界）');
  // 替换点与锚点是否同一条决策要**如实报告**：只有边界恰好落在锚点前一 tick 时才是重放。
  assert.equal(pivot.replaysOriginalDecision, pivot.pivotTick === pivot.anchorTick);
  assert.equal(typeof pivot.note, 'string');
});

test('counterfactual: anchorPivotFor 用存档里的提交边界，而不是当前时钟', () => {
  seedHistory();
  // 只读世界（无 loop.run）时时钟停在 0；若实现忽略存档参数、只看当前时钟，
  // 这里就会得到 1 而不是 43——「推错边界」在真实使用中表现为干预静默不生效。
  const snap = { sections: { clock: { tick: 42 } } };
  assert.equal(counterfactual.pivotTickFor(snap), 43, 'pivotTickFor 必须读存档里的提交边界');
  const pivot = counterfactual.anchorPivotFor({ agentId: 'a', tick: 5, restore: snap });
  assert.equal(pivot.splitTick, 42, 'splitTick 必须来自存档');
  assert.equal(pivot.pivotTick, 43);
  assert.equal(pivot.anchorTick, 5);
  assert.equal(pivot.replaysOriginalDecision, false,
    '锚点 5 与替换点 43 不是同一条决策，不得假装换掉了原来那条');
});

test('counterfactual: anchorPivotFor 拒绝不存在的锚点（不许凭空造一条决策）', () => {
  seedHistory();
  assert.throws(() => counterfactual.anchorPivotFor({ agentId: 'a', tick: 99 }), /未找到/);
  assert.throws(() => counterfactual.anchorPivotFor({ agentId: 'nobody', tick: 1 }), /未找到/);
  assert.throws(() => counterfactual.anchorPivotFor({ decisionId: 'obs.decision.999' }), /找不到/);
  assert.throws(() => counterfactual.anchorPivotFor({}), TypeError);
  // 存档缺少 clock.tick 时必须显式报错，而不是悄悄按当前时钟算出一个错的边界。
  assert.throws(() => counterfactual.pivotTickFor({ sections: {} }), /提交边界/);
});

test('counterfactual: anchorPivotFor 可用 decisionId 精确锚定（同 tick 多条决策）', () => {
  seedHistory();
  // 同一 (agentId, tick) 在真实运行中可能有多条决策（实测 tick 1 有两条）。
  // 按 (agentId, tick) 只能定位到「该 tick 的最后一条」，无法指定是哪一条；
  // decisionId 才能精确锚定，且必须回报的就是那一条。
  decisionLog.record({ tick: 1, agentId: 'a', decision: { type: 'rest' } });
  const all = decisionLog.list().filter((n) => n.data.agentId === 'a' && n.data.tick === 1);
  assert.equal(all.length, 2, '本用例需要同一 (agentId, tick) 上的两条决策');
  const first = counterfactual.anchorPivotFor({ decisionId: all[0].id });
  const second = counterfactual.anchorPivotFor({ decisionId: all[1].id });
  assert.equal(first.originalDecisionId, all[0].id, 'decisionId 必须精确锚定到指定那条');
  assert.equal(second.originalDecisionId, all[1].id);
  // 按 (agentId, tick) 只能定位到最后一条——这正是 smoke.p3 曾经踩到的坑。
  const byTick = counterfactual.anchorPivotFor({ agentId: 'a', tick: 1 });
  assert.equal(byTick.originalDecisionId, all[1].id, '按 (agentId, tick) 定位到该 tick 的最后一条');
});
