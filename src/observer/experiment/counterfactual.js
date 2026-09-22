/**
 * truman-town.observer.experiment.counterfactual — 反事实 / Counterfactual
 *
 * 以已记录的决策为锚点创建"如果当时不这样做"的分支，并用确定性投影比较
 * 原决策与备选决策的差异，附上该主体随后的真实行为作为下游证据。全程只读
 * observer 决策/行为日志，绝不修改世界状态。
 */

import * as recorder from '../recorder/index.js';
import { hashHex } from './_hash.js';

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('counterfactual: agentId 必须为非空字符串');
  }
}

function assertTick(tick) {
  if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0) {
    throw new TypeError('counterfactual: tick 必须为非负整数');
  }
}

function findDecision(agentId, tick) {
  for (const node of recorder.decisionLog.list()) {
    if (node.data && node.data.agentId === agentId && node.data.tick === tick) {
      return node;
    }
  }
  return null;
}

/** 确定性"如果这样选会怎样"投影：[0,1) 区间伪分数。 */
function project(agentId, tick, choice) {
  const h = hashHex(agentId + ':' + tick + ':' + JSON.stringify(choice ?? null));
  return parseInt(h.slice(0, 8), 16) / 0xffffffff;
}

/**
 * 以已记录决策为锚点创建反事实分支。
 * @param {{ agentId: string, tick: number, alternative?: unknown }} input
 * @returns {{ branchId: string, agentId: string, tick: number, original: unknown, alternative: unknown, sourceDecisionId: string }}
 */
export function branch({ agentId, tick, alternative = null } = {}) {
  assertAgentId(agentId);
  assertTick(tick);
  const node = findDecision(agentId, tick);
  if (node === null) {
    throw new Error('counterfactual.branch: 在 tick ' + tick + ' 未找到 ' + agentId + ' 的决策');
  }
  return {
    branchId: 'cf:' + agentId + ':' + tick,
    agentId,
    tick,
    original: structuredClone(node.data.decision),
    alternative: structuredClone(alternative),
    sourceDecisionId: node.id,
  };
}

/**
 * 比较原决策与备选决策的差异（确定性投影 + 下游真实行为证据）。
 * 接受分支对象或 { agentId, tick, alternative } 输入。
 * @param {object} input 分支对象，或 { agentId, tick, alternative }
 * @returns {{ branchId: string, agentId: string, tick: number, original: unknown, alternative: unknown, diverged: boolean, originalScore: number, alternativeScore: number, delta: number, downstream: object[] }}
 */
export function compare(input = {}) {
  const b = input.original !== undefined
    ? {
        branchId: input.branchId ?? 'cf:' + input.agentId + ':' + input.tick,
        agentId: input.agentId,
        tick: input.tick,
        original: input.original,
        alternative: input.alternative,
        sourceDecisionId: input.sourceDecisionId,
      }
    : branch(input);
  const originalScore = project(b.agentId, b.tick, b.original);
  const alternativeScore = project(b.agentId, b.tick, b.alternative);
  const downstream = recorder.actionLog.list()
    .filter((n) => n.data && n.data.agentId === b.agentId && n.data.tick > b.tick)
    .map((n) => ({
      tick: n.data.tick,
      action: structuredClone(n.data.action),
      outcome: n.data.outcome === undefined ? null : structuredClone(n.data.outcome),
    }));
  return {
    branchId: b.branchId,
    agentId: b.agentId,
    tick: b.tick,
    original: structuredClone(b.original),
    alternative: structuredClone(b.alternative),
    diverged: originalScore !== alternativeScore,
    originalScore,
    alternativeScore,
    delta: alternativeScore - originalScore,
    downstream,
  };
}
