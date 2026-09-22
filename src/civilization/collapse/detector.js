/**
 * truman-town.civilization.collapse.detector — 崩溃检测器 / Collapse Detector
 *
 * 汇总生存危机与文明状态指标，检测集体性崩溃信号：
 * 人口灭绝、资源枯竭、危机升级均会直接判定崩溃，综合 score 作为辅助阈值。
 */

function clamp01(v) {
  if (typeof v !== 'number' || Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/**
 * 计算崩溃指标。
 * @param {object} [input]
 * @param {number} [input.population=0] 当前人口
 * @param {number} [input.resourceRatio=1] 资源充裕度 [0,1]（1=充裕，0=枯竭）
 * @param {number} [input.crisisLevel=0] 危机烈度 [0,1]
 * @param {number} [input.survivalTime=0] 已存活 tick 数
 * @returns {Array<{key, value, critical}>}
 */
export function indicators(input = {}) {
  const population = Number.isInteger(input?.population) && input.population >= 0 ? input.population : 0;
  const resourceRatio = clamp01(input?.resourceRatio ?? 1);
  const crisisLevel = clamp01(input?.crisisLevel ?? 0);
  const survivalTime = Number.isFinite(input?.survivalTime) && input.survivalTime >= 0 ? input.survivalTime : 0;
  const scarcity = clamp01(1 - resourceRatio);
  const extinction = population <= 0 ? 1 : 0;
  const score = clamp01(0.4 * extinction + 0.3 * scarcity + 0.3 * crisisLevel);
  return [
    { key: 'population', value: population, critical: population <= 0 },
    { key: 'resourceScarcity', value: scarcity, critical: scarcity >= 0.9 },
    { key: 'crisisLevel', value: crisisLevel, critical: crisisLevel >= 0.8 },
    { key: 'survivalTime', value: survivalTime, critical: false },
    { key: 'collapseScore', value: score, critical: score >= 0.6 },
  ];
}

/**
 * 检测文明是否发生集体性崩溃。
 * @param {object} [input]
 * @param {object} [input.thresholds] 阈值覆盖
 * @param {number} [input.thresholds.score=0.6]
 * @param {number} [input.thresholds.scarcity=0.9]
 * @param {number} [input.thresholds.crisis=0.8]
 * @returns {object} { collapsed, score, threshold, indicators, reasons }
 */
export function detect(input = {}) {
  const t = input?.thresholds ?? {};
  const scoreThreshold = Number.isFinite(t.score) ? t.score : 0.6;
  const scarcityThreshold = Number.isFinite(t.scarcity) ? t.scarcity : 0.9;
  const crisisThreshold = Number.isFinite(t.crisis) ? t.crisis : 0.8;

  const ind = indicators(input);
  const population = ind.find((i) => i.key === 'population').value;
  const scarcity = ind.find((i) => i.key === 'resourceScarcity').value;
  const crisisLevel = ind.find((i) => i.key === 'crisisLevel').value;
  const score = ind.find((i) => i.key === 'collapseScore').value;

  const reasons = [];
  if (population <= 0) reasons.push('population_extinct');
  if (scarcity >= scarcityThreshold) reasons.push('resource_exhausted');
  if (crisisLevel >= crisisThreshold) reasons.push('crisis_escalated');

  const collapsed =
    population <= 0 || scarcity >= scarcityThreshold || crisisLevel >= crisisThreshold || score >= scoreThreshold;
  return { collapsed, score, threshold: scoreThreshold, indicators: ind, reasons };
}
