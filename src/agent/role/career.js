/**
 * truman-town.agent.role.career — 职业角色 / Career Role
 *
 * 把居民与真实企业职位绑定/解绑（economy.industry.labour.hire），职业影响收入与日程。
 * assign 记录职业身份并（可选）绑定企业；release 卸任。
 *
 * RPC：agent.role.career.assign / release
 */

import * as graph from '../../infra/store/graph.js';
import * as labour from '../../economy/industry/labour.js';
import * as business from '../../economy/industry/business.js';

const TYPE = 'agent.role.career';

function nodeId(agentId) { return 'career:' + agentId; }

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('career: agentId 必须为非空字符串');
  }
  return agentId;
}

function load(agentId) {
  const n = graph.read(nodeId(agentId));
  return (n && n.type === TYPE && n.data) ? n.data : null;
}

/**
 * 分配职业（绑定企业职位，职业决定 wage 与日程偏向）。
 * @param {string} agentId
 * @param {{ occupation?: string, businessId?: string, wage?: number, tick?: number }} [input]
 * @returns {object} 职业记录
 */
export function assign(agentId, input = {}) {
  assertAgentId(agentId);
  const occupation = typeof input?.occupation === 'string' && input.occupation.trim() !== '' ? input.occupation : 'worker';
  const tick = Number.isInteger(input?.tick) ? input.tick : 0;
  const businessId = typeof input?.businessId === 'string' && input.businessId.trim() !== '' ? input.businessId : null;
  const wage = typeof input?.wage === 'number' && Number.isFinite(input.wage) && input.wage >= 0 ? input.wage : null;

  let hire = null;
  let businessName = null;
  if (businessId) {
    const biz = business.list?.().find((b) => b.businessId === businessId) ?? null;
    businessName = biz?.name ?? null;
    try {
      hire = labour.hire({ businessId, agentId, role: occupation, wage: wage ?? 1, tick });
    } catch (err) {
      hire = { skipped: String(err?.message ?? err) }; // 已雇佣/企业不可用时不重复绑定
    }
  }

  const record = {
    agentId,
    occupation,
    businessId,
    businessName,
    wage: wage ?? 1,
    status: 'assigned',
    assignedAt: tick,
    hire,
  };
  graph.write({ id: nodeId(agentId), type: TYPE, data: record });
  return record;
}

/**
 * 卸任职业（status → released，记录原因）。
 * @param {string} agentId
 * @param {{ tick?: number, reason?: string }} [input]
 * @returns {object} 更新后的职业记录
 */
export function release(agentId, input = {}) {
  assertAgentId(agentId);
  const prev = load(agentId) ?? { agentId, occupation: 'worker', assignedAt: 0 };
  const tick = Number.isInteger(input?.tick) ? input.tick : 0;
  const reason = typeof input?.reason === 'string' && input.reason.trim() !== '' ? input.reason : 'voluntary';
  const record = { ...prev, status: 'released', releasedAt: tick, reason };
  graph.write({ id: nodeId(agentId), type: TYPE, data: record });
  return record;
}

/** 读取职业记录。 */
export function current(agentId) {
  return load(agentId);
}

/** 职业分布汇总，供观测与跨种子对照。 */
export function summary() {
  const all = graph.read({ type: TYPE });
  const distribution = {};
  for (const n of all) {
    const d = n.data;
    if (!d) continue;
    const occ = d.occupation ?? 'worker';
    distribution[occ] = (distribution[occ] ?? 0) + 1;
  }
  return { distribution, count: Object.values(distribution).reduce((a, b) => a + b, 0) };
}

export function __reset() {}
