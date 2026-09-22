/**
 * truman-town.social.politics.law — 规则 / Law
 *
 * 提议（propose）、表决（vote）与执行（enforce）规则。法律以 graph 节点
 * 持久化（status: proposed → enacted / rejected）；表决按支持者人数计票，
 * 达到简单多数即通过。提议/通过/执行均发布事件总线并写 observer 日志
 * （表决同时写决策日志）。
 *
 * RPC：social.politics.law.propose / vote / enforce
 */

import * as identity from '../../infra/identity.js';
import * as recorder from '../../observer/recorder/index.js';
import * as store from './_store.js';

function load(lawId) {
  const node = store.readNode(lawId);
  return (node !== null && node.type === store.TYPES.law) ? node.data : null;
}

function save(lawId, data) {
  return store.writeNode(lawId, store.TYPES.law, data).data;
}

function assertId(id, what) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('law: ' + what + ' 必须为非空字符串');
  }
}

/**
 * 提议一条规则（进入 proposed）。
 * @param {{ title: string, text: string, proposerId: string, factionId?: string, tick?: number }} input
 * @returns {object} 法律快照
 */
export function propose(input = {}) {
  const title = input?.title;
  const text = input?.text;
  const proposerId = input?.proposerId;
  if (typeof title !== 'string' || title.trim() === '') {
    throw new TypeError('law.propose: title 必须为非空字符串');
  }
  assertId(proposerId, 'proposerId');
  const lawId = identity.next('law');
  const law = {
    lawId,
    title,
    text: typeof text === 'string' ? text : '',
    proposerId,
    factionId: typeof input?.factionId === 'string' ? input.factionId : null,
    status: 'proposed',
    votes: {},
    yes: 0,
    no: 0,
    proposedAt: Date.now(),
  };
  save(lawId, law);
  store.emit({ tick: input?.tick, topic: 'politics.law.proposed', payload: { lawId, title, proposerId }, agentId: proposerId });
  return law;
}

/**
 * 表决（每人一票，可改票），达到简单多数即通过并转为 enacted。
 * @param {{ lawId: string, agentId: string, vote: 'yes'|'no', tick?: number }} input
 * @returns {object} 更新后的法律快照
 */
export function vote(input = {}) {
  const lawId = input?.lawId;
  const agentId = input?.agentId;
  const voteVal = input?.vote;
  assertId(lawId, 'lawId');
  assertId(agentId, 'agentId');
  if (voteVal !== 'yes' && voteVal !== 'no') {
    throw new TypeError("law.vote: vote 必须为 'yes' | 'no'");
  }
  const law = load(lawId);
  if (law === null) throw new Error('law_not_found: ' + lawId);
  if (law.status !== 'proposed') throw new Error('law_not_proposed: ' + lawId);

  const previous = law.votes[agentId];
  if (previous === voteVal) {
    return law;
  }
  if (previous === 'yes') law.yes -= 1;
  if (previous === 'no') law.no -= 1;
  law.votes[agentId] = voteVal;
  if (voteVal === 'yes') law.yes += 1;
  else law.no += 1;

  if (law.yes > law.no) {
    law.status = 'enacted';
    law.enactedAt = Date.now();
  }
  save(lawId, law);

  recorder.decisionLog.record({
    tick: typeof input?.tick === 'number' ? input.tick : 0,
    agentId,
    decision: { lawId, vote: voteVal },
    context: { law: law.title, status: law.status },
  });
  store.emit({
    tick: input?.tick,
    topic: law.status === 'enacted' ? 'politics.law.enacted' : 'politics.law.voted',
    payload: { lawId, agentId, vote: voteVal, status: law.status },
    agentId,
  });
  return law;
}

/**
 * 执行一条已生效规则，对违反者施加后果并写行为日志。
 * @param {{ lawId: string, agentId: string, violation?: unknown, penalty?: unknown, tick?: number }} input
 * @returns {object} 执行回执
 */
export function enforce(input = {}) {
  const lawId = input?.lawId;
  const agentId = input?.agentId;
  assertId(lawId, 'lawId');
  assertId(agentId, 'agentId');
  const law = load(lawId);
  if (law === null) throw new Error('law_not_found: ' + lawId);
  if (law.status !== 'enacted') throw new Error('law_not_enacted: ' + lawId);

  const violation = input?.violation ?? null;
  const penalty = input?.penalty ?? { type: 'fine', amount: 0 };
  const receipt = {
    lawId,
    title: law.title,
    agentId,
    violation,
    penalty,
    enforcedAt: Date.now(),
  };
  recorder.actionLog.record({
    tick: typeof input?.tick === 'number' ? input.tick : 0,
    agentId,
    action: 'law.enforce',
    outcome: { lawId, title: law.title, penalty },
  });
  store.emit({
    tick: input?.tick,
    topic: 'politics.law.enforced',
    payload: { lawId, title: law.title, agentId, penalty },
    agentId,
  });
  return receipt;
}

/** 列出全部法律（辅助方法）。 */
export function list() {
  return store.listByType(store.TYPES.law).map((n) => n.data);
}
