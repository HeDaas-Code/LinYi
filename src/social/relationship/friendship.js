/**
 * truman-town.social.relationship.friendship — 友谊关系 / Friendship
 *
 * 更新友谊强度并记录互动历史。以 graph store 持久化：双向关系按排序对键
 * 去重（a-b 与 b-a 同一条），strength 夹在 [0,1]。
 */

import * as graph from '../../infra/store/graph.js';

const TYPE = 'social.friendship';
const PREFIX = 'friendship:';

function assertId(id, label) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('friendship: ' + label + ' 必须为非空字符串');
  }
}

function sorted(a, b) {
  return a < b ? { a, b } : { a: b, b: a };
}

function nodeId(a, b) {
  const p = sorted(a, b);
  return PREFIX + p.a + ':' + p.b;
}

function load(a, b) {
  const node = graph.read(nodeId(a, b));
  if (node && node.data) return node.data;
  const p = sorted(a, b);
  return { a: p.a, b: p.b, strength: 0, history: [] };
}

/**
 * 更新友谊强度（delta 累加，夹在 [0,1]）并追加互动记录。
 * @param {{ a: string, b: string, delta?: number, note?: string }} input
 * @returns 更新后的友谊快照
 */
export function update({ a, b, delta = 0.1, note } = {}) {
  assertId(a, 'a');
  assertId(b, 'b');
  if (typeof delta !== 'number' || !Number.isFinite(delta)) {
    throw new TypeError('friendship.update: delta 必须为有限数值');
  }
  const state = load(a, b);
  state.strength = Math.max(0, Math.min(1, state.strength + delta));
  state.history.push({ delta, note: note ?? null, ts: Date.now() });
  graph.write({ id: nodeId(a, b), type: TYPE, data: state });
  return structuredClone(state);
}

/**
 * 读取当前友谊强度（无记录返回 0）。
 * @param {{ a: string, b: string }} input
 * @returns {number}
 */
export function strength({ a, b } = {}) {
  assertId(a, 'a');
  assertId(b, 'b');
  return load(a, b).strength;
}

/** 复位底层 graph store（测试用）。 */
export function __reset() {
  graph.__reset();
}
