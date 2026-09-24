/**
 * truman-town.social.graph.edges — 关系边 / Graph Edges
 *
 * 维护个体间关系边（类型 + 权重），随互动增减。以 graph store 持久化，排序对键去重
 *（a-b 与 b-a 同一条）。create 累加权重（同一对多次互动权重递增）、remove 软删除。
 * 可选把互动事实写入 agent.memory.semantic（dataflow），供决策召回复用。
 */

import * as graph from '../../infra/store/graph.js';
import * as semantic from '../../agent/memory/semantic.js';

const TYPE = 'social.graph.edge';
const PREFIX = 'edge:';

function assertId(id, label) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('graph.edges: ' + label + ' 必须为非空字符串');
  }
}

function sorted(a, b) {
  return a < b ? { a, b } : { a: b, b: a };
}

function nodeId(a, b) {
  const p = sorted(a, b);
  return PREFIX + p.a + ':' + p.b;
}

function clone(v) {
  return v === undefined ? undefined : structuredClone(v);
}

function load(a, b) {
  const node = graph.read(nodeId(a, b));
  if (node && node.data) return node.data;
  return null;
}

/** 创建/累加关系边：调用 social.graph.edges.create。 */
export function create({ a, b, type = 'interaction', weight = 1, note = null, memory = false } = {}) {
  assertId(a, 'a');
  assertId(b, 'b');
  if (a === b) throw new TypeError('graph.edges.create: 不能建立自环边');
  if (typeof weight !== 'number' || !Number.isFinite(weight)) {
    throw new TypeError('graph.edges.create: weight 必须为有限数值');
  }
  const p = sorted(a, b);
  const prev = load(a, b);
  const edge = prev ?? { a: p.a, b: p.b, type, weight: 0, count: 0, note: null, removed: false };
  edge.type = type;
  edge.weight = Math.max(0, edge.weight + weight);
  edge.count = (edge.count ?? 0) + 1;
  if (note !== null && note !== undefined) edge.note = note;
  edge.removed = false;
  edge.updatedAt = Date.now();
  graph.write({ id: nodeId(a, b), type: TYPE, data: edge });
  if (memory === true) {
    try {
      semantic.store(a, { content: '与 ' + b + ' 建立' + type + '关系', tags: ['relation', type], salience: 0.4 });
    } catch { /* 语义记忆不可用则跳过（边仍记录互动事实） */ }
  }
  return clone(edge);
}

/** 移除关系边：调用 social.graph.edges.remove（软删除）。 */
export function remove({ a, b } = {}) {
  assertId(a, 'a');
  assertId(b, 'b');
  const edge = load(a, b);
  if (edge === null) return null;
  edge.removed = true;
  edge.removedAt = Date.now();
  graph.write({ id: nodeId(a, b), type: TYPE, data: edge });
  return clone(edge);
}

/** 列出全部未删除关系边（辅助）。 */
export function list() {
  return graph.read({ type: TYPE }).map((n) => clone(n.data)).filter((e) => e && e.removed !== true);
}

/** 读取两节点间的边（辅助，无则 null）。 */
export function between({ a, b } = {}) {
  assertId(a, 'a');
  assertId(b, 'b');
  const edge = load(a, b);
  return edge === null || edge.removed === true ? null : clone(edge);
}

/** 复位底层 graph store（测试用）。 */
export function __reset() {
  graph.__reset();
}

