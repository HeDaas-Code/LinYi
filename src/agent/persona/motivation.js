/**
 * truman-town.agent.persona.motivation — 动机 / Motivation
 *
 * 按当前需求（饥饿/口渴）与性格画像给出行动动机权重并排序，供
 * schedule.planner / 决策器消费。evaluate 输出权重，rank 降序排序。
 *
 * RPC：agent.persona.motivation.evaluate / rank
 */

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('persona.motivation: agentId 必须为非空字符串');
  }
}

function num(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * 评估行动动机权重。
 * @param {string} agentId
 * @param {{ needs?: { food?: number, water?: number }, profile?: object }} [input]
 * @returns {Array<{ action: string, weight: number, drivers: string[] }>}
 */
export function evaluate(agentId, input = {}) {
  assertAgentId(agentId);
  const needs = (input.needs && typeof input.needs === 'object') ? input.needs : {};
  const dims = (input.profile && input.profile.dimensions && typeof input.profile.dimensions === 'object') ? input.profile.dimensions : {};
  const hunger = num(needs.food, 0);
  const thirst = num(needs.water, 0);
  const industrious = num(dims.industrious, 0.5);
  const cautious = num(dims.cautious, 0.5);
  return [
    { action: 'eat', weight: hunger * 1.5, drivers: ['hunger'] },
    { action: 'drink', weight: thirst * 1.5, drivers: ['thirst'] },
    { action: 'forage', weight: 0.4 + industrious * 0.4 + (1 - hunger) * 0.3, drivers: ['industrious', 'sustenance'] },
    { action: 'rest', weight: 0.3 + cautious * 0.4, drivers: ['cautious'] },
  ];
}

/**
 * 按动机权重降序排序。
 * @param {string} agentId
 * @param {object} [input]
 * @returns {Array<{ action: string, weight: number, drivers: string[] }>}
 */
export function rank(agentId, input = {}) {
  return evaluate(agentId, input).slice().sort((a, b) => b.weight - a.weight);
}

/** 无状态。 */
export function __reset() {}
