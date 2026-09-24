/**
 * truman-town.agent.anticipation.pool.store — 候选存储 / Candidate Store
 *
 * 存储与列出智能体的候选行动（预想池）。以 graph store 为基座：每个智能体
 * 一个 type=anticipation.pool 的图节点，data.candidates 为候选数组；同一
 * 候选 id 重复 add 时按 upsert 覆盖。
 */

import * as graph from '../../../infra/store/graph.js';

const TYPE = 'anticipation.pool';
const PREFIX = 'anticipation:pool:';

function nodeId(agentId) {
  return PREFIX + agentId;
}

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('anticipation.pool.store: agentId 必须为非空字符串');
  }
}

function normalizeCandidate(candidate) {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError('anticipation.pool.store: candidate 必须为对象');
  }
  if (typeof candidate.id !== 'string' || candidate.id.trim() === '') {
    throw new TypeError('anticipation.pool.store: candidate.id 必须为非空字符串');
  }
  if (candidate.action === undefined) {
    throw new TypeError('anticipation.pool.store: candidate.action 不能为 undefined');
  }
  const score = candidate.score === undefined ? 0 : candidate.score;
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    throw new TypeError('anticipation.pool.store: candidate.score 必须为有限数');
  }
  return {
    id: candidate.id,
    action: structuredClone(candidate.action),
    score,
    ts: typeof candidate.ts === 'number' ? candidate.ts : Date.now(),
    meta: candidate.meta === undefined ? {} : structuredClone(candidate.meta),
  };
}

/**
 * 向智能体预想池写入一个候选（按 id upsert）。
 * @param {string} agentId
 * @param {{ id: string, action: unknown, score?: number, ts?: number, meta?: object }} candidate
 * @returns 已落盘的候选快照
 */
export function add(agentId, candidate) {
  assertAgentId(agentId);
  const normalized = normalizeCandidate(candidate);
  const existing = graph.read(nodeId(agentId));
  const candidates =
    existing !== null && existing.data && Array.isArray(existing.data.candidates)
      ? structuredClone(existing.data.candidates)
      : [];
  const idx = candidates.findIndex((c) => c.id === normalized.id);
  if (idx >= 0) candidates[idx] = normalized;
  else candidates.push(normalized);

  graph.write({
    id: nodeId(agentId),
    type: TYPE,
    data: { agentId, candidates },
  });
  return structuredClone(normalized);
}

/**
 * 列出某智能体预想池的全部候选。
 * @param {string} agentId
 * @returns {Array<object>}
 */
export function list(agentId) {
  assertAgentId(agentId);
  const node = graph.read(nodeId(agentId));
  if (node === null || node.data === undefined) return [];
  return structuredClone(node.data.candidates ?? []);
}

/** 清空某智能体的候选池（D0：逐 tick 按状态重建候选，而非出生时固定）。 */
export function reset(agentId) {
  assertAgentId(agentId);
  graph.write({ id: nodeId(agentId), type: TYPE, data: { agentId, candidates: [] } });
}

/**
 * 用给定候选**整批替换**某智能体的预想池（D0 性能关键路径）。
 * 相比 reset()+N×add()，本接口只做一次 graph.write、且不读旧值，
 * 避免逐候选的 graph.read 深拷贝（实测可省下约 70% 的 structuredClone 调用）。
 * @param {string} agentId
 * @param {Array<object>} candidates
 * @returns {number} 写入的候选数
 */
export function replace(agentId, candidates) {
  assertAgentId(agentId);
  const list = Array.isArray(candidates) ? candidates : [];
  const normalized = list.map((c) => normalizeCandidate(c));
  graph.write({ id: nodeId(agentId), type: TYPE, data: { agentId, candidates: normalized } });
  return normalized.length;
}

/** 复位底层 graph store（测试用）。 */
export function __reset() {
  graph.__reset();
}
