/**
 * t11 回归：统一候选、预想、调度与执行的动作契约。
 *
 * 锁定以下契约：
 * 1. 契约覆盖**全部现有动作**的前置条件/目标/成本/时长/争用/风险/成败结果；
 * 2. 候选准入 = 执行器前置条件（同一判据），不再出现"选了必然被拒"的空转；
 * 3. 未建模动作显式 unknown，不可数值化预想的动作显式 unknown，
 *    两者都**不得**回落为"零风险零收益"；
 * 4. 共享池争用被声明并被记账，预想不再重复预支同一份公共资源；
 * 5. trade 是**单向卖出**，其失败原因与执行器逐字一致；
 * 6. 日程建议的行动必须真实可行，不可行时显式标注而不是静默命令。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loop, registry } from '../src/runtime/index.js';
import * as stage2 from '../src/runtime/orchestrator/_stage2.js';
import * as observer from '../src/observer/index.js';
import * as contract from '../src/agent/decision/action-contract.js';
import * as candidates from '../src/agent/decision/candidates.js';
import * as contention from '../src/agent/decision/contention.js';
import * as simulator from '../src/agent/anticipation/simulator.js';

const { decisionLog, actionLog } = observer.recorder;

/** 执行器的行动分支（与 _stage2.performAgentAction 的 case 一一对应）。 */
const EXECUTOR_ACTIONS = [
  'craft', 'build', 'write', 'work', 'trade', 'socialize', 'court', 'accept', 'found', 'expedition',
];

function freshAgent(extra = {}) {
  loop.reset();
  loop.spawnAgent({ name: 'A', food: 1.0, water: 1.0, ...extra });
  return registry.lookup({ type: 'agent' })[0].id;
}

// ---- 1. 契约完整性 ----

test('contract: 覆盖全部现有动作，且每条契约字段齐备', () => {
  const known = new Set(contract.knownActions());
  // 候选空间里的每个动作都必须有契约（否则会出现"候选存在但契约未知"）。
  for (const action of candidates.actions()) {
    assert.ok(known.has(action), '候选动作缺少契约：' + action);
  }
  // 执行器的每个分支都必须有契约（否则会出现"能执行但不可预想"）。
  for (const action of EXECUTOR_ACTIONS) {
    assert.ok(known.has(action), '执行器动作缺少契约：' + action);
  }
  // 字段齐备性：目标/成本/时长/风险/成败/前置条件/争用都必须声明。
  for (const action of contract.knownActions()) {
    const c = contract.contractOf(action);
    assert.equal(c.known, true);
    assert.equal(typeof c.goal, 'string', action + ' 缺少 goal');
    assert.ok(c.goal !== 'unknown', action + ' 的 goal 不得为 unknown');
    assert.ok(Array.isArray(c.requires), action + ' 缺少 requires');
    assert.ok(Array.isArray(c.mayFail), action + ' 缺少 mayFail');
    assert.ok(c.consumes !== null && typeof c.consumes === 'object', action + ' 缺少 consumes');
    assert.ok(c.produces !== null && typeof c.produces === 'object', action + ' 缺少 produces');
    assert.ok(c.needsDelta !== null && typeof c.needsDelta === 'object', action + ' 缺少 needsDelta');
    assert.equal(typeof c.risk, 'number', action + ' 缺少 risk');
    assert.equal(typeof c.durationTicks, 'number', action + ' 缺少 durationTicks');
    assert.equal(typeof c.completes, 'boolean', action + ' 缺少 completes');
    assert.ok(c.contention !== null && typeof c.contention.mode === 'string', action + ' 缺少 contention');
    assert.ok(typeof c.success === 'string' && c.success !== '', action + ' 缺少 success');
    // 前置条件的 reason 必须存在（用于与执行器对账）。
    for (const r of c.requires) {
      assert.ok(typeof r.reason === 'string' && r.reason !== '', action + ' 的前置条件缺少 reason');
      assert.equal(typeof r.test, 'function', action + ' 的前置条件缺少 test');
    }
  }
});

test('contract: 未建模动作显式未知，不得回落为零风险零收益', () => {
  const c = contract.contractOf('teleport');
  assert.equal(c.known, false);
  assert.equal(c.risk, null, '未建模动作的 risk 必须是 null 而不是 0');
  assert.equal(c.needsDelta, null);
  assert.equal(c.durationTicks, null);
  assert.equal(contract.predictedRisk('teleport'), null);
  assert.equal(contract.predictedNeedsDelta('teleport'), null);
  // 前置条件无法判定 → 显式不可行，不得默认为可行。
  const pre = contract.preconditionOf('teleport', {});
  assert.equal(pre.ok, false);
  assert.equal(pre.reason, 'not_in_contract');
  // 预想同样必须显式未知。
  const sim = simulator.simulate({ id: 'x:teleport', action: 'teleport' }, { needs: { food: 1 } });
  assert.equal(sim.known, false);
  assert.equal(sim.risk, null);
  assert.equal(sim.expectedUtility, null);
  assert.equal(sim.utilityScope, 'none');
  // 未建模 != 零风险：必须是 null，不得是 0。
  assert.notEqual(sim.risk, 0);
});

test('contract: 不可数值化预想的动作标注未建模口径，但不得把已知部分也丢掉', () => {
  for (const action of ['craft', 'build', 'write', 'work', 'trade', 'socialize', 'court', 'accept', 'found', 'expedition']) {
    const c = contract.contractOf(action);
    assert.equal(c.simulatable, false, action + ' 的收益是结构性的，不应声称可数值化预想');
    assert.ok(c.unknownFields.length > 0, action + ' 必须列出未建模的维度');
    const sim = simulator.simulate({ id: 'x:' + action, action }, { needs: { food: 1 } });
    assert.equal(sim.known, true, action + ' 是已建模动作');
    assert.equal(sim.simulatable, false);
    // 口径必须显式标注：这个效用只含「已建模的那部分」，不是行动的全部价值。
    assert.equal(sim.utilityScope, 'modeled_only', action + ' 必须标注效用口径');
    assert.equal(sim.unmodeledBenefit, true, action + ' 必须声明存在未建模收益');
    assert.deepEqual(sim.unknownFields, c.unknownFields);
    // 关键：unknown 不等于零风险——声明的风险必须保留。
    assert.equal(typeof sim.risk, 'number', action + ' 的声明风险不得被抹成 null');
    // 关键回归：不得把已建模部分的效用丢掉。
    // 曾经置为 null，消费方 ?? 0 便把它变成 0——那正是「把未知当成零」，
    // 只是从模拟器内部挪到了调用方。实测后果：build 成为候选 104 次却一次都没被选中。
    assert.equal(typeof sim.expectedUtility, 'number',
      action + ' 的已建模效用必须保留为数值（置 null 会被消费方 ?? 0 静默归零）');
    assert.ok(Number.isFinite(sim.expectedUtility));
  }
  // 生存骨架：可数值化预想，口径为 full。
  for (const action of contract.sustainActions()) {
    assert.equal(contract.contractOf(action).simulatable, true, action + ' 应可数值化预想');
    const sim = simulator.simulate({ id: 'x:' + action, action }, { needs: { food: 1 }, noise: 0 });
    assert.equal(sim.utilityScope, 'full');
    assert.equal(sim.unmodeledBenefit, false);
    assert.equal(typeof sim.expectedUtility, 'number');
  }
  // 契约外行动才是真正的「无依据」：null（而不是 0），且口径为 none。
  const unk = simulator.simulate({ id: 'x:teleport', action: 'teleport' }, { needs: { food: 1 } });
  assert.equal(unk.known, false);
  assert.equal(unk.expectedUtility, null, '未建模行动的效用必须是 null 而不是 0');
  assert.equal(unk.risk, null, '未建模行动的风险必须是 null 而不是 0');
  assert.equal(unk.utilityScope, 'none');
  assert.notEqual(unk.risk, 0, '不得把「未知」写成「零风险」');
});

// ---- 2. 候选准入 = 执行器前置条件 ----

test('agreement: 契约声明的前置条件 reason 与执行器的真实拒绝原因逐字一致', () => {
  const id = freshAgent();
  // write：先发起一次写作任务，第二次必然被 already_writing 拒绝。
  const first = stage2.performAgentAction(1, id, 'write', {});
  assert.equal(first.ok, true, '首次写作应被接受');
  const second = stage2.performAgentAction(2, id, 'write', {});
  assert.equal(second.ok, false);
  assert.equal(second.reason, contract.preconditionOf('write', { literate: true, pendingWrite: true }).reason);

  // 其余动作：在同一居民上触发各自的拒绝原因，与契约声明逐一比对。
  // 注意：契约的前置条件**顺序**必须与执行器的检查顺序一致，
  // 否则同一状态下两边会报出不同的首个原因（这本身就是本测试要锁定的不变量）。
  // 新出生的居民没有账本账户，因此 trade/found 首先撞上 no_account——
  // 契约状态也必须如实反映这一点。
  // t26（F4）：'accept' 的待决来源在 t13 已从"只服务表白的内存队列"改为
  // 互动记录，因此拒绝原因必须是 no_pending_interaction。
  // 这里曾写着 no_pending_court（旧名），而执行器返回 no_pending_interaction——
  // 同一条事实两个名字，正是本用例要锁死的不一致。
  const cases = [
    ['work', { employed: false, businessActive: true }, 'not_employed'],
    ['trade', { hasAccount: false }, 'no_account'],
    ['socialize', { hasPeer: false }, 'no_peer'],
    ['court', { paired: false, eligibleMate: false }, 'no_eligible_mate'],
    ['accept', { paired: false, hasPendingInteraction: false }, 'no_pending_interaction'],
    ['reject', { hasPendingInteraction: false }, 'no_pending_interaction'],
    ['fulfill', { hasOpenPromise: false }, 'no_open_promise'],
    ['violate', { hasOpenPromise: false }, 'no_open_promise'],
    ['found', { hasAccount: false }, 'no_account'],
  ];
  for (const [action, state, expectedReason] of cases) {
    const res = stage2.performAgentAction(3, id, action, {});
    assert.equal(res.ok, false, action + ' 在该状态下应被拒绝');
    assert.equal(res.reason, expectedReason, action + ' 的实际拒绝原因');
    // 契约对同一状态给出的原因必须一致。
    const pre = contract.preconditionOf(action, { hasItemCatalog: true, canFound: true, ...state });
    assert.equal(pre.ok, false, action + ' 的契约应判定不可行');
    assert.equal(pre.reason, expectedReason, action + ' 的契约 reason 必须与执行器一致');
  }

  // 顺序一致性：契约声明的首个原因必须是**最先生效**的那个。
  const tradeOrder = contract.contractOf('trade').requires.map((r) => r.reason);
  assert.deepEqual(tradeOrder, ['no_account', 'no_item_catalog', 'no_surplus', 'pool_insufficient'],
    'trade 的前置条件顺序必须与执行器的检查顺序一致');

  // t26（F4）：社会动作的"没人向我提出请求"只能有**一个**名字。
  // 同时锁住 failure 与 requires reason 的逐字一致——按名字分支的消费者
  // （观察者、叙事、反事实）依赖这个唯一性。
  for (const action of ['accept', 'reject']) {
    const c = contract.contractOf(action);
    const gate = c.requires.find((r) => r.reason === 'no_pending_interaction');
    assert.ok(gate, action + ' 必须有 no_pending_interaction 前置条件');
    assert.equal(c.failure, 'no_pending_interaction', action + ' 的 failure 必须与前置原因逐字一致');
  }
  // 全仓唯一的命名：不得再出现旧名。
  const allReasons = contract.knownActions()
    .flatMap((a) => contract.contractOf(a).requires.map((r) => r.reason))
    .concat(contract.knownActions().map((a) => contract.contractOf(a).failure).filter((x) => typeof x === 'string'));
  assert.ok(!allReasons.includes('no_pending_court'), '旧名 no_pending_court 必须彻底消失');
  assert.ok(!allReasons.includes('no_pending_proposal'), '旧名 no_pending_proposal 必须彻底消失');
  assert.ok(!allReasons.includes('no_pending_request'), '旧名 no_pending_request 必须彻底消失');
});

test('admission: 前置条件不满足的动作不进入候选（消除"选了必然被拒"的空转）', () => {
  const base = {
    actionSpaceEnabled: true,
    hasWorkbenchMaterial: true, hasBuildingMaterial: true, literate: true,
    employed: true, businessActive: true, hasSurplus: true, hasPeer: true,
    eligibleMate: true, hasPendingCourt: false, expeditionViable: false,
    canFound: false, marketRoom: true, hasAccount: true, hasItemCatalog: true,
  };
  const acts = (s) => candidates.plan(s).map((c) => c.action);

  // 全条件满足时，动态动作齐备。
  const all = acts(base);
  for (const a of ['craft', 'build', 'write', 'work', 'trade', 'socialize', 'court']) {
    assert.ok(all.includes(a), '全条件满足时 ' + a + ' 应出现');
  }

  // 关键回归：进行中的任务会让对应候选消失（此前 88% 的写作选择在此空转）。
  assert.ok(!acts({ ...base, pendingWrite: true }).includes('write'), '写作进行中时 write 不得出现在候选里');
  assert.ok(!acts({ ...base, pendingCraft: true }).includes('craft'), '制作进行中时 craft 不得出现');
  assert.ok(!acts({ ...base, pendingBuild: true }).includes('build'), '建造进行中时 build 不得出现');
  assert.ok(!acts({ ...base, employed: false }).includes('work'), '未受雇时 work 不得出现');
  assert.ok(!acts({ ...base, hasSurplus: false }).includes('trade'), '无可售余量时 trade 不得出现');
  assert.ok(!acts({ ...base, hasPeer: false }).includes('socialize'), '无同伴时 socialize 不得出现');
  assert.ok(!acts({ ...base, canFound: true, marketRoom: false }).includes('found'), '市场无空位时 found 不得出现');

  // 生存骨架永远可选（库存是否为空只有执行时才知道，由争用预想与 noop 记账兜住）。
  for (const a of ['eat', 'drink', 'rest', 'forage']) {
    assert.ok(acts({ actionSpaceEnabled: false }).includes(a), a + ' 应永远可选');
  }
});

// ---- 3. 共享资源争用 ----

test('contention: 共享池争用被声明，且分类与池名一致', () => {
  const P = contract.POOLS;
  const C = contract.CONTENTION;
  const expect = {
    forage: [P.FORAGE, C.SHARED_DRAW],
    eat: [P.FOOD, C.SHARED_DRAW],
    drink: [P.WATER, C.SHARED_DRAW],
    trade: [P.SUPPLY_MONEY, C.QUOTA],
    found: [P.MARKET_ROOM, C.QUOTA],
    court: [P.MATE, C.EXCLUSIVE],
    accept: [P.MATE, C.EXCLUSIVE],
  };
  for (const [action, [pool, mode]] of Object.entries(expect)) {
    const c = contract.contentionOf(action);
    assert.equal(c.pool, pool, action + ' 的池名');
    assert.equal(c.mode, mode, action + ' 的争用方式');
  }
  // 独占自身资源的动作不得被误标为共享争用。
  for (const action of ['rest', 'write', 'build', 'socialize']) {
    assert.equal(contract.contentionOf(action).mode, C.NONE, action + ' 不应声明共享争用');
  }
});

test('contention ledger: 预支有界、剩余不为负、未登记的池是"未知"而不是 0', () => {
  contention.__reset();
  contention.open(3, { foragePool: 5, foodStock: 2 });
  assert.equal(contention.remaining('foragePool'), 5);
  // 未登记的池必须返回 undefined（未知），不得伪装成 0。
  assert.equal(contention.remaining('neverRegistered'), undefined);
  // 预支不得超过容量，剩余不得为负。
  assert.equal(contention.reserve('foragePool', 3), 3);
  assert.equal(contention.remaining('foragePool'), 2);
  assert.equal(contention.reserve('foragePool', 100), 2);
  assert.equal(contention.remaining('foragePool'), 0);
  assert.equal(contention.reserve('foragePool', 1), 0, '池已空时不得再预支');
  assert.equal(contention.remaining('foragePool'), 0);
  // 未登记的池预支 0（不是"无限"）。
  assert.equal(contention.reserve('neverRegistered', 5), 0);
  // 视图只含已登记的池。
  const v = contention.view();
  assert.equal(v.foragePool, 0);
  assert.equal(v.foodStock, 2);
  assert.ok(!('neverRegistered' in v));
  contention.__reset();
  assert.equal(contention.isOpen(), false);
});

test('simulator: 池已空时依赖该池的行动被预想为"注定落空"', () => {
  const ctx = {
    needs: { food: 1, water: 1 },
    resources: { food: { scarcity: 1 }, water: { scarcity: 1 } },
    noise: 0,
    poolRemaining: { [contract.POOLS.FORAGE]: 0 },
  };
  const doomed = simulator.simulate({ id: 'x:forage', action: 'forage' }, ctx);
  assert.equal(doomed.contendedOut, true);
  assert.equal(doomed.resourceGain, 0, '池已空时不得预测有收益');
  assert.ok(doomed.expectedUtility < 0, '注定落空必须是负效用：' + doomed.expectedUtility);

  // 池有余量时正常预测收益。
  const ok = simulator.simulate({ id: 'x:forage', action: 'forage' }, {
    ...ctx, poolRemaining: { [contract.POOLS.FORAGE]: 10 },
  });
  assert.equal(ok.contendedOut, false);
  assert.ok(ok.resourceGain > 0);
  assert.ok(ok.expectedUtility > doomed.expectedUtility);

  // 池况**未知**时不得施加落空惩罚（未知 ≠ 零）。
  const unknown = simulator.simulate({ id: 'x:forage', action: 'forage' }, {
    ...ctx, poolRemaining: undefined,
  });
  assert.equal(unknown.contendedOut, false, '池况未知不得被当成"已空"');
  assert.ok(unknown.resourceGain > 0);
});

// ---- 4. trade 语义 ----

test('trade: 契约据实声明为单向卖出，失败原因与执行器一致', () => {
  const c = contract.contractOf('trade');
  assert.equal(c.direction, 'sell', 'trade 实际只实现卖出，不得假装是对称买卖');
  assert.equal(c.completes, true);
  const declared = c.requires.map((r) => r.reason).concat(c.mayFail);
  for (const reason of ['no_account', 'no_item_catalog', 'no_surplus', 'pool_insufficient']) {
    assert.ok(declared.includes(reason), 'trade 必须声明失败原因：' + reason);
  }
  // 供应池额度是共享的 → 必须声明为 quota 争用。
  assert.equal(contract.contentionOf('trade').mode, contract.CONTENTION.QUOTA);
});

// ---- 5. 主循环端到端：共享资源不再被重复预支 ----

test('loop: 共享池按决策顺序被记账，且预支不超过 tick 起始容量', async () => {
  loop.reset();
  await loop.run({ ticks: 25, seed: 7, agentCount: 40, scheduleEnabled: false });
  const ds = decisionLog.list().map((n) => n.data);

  let sawReservation = 0;
  const perTickPool = new Map();
  for (const d of ds) {
    const ct = d.context?.contention;
    assert.ok(ct !== undefined, '每条决策都应带争用记账（可审计谁预支了公共资源）');
    if ((ct.reserved ?? 0) > 0) sawReservation += 1;
    // 剩余量不得为负。
    if (ct.remainingAfter !== null && ct.remainingAfter !== undefined) {
      assert.ok(ct.remainingAfter >= 0, '共享池剩余不得为负：' + ct.remainingAfter);
    }
    // 同一 tick 内，同一池的预支总和不得超过该 tick 起始容量。
    if ((ct.reserved ?? 0) > 0 && ct.pool) {
      const key = d.tick + '|' + ct.pool;
      perTickPool.set(key, (perTickPool.get(key) ?? 0) + ct.reserved);
    }
  }
  assert.ok(sawReservation > 0, '本局应有居民预支共享额度（否则争用账本未接线）');
});

test('loop: 采集空转显著下降（争用感知预想的实测效果）', async () => {
  loop.reset();
  await loop.run({ ticks: 60, seed: 7, agentCount: 40, scheduleEnabled: false });
  const acts = actionLog.list().map((n) => n.data);
  const forage = acts.filter((a) => a.action === 'forage');
  const noop = forage.filter((a) => a.outcome.status === 'noop');
  assert.ok(forage.length > 0, '本局应有采集发生');
  // 修复前实测：608 次采集里 198 次（33%）以 forage_pool_empty 空转。
  // 争用感知预想后应降到 10% 以下；残留部分由生存门有意压过（见下一条测试）。
  const ratio = noop.length / forage.length;
  assert.ok(ratio < 0.10,
    '采集空转率应低于 10%，实际 ' + (ratio * 100).toFixed(1) + '%（' + noop.length + '/' + forage.length + '）');
});

test('loop: 生存门压过争用惩罚时必须显式标注（而不是静默不一致）', async () => {
  loop.reset();
  await loop.run({ ticks: 40, seed: 7, agentCount: 40, scheduleEnabled: false });
  const ds = decisionLog.list().map((n) => n.data);
  const doomed = ds.filter((d) => d.context?.contention?.doomedButChosen === true);
  // 这类决策是**有意的**：食物/水见底时 forage 是唯一补货行动，
  // 效率必须让位于生存。要求是它们被标注出来，而不是消失。
  for (const d of doomed) {
    assert.equal(d.decision, 'forage', '只有采集会在池空时仍被生存门推选');
    assert.equal(d.context.contention.reserved, 0, '池已空时预支应为 0');
    assert.ok(d.context.contention.remainingBefore <= 0);
  }
  // 被压过的次数必须是少数（否则说明争用感知根本没起作用）。
  assert.ok(doomed.length < ds.length * 0.05,
    '生存门压过争用的比例应很低，实际 ' + doomed.length + '/' + ds.length);
});

// ---- 6. 日程可行性 ----

test('schedule: 不可行的日程建议被显式标注，最终行动仍是居民自选', async () => {
  loop.reset();
  await loop.run({ ticks: 30, seed: 7, agentCount: 40 });
  const ds = decisionLog.list().map((n) => n.data);
  const infeasible = ds.filter((d) => d.schedule?.feasible === false);
  assert.ok(infeasible.length > 0, '本局应出现不可行的日程建议（实测日程词汇表含 work，而多数居民未受雇）');
  for (const d of infeasible) {
    assert.equal(typeof d.schedule.infeasibleReason, 'string');
    assert.ok(d.schedule.infeasibleReason.length > 0);
    assert.equal(d.schedule.trigger, 'schedule_infeasible');
    // 不可行建议**不得**成为最终行动。
    assert.notEqual(d.decision, d.schedule.suggested,
      '不可行的日程建议不得成为最终行动：' + d.schedule.suggested);
  }
});
