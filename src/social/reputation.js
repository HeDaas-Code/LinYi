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

/** graph 被上层直接 __reset 后重建本派生索引（保证与图一致）。 */
function ensureFresh() {
  const gen = graph.__generation();
  if (gen !== lastGeneration) {
    byAgent.clear();
    lastGeneration = gen;
  }
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
