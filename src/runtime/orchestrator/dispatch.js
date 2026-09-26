/**
 * truman-town.runtime.orchestrator.dispatch — 行动执行 / Action Dispatch
 *
 * 把智能体决策结果解析为世界操作并提交执行。resolve(decisions) 归一化并校验
 * 决策；actions(resolved) 把操作提交到 world-state（默认记录
 * agents.<id>.last_action，并可携带 effect 函数自定义世界变更），
 * 同时支持 onApplied 回调供观察者接入。
 */

import * as worldState from '../world-state.js';

// lastApplied 曾在 actions() 里写入后无人读取（返回值才是调用方拿到的结果），
// 属于「只写不读」的死状态，已删除（见 bin/flow-index.mjs 的 store/never-read 诊断）。
let opSeq = 0;

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function normalizeDecision(decision) {
  if (decision === null || typeof decision !== 'object' || Array.isArray(decision)) {
    throw new TypeError('dispatch.resolve: decision 必须为对象');
  }
  if (typeof decision.agentId !== 'string' || decision.agentId.trim() === '') {
    throw new TypeError('dispatch.resolve: decision.agentId 必须为非空字符串');
  }
  opSeq += 1;
  return {
    id: (typeof decision.id === 'string' && decision.id !== '') ? decision.id : `op_${opSeq}`,
    agentId: decision.agentId,
    action: (typeof decision.action === 'string' && decision.action !== '') ? decision.action : 'noop',
    params: clone(decision.params ?? {}),
    reason: decision.reason,
    confidence: decision.confidence,
    effect: typeof decision.effect === 'function' ? decision.effect : undefined,
    ts: Date.now(),
  };
}

/**
 * 归一化并校验一组决策，产出可提交的世界操作。
 * @param {object | object[]} decisions
 * @returns {object[]} 归一化后的操作数组
 */
export function resolve(decisions) {
  const list = Array.isArray(decisions) ? decisions : [decisions];
  return list.filter((d) => d != null).map(normalizeDecision);
}

/**
 * 提交一组操作到 world-state。
 * @param {object | object[]} resolved resolve 的输出
 * @param {{ onApplied?: (record: object, world: object) => void }} [opts]
 * @returns {object[]} 已提交的操作记录数组
 */
export function actions(resolved, opts = {}) {
  const list = Array.isArray(resolved) ? resolved : [resolved];
  const applied = [];
  for (const op of list) {
    if (op !== null && typeof op === 'object' && typeof op.effect === 'function') {
      op.effect(worldState);
    }
    const record = {
      id: op.id,
      agentId: op.agentId,
      action: op.action,
      params: clone(op.params ?? {}),
      reason: op.reason,
      confidence: op.confidence,
      ts: op.ts,
    };
    worldState.set(`agents.${op.agentId}.last_action`, record);
    if (typeof opts.onApplied === 'function') opts.onApplied(record, worldState);
    applied.push(record);
  }
  return applied.map(clone);
}

/** 复位行动执行状态（测试用）。 */
export function __reset() {
  opSeq = 0;
}
