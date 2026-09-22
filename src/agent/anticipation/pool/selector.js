/**
 * truman-town.agent.anticipation.pool.selector — 候选选择器 / Candidate Selector
 *
 * 根据模拟评分从预想池中选择候选行动并生成短名单。默认使用候选自带 score，
 * 也可传入 scoreFn(candidate) 重新评分。
 */

import * as poolStore from './store.js';

function scoreOf(candidate, scoreFn) {
  if (typeof scoreFn === 'function') {
    const s = scoreFn(candidate);
    return typeof s === 'number' && Number.isFinite(s) ? s : 0;
  }
  return typeof candidate.score === 'number' && Number.isFinite(candidate.score) ? candidate.score : 0;
}

function byScoreDesc(a, b) {
  if (a.score !== b.score) return b.score - a.score;
  const aid = String(a.id ?? '');
  const bid = String(b.id ?? '');
  return aid < bid ? -1 : aid > bid ? 1 : 0;
}

/**
 * 生成按评分降序的候选短名单。
 * @param {string} agentId
 * @param {{ limit?: number, scoreFn?: (candidate: object) => number }} [options]
 * @returns {Array<object>} 候选（score 字段为最终评分）
 */
export function shortlist(agentId, options = {}) {
  const limit = options.limit ?? 3;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError('anticipation.pool.selector.shortlist: limit 必须为正整数');
  }
  const scored = poolStore.list(agentId).map((candidate) => ({
    ...candidate,
    score: scoreOf(candidate, options.scoreFn),
  }));
  scored.sort(byScoreDesc);
  return scored.slice(0, limit);
}

/**
 * 选择评分最高的单个候选。
 * @param {string} agentId
 * @param {{ scoreFn?: (candidate: object) => number }} [options]
 * @returns {object | null}
 */
export function select(agentId, options = {}) {
  const top = shortlist(agentId, { ...options, limit: 1 });
  return top.length === 0 ? null : top[0];
}

/** 复位底层候选存储（测试用）。 */
export function __reset() {
  poolStore.__reset();
}
