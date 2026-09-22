/**
 * truman-town.social.politics.faction — 派系 / Faction
 *
 * 组织派系（form）、加入/退出派系（join/leave），并支持派系结盟（ally）
 * 与对立（oppose）。派系与派系关系以 infra.store.graph 节点持久化，
 * 每次变更发布 infra.events.pubsub 事件并写 observer 事件日志。
 *
 * RPC：social.politics.faction.form / join / leave
 * （ally / oppose / relationship 为辅助方法，供 law / conflict 复用）
 */

import * as identity from '../../infra/identity.js';
import * as store from './_store.js';

function load(factionId) {
  const node = store.readNode(factionId);
  return (node !== null && node.type === store.TYPES.faction) ? node.data : null;
}

function save(factionId, data) {
  return store.writeNode(factionId, store.TYPES.faction, data).data;
}

function assertId(id, what) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('faction: ' + what + ' 必须为非空字符串');
  }
}

/**
 * 创建派系。
 * @param {{ name: string, founderId: string, tick?: number }} input
 * @returns {object} 派系快照
 */
export function form(input = {}) {
  const name = input?.name;
  const founderId = input?.founderId;
  if (typeof name !== 'string' || name.trim() === '') {
    throw new TypeError('faction.form: name 必须为非空字符串');
  }
  assertId(founderId, 'founderId');
  const factionId = identity.next('fac');
  const faction = {
    factionId,
    name,
    founderId,
    members: [founderId],
    status: 'active',
    formedAt: Date.now(),
  };
  save(factionId, faction);
  store.emit({ tick: input?.tick, topic: 'politics.faction.formed', payload: { factionId, name, founderId }, agentId: founderId });
  return faction;
}

/**
 * 加入派系。
 * @param {{ factionId: string, agentId: string, tick?: number }} input
 * @returns {object} 更新后的派系快照
 */
export function join(input = {}) {
  const factionId = input?.factionId;
  const agentId = input?.agentId;
  assertId(factionId, 'factionId');
  assertId(agentId, 'agentId');
  const faction = load(factionId);
  if (faction === null) throw new Error('faction_not_found: ' + factionId);
  if (faction.status !== 'active') throw new Error('faction_inactive: ' + factionId);
  if (!faction.members.includes(agentId)) {
    faction.members.push(agentId);
    save(factionId, faction);
  }
  store.emit({ tick: input?.tick, topic: 'politics.faction.joined', payload: { factionId, agentId }, agentId });
  return faction;
}

/**
 * 退出派系。创始人退出且无其余成员时解散派系。
 * @param {{ factionId: string, agentId: string, tick?: number }} input
 * @returns {object} 更新后的派系快照（解散时 status='dissolved'）
 */
export function leave(input = {}) {
  const factionId = input?.factionId;
  const agentId = input?.agentId;
  assertId(factionId, 'factionId');
  assertId(agentId, 'agentId');
  const faction = load(factionId);
  if (faction === null) throw new Error('faction_not_found: ' + factionId);
  const idx = faction.members.indexOf(agentId);
  if (idx !== -1) faction.members.splice(idx, 1);
  if (faction.members.length === 0) {
    faction.status = 'dissolved';
  }
  save(factionId, faction);
  store.emit({
    tick: input?.tick,
    topic: faction.status === 'dissolved' ? 'politics.faction.dissolved' : 'politics.faction.left',
    payload: { factionId, agentId, status: faction.status },
    agentId,
  });
  return faction;
}

/**
 * 派系结盟（辅助方法）。
 * @param {{ a: string, b: string, tick?: number }} input
 * @returns {object} 关系快照
 */
export function ally(input = {}) {
  return setRelation('ally', input);
}

/**
 * 派系对立（辅助方法）。
 * @param {{ a: string, b: string, tick?: number }} input
 * @returns {object} 关系快照
 */
export function oppose(input = {}) {
  return setRelation('oppose', input);
}

function relationId(a, b) {
  return [a, b].sort().join('__');
}

function setRelation(stance, input) {
  const a = input?.a;
  const b = input?.b;
  assertId(a, 'a');
  assertId(b, 'b');
  if (a === b) throw new TypeError('faction: 不能与自身结盟/对立');
  const rel = { a, b, stance, updatedAt: Date.now() };
  store.writeNode('rel:' + relationId(a, b), store.TYPES.relation, rel);
  store.emit({ tick: input?.tick, topic: 'politics.faction.' + stance, payload: rel });
  return rel;
}

/**
 * 查询某派系与他派系的关系（辅助方法）。
 * @param {{ factionId: string }} input
 * @returns {object[]} 关系数组
 */
export function relationship(input = {}) {
  const factionId = input?.factionId;
  assertId(factionId, 'factionId');
  return store.listByType(store.TYPES.relation)
    .map((n) => n.data)
    .filter((r) => r.a === factionId || r.b === factionId);
}

/** 列出全部派系（辅助方法）。 */
export function list() {
  return store.listByType(store.TYPES.faction).map((n) => n.data);
}
