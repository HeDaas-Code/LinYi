/**
 * truman-town.agent.memory.episodic.recaller — 情景召回 / Episodic Recaller
 *
 * 按标签、时间窗口召回情景记忆，并按显著性 + 时间衰减 + 标签重合度排序。
 */

import * as store from './store.js';

function tagOverlap(memoryTags, queryTags) {
  if (queryTags.length === 0) return 0;
  const set = new Set(memoryTags ?? []);
  let hit = 0;
  for (const tag of queryTags) if (set.has(tag)) hit += 1;
  return hit / queryTags.length;
}

function scoreMemory(memory, options) {
  const {
    queryTags = [],
    now = Date.now(),
    halflife = 86400000,
    salienceWeight = 1,
    recencyWeight = 0.5,
    tagWeight = 1,
  } = options;
  const salience = typeof memory.salience === 'number' ? memory.salience : 0;
  const ts = typeof memory.ts === 'number' ? memory.ts : now;
  const recency = Math.exp(-Math.max(0, now - ts) / halflife);
  return salienceWeight * salience + recencyWeight * recency + tagWeight * tagOverlap(memory.tags, queryTags);
}

/**
 * 召回某智能体的情景记忆。
 * @param {string} agentId
 * @param {{ tags?: string[], since?: number, limit?: number, now?: number }} [options]
 * @returns {Array<object>}
 */
export function recall(agentId, options = {}) {
  const queryTags = Array.isArray(options.tags) ? options.tags.map(String) : [];
  const since = typeof options.since === 'number' ? options.since : undefined;
  let memories = store.list(agentId);
  if (since !== undefined) memories = memories.filter((m) => (m.ts ?? 0) >= since);
  if (queryTags.length > 0) {
    memories = memories.filter((m) => (m.tags ?? []).some((t) => queryTags.includes(t)));
  }
  const ranked = rank(memories, {
    queryTags,
    now: options.now,
    halflife: options.halflife,
    salienceWeight: options.salienceWeight,
    recencyWeight: options.recencyWeight,
    tagWeight: options.tagWeight,
  });
  const out = ranked.map((entry) => entry.memory);
  if (Number.isInteger(options.limit) && options.limit >= 0) return out.slice(0, options.limit);
  return out;
}

/**
 * 对情景记忆按综合评分降序排序。
 * @param {Array<object>} memories
 * @param {{ queryTags?: string[], now?: number, halflife?: number, salienceWeight?: number, recencyWeight?: number, tagWeight?: number }} [options]
 * @returns {Array<{ memory: object, score: number }>}
 */
export function rank(memories, options = {}) {
  const list = Array.isArray(memories) ? memories : [];
  const queryTags = Array.isArray(options.queryTags) ? options.queryTags.map(String) : [];
  const scored = list.map((memory) => ({
    memory,
    score: scoreMemory(memory, { ...options, queryTags }),
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.memory.ts ?? 0) - (b.memory.ts ?? 0);
  });
  return scored;
}

/** 复位底层情景存储（测试用）。 */
export function __reset() {
  store.__reset();
}
