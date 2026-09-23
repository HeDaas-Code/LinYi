/**
 * truman-town.agent.memory.episodic.recaller — 情景召回 / Episodic Recaller
 *
 * 按标签、时间窗口召回情景记忆，并按显著性 + 时间衰减 + 标签重合度排序。
 *
 * 性能：recall 通过 store._rawList() 读取该主体记忆的只读追加数组（不深拷贝
 * 全量），并用有界 top-K（limit ≤ 若干条）选出得分最高的若干条，最后仅对命中
 * 条目做一次深拷贝——避免每 tick 深拷贝全部记忆导致的 O(t²) 增长。
 */

import * as store from './store.js';

const { DEFAULT_HALFLIFE } = store;

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

/** 分数降序，分数相同按 ts 升序（与 rank 的全排序比较器一致）。 */
function compareScoreDesc(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  return (a.memory.ts ?? 0) - (b.memory.ts ?? 0);
}

/** a 是否严格优于 b（分数更高，或分数相同但 ts 更早）。 */
function isBetter(a, b) {
  if (a.score !== b.score) return a.score > b.score;
  return (a.memory.ts ?? 0) < (b.memory.ts ?? 0);
}

/** 有界 top-K：只保留得分最高的 k 条（结果顺序与 rank 一致，线性插入免每步 sort）。 */
function topK(memories, k, options) {
  const {
    queryTags = [],
    now = Date.now(),
    halflife = DEFAULT_HALFLIFE,
    salienceWeight = 1,
    recencyWeight = 0.5,
    tagWeight = 1,
  } = options;
  // 半衰期为默认值时，用写入时预计算的 _recencyKey 免去每条记忆一次 Math.exp。
  const fastRecency = halflife === DEFAULT_HALFLIFE;
  const nowFactor = fastRecency ? Math.exp(-now / halflife) : 0;
  const top = []; // 按分数降序（分数相同 ts 升序）维护，长度 ≤ k
  for (const memory of memories) {
    const salience = typeof memory.salience === 'number' ? memory.salience : 0;
    const ts = typeof memory.ts === 'number' ? memory.ts : now;
    let recency;
    if (fastRecency && typeof memory._recencyKey === 'number' && ts <= now) {
      recency = memory._recencyKey * nowFactor;
    } else {
      recency = Math.exp(-Math.max(0, now - ts) / halflife);
    }
    const score = salienceWeight * salience + recencyWeight * recency + tagWeight * tagOverlap(memory.tags, queryTags);
    const item = { memory, score };
    let i = top.length;
    while (i > 0 && isBetter(item, top[i - 1])) i -= 1;
    if (i < k) {
      top.splice(i, 0, item);
      if (top.length > k) top.length = k;
    }
  }
  return top.map((entry) => entry.memory);
}

/**
 * 召回某智能体的情景记忆。
 * @param {string} agentId
 * @param {{ tags?: string[], since?: number, limit?: number, now?: number, halflife?: number, salienceWeight?: number, recencyWeight?: number, tagWeight?: number }} [options]
 * @returns {Array<object>}
 */
export function recall(agentId, options = {}) {
  const queryTags = Array.isArray(options.tags) ? options.tags.map(String) : [];
  const since = typeof options.since === 'number' ? options.since : undefined;
  const limit = Number.isInteger(options.limit) && options.limit >= 0 ? options.limit : undefined;

  const raw = store._rawList(agentId);
  const filtered = [];
  for (const memory of raw) {
    if (since !== undefined && (memory.ts ?? 0) < since) continue;
    if (queryTags.length > 0 && !(memory.tags ?? []).some((t) => queryTags.includes(t))) continue;
    filtered.push(memory);
  }

  const opts = {
    queryTags,
    now: options.now,
    halflife: options.halflife,
    salienceWeight: options.salienceWeight,
    recencyWeight: options.recencyWeight,
    tagWeight: options.tagWeight,
  };

  let result;
  if (limit === 0) {
    return [];
  } else if (limit !== undefined && limit < filtered.length) {
    result = topK(filtered, limit, opts);
  } else {
    result = rank(filtered, opts).map((entry) => entry.memory);
    if (limit !== undefined) result = result.slice(0, limit);
  }

  // 只对命中的条目深拷贝，保持"返回独立快照"的既有语义。
  return structuredClone(result);
}

/**
 * 对情景记忆按综合评分降序排序（分数相同按 ts 升序）。
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
  scored.sort(compareScoreDesc);
  return scored;
}

/** 复位底层情景存储（测试用）。 */
export function __reset() {
  store.__reset();
}
