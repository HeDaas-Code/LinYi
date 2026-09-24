/**
 * truman-town.social.reputation — 声誉系统 / Reputation
 *
 * 依据社交（发帖被回复/点赞/踩）与经济（履约交易/违约破产）行为更新个体声誉，
 * 并供行为反馈（治疗分诊优先级、信息流排序）读取。经济侧数据源为
 * economy.ledger.transaction 流水（由 _stage2 依据 ref 判定声誉增减）。
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

function clone(v) {
  return v === undefined ? undefined : structuredClone(v);
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
  const prevNode = graph.read(nodeId(agentId));
  const before = prevNode && prevNode.data && typeof prevNode.data.score === 'number'
    ? prevNode.data.score
    : INITIAL;
  const score = clamp(before + delta);
  const history = [
    ...(prevNode && prevNode.data && Array.isArray(prevNode.data.history) ? prevNode.data.history : []),
    { delta, reason, tick, before, after: score },
  ].slice(-64);
  const record = {
    agentId,
    score,
    level: levelOf(score),
    updatedAt: Date.now(),
    history,
  };
  graph.write({ id: nodeId(agentId), type: TYPE, data: record });
  return clone(record);
}

/**
 * 查询个体声誉：调用 social.reputation.query。
 * @param {{ agentId: string }} input
 * @returns {object} { agentId, score, level, history }
 */
export function query({ agentId } = {}) {
  assertAgentId(agentId);
  const node = graph.read(nodeId(agentId));
  if (node && node.data) return clone(node.data);
  return { agentId, score: INITIAL, level: 'neutral', history: [] };
}

/** 列出全部已登记声誉记录（辅助，供分布统计）。 */
export function list() {
  return graph.read({ type: TYPE }).map((n) => clone(n.data)).filter(Boolean);
}

/** 复位底层 graph store（测试用）。 */
export function __reset() {
  graph.__reset();
}
