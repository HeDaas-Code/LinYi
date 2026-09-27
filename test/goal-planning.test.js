/**
 * t12 回归：短期目标与多步计划。
 *
 * 锁定以下契约：
 * 1. 目标 = 可判定的期望状态 + 有序步骤 + 时间预算；完成判据只看**世界真实状态**；
 * 2. 步骤前置条件来自动作契约（唯一事实来源），计划不自己另立一套判据；
 * 3. **依赖实际后果重规划**：制作消耗原料后 craft 变得不可行，计划退回采料，
 *    于是「采料→制作→出售」在真实后果驱动下自然震荡，而不是把每一步写死；
 * 4. 中断恢复：生存危机**挂起**而非丢弃，恢复后从原步骤继续，已完成部分不重做；
 * 5. 时间预算真的能终止计划；
 * 6. 目标只是**有界建议**：加分有上限、生存门优先、一次性机会窗口优先、
 *    日程不得静默替代最终选择。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loop, registry } from '../src/runtime/index.js';
import * as observer from '../src/observer/index.js';
import * as goals from '../src/agent/decision/goals.js';
import * as persistence from '../src/runtime/persistence.js';
import * as contract from '../src/agent/decision/action-contract.js';

const { decisionLog, actionLog, eventLog } = observer.recorder;

const CFG = { goalPlanningEnabled: true, goalWeight: 0.35, goalMaxAttempts: 3, goalCooldownTicks: 5, crisisNeedLevel: 0.8 };

/** 一个「手里有 2 份原料、没有成品、有账户」的居民状态：足以开始采料→制作→出售。 */
function state(over = {}) {
  const wood = over.wood ?? 0;
  const surplus = over.surplus ?? 0;
  return {
    hasAccount: true,
    hasItemCatalog: true,
    pendingCraft: false, pendingBuild: false, pendingWrite: false,
    paired: false, eligibleMate: true, hasPendingCourt: false,
    hasPeer: true, employed: false, businessActive: false,
    canFound: false, marketRoom: true, supplyPoolCoversSurplus: true,
    needs: { food: 0.1, water: 0.1 },
    ...over,
    wood,
    surplus,
    hasWorkbenchMaterial: wood >= 2,
    hasBuildingMaterial: wood >= 3,
    hasSurplus: surplus > 2,
  };
}

// ---- 1. 目标模板的结构契约 ----

test('templates: 每个目标都声明可判定前置条件、有序步骤与时间预算', () => {
  const all = goals.templates();
  const ids = Object.keys(all);
  assert.ok(ids.length >= 3, '应至少提供三个目标模板，实际 ' + ids.length);
  for (const id of ids) {
    const t = all[id];
    assert.equal(t.id, id);
    assert.equal(typeof t.goal, 'string');
    assert.ok(t.goal.length > 0);
    assert.equal(typeof t.timeBudget, 'number');
    assert.ok(t.timeBudget > 0, id + ' 必须有正的时间预算');
    assert.equal(typeof t.available, 'function', id + ' 必须有目标级前置条件');
    assert.ok(Array.isArray(t.steps) && t.steps.length >= 1, id + ' 必须有步骤');
    for (const s of t.steps) {
      assert.equal(typeof s.action, 'string');
      assert.equal(typeof s.doneWhen, 'function', id + '.' + s.action + ' 必须有完成判据');
      // 步骤动作必须在动作契约里（否则前置条件无从判定）。
      assert.equal(contract.contractOf(s.action).known, true, id + ' 的步骤 ' + s.action + ' 不在动作契约中');
    }
  }
  // 旗舰目标必须是跨 tick 的三步链。
  const flagship = all.craft_and_sell;
  assert.deepEqual(flagship.steps.map((s) => s.action), ['forage', 'craft', 'trade']);
});

test('templates: 完成判据只看世界真实状态，不看命令是否发出', () => {
  const t = goals.templates().craft_and_sell;
  const [forage, craft, trade] = t.steps;
  assert.equal(forage.doneWhen(state({ wood: 1 })), false);
  assert.equal(forage.doneWhen(state({ wood: 2 })), true, '原料到手才算完成');
  assert.equal(craft.doneWhen(state({ surplus: 2 })), false);
  assert.equal(craft.doneWhen(state({ surplus: 3 })), true, '成品攒够才算完成');
  assert.equal(trade.doneWhen(state({ surplus: 3 })), false);
  assert.equal(trade.doneWhen(state({ surplus: 0 })), true, '卖掉才算完成');
});

// ---- 2. 多步推进 ----

test('plan: 已完成的步骤被跳过，不做无用功', () => {
  goals.__reset();
  // 原料已备齐 → 采料步骤应被跳过，直接建议制作。
  const r = goals.plan('a1', 0, state({ wood: 5 }), CFG, contract);
  assert.ok(r.suggestion, '应给出建议');
  assert.equal(r.suggestion.action, 'craft', '原料已够时不应再建议采料');
  assert.equal(r.suggestion.stepIndex, 1);
  goals.__reset();
});

test('plan: 整条链已满足时直接结项，不产生空转建议', () => {
  goals.__reset();
  // 原料够（跳过采料）+ 成品够（跳过制作）→ 只剩出售。
  const r = goals.plan('a2', 0, state({ wood: 4, surplus: 4 }), CFG, contract);
  assert.ok(r.suggestion);
  assert.equal(r.suggestion.action, 'trade');
  goals.__reset();
});

test('observe: 最后一步在真实状态上达成即结项，不留越界计划', () => {
  goals.__reset();
  // 直接进入出售步骤。
  let r = goals.plan('a3', 0, state({ wood: 4, surplus: 4 }), CFG, contract);
  assert.equal(r.suggestion.action, 'trade');
  // 执行后余货清零 → 出售步骤的完成判据成立 → 目标达成并结项。
  const after = goals.observe('a3', 1, { status: 'applied', action: 'trade' }, state({ wood: 4, surplus: 0 }), CFG);
  const types = after.transitions.map((x) => x.type);
  assert.ok(types.includes('achieved'), '应记录达成，实际 ' + JSON.stringify(types));
  assert.equal(goals.active('a3'), null, '达成后不应残留计划');
  // 关键回归：结项后再次 observe 不得抛错（曾因 stepIndex 越界而 TypeError）。
  const again = goals.observe('a3', 2, { status: 'applied', action: 'trade' }, state({ wood: 4, surplus: 0 }), CFG);
  assert.equal(again.plan, null);
  goals.__reset();
});

// ---- 3. 依赖实际后果重规划（本任务的核心） ----

test('replan: 制作消耗原料后 craft 不可行，计划**退回采料**（后果驱动，而非写死序列）', () => {
  goals.__reset();
  // tick0：原料已备齐 → 建议制作。
  let r = goals.plan('b1', 0, state({ wood: 2, surplus: 0 }), CFG, contract);
  assert.equal(r.suggestion.action, 'craft');

  // 制作**真的消耗了原料**：wood 2→0，产出一件成品。
  const afterCraft = state({ wood: 0, surplus: 1 });
  // 制作任务已发起（跨 tick 才完成）→ 此时必须**等待**，不得重发（会撞 already_crafting）。
  const beforeWait = goals.summary().waiting;
  goals.observe('b1', 1, { status: 'started', action: 'craft' }, afterCraft, CFG);
  assert.ok(goals.summary().waiting > beforeWait, '任务在飞时应计为等待（例行转移只计数不产事件）');

  // tick2：任务已落地、原料见底 → craft 前置条件不满足 → **退回采料**。
  const r2 = goals.plan('b1', 2, afterCraft, CFG, contract);
  assert.ok(r2.suggestion, '应重新给出建议');
  assert.equal(r2.suggestion.action, 'forage', '原料耗尽后应退回采料，而不是硬发必然被拒的 craft');
  assert.equal(r2.suggestion.stepIndex, 0);
  assert.ok(r2.transitions.some((x) => x.type === 'replanned'), '应记录重规划，实际 ' + JSON.stringify(r2.transitions.map((x) => x.type)));

  // 采料补回原料后，又回到制作 —— 序列由**后果**驱动自然震荡。
  const r3 = goals.plan('b1', 3, state({ wood: 2, surplus: 1 }), CFG, contract);
  assert.equal(r3.suggestion.action, 'craft', '原料补回后应回到制作');
  goals.__reset();
});

test('replan: 计划等待在飞的制作任务，不重发也不误退回', () => {
  goals.__reset();
  goals.plan('b2', 0, state({ wood: 2 }), CFG, contract);
  // 制作任务在飞（pendingCraft=true）且原料已被消耗。
  const inFlight = state({ wood: 0, surplus: 0, pendingCraft: true });
  const beforeWait = goals.summary().waiting;
  const r = goals.plan('b2', 1, inFlight, CFG, contract);
  assert.equal(r.suggestion, null, '任务在飞时不应给出任何建议（等待）');
  assert.ok(goals.summary().waiting > beforeWait, '应计为等待，而不是 blocked 或 replanned');
  assert.equal(goals.summary().blocked, 0, '在飞的任务不得被误记为 blocked');
  goals.__reset();
});

// ---- 4. 时间预算与放弃 ----

test('budget: 时间预算用完则放弃目标（预算不是装饰）', () => {
  goals.__reset();
  const r0 = goals.plan('c1', 0, state({ wood: 0 }), CFG, contract);
  assert.ok(r0.plan, '应开始一个目标');
  const budget = r0.plan.timeBudget;
  // 超过预算一个 tick → 应放弃并进入冷却。
  const r1 = goals.plan('c1', budget + 1, state({ wood: 0 }), CFG, contract);
  assert.ok(r1.transitions.some((x) => x.type === 'expired'), '应记录超时');
  assert.equal(goals.active('c1')?.goalId ?? null, r1.plan?.goalId ?? null);
  const s = goals.summary();
  assert.ok(s.expired >= 1);
  goals.__reset();
});

test('budget: 连续失败超过上限则放弃，并在冷却期内不重选同一目标', () => {
  goals.__reset();
  goals.plan('c2', 0, state({ wood: 0 }), CFG, contract);
  // 反复失败（noop）直到超过 goalMaxAttempts。
  let last = null;
  for (let i = 1; i <= CFG.goalMaxAttempts + 1; i += 1) {
    last = goals.observe('c2', i, { status: 'noop', reason: 'forage_pool_empty', action: 'forage' }, state({ wood: 0 }), CFG);
  }
  assert.ok(last.transitions.some((x) => x.type === 'abandoned'), '应放弃目标，实际 ' + JSON.stringify(last.transitions.map((x) => x.type)));
  assert.equal(goals.active('c2'), null);
  assert.ok(goals.summary().abandoned >= 1);
  goals.__reset();
});

// ---- 5. 中断恢复 ----

test('interrupt: 生存危机挂起目标，恢复后从原步骤继续（已完成部分不重做）', () => {
  goals.__reset();
  // 推进到「制作」步骤。
  let r = goals.plan('d1', 0, state({ wood: 5 }), CFG, contract);
  assert.equal(r.suggestion.action, 'craft');
  assert.equal(r.suggestion.stepIndex, 1);

  // 生存危机：食物达到危机阈值 → 目标被**挂起**（不是丢弃）。
  const crisis = state({ wood: 5, needs: { food: 0.95, water: 0.1 } });
  const r2 = goals.plan('d1', 1, crisis, CFG, contract);
  assert.equal(r2.suggestion, null, '危机期间目标不参与打分，居民先活下来');
  assert.ok(r2.transitions.some((x) => x.type === 'suspended'), '应记录挂起');
  const suspended = goals.active('d1');
  assert.equal(suspended.status, 'suspended');
  assert.equal(suspended.stepIndex, 1, '挂起不得丢失已完成进度');

  // 危机解除 → 恢复，且**仍在第 1 步**（采料已完成，不重做）。
  const r3 = goals.plan('d1', 2, state({ wood: 5, needs: { food: 0.2, water: 0.2 } }), CFG, contract);
  assert.ok(r3.transitions.some((x) => x.type === 'resumed'), '应记录恢复');
  assert.equal(r3.suggestion.action, 'craft', '恢复后应从原步骤继续');
  assert.equal(r3.suggestion.stepIndex, 1, '不得退回第 0 步重做采料');
  assert.ok(goals.summary().suspended >= 1 && goals.summary().resumed >= 1);
  goals.__reset();
});

// ---- 6. 目标只是有界建议 ----

test('bounded: 计划加分有上限，且远小于生存门的压制量', () => {
  goals.__reset();
  const r = goals.plan('e1', 0, state({ wood: 0 }), CFG, contract);
  assert.ok(r.suggestion);
  assert.equal(r.suggestion.weight, CFG.goalWeight);
  // 生存门在 loop 里对非生存行动扣 5 分；计划加分必须远小于它，
  // 否则"计划"会变成"命令"，把饥饿的居民留在工作台前。
  assert.ok(r.suggestion.weight < 1, '计划加分必须是有界的小量');
  assert.ok(r.suggestion.weight * 10 < 5, '计划加分不得逼近生存门量级');
  goals.__reset();
});

test('bounded: 一次性机会窗口优先于计划（计划可以等，机会不能）', () => {
  goals.__reset();
  const r0 = goals.plan('e2', 0, state({ wood: 5 }), CFG, contract);
  assert.equal(r0.suggestion.action, 'craft');
  // 有人正在等我答复：计划必须让位，否则表白窗口过期，链路永远无法闭环。
  const r1 = goals.plan('e2', 1, state({ wood: 5, hasPendingCourt: true }), CFG, contract);
  assert.equal(r1.suggestion, null, '机会窗口期间不得用计划加分去竞争');
  assert.ok(r1.transitions.some((x) => x.type === 'yielded'), '应记录让位');
  // 窗口过后计划照常恢复，且进度不丢。
  const r2 = goals.plan('e2', 2, state({ wood: 5 }), CFG, contract);
  assert.equal(r2.suggestion.action, 'craft');
  assert.equal(r2.suggestion.stepIndex, 1);
  goals.__reset();
});

test('bounded: 居民做了计划外的事只记偏离，不惩罚也不推进', () => {
  goals.__reset();
  goals.plan('e3', 0, state({ wood: 0 }), CFG, contract);
  const before = goals.summary().diverged;
  goals.observe('e3', 1, { status: 'applied', action: 'socialize' }, state({ wood: 0 }), CFG);
  assert.ok(goals.summary().diverged > before, '应记录偏离');
  assert.equal(goals.active('e3').stepIndex, 0, '偏离不得推进计划（居民的选择权优先）');
  // 偏离是常态：只计数，不逐条写事件（否则会淹没事件日志）。
  assert.ok(goals.summary().diverged >= 1);
  goals.__reset();
});

test('reset: 复位清空计划、冷却与统计', () => {
  goals.plan('f1', 0, state({ wood: 0 }), CFG, contract);
  assert.ok(goals.summary().started >= 1);
  goals.__reset();
  const s = goals.summary();
  assert.equal(s.active, 0);
  assert.equal(s.started, 0);
  assert.equal(goals.active('f1'), null);
});

// ---- 7. 主循环端到端 ----

test('loop: 目标事件进入观察者日志，且计划状态可在决策上下文中追溯', async () => {
  loop.reset();
  await loop.run({ phase2: true, ticks: 40, seed: 7, agentCount: 20, scheduleEnabled: false });
  const topics = eventLog.list().map((n) => n.data.topic);
  for (const t of ['agent.goal.started', 'agent.goal.advanced']) {
    assert.ok(topics.includes(t), '应写目标事件：' + t);
  }
  const ds = decisionLog.list().map((n) => n.data);
  // 决策上下文必须能回答"居民为什么做这件事"——追溯到目标而不只是追溯到一次打分。
  assert.ok(ds.some((d) => d.context?.goal?.stepAction), '决策上下文应携带计划建议');
  const withGoal = ds.filter((d) => d.context?.goal?.stepAction);
  for (const d of withGoal) {
    assert.equal(typeof d.context.goal.goalId, 'string');
    assert.equal(typeof d.context.goal.aligned, 'boolean', '必须记录居民是否按计划执行');
  }
});

test('loop: 计划不剥夺居民选择权——偏离被记录而不是被静默改写', async () => {
  loop.reset();
  await loop.run({ phase2: true, ticks: 40, seed: 7, agentCount: 20, scheduleEnabled: false });
  // 偏离是常态（居民有自己的需求与人格），关键是它**可见**。
  // 可见性由 summary 计数器 + 每条决策的 goal.aligned 标记提供，
  // 而不是逐条事件（40 人 × 60 tick 实测偏离 2225 次，逐条写会淹没日志）。
  const s = goals.summary();
  assert.ok(s.diverged > 0, '居民做计划外的事必须留下可审计计数');
  assert.ok(s.started > 0, '计划应被真实启动过');
  const ds = decisionLog.list().map((n) => n.data);
  // 未被日程/模型覆盖的决策，其最终动作就是居民自选。
  // 注意：decision-log 把最终动作存在 decision 字段（不是 action）。
  const selfChosen = ds.filter((d) => d.final?.source === 'rule');
  assert.ok(selfChosen.length > 0, '应存在居民自选的决策');
  for (const d of selfChosen) {
    assert.equal(d.final.action, d.decision,
      'final.source=rule 时最终动作必须就是居民自选的那个');
    // 未被覆盖的决策，其分数不得被清空（清空只应发生在真的被覆盖时）。
    assert.equal(typeof d.final.score, 'number');
  }
});

test('loop: 关闭目标规划后行为分布改变，且存活不退化', async () => {
  const aliveOf = (rep) => {
    const wa = rep.world?.agents ?? {};
    return Object.values(wa).filter((x) => x.alive !== false).length;
  };
  const distOf = () => {
    const d = {};
    for (const a of actionLog.list().map((n) => n.data)) d[a.action] = (d[a.action] ?? 0) + 1;
    return d;
  };
  loop.reset();
  const on = await loop.run({ phase2: true, ticks: 40, seed: 7, agentCount: 20, scheduleEnabled: false });
  const distOn = distOf();
  loop.reset();
  const off = await loop.run({ phase2: true, ticks: 40, seed: 7, agentCount: 20, scheduleEnabled: false, goalPlanningEnabled: false });
  const distOff = distOf();

  // 目标规划必须**真的在起作用**（否则就是装饰）。
  let diff = 0;
  for (const k of new Set([...Object.keys(distOn), ...Object.keys(distOff)])) {
    if ((distOn[k] ?? 0) !== (distOff[k] ?? 0)) diff += 1;
  }
  assert.ok(diff > 0, '开启目标规划后行为分布应改变');
  // 但绝不能以生存为代价：目标是有界倾向，不是生存策略的替代品。
  assert.ok(aliveOf(on) >= aliveOf(off) - 2,
    '目标规划不得以生存为代价：开启=' + aliveOf(on) + ' 关闭=' + aliveOf(off));
  assert.ok(aliveOf(on) > 0);
});

// ---- t22：目标引擎状态入档与跨进程恢复 ----

/*
 * t22：plans / cooldown / stats 必须随存档往返（不只是同进程内可见）。
 *
 * 缺口曾经存在：这三个是模块级 Map/对象，只活在内存里。不入档时续跑会表现为
 *   - 在办计划凭空消失 → 居民从第 0 步重做已完成的部分；
 *   - 冷却窗口消失 → 刚放弃的目标被立刻重选，「不反复拾起做不成的目标」失效；
 *   - 统计归零 → 达成/重规划次数与连续运行不可比。
 * 这类缺陷不崩不报错，只让恢复后的轨迹悄悄变成另一条。
 */
test('t22 目标状态：snapshot/restore 往返后计划、冷却与统计逐位一致', async () => {
  loop.reset();
  await loop.run({ ticks: 40, seed: 7, agentCount: 12 });

  const before = goals.__snapshot();
  assert.ok(before.plans.length > 0, '前置条件：本局应产生在办计划，实际 ' + before.plans.length);
  assert.ok(before.cooldown.length > 0, '前置条件：本局应产生放弃冷却');
  assert.ok(before.stats.started > 0, '前置条件：本局应有目标启动');

  const snap = persistence.saveRun({ meta: { test: 't22' } });
  assert.ok(snap.meta.capturedSections.includes('goals'),
    'goals 必须被采集进存档；实际采集了 ' + JSON.stringify(snap.meta.capturedSections));

  // 先彻底清空，确保恢复的是真状态，而不是本来就还在。
  goals.__reset();
  assert.equal(goals.__snapshot().plans.length, 0);

  persistence.restoreRun(snap);
  loop.markRestored();
  const after = goals.__snapshot();

  assert.deepEqual(after.stats, before.stats, '统计必须逐字段复原');
  assert.deepEqual(after.plans, before.plans, '在办计划必须逐字段复原（含 stepIndex/deadline/attempts）');
  assert.deepEqual(after.cooldown, before.cooldown, '放弃冷却必须复原（含 until/goalId）');

  assert.ok(persistence.inventory().some((i) => i.name === 'goals'),
    'goals 应出现在持久化状态清单中');
});

test('t22 目标状态：恢复后继续推进，计划不从头重来', async () => {
  loop.reset();
  await loop.run({ ticks: 40, seed: 7, agentCount: 12 });
  const snap = persistence.saveRun({ meta: { test: 't22-resume' } });
  const before = goals.__snapshot();

  // 前置条件不能假定"某一步一定推进过"：实测本配置（40 tick / 12 人 / seed 7）下
  // 所有在办计划都停在 gather_material 的第 0 步（材料还没攒够，craft 尚未可行），
  // 因此断言 stepIndex>0 会误报。真正要证明的是"状态被完整带过去了"，
  // 用**计划本身存在**作为前置条件，用**逐字段一致**作为断言。
  assert.ok(before.plans.length > 0, '前置条件：本局应有在办计划，实际 ' + before.plans.length);

  persistence.restoreRun(snap);
  loop.markRestored();
  await loop.resume({ ticks: 5, seed: 7 });
  const after = goals.__snapshot();

  // 统计只增不减：恢复后继续跑，绝不因"忘了恢复"而回到低计数。
  assert.ok(after.stats.started >= before.stats.started,
    '启动计数不得因恢复而回退：' + after.stats.started + ' < ' + before.stats.started);
  const closedBefore = before.stats.abandoned + before.stats.achieved + before.stats.expired;
  const closedAfter = after.stats.abandoned + after.stats.achieved + after.stats.expired;
  assert.ok(closedAfter >= closedBefore, '目标结项计数不得因恢复而回退');

  // 恢复出来的计划必须**原样**留在表里（而不是被当作损坏数据丢弃），
  // 且进度绝不倒退——"从头重来"正是本用例要排除的失败模式。
  const beforeById = new Map(before.plans.map((q) => [q.agentId, q.plan]));
  let matched = 0;
  for (const q of after.plans) {
    const b = beforeById.get(q.agentId);
    if (b === undefined) continue;
    // 计划可能在本段内被推进或结项，故不要求全等；但不允许倒退。
    assert.ok(q.plan.stepIndex >= b.stepIndex,
      '计划进度不得因恢复而倒退：' + q.agentId + ' ' + q.plan.stepIndex + ' < ' + b.stepIndex);
    assert.ok(q.plan.attempts >= b.attempts, '尝试计数不得因恢复而倒退：' + q.agentId);
    matched += 1;
  }
  assert.ok(matched > 0 || after.stats.achieved > 0,
    '恢复出的计划应能被继续推进或被正常结项');
});

test('t22 目标状态：残缺的入档数据被丢弃，而不是让决策读到 undefined', () => {
  goals.__reset();
  goals.__restore({
    plans: [
      { agentId: 'ok', plan: { goalId: 'g', steps: [{ action: 'craft' }], stepIndex: 2, attempts: 1, status: 'active' } },
      { agentId: 'no-steps', plan: { goalId: 'g', steps: [] } },
      { agentId: 'no-goal', plan: { steps: [{ action: 'craft' }] } },
      null,
    ],
    cooldown: [{ agentId: 'a', until: 9, goalId: 'g' }, { goalId: 'x' }],
    stats: { started: 3, achieved: -5 },
  });
  const s = goals.__snapshot();
  assert.equal(s.plans.length, 1, '只有结构完整的计划应收下');
  assert.equal(s.plans[0].plan.stepIndex, 2);
  assert.equal(s.cooldown.length, 1, '缺 agentId 的冷却记录应被丢弃');
  assert.equal(s.stats.started, 3);
  assert.equal(s.stats.achieved, 0, '负数统计应被夹到 0，而不是把累计量拉负');
  goals.__reset();
});