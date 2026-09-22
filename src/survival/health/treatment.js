/**
 * truman-town.survival.health.treatment — 治疗 / Treatment
 *
 * 由医生角色分诊并消耗医疗物资实施治疗。apply 消耗 medical 库存后调用
 * disease.recover 治愈；triage 按 severity 降序给出患者优先级。依赖
 * resources.medical（医疗物资）与 agent.role.career（医生角色，MVP 声明式，
 * 未强制）。
 */

import * as medical from './_medical.js';
import * as disease from './disease.js';

/** 每次治疗消耗的医疗物资数量。 */
const COST = 10;

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('treatment: agentId 必须为非空字符串');
  }
}

/**
 * 实施一次治疗：消耗医疗物资并治愈目标居民。
 * @param {{ agentId: string, diseaseId?: string, amount?: number, tick?: number }} input
 * @returns {object} 康复结果（含 consumed / medical 库存快照）
 */
export function apply(input = {}) {
  const agentId = input?.agentId; assertAgentId(agentId);
  const amount = (typeof input?.amount === 'number' && Number.isFinite(input.amount) && input.amount >= 0)
    ? Math.min(1, input.amount)
    : 0.5;
  const tick = Number.isInteger(input?.tick) ? input.tick : 0;

  const med = medical.consume(COST);
  const healed = disease.recover({ agentId, diseaseId: input?.diseaseId, amount, tick });

  return { ...healed, medical: med, consumed: med.consumed, tick };
}

/**
 * 分诊：按病情严重度降序给出患者优先级。
 * @param {{ agents?: string[], tick?: number }} [input] agents 缺省时取全部登记居民
 * @returns {Array<object>} 已感染患者按 severity 降序排序
 */
export function triage(input = {}) {
  const tick = Number.isInteger(input?.tick) ? input.tick : 0;

  let patients;
  if (Array.isArray(input?.agents)) {
    patients = input.agents.map((a) => disease.status({ agentId: a }));
  } else {
    patients = disease.list();
  }

  return patients
    .filter((p) => p.infected)
    .sort((a, b) => (b.severity - a.severity) || a.agentId.localeCompare(b.agentId))
    .map((p) => ({ ...p, tick }));
}
