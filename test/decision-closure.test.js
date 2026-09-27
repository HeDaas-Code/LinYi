/**
 * t4 决策闭环回归：意图/覆盖/执行/后果学习。
 *
 * 锁定以下契约（每条对应修复计划 D01–D04 的一条验收）：
 * 1. 规则选择 / 模型选择 / 日程建议 / 最终行动分阶段记录，且带可关联 ID；
 * 2. 被覆盖动作的分数/置信度不得冒充最终动作的分数/置信度；
 * 3. 空操作/失败不得记成功（eat 无库存、forage 池见底）；
 * 4. 执行成本收益写入情景/语义记忆，且与执行事件用同一 ID 关联；
 * 5. anticipation simulator 与执行器共用行动契约；未知动作显式标未知而非零风险；
 * 6. 有界状态-行动-结果估计：失败降预期、成功升预期、证据过期、清零消融有效。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loop, registry, worldState } from '../src/runtime/index.js';
import * as observer from '../src/observer/index.js';
import * as survival from '../src/survival/index.js';
import * as simulator from '../src/agent/anticipation/simulator.js';
import * as contract from '../src/agent/decision/action-contract.js';
import * as candidates from '../src/agent/decision/candidates.js';
import * as cf from '../src/observer/experiment/counterfactual.js';
import * as persistence from '../src/runtime/persistence.js';
import * as outcomeModel from '../src/agent/decision/outcome-model.js';
import * as executionOutcome from '../src/agent/decision/execution-outcome.js';
import * as episodicStore from '../src/agent/memory/episodic/store.js';
import * as semantic from '../src/agent/memory/semantic.js';

const { decisionLog, actionLog, eventLog } = observer.recorder;

// ---- 1. 行动契约（D04） ----

test('action-contract: 生存骨架的成本/需求变化与执行器一致（可对账）', () => {
  assert.deepEqual(contract.predictedNeedsDelta('eat'), { food: -0.5, water: 0 });
  assert.deepEqual(contract.predictedNeedsDelta('drink'), { food: 0, water: -0.5 });
  assert.equal(contract.contractOf('eat').consumes.food, 1);
  assert.equal(contract.contractOf('forage').risk, 0.15);
  // 发起/计划类动作当 tick 不完成：不得把「开了任务」记成「有产出」。
  assert.equal(contract.completesThisTick('craft'), false);
  assert.equal(contract.completesThisTick('work'), false);
  assert.equal(contract.completesThisTick('eat'), true);
});

test('action-contract: 未知动作显式标未知，不回落为零风险零收益', () => {
  const c = contract.contractOf('teleport');
  assert.equal(c.known, false);
  assert.equal(c.risk, null);
  assert.equal(contract.predictedNeedsDelta('teleport'), null);
  assert.equal(contract.predictedRisk('teleport'), null);

  const sim = simulator.simulate({ id: 'x:teleport', action: 'teleport' }, { needs: { food: 1 } });
  assert.equal(sim.known, false);
  assert.equal(sim.risk, null, '未知动作风险必须是 null 而不是 0');
  assert.equal(sim.expectedUtility, null, '未知动作期望效用必须是 null 而不是 0');
});

test('simulator: 无噪声预想与契约逐项一致；未知动作排在已知之后', () => {
  const ctx = { needs: { food: 0.5, water: 0.2 }, resources: { food: { scarcity: 0 }, water: { scarcity: 0 } }, noise: 0 };
  const eat = simulator.simulate({ id: 'x:eat', action: 'eat' }, ctx);
  assert.deepEqual(eat.needsDelta, contract.predictedNeedsDelta('eat'));
  assert.equal(eat.exploration, 0);
  assert.ok(eat.expectedUtility > 0);

  const preds = simulator.predict('x', [
    { id: 'x:teleport', action: 'teleport' },
    { id: 'x:eat', action: 'eat' },
  ], ctx);
  assert.equal(preds[0].action, 'eat', '未知动作不得排在有依据的候选之前');
  assert.equal(preds[1].action, 'teleport');
});

// ---- 2. 执行结果归一化（D01：空操作/失败不得记成功） ----

test('execution-outcome: 生存动作按实测 ok 归一化（空操作=noop，不是成功）', () => {
  const ok = executionOutcome.normalize({
    action: 'eat',
    performed: { ok: true, reason: null, needsDelta: { food: -0.5, water: 0 }, consumed: { food: 1 }, produced: null },
  });
  assert.equal(ok.status, 'applied');
  assert.equal(ok.ok, true);
  assert.ok(ok.gainScore > 0, '进食缓解需求应产生正收益分');

  const noop = executionOutcome.normalize({
    action: 'eat',
    performed: { ok: false, reason: 'no_food_stock', needsDelta: null, consumed: { food: 0 }, produced: null },
  });
  assert.equal(noop.status, 'noop');
  assert.equal(noop.ok, false, '无库存进食不得记为成功');
  assert.equal(noop.reason, 'no_food_stock');
});

test('execution-outcome: 动态动作区分 started/planned/failed', () => {
  const started = executionOutcome.normalize({ action: 'craft', dynamic: true, performed: { ok: true, detail: { jobId: 'j1' } } });
  assert.equal(started.status, 'started');
  assert.equal(started.ok, false, '发起制作不等于当 tick 已生效');
  assert.equal(started.completed, false);

  const planned = executionOutcome.normalize({ action: 'work', dynamic: true, performed: { ok: true, detail: { businessId: 'b1', planned: 2 } } });
  assert.equal(planned.status, 'planned', '只创建生产计划不得记为产出成功');
  assert.equal(planned.ok, false);

  const failed = executionOutcome.normalize({ action: 'trade', dynamic: true, performed: { ok: false, reason: 'no_surplus' } });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'no_surplus');
});

// ---- 3. 有界结果估计（D03） ----

test('outcome-model: 失败降预期、成功升预期，且未知不是 0', () => {
  outcomeModel.__reset();
  const unknown = outcomeModel.estimate({ agentId: 'a1', action: 'craft', need: 'none', tick: 0 });
  assert.equal(unknown.known, false);
  assert.equal(unknown.expected, null, '无证据时预期必须是 null 而不是 0');
  assert.equal(unknown.confidence, 0);
  assert.equal(outcomeModel.bias({ agentId: 'a1', action: 'craft', need: 'none', tick: 0 }), 0);

  for (let i = 0; i < 3; i += 1) {
    outcomeModel.observe({ agentId: 'a1', action: 'craft', need: 'none', tick: i, outcome: { status: 'failed' } });
  }
  const afterFail = outcomeModel.estimate({ agentId: 'a1', action: 'craft', need: 'none', tick: 3 });
  assert.ok(afterFail.expected < 0, '失败应把预期压到负值');
  assert.ok(afterFail.confidence > 0);
  assert.ok(outcomeModel.bias({ agentId: 'a1', action: 'craft', need: 'none', tick: 3 }) < 0);

  for (let i = 3; i < 9; i += 1) {
    outcomeModel.observe({ agentId: 'a1', action: 'craft', need: 'none', tick: i, outcome: { status: 'applied', gainScore: 1, costScore: 0 } });
  }
  const afterSuccess = outcomeModel.estimate({ agentId: 'a1', action: 'craft', need: 'none', tick: 9 });
  assert.ok(afterSuccess.expected > afterFail.expected, '成功应抬高预期（收益反转后策略可调整）');
});

test('outcome-model: 同次数不同结果历史影响不同 + 证据过期 + 有界', () => {
  outcomeModel.__reset();
  for (let i = 0; i < 4; i += 1) {
    outcomeModel.observe({ agentId: 'a1', action: 'trade', need: 'food', tick: i, outcome: { status: 'applied', gainScore: 1, costScore: 0 } });
    outcomeModel.observe({ agentId: 'a2', action: 'trade', need: 'food', tick: i, outcome: { status: 'applied', gainScore: 0, costScore: 1 } });
  }
  const good = outcomeModel.estimate({ agentId: 'a1', action: 'trade', need: 'food', tick: 4 });
  const bad = outcomeModel.estimate({ agentId: 'a2', action: 'trade', need: 'food', tick: 4 });
  assert.ok(good.expected > bad.expected, '同样观测次数下，收益为正的历史预期更高');

  // 证据过期：超过 halfLife × 2 后置信度归零（旧证据不再左右决策）。
  const stale = outcomeModel.estimate({ agentId: 'a1', action: 'trade', need: 'food', tick: 5000, halfLife: 200 });
  assert.equal(stale.stale, true);
  assert.equal(stale.confidence, 0);
  assert.equal(outcomeModel.bias({ agentId: 'a1', action: 'trade', need: 'food', tick: 5000, halfLife: 200 }), 0);

  // 有界：样本数上限固定，键数量有全局上限。
  for (let i = 0; i < 200; i += 1) {
    outcomeModel.observe({ agentId: 'a1', action: 'trade', need: 'food', tick: i, outcome: { status: 'applied', gainScore: 1, costScore: 0 } });
  }
  const bounded = outcomeModel.estimate({ agentId: 'a1', action: 'trade', need: 'food', tick: 200 });
  assert.ok(bounded.samples <= 32, '单键样本数必须有上限，实际 ' + bounded.samples);
  assert.ok(outcomeModel.size() <= 4096, '键数量必须有全局上限');
});

test('outcome-model: __reset 清空证据（消融对照有效）', () => {
  outcomeModel.__reset();
  outcomeModel.observe({ agentId: 'a1', action: 'forage', need: 'food', tick: 1, outcome: { status: 'failed' } });
  assert.ok(outcomeModel.bias({ agentId: 'a1', action: 'forage', need: 'food', tick: 2 }) < 0);
  outcomeModel.__reset();
  assert.equal(outcomeModel.size(), 0);
  assert.equal(outcomeModel.bias({ agentId: 'a1', action: 'forage', need: 'food', tick: 2 }), 0, '清空后偏置必须归零');
});

// ---- 4. 主循环端到端：意图 → 最终动作 → 真实执行结果 → 记忆回写（D01/D02） ----

test('loop 端到端：决策日志分阶段 + actionId===decisionId + 结果记忆带引用', async () => {
  loop.reset();
  loop.spawnAgent({ name: 'E2E', food: 1.0, water: 0.0 });
  await loop.step({ eventProbability: 0 });

  const d = decisionLog.list().map((n) => n.data)[0];
  const a = actionLog.list().map((n) => n.data)[0];
  assert.ok(d, '应有决策日志');
  assert.ok(a, '应有行为日志');

  // 阶段拆分：意图 / 模型 / 日程 / 最终行动各自留档。
  assert.equal(typeof d.intent?.action, 'string', '决策日志必须记录规则选择意图');
  assert.equal(d.intent.source, 'rule');
  assert.ok('model' in d, '决策日志必须记录模型阶段');
  assert.equal(d.model.applied, false);
  assert.equal(d.model.fallbackReason, 'llm_decide_disabled', 'LLM 默认不参与决策且必须显式说明');
  assert.ok('schedule' in d, '决策日志必须记录日程阶段');

  // 关联 ID：意图 → 执行 → 结果 同一个 ID。
  assert.equal(typeof d.decisionId, 'string');
  assert.equal(a.actionId, d.decisionId, 'actionId 必须等于 decisionId');
  assert.equal(a.decisionId, d.decisionId);

  // 执行结果是实测归一化后的形状。
  assert.ok(['applied', 'started', 'planned', 'noop', 'failed'].includes(a.outcome.status));
  assert.equal(a.outcome.ok, a.outcome.status === 'applied');
  assert.equal(a.outcome.ref.decisionId, d.decisionId);
  assert.equal(a.outcome.ref.actionId, a.actionId);

  // 结果记忆（情景 + 语义）带同一引用，可反查日志。
  const agentId = registry.lookup({ type: 'agent' })[0].id;
  const epi = episodicStore.list(agentId).filter((m) => m.tags?.includes('outcome'));
  assert.ok(epi.length > 0, '执行后应写入情景记忆');
  assert.equal(epi[0].ref.decisionId, d.decisionId);
  assert.equal(epi[0].ref.actionId, a.actionId);
  assert.equal(epi[0].outcome.status, a.outcome.status);

  const sem = semantic.list(agentId);
  assert.ok(sem.some((m) => m.phase === 'intent'), '决策时刻写意图记忆');
  assert.ok(sem.some((m) => m.phase === 'outcome'), '执行后写结果记忆');

  // 结果学习：真实执行后必须有观测（失败/成功都能改变后续偏好）。
  assert.ok(outcomeModel.size() >= 1, '执行后应有结果估计观测');
});

test('loop 端到端：空操作不得记成功（粮仓抽干 + 采集池为零）', async () => {
  // 把全部可消耗来源归零：粮仓/水仓抽干，采集池容量与再生都为 0。
  // 此时 eat/drink/forage 的 effect 实测都拿不到任何资源，
  // 旧实现会把这些空操作记成 applied:true —— 本测试锁定该缺陷不再复发。
  loop.reset();
  loop.spawnAgent({ name: 'Noop', food: 1.0, water: 1.0 });
  const f = survival.resources.food.query();
  survival.resources.food.consume(f.stockpile);
  const w = survival.resources.water.query();
  survival.resources.water.consume(w.stockpile);
  const zeroPool = { forageYield: 0, foragePoolCapacity: 0, foragePoolPerCapita: 0, forageRegen: 0, forageRegenPerCapita: 0 };
  await loop.step({ eventProbability: 0, ...zeroPool });
  await loop.step({ eventProbability: 0, ...zeroPool });

  const acts = actionLog.list().map((n) => n.data);
  assert.ok(acts.length > 0, '应有行为日志');
  const resourceActions = acts.filter((a) => ['eat', 'drink', 'forage'].includes(a.action));
  assert.ok(resourceActions.length > 0, '该场景应至少尝试一次资源获取行动');
  for (const a of resourceActions) {
    assert.notEqual(a.outcome.status, 'applied',
      a.action + ' 在无资源可得时必须记 noop，不得记成功（旧实现在此记 applied:true）');
    assert.equal(a.outcome.ok, false, a.action + ' 的 ok 必须为 false');
    assert.ok(typeof a.outcome.reason === 'string' && a.outcome.reason.length > 0,
      a.action + ' 空操作必须给出原因');
  }
  const forage = resourceActions.filter((a) => a.action === 'forage');
  if (forage.length > 0) {
    assert.equal(forage[0].outcome.reason, 'forage_pool_empty');
    assert.equal(forage[0].outcome.needsDelta, null, '空操作不得声称产生了需求变化');
  }

  // 空操作必须留下可检索事件（带同一 decisionId），供审计发现「伪成功」。
  const evs = eventLog.list().filter((n) => String(n.data.topic).startsWith('agent.action.'));
  assert.ok(evs.length > 0, '空操作应写事件日志');
  for (const e of evs) {
    assert.equal(typeof e.data.payload.decisionId, 'string');
    assert.ok(['noop', 'failed'].includes(e.data.payload.status));
  }

  // 空操作必须写回记忆并成为**负**证据（失败/空操作降预期）。
  const agentId = registry.lookup({ type: 'agent' })[0].id;
  const epi = episodicStore.list(agentId).filter((m) => m.tags?.includes('outcome'));
  assert.ok(epi.some((m) => m.outcome.status === 'noop'), '空操作应写入情景记忆');
  const sem = semantic.list(agentId).filter((m) => m.phase === 'outcome');
  assert.ok(sem.some((m) => m.outcome.status === 'noop'), '空操作应写入语义记忆');
  assert.ok(outcomeModel.size() >= 1, '空操作应写入结果估计');
  const observed = outcomeModel.snapshot();
  const negatives = Object.values(observed).filter((v) => v.lastReward < 0);
  assert.ok(negatives.length > 0, '空操作必须成为负证据，而不是中性或正证据');
});

// ---- 5. 覆盖不变式：被覆盖动作的分数不得冒充最终动作（D01） ----

test('loop 不变式：最终动作来源与分数一致，日志三阶段齐备，ID 全链可关联', async () => {
  loop.reset();
  await loop.run({ ticks: 20, seed: 5, agentCount: 8 });

  const ds = decisionLog.list().map((n) => n.data);
  const as = actionLog.list().map((n) => n.data);
  assert.ok(ds.length > 0 && as.length > 0);

  let adopted = 0;
  for (const d of ds) {
    // 阶段齐备：意图 / 模型 / 日程 / 最终动作各自留档，缺一不可。
    assert.equal(d.intent?.source, 'rule', '每条决策都必须留档规则选择意图');
    assert.equal(typeof d.intent.action, 'string');
    assert.ok('model' in d, '每条决策都必须留档模型阶段');
    assert.ok('schedule' in d, '每条决策都必须留档日程阶段');
    assert.ok('final' in d, '每条决策都必须留档最终动作阶段');
    assert.equal(typeof d.decisionId, 'string', '每条决策都必须有可关联 ID');

    // 核心不变式：分数/置信度只属于它实际对应的那个动作。
    // 一旦被模型或日程覆盖，被覆盖动作的分数必须清空，不得冒充最终动作。
    const source = d.final?.source ?? 'rule';
    if (source !== 'rule') {
      adopted += 1;
      assert.equal(d.final.score, null, '被覆盖时 final.score 必须清空，实际 ' + d.final.score);
      assert.equal(d.final.confidence, null, '被覆盖时 final.confidence 必须清空');
      assert.equal(d.final.action, d.decision, 'final.action 必须等于最终动作');
    } else {
      assert.equal(typeof d.final.score, 'number', '未被覆盖时 final.score 必须是数值');
      assert.equal(d.final.action, d.decision, 'final.action 必须等于最终动作');
    }
    // 模型未参与时必须显式给出回退原因（LLM 不是全局决策者）。
    if (d.model.applied === false) {
      assert.ok(typeof d.model.fallbackReason === 'string' && d.model.fallbackReason.length > 0,
        '模型未生效必须给出回退原因');
    }
  }

  // 全链关联：每个执行日志的 decisionId 必须能在决策日志里找到。
  const decisionIds = new Set(ds.map((d) => d.decisionId));
  for (const a of as) {
    assert.ok(decisionIds.has(a.decisionId),
      '执行日志的 decisionId 必须能定位到决策日志：' + a.decisionId);
    assert.equal(a.actionId, a.decisionId, 'actionId 与 decisionId 必须一致');
  }

  // 记录实测事实：默认配置下日程/模型不夺取居民决定权（覆盖次数为 0），
  // 这是设计意图（日程是建议，不是决定者）；若未来真的发生覆盖，
  // 上面的不变式分支会自动接管校验。
  assert.equal(adopted, 0, '默认配置下不应发生日程/模型覆盖（居民自选优先）');
});

// ---- 6. 结果学习真实参与决策（D03：消融对照，且不以生存为代价） ----

test('loop 消融：关闭结果学习后行动分布改变，且两次都存活', async () => {
  const distOf = (rep) => {
    const d = {};
    for (const st of (rep.steps ?? [])) {
      for (const dec of (st.decisions ?? [])) d[dec.action] = (d[dec.action] ?? 0) + 1;
    }
    return d;
  };
  const aliveOf = (rep) => {
    const wa = rep.world.agents ?? {};
    return Object.values(wa).filter((x) => x.alive !== false).length;
  };

  loop.reset();
  const on = await loop.run({ ticks: 60, seed: 11, agentCount: 12, phase2: true });
  loop.reset();
  const off = await loop.run({ ticks: 60, seed: 11, agentCount: 12, phase2: true, outcomeLearningWeight: 0 });

  const a = distOf(on);
  const b = distOf(off);
  let differing = 0;
  for (const act of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if ((a[act] ?? 0) !== (b[act] ?? 0)) differing += 1;
  }
  assert.ok(differing > 0,
    '关闭结果学习后行动分布应变化（否则估计未参与打分）：开启=' + JSON.stringify(a) + ' 关闭=' + JSON.stringify(b));

  // 结果学习是有界偏置，**不得以生存为代价**（方向性断言）。
  // t11 实测（12 人 × 60 tick，seed 11/3/5）：开启存活 17/12/12，关闭 12/12/12
  // ——结果学习从不降低存活；seed 11 反而 +5（学到「池空时采集必空转」而改做别的）。
  // 因此断言方向而非绝对差：允许波动，但绝不允许用生存换偏好。
  assert.ok(aliveOf(on) > 0 && aliveOf(off) > 0, '两种配置都必须有居民存活');
  assert.ok(aliveOf(on) >= aliveOf(off) - 3,
    '结果学习不得以生存为代价：开启=' + aliveOf(on) + ' 关闭=' + aliveOf(off));
});

// ---- 7. 候选准入门：契约故障不得静默（t21） ----

/**
 * t21 回归：**「前置条件不满足」与「契约故障」必须可分辨**。
 *
 * 背景（t19 的归因实验）：candidates.js 曾用
 *   try { pre = preconditionOf(action, s) } catch { pre = { ok: false } }
 * 兜底，而 preconditionOf 内部对每个 requires 也用了
 *   try { passed = r.test(state) === true } catch { passed = false }
 * 于是"契约坏了"被伪装成"条件没到"——行动被静默过滤，理由还是一句听起来很合理的话。
 * 最坏情形下全部动态行动（court/accept/build/craft/write/work/found/trade）消失，
 * 只剩 eat/drink/rest/forage，而主循环照常跑、不崩不报错。
 *
 * 本组用例锁定两件事：
 *   A. 合法的 ok:false **照常过滤且不告警**（不得为了"更响"而制造假告警）；
 *   B. 契约故障**照常保守过滤但留下可查询的具名告警**（不得为了"不中断"而静默）。
 * 两者在日志里必须能分开，否则等于没修。
 */

/** 组装一个"全部动态行动都该出现"的健康状态。 */
function healthyState(over = {}) {
  return {
    actionSpaceEnabled: true,
    hasWorkbenchMaterial: true,
    hasBuildingMaterial: true,
    literate: true,
    employed: true,
    businessActive: true,
    hasSurplus: true,
    hasPeer: true,
    eligibleMate: true,
    hasPendingCourt: false,
    expeditionViable: false,
    canFound: false,
    marketRoom: true,
    ...over,
  };
}

/** 让指定 require 的测试函数抛错（模拟契约故障），其余字段照常。 */
function stateWithBrokenRequires(keys, over = {}) {
  const base = healthyState(over);
  const broken = new Set(keys);
  return new Proxy(base, {
    get(t, k) {
      if (broken.has(k)) throw new Error('contract boom: ' + String(k));
      return t[k];
    },
  });
}

test('t21 候选准入：合法的 ok:false 仍过滤对应行动，且**不产生任何契约告警**', () => {
  candidates.__reset();
  const offered = candidates.plan(healthyState({ literate: false }));
  const names = offered.map((c) => c.action);
  assert.equal(names.includes('write'), false, '不识字时 write 必须被过滤');
  // 关键：合法过滤不是故障，绝不能报警——否则"狼来了"会让真故障淹没在假告警里。
  const summary = candidates.contractFaultSummary();
  assert.equal(summary.clean, true, '合法过滤不得产生契约告警，实际 ' + JSON.stringify(summary));
  assert.equal(summary.total, 0);
  // 其余动态行动不受影响（过滤是**逐行动**的，不是一刀切）。
  assert.ok(names.includes('craft') && names.includes('court') && names.includes('work'));
});

test('t21 候选准入：requires 测试抛错不再静默——保守过滤 + 具名可查询告警', () => {
  candidates.__reset();
  const state = stateWithBrokenRequires(['pendingCraft', 'pendingBuild', 'pendingWrite']);
  const offered = candidates.plan(state);
  const names = offered.map((c) => c.action);

  // 行为面：契约不可校验 ⇒ 保守地不放行（宁可不做，也不做无法校验的事）。
  assert.equal(names.includes('craft'), false, 'craft 的契约故障时应保守过滤');
  assert.equal(names.includes('build'), false);
  assert.equal(names.includes('write'), false);
  // 未被故障波及的行动照常可选——故障不得扩散成"清空全部动态行动"。
  assert.ok(names.includes('work'), 'work 不受 pendingCraft 故障影响，应仍在候选里');
  assert.ok(names.includes('court') && names.includes('socialize'));

  // 诊断面：这才是本任务的核心——故障必须**可见且能定位到具体行动与具体 require**。
  const summary = candidates.contractFaultSummary();
  assert.equal(summary.clean, false, '契约故障必须让 clean=false');
  assert.equal(summary.distinct, 3, '应登记 3 条不同告警，实际 ' + summary.distinct);
  const faults = candidates.contractFaults();
  const subjects = faults.map((f) => f.subject).sort();
  assert.deepEqual(subjects, ['build', 'craft', 'write']);
  for (const f of faults) {
    assert.equal(f.kind, candidates.CONTRACT_FAULT);
    assert.match(f.message, /contract boom/, '告警必须带原始错误信息：' + f.message);
    assert.equal(typeof f.detail.require, 'string', '必须能定位到具体 require');
  }
  assert.ok(faults.some((f) => f.detail.require === 'pendingCraft'));
});

test('t21 候选准入：契约故障与合法过滤在同一状态里并存时仍可分辨', () => {
  candidates.__reset();
  // literate=false 是**合法**过滤；pendingCraft 抛错是**故障**。
  const state = stateWithBrokenRequires(['pendingCraft'], { literate: false });
  const names = candidates.plan(state).map((c) => c.action);
  assert.equal(names.includes('write'), false);
  assert.equal(names.includes('craft'), false);
  const faults = candidates.contractFaults();
  // 只有故障被记录：write 的过滤**不得**出现在告警里。
  assert.equal(faults.length, 1, '只应记录 1 条故障，实际 ' + JSON.stringify(faults.map((f) => f.subject)));
  assert.equal(faults[0].subject, 'craft');
  assert.equal(faults[0].detail.require, 'pendingCraft');
  assert.equal(candidates.contractFaultSummary().total, 1);
});

test('t21 诊断通道：去重有界（每 tick 每居民调用一次也不会刷爆），且随运行复位', () => {
  candidates.__reset();
  const state = stateWithBrokenRequires(['pendingCraft']);
  for (let i = 0; i < 50; i += 1) candidates.plan(state);
  const summary = candidates.contractFaultSummary();
  // 50 次调用 × 1 个故障点 = 50 次告警，但只有 1 个**不同**的键。
  assert.equal(summary.distinct, 1, '相同故障必须去重，否则逐条记录等于没有告警');
  assert.equal(summary.total, 50, '次数仍须如实累计，不得因为去重而少报');
  assert.equal(summary.overflow, 0);

  // 跨 run 复位：账本是模块级状态，不清会污染下一局（把真实故障淹掉）。
  // 目前由测试显式调用；接进 loop.reset 需在 loop.js 的复位清单加一行
  // candidates.__reset()，而 loop.js 不在本任务范围内（见 candidates.js 注释）。
  candidates.__reset();
  const after = candidates.contractFaultSummary();
  assert.equal(after.clean, true, '复位后契约告警必须清零，实际 ' + JSON.stringify(after));
  assert.equal(candidates.contractFaults().length, 0);
});

test('t21 诊断通道：真实运行（phase2 生育/建造/制作）零契约故障', async () => {
  loop.reset();
  await loop.run({ phase2: true, ticks: 60, seed: 42, agentCount: 3 });
  // 健康运行的"候选里没有 build"绝不能靠猜——现在可以直接断言"没有任何契约故障"。
  const summary = candidates.contractFaultSummary();
  assert.equal(summary.clean, true,
    '健康运行不应有任何契约故障，实际 ' + JSON.stringify(candidates.contractFaults().map((f) => f.subject + ':' + f.message)));
});

test('t21 action-contract：preconditionOf 区分「故障」与「不满足」，未知行动不算故障', () => {
  // 合法不满足：unmet 有内容，faults 必须为空。
  const legit = contract.preconditionOf('craft', { hasWorkbenchMaterial: false, pendingCraft: false });
  assert.equal(legit.ok, false);
  assert.deepEqual(legit.faults, [], '合法不满足不得被当成故障');
  assert.ok(legit.unmet.includes('hasWorkbenchMaterial'));

  // 契约故障：测试函数抛错 ⇒ faults 非空且带 require 名与错误信息。
  const broken = contract.preconditionOf('craft', stateWithBrokenRequires(['pendingCraft']));
  assert.equal(broken.ok, false);
  assert.equal(broken.faults.length, 1);
  assert.equal(broken.faults[0].key, 'pendingCraft');
  assert.equal(broken.faults[0].action, 'craft');
  assert.match(broken.faults[0].message, /contract boom/);

  // 未建模行动是**合法**拒绝（它本就不在契约里），不是契约故障。
  const unknown = contract.preconditionOf('teleport', {});
  assert.equal(unknown.ok, false);
  assert.deepEqual(unknown.faults, [], '未知行动是合法拒绝，不是契约故障');

  // 健康路径：ok=true 且 faults 为空。
  const ok = contract.preconditionOf('craft', { hasWorkbenchMaterial: true, pendingCraft: false });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.faults, []);
});


// ---- t10：真实反事实分支重演 ----

test('t10 反事实：真实重演——只换一个行动，其余世界逐位一致且可复现', async () => {
  loop.reset();
  await loop.run({ ticks: 12, seed: 7, agentCount: 4 });
  const snap = persistence.saveRun({ meta: { test: 't10' } });
  const pivot = cf.pivotTickFor(snap);

  // 先确认重演本身是确定的：不确定的重演无法把差异归因到那一个行动。
  const self = await cf.selfCheck({ ticks: 3, seed: 7, restore: snap });
  assert.equal(self.deterministic, true, '同一存档同一 seed 重演两次必须逐条一致');

  const before = cf.worldFingerprint();
  const r = await cf.compare({
    agentId: 'agent_000000000001', tick: pivot, alternative: 'rest',
    ticks: 4, seed: 7, restore: snap,
  });
  const after = cf.worldFingerprint();

  // 1) 干预确实生效——否则"两个世界没差别"可能只是干预根本没落地。
  assert.equal(r.interventionApplied, true, '干预必须真实改写了那一个决策');
  assert.equal(r.pivotDivergence.changed, true);
  assert.equal(r.pivotDivergence.tick, pivot);
  assert.equal(r.pivotDivergence.agentId, 'agent_000000000001');
  assert.equal(r.pivotDivergence.branchAction, 'rest');
  assert.notEqual(r.pivotDivergence.baselineAction, 'rest');

  // 2) 替换点之前两条世界必须一致（同一存档 + 同一随机流位置）。
  assert.equal(r.preIntervention.identical, true, '替换点之前两条世界必须逐条一致');

  // 3) 后果来自真实执行，不是哈希。
  assert.equal(r.diverged, true, '替换一个行动后世界应当偏离');
  assert.equal(typeof r.baseline.actionCounts.rest, 'number');
  assert.equal(typeof r.branchWorld.actionCounts.rest, 'number');
  assert.ok(r.consequence.actionsChanged.length > 0, '应当能指出哪些行动的分布变了');

  // 4) 原世界未被污染。
  assert.equal(r.isolation.originalIntact, true, '分析结束后原世界必须逐位复原');
  assert.deepEqual(after, before, '调用前后世界指纹必须完全一致');
});

test('t10 反事实：不可达的备选被拒绝（不造出真实世界到不了的世界）', async () => {
  loop.reset();
  await loop.run({ ticks: 8, seed: 7, agentCount: 4 });
  const snap = persistence.saveRun({ meta: { test: 't10-unreachable' } });
  const pivot = cf.pivotTickFor(snap);
  await assert.rejects(
    () => cf.compare({ agentId: 'agent_000000000001', tick: pivot, alternative: 'teleport', ticks: 2, seed: 7, restore: snap }),
    /不在 tick .* 的候选集内/,
  );
});

test('t10 反事实：拒绝从非提交边界分叉', async () => {
  loop.reset();
  await loop.run({ ticks: 8, seed: 7, agentCount: 4 });
  const snap = persistence.saveRun({ meta: { test: 't10-boundary' } });
  await assert.rejects(
    () => cf.compare({ agentId: 'agent_000000000001', tick: 1, alternative: 'rest', ticks: 2, seed: 7, restore: snap }),
    /必须等于分叉后的第一 tick/,
  );
});

test('t10 反事实：伪因果哈希投影入口已彻底删除', () => {
  assert.equal(cf.project, undefined, 'project() 哈希投影必须被删除');
  assert.equal(cf.compare.constructor.name, 'AsyncFunction', 'compare 必须是 async');
  assert.equal(typeof cf.worldFingerprint, 'function', '世界指纹用于证明原世界未被污染');
  assert.equal(typeof cf.pivotTickFor, 'function', '替换点换算必须是库的能力');
});
