/**
 * truman-town.observer.recorder.event-log — 事件日志
 *
 * 记录世界事件（天气、突发事件、生存事件等），并接入事件总线：
 * record() 显式记录单条事件，attach() 订阅总线自动记录全部事件。
 * 事件日志同样写入图存储为不可变追加日志。
 */

import * as graph from '../../infra/store/graph.js';
import * as pubsub from '../../infra/events/pubsub.js';
import { nextSeq } from './_shared.js';

/** 事件日志在 graph store 中的节点类型。 */
export const TYPE = 'observer.event';

function assertTick(tick) {
  if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0) {
    throw new TypeError('event-log.record: tick 必须为非负整数');
  }
}

/**
 * 记录一条世界事件日志。
 * @param {object} input
 * @param {number} input.tick 事件发生的 tick
 * @param {string} input.topic 事件主题
 * @param {unknown} [input.payload] 事件载荷（可结构化克隆）
 * @param {string} [input.agentId] 关联主体 ID（可选）
 * @returns {object} 已写入的日志节点快照
 */
export function record(input) {
  const { tick, topic, payload, agentId } = input ?? {};
  assertTick(tick);
  if (typeof topic !== 'string' || topic.trim() === '') {
    throw new TypeError('event-log.record: topic 必须为非空字符串');
  }
  const seq = nextSeq();
  return graph.write({
    id: `obs.event.${seq}`,
    type: TYPE,
    data: {
      tick,
      seq,
      ts: Date.now(),
      topic,
      payload: payload === undefined ? null : structuredClone(payload),
      ...(agentId === undefined ? {} : { agentId }),
    },
  });
}

/** 读取全部事件日志节点（按写入顺序）。 */
export function list() {
  return graph.read({ type: TYPE });
}

/**
 * 接入事件总线：订阅全部 topic 并自动记录为事件日志。
 * @param {object} [opts]
 * @param {number | ((payload: unknown, meta: object) => number)} [opts.tick=0]
 *   固定 tick 值，或从 (payload, meta) 解析 tick 的函数
 * @param {string} [opts.agentId] 可选：为自动记录的事件统一标注主体
 * @returns {() => void} 取消订阅函数
 */
export function attach(opts = {}) {
  const tickSrc = opts.tick ?? 0;
  const resolveTick = typeof tickSrc === 'function' ? tickSrc : () => tickSrc;
  const agentId = opts.agentId;
  return pubsub.subscribe('*', (payload, meta) => {
    try {
      record({
        tick: resolveTick(payload, meta),
        topic: meta.topic,
        payload,
        ...(agentId === undefined ? {} : { agentId }),
      });
    } catch (err) {
      console.error('[observer.event-log] 自动记录事件失败:', err);
    }
  });
}
