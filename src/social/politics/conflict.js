/**
 * truman-town.social.politics.conflict — 冲突 / Conflict
 *
 * 开启（start）、升级/调停（escalate / mediate）与解决（resolve）派系或主体间冲突。
 * 冲突强度 ∈ [0,1] 受生存压力驱动（pressure 代理），解决时可施加伤亡（lifecycle
 * 代理，记为 casualties）。全程以 graph 节点持久化，并发布事件总线 + 写 observer 日志。
 *
 * RPC：social.politics.conflict.start / resolve
 * （escalate / mediate 为辅助方法，供 resolve 与主循环复用）
 */

import * as identity from '../../infra/identity.js';
import * as store from './_store.js';

function load(conflictId) {
  const node = store.readNode(conflictId);
  return (node !== null && node.type === store.TYPES.conflict) ? node.data : null;
}

function save(conflictId, data) {
  return store.writeNode(conflictId, store.TYPES.conflict, data).data;
}

function assertId(id, what) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('conflict: ' + what + ' 必须为非空字符串');
  }
}

/**
 * 开启冲突。intensity 缺省由 pressure（生存压力代理，∈[0,1]）映射。
 * @param {{ partyA: string, partyB: string, cause?: string, intensity?: number, pressure?: number, tick?: number }} input
 * @returns {object} 冲突快照
 */
export function start(input = {}) {
  const partyA = input?.partyA;
  const partyB = input?.partyB;
  assertId(partyA, 'partyA');
  assertId(partyB, 'partyB');
  if (partyA === partyB) throw new TypeError('conflict.start: 冲突双方不能相同');
  const pressure = store.unit(input?.pressure, 0);
  const intensity = store.unit(input?.intensity, 0.25 + 0.75 * pressure);
  const conflictId = identity.next('cnf');
  const conflict = {
    conflictId,
    partyA,
    partyB,
    cause: typeof input?.cause === 'string' ? input.cause : null,
    intensity,
    status: 'open',
    casualties: 0,
    history: [{ at: Date.now(), event: 'started', intensity }],
    startedAt: Date.now(),
  };
  save(conflictId, conflict);
  store.emit({ tick: input?.tick, topic: 'politics.conflict.started', payload: { conflictId, partyA, partyB, intensity } });
  return conflict;
}

/**
 * 升级冲突：强度提升 delta（缺省 0.1，夹到 [0,1]）。
 * @param {{ conflictId: string, delta?: number, tick?: number }} input
 * @returns {object} 更新后的冲突快照
 */
export function escalate(input = {}) {
  const conflictId = input?.conflictId;
  assertId(conflictId, 'conflictId');
  const conflict = load(conflictId);
  if (conflict === null) throw new Error('conflict_not_found: ' + conflictId);
  if (conflict.status !== 'open') throw new Error('conflict_closed: ' + conflictId);
  const delta = typeof input?.delta === 'number' && Number.isFinite(input.delta) ? input.delta : 0.1;
  conflict.intensity = Math.min(1, Math.max(0, conflict.intensity + delta));
  conflict.history.push({ at: Date.now(), event: 'escalated', intensity: conflict.intensity });
  save(conflictId, conflict);
  store.emit({ tick: input?.tick, topic: 'politics.conflict.escalated', payload: { conflictId, intensity: conflict.intensity } });
  return conflict;
}

/**
 * 调停冲突：强度降低 delta（缺省 0.2），记录调解人。
 * @param {{ conflictId: string, mediatorId: string, delta?: number, tick?: number }} input
 * @returns {object} 更新后的冲突快照
 */
export function mediate(input = {}) {
  const conflictId = input?.conflictId;
  const mediatorId = input?.mediatorId;
  assertId(conflictId, 'conflictId');
  assertId(mediatorId, 'mediatorId');
  const conflict = load(conflictId);
  if (conflict === null) throw new Error('conflict_not_found: ' + conflictId);
  if (conflict.status !== 'open') throw new Error('conflict_closed: ' + conflictId);
  const delta = typeof input?.delta === 'number' && Number.isFinite(input.delta) ? input.delta : 0.2;
  conflict.intensity = Math.max(0, conflict.intensity - delta);
  conflict.mediatorId = mediatorId;
  conflict.history.push({ at: Date.now(), event: 'mediated', mediatorId, intensity: conflict.intensity });
  save(conflictId, conflict);
  store.emit({ tick: input?.tick, topic: 'politics.conflict.mediated', payload: { conflictId, mediatorId, intensity: conflict.intensity }, agentId: mediatorId });
  return conflict;
}

/**
 * 解决冲突：outcome ∈ {'escalate','mediate','settle','ceasefire'}。
 * escalate 先升强度；mediate 先降强度（需 mediatorId）；settle/ceasefire 直接闭合。
 * 依据强度折算伤亡（casualties），写事件日志。
 * @param {{ conflictId: string, outcome?: string, mediatorId?: string, tick?: number }} input
 * @returns {object} 解决后的冲突快照
 */
export function resolve(input = {}) {
  const conflictId = input?.conflictId;
  assertId(conflictId, 'conflictId');
  const outcome = input?.outcome ?? 'settle';
  const conflict = load(conflictId);
  if (conflict === null) throw new Error('conflict_not_found: ' + conflictId);
  if (conflict.status !== 'open') throw new Error('conflict_closed: ' + conflictId);

  if (outcome === 'escalate') {
    conflict.intensity = Math.min(1, conflict.intensity + 0.1);
  } else if (outcome === 'mediate') {
    if (typeof input?.mediatorId !== 'string' || input.mediatorId === '') {
      throw new TypeError('conflict.resolve: mediate 需提供 mediatorId');
    }
    conflict.intensity = Math.max(0, conflict.intensity - 0.2);
    conflict.mediatorId = input.mediatorId;
  }

  const casualties = Math.max(0, Math.round(conflict.intensity * 10));
  conflict.casualties = casualties;
  conflict.status = 'resolved';
  conflict.outcome = outcome;
  conflict.resolvedAt = Date.now();
  conflict.history.push({ at: Date.now(), event: 'resolved', outcome, intensity: conflict.intensity, casualties });
  save(conflictId, conflict);
  store.emit({
    tick: input?.tick,
    topic: 'politics.conflict.resolved',
    payload: { conflictId, outcome, intensity: conflict.intensity, casualties },
    agentId: conflict.mediatorId,
  });
  return conflict;
}

/** 列出全部冲突（辅助方法）。 */
export function list() {
  return store.listByType(store.TYPES.conflict).map((n) => n.data);
}
