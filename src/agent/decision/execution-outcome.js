/**
 * truman-town.agent.decision.execution-outcome — 执行结果归一化 / Execution Outcome
 *
 * 把「决策意图」与「实际执行」分开记：决策阶段写意图，执行阶段写真实结果。
 * 本模块只做**归一化**（把两条执行路径的输出折叠成同一形状），不执行世界变更。
 *
 * 两条路径：
 * 1) 生存骨架（eat/drink/forage/rest）：世界变更由 runtime 的 effect 闭包完成，
 *    闭包返回实测结果 { ok, reason, needsDelta, consumed, produced }。
 * 2) 动态行动（craft/work/trade/...）：世界变更由 stage2.performAgentAction 完成，
 *    返回 { ok, reason, detail }。
 *
 * 必须解决的缺陷（D01/D02）：
 * - 旧实现把 eat/drink/forage 的「无库存可消耗」也记成 applied:true（伪成功）；
 * - 旧实现把 craft/build/write「发起了任务」记成已生效成功；
 * - 旧实现把 work「创建了生产计划」记成成功产出（计划从不被执行）。
 * 因此本模块引入显式 status：applied / started / planned / noop / failed。
 *   - applied：世界当 tick 真的发生了预期变化（唯一的 ok=true）
 *   - started：发起了任务，本 tick 无产出（ok=false, completed=false）
 *   - planned：只创建了计划，本 tick 无产出（ok=false, completed=false）
 *   - noop：调用了但没有可执行的对象（空操作，ok=false）
 *   - failed：模块报错或前置条件不满足（ok=false）
 *
 * 成本/收益（D02）只写**可核对的事实**：
 * - 生存动作：需求变化与资源消耗由 effect 闭包实测返回；
 * - 动态动作：来自 performAgentAction 的 detail，加上契约声明的估计值
 *   （estimated:true 明确标注是估计而非实测）。
 */

import { contractOf, completesThisTick } from './action-contract.js';

/** 需求缓解的标量化尺度（1 个单位需求≈1 分收益）。 */
const NEED_SCALE = 1;
/** 资源/物品收益标量化尺度（1 件≈0.25 分，避免物品数量压过需求）。 */
const ITEM_SCALE = 0.25;
/** 货币收益标量化尺度（1 分≈0.05 分）。 */
const MONEY_SCALE = 0.05;

function num(v) {
  return (typeof v === 'number' && Number.isFinite(v)) ? v : 0;
}

function clampUnit(v) {
  return Math.max(0, Math.min(1, num(v)));
}

/** 需求变化 → 收益分（负变化=缓解=正收益）。 */
function reliefScore(needsDelta) {
  if (needsDelta === null || typeof needsDelta !== 'object') return 0;
  let s = 0;
  for (const need of ['food', 'water']) s += -num(needsDelta[need]);
  return s * NEED_SCALE;
}

function resourceScore(map) {
  if (map === null || typeof map !== 'object') return 0;
  let s = 0;
  for (const v of Object.values(map)) s += num(v);
  return s;
}

/**
 * 归一化生存骨架的执行结果。
 * @param {{ action?: string, performed?: object|null }} input
 * @returns {object}
 */
export function fromSustain(input = {}) {
  const action = input.action;
  const c = contractOf(action);
  const p = (input.performed !== null && typeof input.performed === 'object') ? input.performed : {};
  const applied = p.ok === true;
  const needsDelta = (p.needsDelta !== null && typeof p.needsDelta === 'object') ? p.needsDelta : null;
  const consumed = (p.consumed !== null && typeof p.consumed === 'object') ? p.consumed : null;
  const produced = (p.produced !== null && typeof p.produced === 'object') ? p.produced : null;
  const gainScore = clampUnit(reliefScore(needsDelta) + resourceScore(produced) * ITEM_SCALE);
  const costScore = clampUnit(resourceScore(consumed) * ITEM_SCALE);
  return {
    action,
    status: applied ? 'applied' : (p.reason === undefined || p.reason === null ? 'noop' : 'noop'),
    applied,
    ok: applied,
    completed: applied && completesThisTick(action),
    reason: applied ? null : (p.reason ?? 'no_effect'),
    needsDelta,
    cost: consumed,
    gain: produced,
    gainScore,
    costScore,
    known: c.known === true,
    estimated: false,
  };
}

/**
 * 归一化动态行动（performAgentAction）的执行结果。
 * @param {{ action?: string, performed?: object|null }} input
 * @returns {object}
 */
export function fromDynamic(input = {}) {
  const action = input.action;
  const c = contractOf(action);
  const p = (input.performed !== null && typeof input.performed === 'object') ? input.performed : {};
  const ok = p.ok === true;
  const detail = (p.detail !== null && typeof p.detail === 'object') ? p.detail : null;

  let status;
  if (!ok) {
    // 区分「前置条件不满足」（failed）与「没有可执行对象」（noop）。
    status = (typeof p.reason === 'string' && p.reason !== '') ? 'failed' : 'noop';
  } else if (c.known === true && c.completes === false) {
    status = (c.kind === 'plan') ? 'planned' : 'started';
  } else {
    status = 'applied';
  }

  // 实测收益（只取 detail 里明确存在的字段，不猜）。
  const gain = {};
  let money = 0;
  if (detail !== null) {
    if (typeof detail.revenue === 'number') money += detail.revenue;
    if (typeof detail.quantity === 'number' && status === 'applied') gain.items = detail.quantity;
  }
  const gainScore = clampUnit((money * MONEY_SCALE) + resourceScore(gain) * ITEM_SCALE);
  const declaredCost = c.known === true && c.consumes !== null ? c.consumes : {};
  const costScore = clampUnit(resourceScore(declaredCost) * ITEM_SCALE);

  return {
    action,
    status,
    applied: ok,
    ok: status === 'applied',
    completed: status === 'applied',
    reason: ok
      ? (status === 'started' ? 'job_started'
        : status === 'planned' ? 'plan_created'
          : null)
      : (p.reason ?? 'failed'),
    needsDelta: null,
    cost: Object.keys(declaredCost).length > 0 ? declaredCost : null,
    gain: Object.keys(gain).length > 0 ? gain : null,
    gainScore,
    costScore,
    known: c.known === true,
    // 契约声明的成本是估计值，与实测收益区分开，便于审计「哪些数字是实测的」。
    estimated: true,
  };
}

/**
 * 归一化一次执行（自动选择路径）。
 * @param {{ action?: string, dynamic?: boolean, performed?: object|null }} input
 * @returns {object}
 */
export function normalize(input = {}) {
  return input.dynamic === true ? fromDynamic(input) : fromSustain(input);
}

/**
 * 为日志/记忆附加关联 ID（意图 → 执行 → 结果 的唯一定位）。
 * @param {object} outcome normalize 的输出
 * @param {{ decisionId?: string, actionId?: string, tick?: number, agentId?: string }} ref
 * @returns {object}
 */
export function withRef(outcome, ref = {}) {
  return {
    ...outcome,
    ref: {
      decisionId: ref.decisionId ?? null,
      actionId: ref.actionId ?? null,
      tick: Number.isInteger(ref.tick) ? ref.tick : null,
      agentId: ref.agentId ?? null,
    },
  };
}
