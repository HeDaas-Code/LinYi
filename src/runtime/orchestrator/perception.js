/**
 * truman-town.runtime.orchestrator.perception — 感知分发 / Perception Dispatch
 *
 * 采集世界事件并分发给相关智能体，形成可感知上下文。MVP 采用显式事件列表：
 * collect(events) 归一化事件为 percept；route(percepts) 按事件 targets 或默认
 * 全体 agent 实体（registry 中 type=agent）分组，返回每个智能体的感知收件箱。
 */

import * as registry from '../registry.js';

let lastCollected = [];

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function normalizeEvent(event, i) {
  if (event === null || typeof event !== 'object' || Array.isArray(event)) {
    throw new TypeError('perception.collect: event 必须为对象');
  }
  return {
    id: (typeof event.id === 'string' && event.id !== '') ? event.id : `event_${i + 1}`,
    topic: typeof event.topic === 'string' && event.topic !== '' ? event.topic : 'world',
    data: clone(event.data ?? {}),
    targets: Array.isArray(event.targets) ? event.targets.map(String) : undefined,
    ts: typeof event.ts === 'number' ? event.ts : Date.now(),
  };
}

/**
 * 归一化并暂存一批世界事件。
 * @param {object | object[]} [events]
 * @returns {object[]} 归一化后的 percept 快照数组
 */
export function collect(events = []) {
  const list = Array.isArray(events) ? events : [events];
  lastCollected = list.map(normalizeEvent);
  return lastCollected.map(clone);
}

/**
 * 把 percept 分发给相关智能体。
 * @param {object[]} [percepts] 默认使用最近一次 collect 的结果
 * @param {{ agents?: string[] }} [opts] agents 缺省时为 registry 中全部 type=agent 实体
 * @returns {Record<string, object[]>} 每个 agentId 的感知收件箱
 */
export function route(percepts, opts = {}) {
  const list = percepts === undefined ? lastCollected : (Array.isArray(percepts) ? percepts : [percepts]);
  const targets = opts.agents ?? registry.lookup({ type: 'agent' }).map((e) => e.id);
  const inbox = {};
  for (const target of targets) inbox[target] = [];
  for (const p of list) {
    const recipients = p.targets ?? targets;
    for (const id of recipients) {
      if (id === undefined || id === null || id === '') continue;
      (inbox[id] ??= []).push(clone(p));
    }
  }
  return inbox;
}

/** 清空暂存感知（测试用）。 */
export function __reset() {
  lastCollected = [];
}
