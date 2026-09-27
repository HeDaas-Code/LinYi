/**
 * truman-town.agent.decision.outcome-model — 有界结果学习 / Bounded Outcome Model
 *
 * 实现 D03：**有界**的状态-行动-结果估计 + 置信度。
 *
 * 语义：
 * - 状态 = 主导需求（food/water/none）；行动 = 行动名；两者组成估计键。
 * - 每次执行后 observe() 写入一次带符号 reward：失败/空操作 → 负；
 *   真实生效且有收益 → 正；成功但无收益 → 小正。
 * - estimate 采用**有界滑动平均**：样本数上限 cap，超过后旧证据按 1/cap 权重衰减，
 *   因此内存与单键影响都有上界（不会因长跑无限累积）。
 * - 置信度 = min(1, samples/MIN_SAMPLES) × 时间衰减。证据超过 halfLife × 2 即视为
 *   **过期**（confidence=0），使收益反转后策略能重新被新证据驱动。
 * - 未知键返回 { expected: null, confidence: 0, known: false }——**不是 0**。
 *   调用方必须显式处理「不知道」，不得把未知当中性。
 * - 键数量有全局上限 MAX_KEYS（LRU 淘汰），保证长跑内存受控。
 * - __reset() 清空全部证据 → 消融对照可验证「清掉记忆后策略确实改变」。
 *
 * 本模块只做估计，不替居民决定；调用方以**有界偏置**形式使用它
 * （见 loop.js 的 outcomeBias），且权重小于生存/人格项，不能颠倒量级差异。
 */

/** 单键最大样本数（有界：超出后旧证据被稀释）。 */
const DEFAULT_CAP = 32;
/** 达到该样本数时置信度饱和为时间衰减值。 */
const MIN_SAMPLES = 3;
/** 证据半衰期（tick）。默认 200 ≈ 标准局长度。 */
const DEFAULT_HALF_LIFE = 200;
/** 全局键上限（LRU 淘汰），保证长跑内存受控。 */
const MAX_KEYS = 4096;

/** @type {Map<string, {sum:number, weight:number, samples:number, lastTick:number, lastReward:number}>} */
const table = new Map();
/** 命中顺序（LRU）：键 → 最近一次访问序号。 */
const lru = new Map();
let lruSeq = 0;
let observations = 0;

function assertKeyPart(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError('outcome-model: ' + label + ' 必须为非空字符串');
  }
}

function clampUnit(v) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

/** 估计键：agentId | 主导需求 | 行动。 */
export function keyOf(agentId, action, need) {
  assertKeyPart(agentId, 'agentId');
  assertKeyPart(action, 'action');
  const n = (typeof need === 'string' && need !== '') ? need : 'none';
  return agentId + '|' + n + '|' + action;
}

/** 记录一次访问（LRU）。 */
function touch(key) {
  lruSeq += 1;
  lru.set(key, lruSeq);
  if (lru.size <= MAX_KEYS) return;
  // 淘汰最久未访问的键（有界内存）。
  let oldestKey = null;
  let oldestSeq = Infinity;
  for (const [k, seq] of lru) {
    if (seq < oldestSeq) { oldestSeq = seq; oldestKey = k; }
  }
  if (oldestKey !== null) {
    lru.delete(oldestKey);
    table.delete(oldestKey);
  }
}

/**
 * 由执行结果计算 reward（-1..1）。
 * 规则（必须与 outcome 的字段语义一致，不得凭感觉给分）：
 * - failed / noop → -1（失败与空操作都是负证据）
 * - started / planned（发起任务或创建计划，本 tick 无产出）→ null（**不写证据**，
 *   结果尚未发生；延迟结果由后续完成事件另行观察）
 * - applied → clamp(gainScore - costScore, -1, 1)
 * @param {object|null} outcome
 * @returns {number|null}
 */
export function rewardOf(outcome) {
  if (outcome === null || typeof outcome !== 'object') return null;
  const status = outcome.status;
  if (status === 'failed' || status === 'noop') return -1;
  if (status === 'started' || status === 'planned') return null;
  const gain = clampUnit(outcome.gainScore ?? 0);
  const cost = clampUnit(outcome.costScore ?? 0);
  const r = gain - cost;
  return Math.max(-1, Math.min(1, r));
}

/**
 * 写入一次观测。reward 为 null 时忽略（无结果证据）。
 * @param {{ agentId?: string, action?: string, need?: string, tick?: number,
 *           reward?: number|null, outcome?: object }} input
 * @returns {{ key: string, samples: number, mean: number, reward: number }|null}
 */
export function observe(input = {}) {
  const agentId = input.agentId;
  const action = input.action;
  assertKeyPart(agentId, 'agentId');
  assertKeyPart(action, 'action');
  const explicit = (typeof input.reward === 'number' && Number.isFinite(input.reward))
    ? input.reward : undefined;
  const reward = explicit !== undefined ? Math.max(-1, Math.min(1, explicit)) : rewardOf(input.outcome ?? null);
  if (reward === null || reward === undefined) return null;

  const key = keyOf(agentId, action, input.need);
  const tick = Number.isInteger(input.tick) ? input.tick : 0;
  let e = table.get(key);
  if (e === undefined) {
    e = { sum: 0, weight: 0, samples: 0, lastTick: tick, lastReward: reward };
    table.set(key, e);
  }
  // 有界滑动平均：权重上限 cap，新增权重 1 → 旧证据自动被稀释。
  if (e.weight >= DEFAULT_CAP) {
    const keep = (DEFAULT_CAP - 1) / DEFAULT_CAP;
    e.sum *= keep;
    e.weight *= keep;
  }
  e.sum += reward;
  e.weight += 1;
  e.samples = Math.min(DEFAULT_CAP, Math.round(e.weight));
  e.lastTick = tick;
  e.lastReward = reward;
  observations += 1;
  touch(key);
  return { key, samples: e.samples, mean: e.mean ?? (e.sum / e.weight), reward };
}

/**
 * 读取某状态-行动的结果估计。
 * @param {{ agentId?: string, action?: string, need?: string, tick?: number,
 *           halfLife?: number }} input
 * @returns {{ expected: number|null, confidence: number, samples: number, known: boolean, stale: boolean }}
 */
export function estimate(input = {}) {
  const key = keyOf(input.agentId, input.action, input.need);
  const e = table.get(key);
  if (e === undefined || e.weight <= 0) {
    return { expected: null, confidence: 0, samples: 0, known: false, stale: false };
  }
  touch(key);
  const tick = Number.isInteger(input.tick) ? input.tick : e.lastTick;
  const halfLife = (typeof input.halfLife === 'number' && input.halfLife > 0)
    ? input.halfLife : DEFAULT_HALF_LIFE;
  const age = Math.max(0, tick - e.lastTick);
  const decay = Math.pow(0.5, age / halfLife);
  const stale = age > halfLife * 2;
  const sampleFactor = Math.min(1, e.samples / MIN_SAMPLES);
  const confidence = stale ? 0 : sampleFactor * decay;
  const mean = e.sum / e.weight;
  return {
    expected: Math.max(-1, Math.min(1, mean)),
    confidence,
    samples: e.samples,
    known: true,
    stale,
  };
}

/**
 * 有界偏置：供打分函数直接相加。
 * 未知/过期证据 → 0（不是猜测值）。
 * @param {{ agentId?: string, action?: string, need?: string, tick?: number,
 *           weight?: number, halfLife?: number }} input
 * @returns {number} 有界偏置（|bias| ≤ weight）
 */
export function bias(input = {}) {
  const weight = (typeof input.weight === 'number' && Number.isFinite(input.weight) && input.weight >= 0)
    ? input.weight : 0.3;
  if (weight === 0) return 0;
  const est = estimate(input);
  if (est.known !== true || est.expected === null || est.confidence <= 0) return 0;
  return weight * est.expected * est.confidence;
}

/** 当前估计表大小（有界性断言用）。 */
export function size() {
  return table.size;
}

/** 观测总数（审计用）。 */
export function stats() {
  return { keys: table.size, observations, cap: DEFAULT_CAP, maxKeys: MAX_KEYS };
}

/** 快照（测试与审计用，深拷贝）。 */
export function snapshot() {
  const out = {};
  for (const [k, e] of table) {
    out[k] = {
      mean: e.weight > 0 ? e.sum / e.weight : 0,
      samples: e.samples,
      lastTick: e.lastTick,
      lastReward: e.lastReward,
    };
  }
  return out;
}

/** 复位全部证据（消融对照：清掉记忆后策略必须能改变）。 */
export function __reset() {
  table.clear();
  lru.clear();
  lruSeq = 0;
  observations = 0;
}


// ---- 持久化：结果学习证据表必须进存档 ----
//
// 本表是**逐 tick 累积的学习结果**（每次 observe 写入一条带符号 reward），
// 且直接参与打分（loop 以有界偏置形式调用 bias）。不入档则恢复后
// 「居民忘了所有经验」：同一状态下策略与连续运行分叉——实测续跑时
// 行动置信度从第 5 tick 起就与连续运行不同（0.690822 相同、其余 0.177→0.208…），
// 到第 6 tick 行动选择本身出现分歧（craft vs court）。
// 本模块只在内存里维护证据（无 graph 节点），因此必须显式入档。

/** 导出结果学习证据（表 + LRU 顺序 + 计数）。 */
export function __snapshot() {
  return {
    table: [...table.entries()].map(([k, v]) => [k, { ...v }]),
    lru: [...lru.entries()],
    lruSeq,
    observations,
  };
}

/**
 * 恢复结果学习证据（整体替换）。
 * @param {{table?: Array, lru?: Array, lruSeq?: number, observations?: number}} [data]
 */
export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('outcome-model.__restore: 状态必须为对象');
  }
  table.clear();
  lru.clear();
  for (const pair of (Array.isArray(data.table) ? data.table : [])) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    if (typeof pair[0] !== 'string' || pair[0] === '') continue;
    const e = pair[1];
    if (e === null || typeof e !== 'object') continue;
    table.set(pair[0], {
      sum: Number.isFinite(e.sum) ? e.sum : 0,
      weight: Number.isFinite(e.weight) ? e.weight : 0,
      samples: Number.isInteger(e.samples) ? e.samples : 0,
      lastTick: Number.isInteger(e.lastTick) ? e.lastTick : 0,
      lastReward: Number.isFinite(e.lastReward) ? e.lastReward : 0,
    });
  }
  for (const pair of (Array.isArray(data.lru) ? data.lru : [])) {
    if (Array.isArray(pair) && pair.length >= 2 && typeof pair[0] === 'string') lru.set(pair[0], pair[1]);
  }
  lruSeq = Number.isInteger(data.lruSeq) && data.lruSeq >= 0 ? data.lruSeq : 0;
  observations = Number.isInteger(data.observations) && data.observations >= 0 ? data.observations : 0;
  return { keys: table.size, observations };
}
