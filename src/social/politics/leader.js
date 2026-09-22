/**
 * truman-town.social.politics.leader — 领导 / Leader
 *
 * 选举（elect）、罢免（oust）与发布政令（decree）。领导按派系（或全局，factionId=null
 * 表示镇长）记录，支持度（reputation 代理）更高的候选人可更替现任。
 * 每次变更发布事件总线并写 observer 事件/行为日志。
 *
 * RPC：social.politics.leader.elect / oust / decree
 */

import * as recorder from '../../observer/recorder/index.js';
import * as store from './_store.js';

function leaderNodeId(factionId) {
  return 'politics.leader.' + (factionId ?? 'town');
}

function load(factionId) {
  const node = store.readNode(leaderNodeId(factionId));
  return (node !== null && node.type === store.TYPES.leader) ? node.data : null;
}

function save(factionId, data) {
  return store.writeNode(leaderNodeId(factionId), store.TYPES.leader, data).data;
}

function assertId(id, what) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('leader: ' + what + ' 必须为非空字符串');
  }
}

function normalizeFaction(factionId) {
  if (factionId === undefined || factionId === null || factionId === '') return null;
  if (typeof factionId !== 'string') throw new TypeError('leader: factionId 必须为字符串');
  return factionId;
}

function actionLog(agentId, action, outcome, tick) {
  recorder.actionLog.record({
    tick: typeof tick === 'number' ? tick : 0,
    agentId,
    action: 'politics.' + action,
    outcome,
  });
}

/**
 * 选举领导。支持度（support ∈ [0,1]，缺省 0.5）高于现任则更替（领导权更替），
 * 否则拒绝并返回 { elected:false }。
 * @param {{ factionId?: string|null, agentId: string, support?: number, tick?: number }} input
 * @returns {{ elected: boolean, leader: object|null, reason?: string }}
 */
export function elect(input = {}) {
  const agentId = input?.agentId;
  assertId(agentId, 'agentId');
  const factionId = normalizeFaction(input?.factionId);
  const support = store.unit(input?.support, 0.5);
  const current = load(factionId);

  if (current !== null && current.agentId === agentId) {
    const leader = { ...current, support, reelectedAt: Date.now() };
    save(factionId, leader);
    return { elected: true, leader, replaced: false };
  }
  if (current !== null && current.support >= support) {
    return { elected: false, leader: current, reason: 'support_insufficient' };
  }
  const leader = {
    factionId,
    agentId,
    support,
    since: Date.now(),
    terms: (current !== null ? current.terms + 1 : 1),
  };
  save(factionId, leader);
  store.emit({
    tick: input?.tick,
    topic: 'politics.leader.elected',
    payload: { factionId, agentId, support, terms: leader.terms },
    agentId,
  });
  actionLog(agentId, 'elect', { factionId, support, terms: leader.terms }, input?.tick);
  return { elected: true, leader, replaced: current !== null };
}

/**
 * 罢免领导（置为空缺）。
 * @param {{ factionId?: string|null, agentId: string, tick?: number }} input
 * @returns {{ ousted: boolean, leader: object|null }}
 */
export function oust(input = {}) {
  const agentId = input?.agentId;
  assertId(agentId, 'agentId');
  const factionId = normalizeFaction(input?.factionId);
  const current = load(factionId);
  if (current === null) return { ousted: false, leader: null };
  store.writeNode(leaderNodeId(factionId), store.TYPES.leader, {
    ...current,
    status: 'ousted',
    oustedAt: Date.now(),
  });
  store.emit({
    tick: input?.tick,
    topic: 'politics.leader.ousted',
    payload: { factionId, ousted: current.agentId, by: agentId },
    agentId,
  });
  actionLog(agentId, 'oust', { factionId, ousted: current.agentId }, input?.tick);
  return { ousted: true, leader: { ...current, status: 'ousted' } };
}

/**
 * 领导发布政令（直接生效的规则，写为 decree 法律）。
 * @param {{ factionId?: string|null, leaderId: string, title: string, text?: string, tick?: number }} input
 * @returns {object} 政令快照
 */
export function decree(input = {}) {
  const leaderId = input?.leaderId;
  const title = input?.title;
  assertId(leaderId, 'leaderId');
  if (typeof title !== 'string' || title.trim() === '') {
    throw new TypeError('leader.decree: title 必须为非空字符串');
  }
  const factionId = normalizeFaction(input?.factionId);
  const current = load(factionId);
  if (current === null || current.agentId !== leaderId) {
    throw new Error('leader_not_authorized: ' + leaderId);
  }
  const decree = {
    decreeId: 'decree_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e4),
    factionId,
    leaderId,
    title,
    text: typeof input?.text === 'string' ? input.text : '',
    issuedAt: Date.now(),
  };
  store.emit({
    tick: input?.tick,
    topic: 'politics.leader.decree',
    payload: decree,
    agentId: leaderId,
  });
  actionLog(leaderId, 'decree', { factionId, title }, input?.tick);
  return decree;
}

/** 查询当前领导（辅助方法）。 */
export function current(factionId) {
  return load(normalizeFaction(factionId));
}
