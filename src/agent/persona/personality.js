/**
 * truman-town.agent.persona.personality — 性格 / Personality
 *
 * 依赖 agent.traits.tagset，把 50 个特质映射为连续性格维度（冒险性/社交性/
 * 勤勉度/谨慎度/慷慨度），evaluate 对候选行动按性格打分。维度由少数"特有
 * 特质"驱动（base* 为中性底），因此不同种子的特质采样会自然产生性格分叉。
 *
 * RPC：agent.persona.personality.profile / evaluate
 */

import * as tagsetStore from '../traits/tagset/store.js';

/** 维度 → 正向/负向特质键。 */
const DIMENSIONS = {
  adventurous: { pos: ['brave', 'curious'], neg: ['timid', 'cautious'] },
  sociable: { pos: ['sociable', 'kind', 'loyal'], neg: ['cruel'] },
  industrious: { pos: ['hardworking', 'diligent'], neg: ['lazy'] },
  cautious: { pos: ['cautious', 'patient'], neg: ['impulsive', 'brave'] },
  generous: { pos: ['generous', 'kind'], neg: ['greedy'] },
};

/** 行动 → 维度权重（性格对行动倾向的小幅修正，不会盖过生存需求）。 */
const ACTION_AFFINITY = {
  forage: { adventurous: 0.4, industrious: 0.3, cautious: -0.1 },
  rest: { cautious: 0.5, industrious: -0.3 },
  eat: {},
  drink: {},
};

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('persona.personality: agentId 必须为非空字符串');
  }
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function weightMap(tags) {
  const m = new Map();
  for (const t of tags ?? []) m.set(t.key, t.weight);
  return m;
}

/**
 * 计算单个性格维度（0..1，0.5 为中性）。
 */
function dimensionScore(weights, pos, neg) {
  let raw = 0;
  for (const k of pos) raw += weights.get(k) ?? 0;
  for (const k of neg) raw -= weights.get(k) ?? 0;
  return clamp01(0.5 + 0.2 * raw);
}

/**
 * 生成性格画像：50 特质 → 连续维度 + 主导维度。
 * @param {string} agentId
 * @returns {object|null} 无标签集返回 null
 */
export function profile(agentId) {
  assertAgentId(agentId);
  const tagset = tagsetStore.get(agentId);
  if (tagset === null) return null;
  const weights = weightMap(tagset.tags);
  const dimensions = {};
  for (const [name, { pos, neg }] of Object.entries(DIMENSIONS)) {
    dimensions[name] = dimensionScore(weights, pos, neg);
  }
  const dominant = Object.entries(dimensions).sort((a, b) => b[1] - a[1])[0][0];
  return { agentId, dimensions, dominant, tagCount: tagset.tags.length };
}

/**
 * 对候选行动按性格打分（小幅修正，范围约 [-0.5, 0.5]）。
 * @param {string} agentId
 * @param {string} action
 * @returns {number}
 */
export function evaluate(agentId, action) {
  assertAgentId(agentId);
  const p = profile(agentId);
  if (p === null) return 0;
  const affinity = ACTION_AFFINITY[action] ?? {};
  let score = 0;
  for (const [dim, w] of Object.entries(affinity)) {
    score += (p.dimensions[dim] ?? 0.5) * w;
  }
  return score;
}

/** 复位依赖（tagset store 由 agent.__reset 统一复位）。 */
export function __reset() {}
