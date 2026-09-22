/**
 * truman-town.town.map.topology — 空间拓扑 / Topology
 *
 * 用结构化数据组织避难所空间：登记地块（plot）与道路（road），记录坐标与
 * 邻接关系，为分区（zoning）与建筑布局提供拓扑底座。以 graph store 持久化。
 */

import * as graph from '../../infra/store/graph.js';

const TYPE_PLOT = 'town.topology.plot';
const TYPE_ROAD = 'town.topology.road';
const PREFIX = 'town:topology:';

function nodeId(id) {
  return PREFIX + id;
}

function assertId(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('topology: id 必须为非空字符串');
  }
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

/**
 * 规划（登记）一个地块或道路。
 * @param {{ id: string, kind?: 'plot'|'road', type?: string, x?: number, y?: number, adjacent?: string[] }} input
 * @returns {object} 已登记的拓扑节点快照
 */
export function plan(input = {}) {
  assertId(input.id);
  const kind = input.kind === 'road' ? 'road' : 'plot';
  const node = {
    id: input.id,
    kind,
    type: typeof input.type === 'string' && input.type !== '' ? input.type : 'open',
    x: typeof input.x === 'number' && Number.isFinite(input.x) ? input.x : 0,
    y: typeof input.y === 'number' && Number.isFinite(input.y) ? input.y : 0,
    adjacent: Array.isArray(input.adjacent) ? input.adjacent.map(String) : [],
  };
  graph.write({ id: nodeId(input.id), type: kind === 'road' ? TYPE_ROAD : TYPE_PLOT, data: node });
  return clone(node);
}

/**
 * 查询拓扑。
 * - query()        → 全部地块与道路
 * - query('id')    → 单个节点或 null
 * - query({kind})  → 按 kind（plot/road）过滤
 * @param {string | { kind?: 'plot'|'road' } | undefined} [query]
 * @returns {object | object[] | null}
 */
export function query(query) {
  const all = () => [
    ...graph.read({ type: TYPE_PLOT }),
    ...graph.read({ type: TYPE_ROAD }),
  ].map((n) => clone(n.data));
  if (query === undefined || query === null) return all();
  if (typeof query === 'string') {
    const n = graph.read(nodeId(query));
    return n === null ? null : clone(n.data);
  }
  if (query.kind === 'road') return graph.read({ type: TYPE_ROAD }).map((n) => clone(n.data));
  if (query.kind === 'plot') return graph.read({ type: TYPE_PLOT }).map((n) => clone(n.data));
  return all();
}

/**
 * 查询某节点的邻接列表（辅助方法）。
 * @param {string} id
 * @returns {string[]}
 */
export function adjacent(id) {
  assertId(id);
  const n = graph.read(nodeId(id));
  return n === null || n.data === undefined ? [] : clone(n.data.adjacent ?? []);
}

/** 复位底层 graph store（测试用）。 */
export function __reset() {
  graph.__reset();
}
