/**
 * politics 内部共享存储与事件辅助（不作为 Normify 模块暴露）。
 *
 * 统一派系 / 法律 / 领导 / 冲突四类图节点（infra.store.graph）的读写，
 * 并封装「发布事件总线 + 写 observer 事件日志」的 emit 助手，供四个
 * 政治模块复用，避免重复访问底层存储。
 */

import * as graph from '../../infra/store/graph.js';
import * as pubsub from '../../infra/events/pubsub.js';
import * as recorder from '../../observer/recorder/index.js';

export const TYPES = {
  faction: 'politics.faction',
  law: 'politics.law',
  relation: 'politics.relation',
  leader: 'politics.leader',
  conflict: 'politics.conflict',
};

export function readNode(id) {
  return graph.read(id);
}

export function listByType(type) {
  return graph.read({ type });
}

export function writeNode(id, type, data) {
  return graph.write({ id, type, data });
}

/**
 * 发布事件总线并写 observer 事件日志（一次调用完成两处记录）。
 * @param {{ tick?: number, topic: string, payload: unknown, agentId?: string }} input
 * @returns {{ delivered: number, log: object }}
 */
export function emit({ tick = 0, topic, payload, agentId }) {
  const delivered = pubsub.publish(topic, payload);
  const log = recorder.eventLog.record({
    tick,
    topic,
    payload,
    ...(agentId === undefined ? {} : { agentId }),
  });
  return { delivered, log };
}

function clampUnit(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

/** 把任意数值夹到 [0,1]（缺省取 fallback），供强度/支持度复用。 */
export function unit(value, fallback) {
  return clampUnit(value, fallback);
}
