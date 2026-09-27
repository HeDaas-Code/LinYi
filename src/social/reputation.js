/**
 * truman-town.social.reputation — 声誉系统 / Reputation
 *
 * 依据社交（发帖被回复/点赞/踩）与经济（履约交易/违约破产）行为更新个体声誉，
 * 并供行为反馈（治疗分诊优先级、信息流排序）读取。经济侧数据源为
 * economy.ledger.transaction 流水（由 _stage2 依据 ref 判定声誉增减）。
 *
 * 为消除逐次 update/query 反复 graph.read + structuredClone 深拷贝 64 条历史的
 * O(n·history) 热点（t53 性能回归根因之一），本模块额外维护一份按 agentId 的
 * 内存索引（byAgent），graph 仅作持久化落盘；读取走索引，写入照常落盘一次。
 * 与 episodic.store 的 ensureFresh()（graph.__generation() 失效）同款做法。
 */

import * as graph from '../infra/store/graph.js';

const TYPE = 'social.reputation';
const PREFIX = 'reputation:';
const INITIAL = 50;
const MIN = 0;
const MAX = 100;

function nodeId(agentId) {
  return PREFIX + agentId;
}

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('reputation: agentId 必须为非空字符串');
  }
}

function clamp(v) {
  return Math.max(MIN, Math.min(MAX, v));
}

function levelOf(score) {
  if (score >= 70) return 'trusted';
  if (score < 30) return 'distrusted';
  return 'neutral';
}

/** @type {Map<string, object>} agentId → 最新声誉记录（score / level / history）。 */
const byAgent = new Map();

/** 上次校验的 graph 复位代数；graph 被直接 __reset 时使本索引失效。 */
let lastGeneration = -1;

/** graph 被上层直接 __reset / __restore 后重建本派生索引（保证与图一致）。 */
function ensureFresh() {
  const gen = graph.__generation();
  if (gen !== lastGeneration) {
    rebuildFromGraph();
    lastGeneration = gen;
  }
}

/**
 * 从图重建索引。
 *
 * **为什么必须「重建」而不是「清空」**：graph 是事实来源，索引只是加速器。
 * 原实现只 clear() 不重建，于是任何一次 graph 复位（loop.reset / 存档恢复）之后，
 * 索引都是空的，而 query/list/scoreMap **只读索引**——调用方拿到的是
 * 「全城声誉 = 初始值」，而不是图里真实存着的分数。这是静默的数据丢失：
 * 实测恢复存档后 reputation.count 由 6 掉到 0、mean 由 48.85 变回 50。
 * 重建后索引与图重新一致，存档恢复（v1 档无 sections 时）也能自愈。
 *
 * 注意：history 只存内存（见 update 的落盘取舍），重建时无法从图恢复，
 * 故置空——完整的 history 由 __snapshot/__restore 在完整存档路径上保留。
 */
function rebuildFromGraph() {
  byAgent.clear();
  for (const node of graph.read({ type: TYPE })) {
    const d = node.data;
    if (!d || typeof d.agentId !== 'string' || d.agentId === '') continue;
    byAgent.set(d.agentId, {
      agentId: d.agentId,
      score: typeof d.score === 'number' ? d.score : INITIAL,
      level: typeof d.level === 'string' ? d.level : levelOf(typeof d.score === 'number' ? d.score : INITIAL),
      updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : 0,
      history: [],
    });
  }
}

// ---- 持久化：内存索引必须进存档（history 只在内存里） ----

/**
 * 导出声誉索引。
 *
 * 图里只有标量（score/level/updatedAt）；**history 只活在 byAgent**。
 * 不入档则恢复后历史归零（分数本身可由 rebuildFromGraph 自愈，但审计链断掉）。
 */
export function __snapshot() {
  return { byAgent: [...byAgent.entries()].map(([k, v]) => [k, structuredClone(v)]) };
}

/**
 * 恢复声誉索引（整体替换）。
 * 必须在 graph.__restore 之后调用，并把 lastGeneration 对齐到新代数。
 * @param {{byAgent?: Array}} [data]
 */
export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('reputation.__restore: 状态必须为对象');
  }
  byAgent.clear();
  for (const pair of (Array.isArray(data.byAgent) ? data.byAgent : [])) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    if (typeof pair[0] !== 'string' || pair[0] === '') continue;
    byAgent.set(pair[0], structuredClone(pair[1]));
  }
  lastGeneration = graph.__generation();
  return { agents: byAgent.size };
}

/**
 * 更新声誉：调用 social.reputation.update。
 * @param {{ agentId: string, delta?: number, reason?: string, tick?: number }} input
 * @returns {object} 更新后的声誉记录（含 score / level / history）
 */
export function update({ agentId, delta = 0, reason = null, tick = 0 } = {}) {
  assertAgentId(agentId);
  if (typeof delta !== 'number' || !Number.isFinite(delta)) {
    throw new TypeError('reputation.update: delta 必须为有限数值');
  }
  ensureFresh();
  const prev = byAgent.get(agentId);
  const before = prev && typeof prev.score === 'number' ? prev.score : INITIAL;
  const score = clamp(before + delta);
  const history = [
    ...(prev && Array.isArray(prev.history) ? prev.history : []),
    { delta, reason, tick, before, after: score },
  ].slice(-64);
  const record = {
    agentId,
    score,
    level: levelOf(score),
    updatedAt: Date.now(),
    history,
  };
  byAgent.set(agentId, record);
  // 落盘仅保留标量（不含 history）：避免每次 update 深拷贝 64 条历史。
  // history 仅存于内存索引 byAgent，query/list/scoreMap 都走索引，不读图。
  graph.write({ id: nodeId(agentId), type: TYPE, data: { agentId, score, level: record.level, updatedAt: record.updatedAt } });
  // record 为本次新建对象，直接返回即可（避免冗余 clone）。
  return record;
}

/**
 * 查询个体声誉：调用 social.reputation.query。
 * @param {{ agentId: string }} input
 * @returns {object} { agentId, score, level, history }
 */
export function query({ agentId } = {}) {
  assertAgentId(agentId);
  ensureFresh();
  const rec = byAgent.get(agentId);
  if (rec) return { ...rec, history: rec.history.slice() };
  return { agentId, score: INITIAL, level: 'neutral', history: [] };
}

/** 列出全部已登记声誉记录（辅助，供分布统计）。 */
export function list() {
  ensureFresh();
  return [...byAgent.values()].map((r) => ({ ...r, history: r.history.slice() }));
}

/**
 * 一次性读取全部声誉分数（Map<agentId, score>）。
 * 供信息流排序等批量场景使用：一次取全量，避免逐帖反复 query 造成的
 * 逐次 graph.read + structuredClone 热点（t53 性能回归根因）。
 */
export function scoreMap() {
  ensureFresh();
  const map = new Map();
  for (const [agentId, rec] of byAgent) map.set(agentId, rec.score);
  return map;
}

/** 复位底层 graph store（测试用）。 */
export function __reset() {
  byAgent.clear();
  graph.__reset();
}
