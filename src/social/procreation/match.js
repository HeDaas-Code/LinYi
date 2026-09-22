/**
 * truman-town.social.procreation.match — 配对评估 / Match Evaluation
 *
 * 评估恋爱双方的繁衍契合度（特质相似度 + 恋爱纽带强度），并从候选名单
 * 生成按契合度排序的配对。
 */

import * as tagsetStore from '../../agent/traits/tagset/store.js';
import * as romance from '../relationship/romance.js';

function keySet(tags) {
  return new Set((tags ?? []).map((t) => t.key));
}

function jaccard(aKeys, bKeys) {
  if (aKeys.size === 0 && bKeys.size === 0) return 0;
  let inter = 0;
  for (const k of aKeys) if (bKeys.has(k)) inter += 1;
  const union = aKeys.size + bKeys.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * 评估一对智能体的繁衍契合度。
 * @param {{ a: string, b: string }} input
 * @returns {{ a: string, b: string, score: number, compatible: boolean, tagSimilarity: number, bondState: string, bondStrength: number }}
 */
export function evaluate({ a, b } = {}) {
  const ta = tagsetStore.get(a);
  const tb = tagsetStore.get(b);
  const tagSimilarity = jaccard(keySet(ta ? ta.tags : null), keySet(tb ? tb.tags : null));
  const bondState = romance.state({ a, b });
  const bondStrength = bondState === 'paired' ? 0.6 : bondState === 'proposed' ? 0.3 : 0;
  const score = Math.max(0, Math.min(1, 0.7 * tagSimilarity + 0.3 * bondStrength));
  return {
    a,
    b,
    score,
    compatible: score >= 0.3,
    tagSimilarity,
    bondState,
    bondStrength,
  };
}

/**
 * 从候选名单生成按契合度降序的前 k 对。
 * @param {{ agentIds?: string[], k?: number, threshold?: number }} input
 * @returns {Array<object>}
 */
export function pair({ agentIds = [], k = 1, threshold = 0 } = {}) {
  if (!Array.isArray(agentIds)) throw new TypeError('match.pair: agentIds 必须为数组');
  const ids = [...new Set(agentIds)];
  const pairs = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const r = evaluate({ a: ids[i], b: ids[j] });
      if (r.score >= threshold) pairs.push(r);
    }
  }
  pairs.sort((x, y) => y.score - x.score || (x.a < y.a ? -1 : x.a > y.a ? 1 : 0));
  return pairs.slice(0, k);
}

/** 复位底层状态（测试用）。 */
export function __reset() {
  romance.__reset();
}
