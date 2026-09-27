/**
 * truman-town.agent.persona.identity — 身份 / Identity
 *
 * 描述与更新智能体的姓名、来源、家庭归属与社会标签。身份以 runtime.world-state
 * 的 agents.<id> 路径持久化（与 registry 同源）；update 允许随事件改变（结婚、
 * 生子、加入派系、丧偶），只接受白名单字段，避免越权写入。
 *
 * RPC：agent.persona.identity.describe / update
 */

import * as worldState from '../../runtime/world-state.js';
import * as registry from '../../runtime/registry.js';

// generation 是代际身份（第几代居民）：文明重启交接后由 registerAgent 写入，
// 使「这一代是第几代」在身份面上可查，而不只存在于 family.lineage。
const IDENTITY_FIELDS = ['name', 'persona', 'familyId', 'parents', 'spouseId', 'factionId', 'socialTags', 'age', 'stage', 'bornTick', 'generation'];

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('persona.identity: agentId 必须为非空字符串');
  }
}

/**
 * 描述智能体身份（姓名/家庭/社会标签/年龄/存续状态）。
 * @param {string} agentId
 * @returns {object}
 */
export function describe(agentId) {
  assertAgentId(agentId);
  const ws = worldState.get('agents.' + agentId) ?? {};
  const rec = registry.lookup(agentId);
  const data = (rec !== null && rec.data && typeof rec.data === 'object') ? rec.data : {};
  return {
    agentId,
    name: ws.name ?? data.name ?? null,
    persona: ws.persona ?? data.persona ?? null,
    familyId: ws.familyId ?? null,
    parents: Array.isArray(ws.parents) ? [...ws.parents] : [],
    spouseId: ws.spouseId ?? null,
    factionId: ws.factionId ?? null,
    socialTags: Array.isArray(ws.socialTags) ? [...ws.socialTags] : [],
    age: typeof ws.age === 'number' ? ws.age : null,
    stage: ws.stage ?? null,
    bornTick: ws.bornTick ?? null,
    generation: Number.isInteger(ws.generation) ? ws.generation
      : (Number.isInteger(data.generation) ? data.generation : null),
    alive: ws.alive !== false,
    deathTick: ws.deathTick ?? null,
  };
}

/**
 * 更新身份字段（仅白名单字段；未知字段被忽略）。
 * @param {string} agentId
 * @param {object} patch
 * @returns {object} 更新后的 describe 快照
 */
export function update(agentId, patch = {}) {
  assertAgentId(agentId);
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new TypeError('persona.identity.update: patch 必须为普通对象');
  }
  for (const [key, value] of Object.entries(patch)) {
    if (IDENTITY_FIELDS.includes(key)) {
      worldState.set('agents.' + agentId + '.' + key, value);
    }
  }
  return describe(agentId);
}

/** 复位依赖（world-state/registry 由 loop.reset 统一复位）。 */
export function __reset() {}
