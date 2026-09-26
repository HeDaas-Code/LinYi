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
  // **生存骨架免疫截断**（与 pruner.prune 同一原则）。
  // 这是更靠前的一道闸（shortlist 先于 prune），必须同时豁免，
  // 否则只修 pruner 仍会看到骨架缺席的窗口。
  const SURVIVAL = ['eat', 'drink', 'rest', 'forage'];
  const reserved = scored.filter((c) => SURVIVAL.includes(c.action));
  const others = scored.filter((c) => !SURVIVAL.includes(c.action));
  // **发展行动也预留名额**：found 是企业涌现的唯一入口，
  // 而它的基础分（0.6）在 craft(0.9)/build(0.8)/trade(0.8)/court(0.85) 之后，
  // 与它们争 6 席时必然垫底出局 → biz 恒为 0、涌现消失。
  // 实测：仅豁免生存骨架时，窗口是 [rest,forage,drink,eat,craft,build]，found 缺席。
  // 因此给「创办企业」一个独立席位——它需要的是**可见性**，
  // 是否真选仍由 scoreAction 按市场需求与自身余额决定。
  // 生物性（found=谋生创业）与 社会性（socialize=结社交谈）各留一席。
  // socialize 的被挤占是实测问题：豁免骨架后 12 人 20 tick 的小局里 4 席全被
  // 骨架占满，socialize 出局 → 社交边无从产生（wiring 测试失败）。
  // 社交是「小镇」这一设定的核心，不该因生存保护而消失。
  // court/accept 是**有时间窗口**的行动（对方在等答复，错过就散），
  // 且是生育的唯一入口 —— 被挤出窗口会让「迭代繁衍」这一核心目标失效。
  // 实测：仅有 found/socialize 席位时，3 人 60 tick 局里子女数恒为 0。
  const DEVELOPMENT = ['found', 'socialize', 'court', 'accept'];
  const devCandidates = others.filter((c) => DEVELOPMENT.includes(c.action) && (options.devBudget ?? 1) > 0);
  const devPicked = devCandidates.slice(0, DEVELOPMENT.length);
  const restOthers = others.filter((c) => !devPicked.includes(c));
  const room = Math.max(0, limit - reserved.length - devPicked.length);
  return [...reserved, ...devPicked, ...restOthers.slice(0, room)];
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
