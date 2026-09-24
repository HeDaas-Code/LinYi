/**
 * truman-town.agent.role.society — 公共角色 / Civic Role
 *
 * 公共角色（医生/教师/治安官/祭司）由居民担任并影响他人：医生提高治疗名额、祭司主持仪式等。
 * hold 上任、retire 卸任；activeEffects 聚合当前全部公共角色的影响。
 *
 * RPC：agent.role.society.hold / retire
 */

import * as graph from '../../infra/store/graph.js';

const TYPE = 'agent.role.society';

/** 可担任的公共角色及其对社区的影响。 */
export const SOCIETY_ROLES = Object.freeze({
  doctor: Object.freeze({ title: '医生', effect: Object.freeze({ treatmentCapacity: 1 }), description: '医生提高每日治疗名额' }),
  teacher: Object.freeze({ title: '教师', effect: Object.freeze({ literacyRate: 0.05 }), description: '教师提升识字率' }),
  guard: Object.freeze({ title: '治安官', effect: Object.freeze({ safety: 0.1 }), description: '治安官提升安全' }),
  priest: Object.freeze({ title: '祭司', effect: Object.freeze({ ritualBonus: 0.1 }), description: '祭司主持仪式加成' }),
});

function nodeId(agentId) { return 'society:' + agentId; }

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('society: agentId 必须为非空字符串');
  }
  return agentId;
}

function assertRole(role) {
  if (!SOCIETY_ROLES[role]) {
    throw new RangeError('society: 未知公共角色「' + String(role) + '」（可用：' + Object.keys(SOCIETY_ROLES).join(' / ') + '）');
  }
  return role;
}

function load(agentId) {
  const n = graph.read(nodeId(agentId));
  return (n && n.type === TYPE && n.data) ? n.data : null;
}

/**
 * 上任公共角色。
 * @param {string} agentId
 * @param {{ role?: string, tick?: number }} [input]
 * @returns {object} 公共角色记录
 */
export function hold(agentId, input = {}) {
  assertAgentId(agentId);
  const role = assertRole(input?.role ?? 'doctor');
  const tick = Number.isInteger(input?.tick) ? input.tick : 0;
  const def = SOCIETY_ROLES[role];
  const record = {
    agentId,
    role,
    title: def.title,
    effect: def.effect,
    description: def.description,
    status: 'active',
    since: tick,
    until: null,
  };
  graph.write({ id: nodeId(agentId), type: TYPE, data: record });
  return record;
}

/**
 * 卸任公共角色。
 * @param {string} agentId
 * @param {{ tick?: number, reason?: string }} [input]
 * @returns {object} 更新后的记录（status=retired）
 */
export function retire(agentId, input = {}) {
  assertAgentId(agentId);
  const prev = load(agentId);
  const tick = Number.isInteger(input?.tick) ? input.tick : 0;
  const reason = typeof input?.reason === 'string' && input.reason.trim() !== '' ? input.reason : 'term_end';
  const record = prev
    ? { ...prev, status: 'retired', until: tick, reason }
    : { agentId, role: null, status: 'retired', until: tick, reason };
  graph.write({ id: nodeId(agentId), type: TYPE, data: record });
  return record;
}

/** 聚合当前所有在职公共角色的影响（同名效应相加）。 */
export function activeEffects() {
  const all = graph.read({ type: TYPE });
  const agg = {};
  const holders = [];
  for (const n of all) {
    const d = n.data;
    if (!d || d.status !== 'active' || !d.effect) continue;
    holders.push({ agentId: d.agentId, role: d.role, title: d.title });
    for (const [k, v] of Object.entries(d.effect)) {
      agg[k] = (agg[k] ?? 0) + v;
    }
  }
  return { effects: agg, holders };
}

/** 列出所有在职公共角色。 */
export function active() {
  return activeEffects().holders;
}

export function __reset() {}
