/**
 * truman-town.agent.anticipation.simulator — 行动模拟 / Action Simulator
 *
 * 对候选行动做"简化推演"——不实现开放世界或地图寻路，只做数值/状态推演：
 * 给定当前需求与资源，估算行动后的需求变化（needsDelta）、资源收益（resourceGain）
 * 与风险（risk），并叠加一个探索扰动（exploration），输出期望效用
 *（expectedUtility）。
 *
 * 行动的目标/前置条件/成本/收益/风险/时长/争用**不在本文件定义**，统一来自
 * decision.action-contract（单一事实来源），与候选生成、日程建议、运行时执行器
 * 共享同一份数字，因此「无噪声预想」与「确定性执行」可以逐项对账。
 *
 * ## 认知状态的诚实标注（t11）
 *
 * 期望效用**永远只是"已建模部分"**，不是行动的全部价值。三类认知状态必须严格区分：
 *
 *   1. known=true  → 契约已建模。**总是**给出数值化的已建模期望效用
 *      （需求缓解 + 资源收益 − 声明风险 + 探索扰动）。
 *   2. simulatable=false（仍 known=true）→ 该行动的**结构性收益无法数值化预测**
 *      （社交回报、经济利润、技能与结构的长期产出）。此时：
 *        · expectedUtility 仍给出，但 utilityScope='modeled_only'，
 *          明确声明"这只是已建模的那部分"；
 *        · unmodeledBenefit=true 且 unknownFields 列出**具体哪些维度没建模**。
 *   3. known=false → 契约里根本没有这个行动。expectedUtility=null、risk=null，
 *      utilityScope='none'。**不得**回落为 {risk:0}——那等于把"我不知道"
 *      写成"零成本零风险"，会系统性误导决策。
 *
 * ## 一个必须避免的陷阱（t11 实测回归）
 *
 * 曾经把第 2 类的 expectedUtility 直接置为 null，结果消费方
 * `simBy.get(id) ?? 0` 把 null 合并成 0 ——**这正是"把未知当成零"**，
 * 只是从模拟器内部挪到了调用方，反而更隐蔽。实测后果：
 * 3 人 × 60 tick（seed 42）下 build 成为候选 104 次却**一次都没被选中**，
 * write 82 次全落空，生育链路断裂（integration2 两项断言失败）。
 * 因此正确做法是：**照常给出已建模部分的数值**，同时把"哪部分没建模"显式标注出来。
 * 声明未知 ≠ 把已知也丢掉。
 *
 * ## 共享池争用（t11）
 *
 * 采集池/粮仓/水仓是**全局共享且可耗尽**的。若调用方提供 poolRemaining
 * （见 decision.contention 账本），则当池已空时，依赖该池的行动被预测为
 * **注定落空**并施以明确惩罚——而不是继续按稀缺度给出乐观收益。
 * 这消除了"同一 tick 内 N 人同时决定采集、后到者全部空转"的重复预支。
 * 池况**未知**（视图里没有该池）时**不施加**惩罚：未知不等于空。
 *
 * 探索扰动使用本地确定性哈希（seed + agentId + tick + action），不消耗全局
 * rng 序列——避免决策层扰动意外影响生存事件 / 经济 / 社会等其他子系统的随机流。
 */

import { contractOf } from '../decision/action-contract.js';

function hash01(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** 采集的资源收益系数（契约未给出稀缺度模型，系数留在模拟侧并注明）。 */
const FORAGE_GAIN_COEFFICIENT = 0.8;
/** 注定落空的行动惩罚（池已空时）。使"空转"明确劣于"改做别的"。 */
const WASTE_PENALTY = 0.5;

function clampUnit(v) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

function needRelief(needsDelta, needs) {
  if (needsDelta === null || needsDelta === undefined) return 0;
  let relief = 0;
  for (const need of ['food', 'water']) {
    const delta = needsDelta[need] ?? 0;
    if (delta < 0) relief += -delta * clampUnit(needs[need]);
  }
  return relief;
}

/**
 * 该行动依赖的共享池在本 tick 还剩多少。
 * @returns {number|undefined} undefined = 池况未知（不是 0）
 */
function poolRemainingFor(contract, context) {
  const pool = contract?.contention?.pool;
  if (typeof pool !== 'string' || pool === '') return undefined;
  const table = context?.poolRemaining;
  if (table === null || typeof table !== 'object') return undefined;
  const left = table[pool];
  return (typeof left === 'number' && Number.isFinite(left)) ? left : undefined;
}

/**
 * 推演一个候选行动。
 * @param {{ id?: string, action?: string }} candidate
 * @param {object} [context]
 * @returns {object}
 */
export function simulate(candidate, context = {}) {
  const contract = contractOf(candidate?.action);
  const needs = context.needs ?? {};

  // 情形 3：契约里没有这个行动 —— 显式未知，不填 0。
  if (contract.known !== true) {
    return {
      candidate,
      action: candidate?.action,
      known: false,
      simulatable: false,
      expectedUtility: null,
      utilityScope: 'none',
      unmodeledBenefit: true,
      unknownFields: contract.unknownFields,
      needsDelta: null,
      resourceGain: null,
      risk: null,
      cost: null,
      durationTicks: null,
      completes: false,
      contention: null,
      contendedOut: false,
      exploration: 0,
      reason: 'action_not_in_contract',
    };
  }

  const risk = contract.risk;
  const left = poolRemainingFor(contract, context);
  const contendedOut = left !== undefined && left <= 0;
  const gainsResources = (contract.produces?.food ?? 0) > 0 || (contract.produces?.water ?? 0) > 0;
  // 消耗型行动在池已空时同样注定落空（eat 无粮、drink 无水），
  // 与执行器的 no_food_stock / no_water_stock 一致。
  const consumesShared = contract.contention?.mode === 'shared-draw'
    && (contract.consumes?.food ?? 0) + (contract.consumes?.water ?? 0) > 0;
  const doomed = contendedOut && (gainsResources || consumesShared);

  // ---- 已建模部分：对**每一个**已知行动都照常计算，不因"结构性收益未建模"而丢弃。 ----
  const relief = needRelief(contract.needsDelta, needs);
  let resourceGain = 0;
  if (gainsResources && !contendedOut) {
    const foodScarcity = clampUnit(context.resources?.food?.scarcity);
    const waterScarcity = clampUnit(context.resources?.water?.scarcity);
    resourceGain = FORAGE_GAIN_COEFFICIENT * Math.max(foodScarcity, waterScarcity);
  }

  const noise = typeof context.noise === 'number' && context.noise >= 0 ? context.noise : 0.25;
  const key = [context.seed, context.agentId, context.tick, candidate?.action].join(':');
  const exploration = noise === 0 ? 0 : (hash01(key) * 2 - 1) * noise;

  let expectedUtility = relief + resourceGain - risk + exploration;
  if (doomed) expectedUtility -= WASTE_PENALTY;

  const full = contract.simulatable === true;
  return {
    candidate,
    action: candidate?.action,
    known: true,
    simulatable: full,
    expectedUtility,
    // 效用的**口径**：full = 契约认为收益可数值化；modeled_only = 只含已建模的那部分。
    // 消费方据此知道这个数字是"全部价值"还是"已知的那块"。
    utilityScope: full ? 'full' : 'modeled_only',
    unmodeledBenefit: !full,
    unknownFields: contract.unknownFields,
    needsDelta: {
      food: contract.needsDelta?.food ?? 0,
      water: contract.needsDelta?.water ?? 0,
    },
    resourceGain,
    risk,
    cost: contract.consumes,
    durationTicks: contract.durationTicks,
    completes: contract.completes === true,
    contention: contract.contention,
    contendedOut: doomed,
    exploration,
  };
}

/**
 * 批量推演并排序。
 * 排序：已建模者按已建模效用降序；契约里没有的行动（known=false）恒排最后
 * ——它们连"是不是一个行动"都不确定，不能与已建模者混排。
 * 注意：non-simulatable 的行动**参与同一排序**（它们的已建模效用是真实可比的），
 * 但每条结果都带 utilityScope 标注，审计能看到排序依据的口径。
 * @param {string} agentId
 * @param {Array<object>} candidates
 * @param {object} [context]
 * @returns {Array<object>}
 */
export function predict(agentId, candidates, context = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const out = list.map((candidate, index) => {
    const sim = simulate(candidate, { ...context, agentId });
    sim.order = index;
    return sim;
  });
  out.sort((a, b) => {
    const unknownA = a.known !== true;
    const unknownB = b.known !== true;
    if (unknownA !== unknownB) return unknownA ? 1 : -1;
    if (!unknownA && b.expectedUtility !== a.expectedUtility) return b.expectedUtility - a.expectedUtility;
    return a.order - b.order;
  });
  return out;
}

export function __reset() {}
