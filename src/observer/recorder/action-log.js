/**
 * truman-town.observer.recorder.action-log — 行为日志
 *
 * 记录每一个智能体行为：谁在哪个 tick 执行了什么动作、结果如何。
 * 与决策日志分离存储，便于区分"决定做什么"与"实际做了什么"，
 * 同样写入图存储为不可变追加日志。
 */

import * as graph from '../../infra/store/graph.js';
import { nextSeq } from './_shared.js';

/** 行为日志在 graph store 中的节点类型。 */
export const TYPE = 'observer.action';

function assertTick(tick) {
  if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0) {
    throw new TypeError('action-log.record: tick 必须为非负整数');
  }
}

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('action-log.record: agentId 必须为非空字符串');
  }
}

/**
 * 记录一条行为日志。
 * @param {object} input
 * @param {number} input.tick 行为发生的 tick
 * @param {string} input.agentId 行为主体 ID
 * @param {unknown} input.action 行为描述
 * @param {unknown} [input.outcome] 行为结果
 * @param {string} [input.actionId] 行为 ID（可选）
 * @returns {object} 已写入的日志节点快照
 */
export function record(input) {
  const { tick, agentId, action, outcome, actionId } = input ?? {};
  assertTick(tick);
  assertAgentId(agentId);
  if (action === undefined) {
    throw new TypeError('action-log.record: action 不能为空');
  }
  const seq = nextSeq();
  return graph.write({
    id: `obs.action.${seq}`,
    type: TYPE,
    data: {
      tick,
      seq,
      ts: Date.now(),
      agentId,
      action: structuredClone(action),
      ...(outcome === undefined ? {} : { outcome: structuredClone(outcome) }),
      ...(actionId === undefined ? {} : { actionId }),
    },
  });
}

/** 读取全部行为日志节点（按写入顺序）。 */
export function list() {
  return graph.read({ type: TYPE });
}
