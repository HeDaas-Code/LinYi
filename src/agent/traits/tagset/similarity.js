/**
 * truman-town.agent.traits.tagset.similarity — 特质相似度 / Tag Similarity
 *
 * 基于 50 维特质权重向量计算个体间余弦相似度（compare），并检索最近邻
 * （neighbors），供择偶/结社复用。compare 对 a/b 对称；邻居排除自身。
 *
 * RPC：agent.traits.tagset.similarity.compare / neighbors
 */

import * as tagsetStore from './store.js';

function assertAgentId(agentId, label) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('tagset.similarity: ' + label + ' 必须为非空字符串');
  }
}

function vector(tags) {
  const v = new Map();
  for (const t of tags ?? []) v.set(t.key, t.weight);
  return v;
}

/**
 * 计算两个智能体的特质余弦相似度（0..1）。
 * @param {{ a: string, b: string }} input
 * @returns {{ a: string, b: string, similarity: number }}
 */
export function compare({ a, b } = {}) {
  assertAgentId(a, 'a');
  assertAgentId(b, 'b');
  const ta = tagsetStore.get(a);
  const tb = tagsetStore.get(b);
  const va = vector(ta === null ? [] : ta.tags);
  const vb = vector(tb === null ? [] : tb.tags);
  const keys = new Set([...va.keys(), ...vb.keys()]);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const k of keys) {
    const x = va.get(k) ?? 0;
    const y = vb.get(k) ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return { a, b, similarity: 0 };
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return { a, b, similarity: denom === 0 ? 0 : dot / denom };
}

/**
 * 在候选集中检索与 target 最相似的 top-k 个邻居（排除自身，按相似度降序）。
 * @param {{ agentId: string, candidates?: string[], k?: number }} input
 * @returns {Array<{ agentId: string, similarity: number }>}
 */
export function neighbors({ agentId, candidates = [], k = 3 } = {}) {
  assertAgentId(agentId, 'agentId');
  if (!Array.isArray(candidates)) throw new TypeError('tagset.similarity.neighbors: candidates 必须为数组');
  const count = Math.floor(k);
  if (!Number.isFinite(count) || count < 0) throw new RangeError('tagset.similarity.neighbors: k 必须为非负整数');
  const out = [];
  for (const c of new Set(candidates)) {
    if (c === agentId) continue;
    const { similarity } = compare({ a: agentId, b: c });
    out.push({ agentId: c, similarity });
  }
  out.sort((x, y) => y.similarity - x.similarity || (x.agentId < y.agentId ? -1 : x.agentId > y.agentId ? 1 : 0));
  return out.slice(0, count);
}

/** 复位依赖（tagset store 由 agent.__reset 统一复位）。 */
export function __reset() {}
