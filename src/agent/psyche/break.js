/**
 * truman-town.agent.psyche.break — 精神崩溃 / Breakdown
 *
 * 创伤积累到阈值后触发崩溃，崩溃时决策质量下降（置信度惩罚 + 异常行为偏好），
 * 创伤缓解到恢复阈值后自动恢复；崩溃与恢复都写 observer 事件日志与情景记忆。
 * 极端崩溃（未来接入 lifecycle）可走向死亡。
 */

import * as trauma from './trauma.js';
import * as eventLog from '../../observer/recorder/event-log.js';
import * as episodic from '../memory/episodic/store.js';

const DEFAULT_THRESHOLD = 0.7;
const RECOVERY_RATIO = 0.5;

/** @type {Set<string>} 已崩溃的智能体 */
const brokenAgents = new Set();

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('break: agentId 必须为非空字符串');
  }
}

function assertTick(tick) {
  if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0) {
    throw new TypeError('break: tick 必须为非负整数');
  }
}

/**
 * 检查是否应触发崩溃或恢复，并按需自动触发/恢复。
 * @param {{ agentId: string, threshold?: number, tick?: number }} input
 * @returns {{ agentId: string, broken: boolean, level: number, threshold: number, recovering: boolean, transition: string|null }}
 */
export function check({ agentId, threshold = DEFAULT_THRESHOLD, tick = 0 } = {}) {
  assertAgentId(agentId);
  assertTick(tick);
  if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new TypeError('break.check: threshold 必须为 (0,1] 内的数值');
  }
  const level = trauma.query({ agentId }).level;
  const broken = brokenAgents.has(agentId);
  if (!broken && level >= threshold) {
    trigger({ agentId, tick });
    return { agentId, broken: true, level, threshold, recovering: false, transition: 'breakdown' };
  }
  if (broken && level < threshold * RECOVERY_RATIO) {
    recover({ agentId, tick });
    return { agentId, broken: false, level, threshold, recovering: true, transition: 'recovery' };
  }
  return { agentId, broken, level, threshold, recovering: false, transition: null };
}

/**
 * 触发崩溃：标记崩溃并写 observer 事件日志 + 情景记忆（幂等）。
 * @param {{ agentId: string, tick?: number }} input
 */
export function trigger({ agentId, tick = 0 } = {}) {
  assertAgentId(agentId);
  assertTick(tick);
  if (brokenAgents.has(agentId)) {
    return { agentId, broken: true, level: trauma.query({ agentId }).level, episode: null };
  }
  brokenAgents.add(agentId);
  const level = trauma.query({ agentId }).level;
  const memory = episodic.write(agentId, {
    content: '精神崩溃',
    emotion: 'breakdown',
    salience: 0.9,
    tags: ['psyche', 'breakdown'],
  });
  eventLog.record({ tick, topic: 'psyche.breakdown', payload: { agentId, level }, agentId });
  return { agentId, broken: true, level, episode: { memoryId: memory.memoryId, topic: 'psyche.breakdown' } };
}

/**
 * 从崩溃中恢复：清除崩溃标记并写 observer 事件日志 + 情景记忆（幂等）。
 * @param {{ agentId: string, tick?: number }} input
 */
export function recover({ agentId, tick = 0 } = {}) {
  assertAgentId(agentId);
  assertTick(tick);
  if (!brokenAgents.has(agentId)) {
    return { agentId, broken: false, level: trauma.query({ agentId }).level, episode: null };
  }
  brokenAgents.delete(agentId);
  const level = trauma.query({ agentId }).level;
  const memory = episodic.write(agentId, {
    content: '从崩溃中恢复',
    emotion: 'relief',
    salience: 0.6,
    tags: ['psyche', 'recovery'],
  });
  eventLog.record({ tick, topic: 'psyche.recovery', payload: { agentId, level }, agentId });
  return { agentId, broken: false, level, episode: { memoryId: memory.memoryId, topic: 'psyche.recovery' } };
}

/**
 * 输出崩溃对决策的影响（接入 agent.decision.selector 的 scoreFn）。
 * 崩溃时：基础分被置信度惩罚压低，异常行为（wander/panic）获得偏好。
 * @param {{ agentId: string }} input
 */
export function decisionModifier({ agentId } = {}) {
  assertAgentId(agentId);
  const broken = brokenAgents.has(agentId);
  const confidencePenalty = broken ? 0.4 : 0;
  const actionBias = broken ? { wander: 0.8, panic: 0.6 } : {};
  const scoreFn = (candidate) => {
    const base = typeof candidate.score === 'number' && Number.isFinite(candidate.score) ? candidate.score : 0;
    return base + (actionBias[candidate.action] ?? 0) - confidencePenalty;
  };
  return { agentId, broken, confidencePenalty, actionBias, scoreFn };
}

/** 复位崩溃状态（测试用）。 */
export function __reset() {
  brokenAgents.clear();
}

// ---- 持久化：崩溃集合必须进存档 ----

/**
 * 导出已崩溃居民集合。
 *
 * 崩溃状态直接改变决策（置信度惩罚 + 异常行为偏好），且由创伤累积触发。
 * 不入档则恢复后全城「精神健康」，崩溃/恢复事件与决策质量在续跑中失真。
 */
export function __snapshot() {
  return { brokenAgents: [...brokenAgents] };
}

/**
 * 恢复崩溃集合（整体替换）。
 * @param {{brokenAgents?: string[]}} [data]
 */
export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('break.__restore: 状态必须为对象');
  }
  brokenAgents.clear();
  const list = Array.isArray(data.brokenAgents) ? data.brokenAgents : [];
  for (const id of list) if (typeof id === 'string' && id !== '') brokenAgents.add(id);
  return { brokenAgents: brokenAgents.size };
}
