/**
 * truman-town.agent.memory.episodic.store — 情景写入 / Episodic Store
 *
 * 写入并标注带情感标记的情景事件。以 graph store 为基座：每个事件是
 * type=memory.episodic 的图节点，data 含 ts / content / emotion / salience / tags。
 */

import * as graph from '../../../infra/store/graph.js';
import * as identity from '../../../infra/identity.js';

const TYPE = 'memory.episodic';
const PREFIX = 'memory:episodic:';

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
  return {
    memoryId,
    agentId: episode.agentId,
    ts,
    content: episode.content,
    emotion: episode.emotion ?? null,
    salience,
    tags: normalizeTags(episode.tags),
  };
}

/**
 * 写入一条情景记忆。
 * @param {string} agentId
 * @param {{ id?: string, ts?: number, content: unknown, emotion?: string, salience?: number, tags?: string[] }} episode
 * @returns 已落盘的事件快照
 */
export function write(agentId, episode) {
  assertAgentId(agentId);
  const memoryId =
    typeof episode?.id === 'string' && episode.id.trim() !== '' ? episode.id : identity.next('mem');
  const normalized = normalizeEpisode({ ...episode, agentId }, memoryId);
  graph.write({
    id: nodeId(memoryId),
    type: TYPE,
    data: normalized,
  });
  return structuredClone(normalized);
}

/**
 * 为已存在的情景记忆追加标签（幂等合并，去重）。
 * @param {string} memoryId
 * @param {string | string[]} tags
 * @returns 更新后的事件快照，或 null（记忆不存在）
 */
export function tag(memoryId, tags) {
  if (typeof memoryId !== 'string' || memoryId.trim() === '') {
    throw new TypeError('episodic.store.tag: memoryId 必须为非空字符串');
  }
  const node = graph.read(nodeId(memoryId));
  if (node === null || node.data === undefined) return null;
  const merged = [...new Set([...(node.data.tags ?? []), ...normalizeTags(tags)])];
  graph.write({ id: node.id, type: node.type, data: { ...node.data, tags: merged } });
  return structuredClone(graph.read(nodeId(memoryId)).data);
}

/**
 * 列出某智能体的全部情景记忆（按 ts 升序）。
 * @param {string} agentId
 * @returns {Array<object>}
 */
export function list(agentId) {
  assertAgentId(agentId);
  const all = graph.read({ type: TYPE });
  const filtered = all.filter((node) => node.data && node.data.agentId === agentId);
  return structuredClone(
    filtered.map((node) => node.data).sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0)),
  );
}

/** 复位底层 graph store 与 ID 计数器（测试用）。 */
export function __reset() {
  graph.__reset();
  identity.__reset();
}
