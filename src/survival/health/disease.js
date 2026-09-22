/**
 * truman-town.survival.health.disease — 疾病 / Disease
 *
 * 感染、症状发展与康复。infect 施加感染（受特质免疫 tags 影响），symptom
 * 推进症状（severity 上升、健康下降），recover 康复（受免疫与医疗物资加成）。
 * 每位居民维护 health（0-100）与 diseases 列表，暴露 status / list 供
 * epidemic / treatment 消费。依赖 traits.tagset（免疫特质）与
 * resources.medical（医疗物资，经内部 _medical 库存）。
 */

import * as traitsStore from '../../agent/traits/tagset/store.js';
import * as medical from './_medical.js';

const IMMUNE_TAG = 'immune';
const DEFAULT_HEALTH = 100;

/** @type {Map<string, { health: number, diseases: Array<object> }>} */
const residents = new Map();

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function clamp01(v) {
  return clamp(v, 0, 1);
}

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('disease: agentId 必须为非空字符串');
  }
}

function assertDiseaseId(diseaseId) {
  if (typeof diseaseId !== 'string' || diseaseId.trim() === '') {
    throw new TypeError('disease: diseaseId 必须为非空字符串');
  }
}

/** 从 traits.tagset 读取 'immune' 特质权重并归一化到 [0,1]。 */
function immunity(agentId) {
  const rec = traitsStore.get(agentId);
  if (!rec) return 0;
  const tag = rec.tags.find((t) => t.key === IMMUNE_TAG);
  if (!tag || typeof tag.weight !== 'number') return 0;
  return clamp01(tag.weight / 10);
}

function load(agentId) {
  let s = residents.get(agentId);
  if (s === undefined) {
    s = { health: DEFAULT_HEALTH, diseases: [] };
    residents.set(agentId, s);
  }
  return s;
}

function maxSeverity(diseases) {
  let m = 0;
  for (const d of diseases) m = Math.max(m, d.severity ?? 0);
  return m;
}

function snapshot(agentId, s) {
  return {
    agentId,
    health: s.health,
    infected: s.diseases.length > 0,
    severity: maxSeverity(s.diseases),
    diseases: structuredClone(s.diseases),
  };
}

/**
 * 感染：施加疾病，免疫可抵抗或削弱。
 * @param {{ agentId: string, diseaseId: string, severity?: number, tick?: number }} input
 * @returns {object} 感染结果（含 infected / severity / immunity / health）
 */
export function infect(input = {}) {
  const agentId = input?.agentId; assertAgentId(agentId);
  const diseaseId = input?.diseaseId; assertDiseaseId(diseaseId);
  const baseSeverity = clamp01(typeof input?.severity === 'number' ? input.severity : 0.5);
  const tick = Number.isInteger(input?.tick) ? input.tick : 0;

  const imm = immunity(agentId);
  if (imm >= 0.9) {
    return { agentId, diseaseId, infected: false, reason: '免疫', immunity: imm, tick };
  }

  const severity = clamp01(baseSeverity * (1 - imm));
  const s = load(agentId);
  const existing = s.diseases.find((d) => d.diseaseId === diseaseId);
  if (existing) {
    existing.severity = Math.max(existing.severity, severity);
  } else {
    s.diseases.push({ diseaseId, severity, stage: 1, infectedAt: tick });
  }
  s.health = clamp(s.health - severity * 40, 0, 100);

  return { ...snapshot(agentId, s), diseaseId, infected: true, immunity: imm, tick };
}

/**
 * 症状推进：severity 上升、健康下降。
 * @param {{ agentId: string, diseaseId?: string, delta?: number, tick?: number }} input
 * @returns {object} 更新后的健康状态
 */
export function symptom(input = {}) {
  const agentId = input?.agentId; assertAgentId(agentId);
  const delta = clamp01(typeof input?.delta === 'number' ? input.delta : 0.1);
  const tick = Number.isInteger(input?.tick) ? input.tick : 0;

  const s = load(agentId);
  for (const d of s.diseases) {
    if (input?.diseaseId !== undefined && d.diseaseId !== input.diseaseId) continue;
    d.severity = clamp01(d.severity + delta);
    d.stage = Math.min(3, (d.stage ?? 1) + 1);
  }
  s.health = clamp(s.health - delta * 30, 0, 100);

  return { ...snapshot(agentId, s), tick };
}

/**
 * 康复：severity 下降、健康回升，受免疫与医疗物资加成。
 * @param {{ agentId: string, diseaseId?: string, amount?: number, tick?: number }} input
 * @returns {object} 更新后的健康状态（含 medicalStockpile）
 */
export function recover(input = {}) {
  const agentId = input?.agentId; assertAgentId(agentId);
  const amount = clamp01(typeof input?.amount === 'number' ? input.amount : 0.5);
  const tick = Number.isInteger(input?.tick) ? input.tick : 0;

  const s = load(agentId);
  const med = medical.query();
  const boost = med.stockpile > 0 ? 0.5 : 0;
  const imm = immunity(agentId);
  const step = clamp01(amount + boost + imm * 0.2);

  for (const d of s.diseases) {
    if (input?.diseaseId !== undefined && d.diseaseId !== input.diseaseId) continue;
    d.severity = clamp01(d.severity - step);
  }
  s.diseases = s.diseases.filter((d) => d.severity > 0.001);
  s.health = clamp(s.health + step * 30, 0, 100);

  return { ...snapshot(agentId, s), tick, medicalStockpile: med.stockpile };
}

/** 查询单个居民的健康状态（辅助方法）。 */
export function status(input = {}) {
  const agentId = input?.agentId; assertAgentId(agentId);
  return snapshot(agentId, load(agentId));
}

/** 查询全部已登记居民的健康状态（按 agentId 排序，辅助方法）。 */
export function list() {
  return [...residents.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([agentId, s]) => snapshot(agentId, s));
}

/** 复位全部居民健康状态（测试用）。 */
export function __reset() {
  residents.clear();
}
