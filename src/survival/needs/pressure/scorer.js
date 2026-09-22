/**
 * truman-town.survival.needs.pressure.scorer — 压力评分器 / Pressure Scorer
 *
 * 综合需求缺口（meter 水平）与资源稀缺度给每个居民评分：单类因子
 * factor = level × (1 + scarcity) × weight，总分 score 为各类因子之和，
 * 并归一化到 [0, 1]。score 越高代表生存压力越大，供 ranker 排序与
 * agent.decision.context 把压力接入决策（decision 侧对 pressure 源加权 ×1.5）。
 */

import * as meter from '../meter.js';

const DEFAULT_WEIGHTS = Object.freeze({ food: 1, water: 1 });

function num(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * 计算单类需求因子的压力贡献。
 * @param {{ need?: string, level?: number, scarcity?: number, weight?: number }} input
 * @returns {number} level × (1 + scarcity) × weight
 */
export function factor(input = {}) {
  const level = Math.max(0, num(input?.level));
  const scarcity = Math.max(0, num(input?.scarcity));
  const weight = Math.max(0, num(input?.weight, 1));
  return level * (1 + scarcity) * weight;
}

/**
 * 给单个居民评分。
 * @param {{
 *   agentId?: string,
 *   needs?: Record<string, number>,
 *   scarcity?: Record<string, number>,
 *   weights?: Record<string, number>
 * }} [input] needs/scarcity 缺省时从 meter.query(agentId) 读取
 * @returns {{ agentId: string | null, score: number, normalized: number,
 *             factors: Record<string, number>, needs: object, scarcity: object }}
 */
export function score(input = {}) {
  let needs = input?.needs;
  let scarcity = input?.scarcity;
  const agentId = input?.agentId ?? null;

  if (needs === undefined || scarcity === undefined) {
    if (agentId === null || agentId === '') {
      throw new TypeError('scorer.score: 需要 agentId，或显式提供 needs 与 scarcity');
    }
    const q = meter.query({ agentId });
    needs = q.needs;
    scarcity = q.scarcity;
  }

  const weights = { ...DEFAULT_WEIGHTS, ...(input?.weights ?? {}) };
  const factors = {};
  let total = 0;
  let maxTotal = 0;

  const keys = new Set([...Object.keys(needs ?? {}), ...Object.keys(scarcity ?? {})]);
  for (const key of [...keys].sort()) {
    const level = num(needs?.[key]);
    const sc = num(scarcity?.[key]);
    const weight = num(weights[key], 1);
    const f = factor({ need: key, level, scarcity: sc, weight });
    factors[key] = f;
    total += f;
    maxTotal += 2 * weight; // 每类因子上限：1 × (1 + 1) × weight
  }

  const normalized = maxTotal > 0 ? Math.max(0, Math.min(1, total / maxTotal)) : 0;
  return {
    agentId,
    score: total,
    normalized,
    factors,
    needs: { ...(needs ?? {}) },
    scarcity: { ...(scarcity ?? {}) },
  };
}
