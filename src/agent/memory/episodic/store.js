/**
 * truman-town.agent.memory.episodic.store — 情景写入 / Episodic Store
 *
 * 写入并标注带情感标记的情景事件。以 graph store 为基座：每个事件是
 * type=memory.episodic 的图节点，data 含 ts / content / emotion / salience / tags。
 *
 * 为消除 recall 每 tick 全量深拷贝全量记忆的 O(t²)，本模块额外维护一份
 * 按 agentId 分组的追加索引（byAgent：agentId → 已归一化的 data 数组），
 * recall 通过 _rawList() 取只读引用做有界 top-K，仅对命中的 ≤limit 条做深拷贝。
 */

import * as graph from '../../../infra/store/graph.js';
import * as identity from '../../../infra/identity.js';

const TYPE = 'memory.episodic';
const PREFIX = 'memory:episodic:';

/** recall 时间衰减半衰期（毫秒），与 recaller 默认一致；用于预计算 recency 键。 */
export const DEFAULT_HALFLIFE = 86400000;

/** @type {Map<string, Array<object>>} agentId → 该主体记忆 data（追加、写序=ts 升序）。 */
const byAgent = new Map();

/** 上次校验的 graph 复位代数；graph 被直接 __reset 时使本索引失效。 */
let lastGeneration = -1;

/** graph 被上层直接 __reset 后，重建本派生索引（保证与图一致）。 */
function ensureFresh() {
  const gen = graph.__generation();
  if (gen !== lastGeneration) {
    byAgent.clear();
    lastGeneration = gen;
  }
}

function nodeId(memoryId) {
  return PREFIX + memoryId;
}

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('episodic.store: agentId 必须为非空字符串');
  }
}

function normalizeTags(tags) {
  const list = Array.isArray(tags) ? tags : tags === undefined ? [] : [tags];
  return [...new Set(list.map((t) => String(t)))];
}

function normalizeEpisode(episode, memoryId) {
  if (episode === null || typeof episode !== 'object' || Array.isArray(episode)) {
    throw new TypeError('episodic.store: episode 必须为对象');
  }
  const ts = typeof episode.ts === 'number' ? episode.ts : Date.now();
  const salience =
    typeof episode.salience === 'number' && Number.isFinite(episode.salience) ? episode.salience : 0.5;
  const normalized = {
    memoryId,
    agentId: episode.agentId,
    ts,
    content: episode.content,
    emotion: episode.emotion ?? null,
    salience,
    tags: normalizeTags(episode.tags),
  };
  // 预计算时间衰减键（非枚举，structuredClone 不会带出，API 形状不变）；
  // recall 侧据此免去每条记忆一次 Math.exp，把召回钳制为线性扫瞄、常量级指数运算。
  Object.defineProperty(normalized, '_recencyKey', {
    value: Math.exp(ts / DEFAULT_HALFLIFE),
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return normalized;
}

/**
 * 写入一条情景记忆。
 * @param {string} agentId
 * @param {{ id?: string, ts?: number, content: unknown, emotion?: string, salience?: number, tags?: string[] }} episode
 * @returns 已落盘的事件快照
 */
export function write(agentId, episode) {
  assertAgentId(agentId);
  ensureFresh();
  const memoryId =
    typeof episode?.id === 'string' && episode.id.trim() !== '' ? episode.id : identity.next('mem');
  const normalized = normalizeEpisode({ ...episode, agentId }, memoryId);
  graph.write({
    id: nodeId(memoryId),
    type: TYPE,
    data: normalized,
  });
  if (!byAgent.has(agentId)) byAgent.set(agentId, []);
  byAgent.get(agentId).push(normalized);
  return structuredClone(normalized);
}

/**
 * 为已存在的情景记忆追加标签（幂等合并，去重）。
 * @param {string} memoryId
 * @param {string | string[]} tags
 * @returns 更新后的事件快照，或 null（记忆不存在）
 */
export function tag(memoryId, tags) {
  ensureFresh();
  if (typeof memoryId !== 'string' || memoryId.trim() === '') {
    throw new TypeError('episodic.store.tag: memoryId 必须为非空字符串');
  }
  const node = graph.read(nodeId(memoryId));
  if (node === null || node.data === undefined) return null;
  const merged = [...new Set([...(node.data.tags ?? []), ...normalizeTags(tags)])];
  graph.write({ id: node.id, type: node.type, data: { ...node.data, tags: merged } });
  // 同步索引副本（tag 非常用 API，此处线性查找可接受）
  const arr = byAgent.get(node.data.agentId);
  if (arr) {
    const entry = arr.find((m) => m.memoryId === memoryId);
    if (entry) entry.tags = merged;
  }
  return structuredClone(graph.read(nodeId(memoryId)).data);
}

/**
 * 列出某智能体的全部情景记忆（按 ts 升序，返回深拷贝，供公开 API 使用）。
 * @param {string} agentId
 * @returns {Array<object>}
 */
export function list(agentId) {
  assertAgentId(agentId);
  ensureFresh();
  const arr = byAgent.get(agentId);
  if (arr === undefined || arr.length === 0) return [];
  return structuredClone([...arr].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0)));
}

/**
 * 内部只读访问：返回某主体记忆 data 的追加数组（不深拷贝）。
 * recall 只做过滤/排序（不原地改写条目），故可直接消费该引用。
 * @param {string} agentId
 * @returns {Array<object>}
 */
export function _rawList(agentId) {
  ensureFresh();
  return byAgent.get(agentId) ?? [];
}

/** 复位底层 graph store 与 ID 计数器（测试用）。 */
export function __reset() {
  byAgent.clear();
  graph.__reset();
  identity.__reset();
}
