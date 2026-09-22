/**
 * truman-town.observer.recorder.decision-log — 决策日志
 *
 * 记录每一次智能体决策：谁在哪个 tick、在什么上下文（需求压力/预想）下，
 * 从哪些候选项中选择了什么、理由是什么。写入图存储为不可变追加日志，
 * 每条记录获得全局唯一且有序的 id，供编年编译与审计回溯。
 */

import * as graph from '../../infra/store/graph.js';
import { nextSeq } from './_shared.js';

/** 决策日志在 graph store 中的节点类型。 */
export const TYPE = 'observer.decision';

function assertTick(tick) {
  if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0) {
    throw new TypeError('decision-log.record: tick 必须为非负整数');
  }
}

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('decision-log.record: agentId 必须为非空字符串');
  }
}

/**
 * 记录一条决策日志。
 * @param {object} input
 * @param {number} input.tick 决策发生的 tick
 * @param {string} input.agentId 决策者 ID
 * @param {unknown} input.decision 最终选择的决策描述
 * @param {unknown[]} [input.options] 候选选项列表
 * @param {unknown} [input.context] 决策上下文快照
 * @param {string} [input.reason] 决策理由
 * @param {string} [input.decisionId] 决策模块产出的决策 ID（可选）
 * @returns {object} 已写入的日志节点快照
 */
export function record(input) {
  const { tick, agentId, decision, options, context, reason, decisionId } = input ?? {};
  assertTick(tick);
  assertAgentId(agentId);
  if (decision === undefined) {
    throw new TypeError('decision-log.record: decision 不能为空');
  }
  const seq = nextSeq();
  return graph.write({
    id: `obs.decision.${seq}`,
    type: TYPE,
    data: {
      tick,
      seq,
      ts: Date.now(),
      agentId,
      decision: structuredClone(decision),
      ...(options === undefined ? {} : { options: structuredClone(options) }),
      ...(context === undefined ? {} : { context: structuredClone(context) }),
      ...(reason === undefined ? {} : { reason }),
      ...(decisionId === undefined ? {} : { decisionId }),
    },
  });
}

/** 读取全部决策日志节点（按写入顺序）。 */
export function list() {
  return graph.read({ type: TYPE });
}
