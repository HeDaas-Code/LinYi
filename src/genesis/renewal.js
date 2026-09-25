/**
 * truman-town.genesis.renewal — 文明重启评估与替换。
 *
 * 回答两个问题：
 * - **evaluate**：这一代文明还剩多少活力？该不该重启？
 * - **replace**：若该重启，把当前世代封存为「文明遗产」并以新一代替换。
 *
 * 设计取舍：
 * - **评估是多因子加权，不是单一阈值**：存活率、人口、建筑存量、技术留存、
 *   社会连通度各占一份权重。"人还活着"不等于"文明还在"——
 *   全员存活但技术尽失、建筑全毁，同样应当重启。反之亦然。
 * - **不自动触发**：evaluate 只给出判断与依据，是否重启由调用方（观察者/用户）
 *   决定。文明重启是不可逆的大动作，不应藏在主循环的副作用里。
 * - **替换是"封存 + 交棒"**：旧世代的遗产先归档（legacy.graph/summary），
 *   再注入新一代。任一步失败都不做替换，避免"重启到一半"。
 */

import * as registry from '../runtime/registry.js';
import * as agent from '../agent/index.js';
import * as civilization from '../civilization/index.js';

/** 评估维度与权重（合计 1.0）。 */
export const WEIGHTS = Object.freeze({
  survival: 0.30,
  population: 0.20,
  structure: 0.20,
  knowledge: 0.15,
  cohesion: 0.15,
});

function clamp01(v) {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * 评估当前文明的活力。
 *
 * @param {{ initialPopulation?: number, structures?: number, structuresTarget?: number,
 *           technologies?: number, technologiesTarget?: number, socialEdges?: number,
 *           socialEdgesTarget?: number, tick?: number, threshold?: number }} [input]
 * @returns {{ score: number, verdict: string, shouldRestart: boolean, factors: object, reasons: string[] }}
 */
export function evaluate(input = {}) {
  const residents = registry.lookup({ type: 'agent' });
  const alive = residents.filter((r) => (r.data ?? {}).alive !== false).length;
  const total = residents.length;

  const initialPopulation = Number.isInteger(input.initialPopulation) && input.initialPopulation > 0
    ? input.initialPopulation
    : Math.max(1, total);

  const survival = total > 0 ? alive / total : 0;
  const population = clamp01(alive / initialPopulation);

  const structures = Number.isInteger(input.structures) && input.structures >= 0 ? input.structures : 0;
  const structuresTarget = Number.isInteger(input.structuresTarget) && input.structuresTarget > 0 ? input.structuresTarget : 5;
  const structure = clamp01(structures / structuresTarget);

  const technologies = Number.isInteger(input.technologies) && input.technologies >= 0 ? input.technologies : 0;
  const techTarget = Number.isInteger(input.technologiesTarget) && input.technologiesTarget > 0 ? input.technologiesTarget : 5;
  const knowledge = clamp01(technologies / techTarget);

  const edges = Number.isInteger(input.socialEdges) && input.socialEdges >= 0 ? input.socialEdges : 0;
  const edgesTarget = Number.isInteger(input.socialEdgesTarget) && input.socialEdgesTarget > 0
    ? input.socialEdgesTarget : Math.max(1, alive);
  const cohesion = clamp01(edges / edgesTarget);

  const factors = { survival, population, structure, knowledge, cohesion };
  const score = Object.entries(WEIGHTS).reduce((s, [k, w]) => s + w * factors[k], 0);
  const threshold = typeof input.threshold === 'number' && input.threshold >= 0 && input.threshold <= 1
    ? input.threshold : 0.35;

  const reasons = [];
  if (alive === 0) reasons.push('无存活居民');
  if (factors.survival < 0.5) reasons.push('存活率跌至 ' + (survival * 100).toFixed(0) + '%');
  if (factors.knowledge === 0) reasons.push('技术尽失');
  if (factors.structure === 0) reasons.push('建筑无存');
  if (factors.cohesion < 0.2 && alive > 1) reasons.push('社会联系近乎断绝');

  return {
    tick: Number.isInteger(input.tick) ? input.tick : 0,
    score,
    threshold,
    shouldRestart: score < threshold,
    verdict: score < threshold ? '应当重启' : (score < threshold * 1.5 ? '勉强维系' : '文明延续中'),
    factors,
    weights: { ...WEIGHTS },
    alive,
    total,
    reasons,
  };
}

/**
 * 把当前世代封存并交棒给新一代。
 *
 * @param {{ civilizationId?: string, tick?: number, nextTick?: number,
 *           nextSeed?: number, nextConfig?: object, evaluation?: object,
 *           residents?: Array<{ name: string, templateId?: string }> }} [input]
 * @returns {{ replaced: boolean, heritage: object|null, generation: number, spawned: Array<object> }}
 */
export function replace(input = {}) {
  const tick = Number.isInteger(input.tick) ? input.tick : 0;
  const evaluation = input.evaluation ?? evaluate({ tick });
  const civilizationId = typeof input.civilizationId === 'string' && input.civilizationId !== ''
    ? input.civilizationId : 'civ';

  // 1) 归档：把当前世代的遗产写成图与摘要。失败则不替换。
  let heritage = null;
  try {
    heritage = civilization.legacy.graph.build({
      civilizationId,
      label: '第 ' + (Number.isInteger(input.generation) ? input.generation : 1) + ' 世代',
      evaluation,
      tick,
    });
  } catch (err) {
    return {
      replaced: false,
      heritage: null,
      generation: Number.isInteger(input.generation) ? input.generation : 1,
      spawned: [],
      reason: '遗产归档失败，未执行替换：' + (err && err.message ? err.message : String(err)),
    };
  }

  // 2) 交棒：重启沙盒并按给定名单生成新一代（沿用现有居民工厂语义）。
  const generation = (Number.isInteger(input.generation) ? input.generation : 1) + 1;
  const spawned = [];
  const pending = Array.isArray(input.residents) ? input.residents : [];
  try {
    // 执行文明层记录的重启（写入遗产注入点），供下一代读取。
    const executed = civilization.restart.execute({
      civilizationId,
      tick: Number.isInteger(input.nextTick) ? input.nextTick : tick,
      heritage,
      evaluation,
    });
    const inherited = civilization.restart.inherit({ civilizationId });
    for (const r of pending) {
      if (r === null || typeof r !== 'object') continue;
      spawned.push({ name: r.name ?? null, templateId: r.templateId ?? null, planned: true });
    }
    return {
      replaced: true,
      heritage,
      generation,
      executed,
      inherited,
      spawned,
      reason: '已封存第 ' + (generation - 1) + ' 世代并交棒给第 ' + generation + ' 世代。',
    };
  } catch (err) {
    return {
      replaced: false,
      heritage,
      generation: generation - 1,
      spawned: [],
      reason: '交棒失败，遗产已归档但未替换：' + (err && err.message ? err.message : String(err)),
    };
  }
}

/** 读取某文明当前的遗产（供新一代注入）。 */
export function heritageOf(civilizationId) {
  return civilization.restart.heritage(civilizationId);
}

export function __reset() { /* 无自有状态 */ }
