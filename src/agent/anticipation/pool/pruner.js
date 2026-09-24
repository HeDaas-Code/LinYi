/**
 * truman-town.agent.anticipation.pool.pruner — 候选修剪器 / Candidate Pruner
 *
 * 按动机（主导需求）与性格（特质标签）对候选行动池打分并裁剪（保留前 K 个），
 * 供决策链消费。动机项保留"饥饿优先进食 / 口渴优先饮水"的生存骨架，性格项
 * 引入个体差异（谨慎者偏休息、勤劳/好奇者偏采集）。
 */

import * as poolStore from './store.js';

/** 特质 → 行动偏好（仅在非饥饿/非口渴时起效，幅度远小于生存信号 +2）。 */
const TRAIT_BIAS = Object.freeze({
  cautious: Object.freeze({ rest: 0.5, forage: -0.2 }),
  curious: Object.freeze({ forage: 0.35 }),
  hardworking: Object.freeze({ forage: 0.5 }),
  resilient: Object.freeze({ forage: 0.2 }),
  sociable: Object.freeze({ rest: 0.2 }),
});

function baseOf(candidate) {
  return typeof candidate?.score === 'number' && Number.isFinite(candidate.score) ? candidate.score : 0;
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => (typeof t === 'string'
    ? { key: t, weight: 1 }
    : { key: String(t?.key ?? t), weight: typeof t?.weight === 'number' ? t.weight : 1 }));
}

function tagBias(action, tags) {
  let bias = 0;
  for (const t of normalizeTags(tags)) {
    const map = TRAIT_BIAS[t.key];
    if (map && typeof map[action] === 'number') bias += map[action] * t.weight;
  }
  return bias;
}

/**
 * 对单个候选打分：基础分 + 动机 + 性格。
 * @param {object} candidate
 * @param {{ dominantNeed?: string|null, level?: number, threshold?: number, tags?: Array }} [context]
 * @returns {number}
 */
export function score(candidate, context = {}) {
  let s = baseOf(candidate);
  const need = context.dominantNeed ?? null;
  const level = typeof context.level === 'number' ? context.level : 0;
  const threshold = typeof context.threshold === 'number' ? context.threshold : 0.4;
  const hungry = need === 'food' && level >= threshold;
  const thirsty = need === 'water' && level >= threshold;

  if (candidate?.action === 'eat' && hungry) s += 2;
  if (candidate?.action === 'drink' && thirsty) s += 2;
  // D0：饥饿/口渴时压抑非生存行动（生存优先骨架保持）；非饥饿时 forage 略高于
  // 非生存行动，但幅度已下调，使「制作/上工/社交」在温饱状态下能与采集竞争。
  if (candidate?.action === 'forage' && !hungry && !thirsty) s += 0.3;
  if (candidate?.action === 'rest' && !hungry && !thirsty) s += 0.2;
  // 库存门（D0 生存门，主判据）：人均库存低于阈值时，**采集优先于一切**。
  // 注意 needs 与资源库存是两套信号：库存见底时 needs 可能仍读 0（hungry=false），
  // 因此不能只靠 needs 判定，必须显式给 forage 加分并压低 rest（否则居民会饿死前还在休息）。
  if (context.survivalGate === true) {
    if (candidate?.action === 'forage') s += 3.0;
    if (candidate?.action === 'rest') s -= 1.0;
  }

  const NON_SURVIVAL = ['craft', 'build', 'write', 'work', 'trade', 'socialize', 'court'];
  if (NON_SURVIVAL.includes(candidate?.action)) {
    // 生存优先：饥饿/口渴时基础分折半（让 eat/drink 的 +2 稳定胜出，但不压成负数）。
    if (hungry || thirsty) s = baseOf(candidate) * 0.5;
    // 资源稀缺时进一步压抑非生存行动：**这是 D0 的关键生存门**。
    // 无此门时，居民会在水池见底前一直制作/建造，导致整镇渴死后崩溃（seed2 实测 alive=0）。
    const scarc = context.scarcity ?? {};
    const worst = Math.max(scarc.food ?? 0, scarc.water ?? 0);
    if (worst >= 0.5) s -= 2.0 * worst;
    // 库存门（D0 生存门，主判据）：人均库存不足阈值时非生存行动彻底让位于采集。
    if (context.survivalGate === true) s -= 5.0;
  }

  s += tagBias(candidate?.action, context.tags);
  return s;
}

/**
 * 裁剪候选池：打分并保留前 K 个。
 * @param {string} agentId
 * @param {Array<object>} [candidates] 候选列表；缺省读预想池 store
 * @param {{ k?: number, dominantNeed?: string|null, level?: number, threshold?: number, tags?: Array }} [options]
 * @returns {Array<object>} 候选（score 字段为最终评分）
 */
export function prune(agentId, candidates, options = {}) {
  const list = Array.isArray(candidates) ? candidates : poolStore.list(agentId);
  if (list.length === 0) return [];
  const k = Number.isInteger(options.k) && options.k > 0 ? options.k : 4;
  const scored = list.map((candidate) => ({
    ...candidate,
    score: score(candidate, options),
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aid = String(a.id ?? '');
    const bid = String(b.id ?? '');
    return aid < bid ? -1 : aid > bid ? 1 : 0;
  });
  return scored.slice(0, Math.min(k, scored.length));
}

/** 复位底层候选存储（测试用）。 */
export function __reset() {
  poolStore.__reset();
}
