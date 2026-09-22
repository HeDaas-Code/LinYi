/**
 * truman-town.town.map.zoning — 分区 / Zoning
 *
 * 划分商业、居住、公共等功能区并可重划；每个分区绑定若干地块并声明人口/建筑
 * 容量。以 graph store 持久化，作为建筑（structure）落位的依据。
 */

import * as graph from '../../infra/store/graph.js';

const TYPE = 'town.zoning';
const PREFIX = 'town:zoning:';
const KINDS = ['commercial', 'residential', 'public', 'industrial'];

function nodeId(id) {
  return PREFIX + id;
}

function assertId(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('zoning: id 必须为非空字符串');
  }
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function normalizeKind(kind) {
  const k = typeof kind === 'string' ? kind.toLowerCase() : 'residential';
  if (!KINDS.includes(k)) {
    throw new TypeError('zoning: 非法分区类型 "' + String(kind) + '"（须为 ' + KINDS.join('|') + '）');
  }
  return k;
}

/**
 * 划定一个分区。
 * @param {{ id: string, kind?: string, plots?: string[], capacity?: number }} input
 * @returns {object} 分区快照
 */
export function assign(input = {}) {
  assertId(input.id);
  const zone = {
    id: input.id,
    kind: normalizeKind(input.kind),
    plots: Array.isArray(input.plots) ? input.plots.map(String) : [],
    capacity: typeof input.capacity === 'number' && Number.isInteger(input.capacity) && input.capacity >= 0 ? input.capacity : 0,
  };
  graph.write({ id: nodeId(input.id), type: TYPE, data: zone });
  return clone(zone);
}

/**
 * 重划分区（改类型或容量，保留地块）。
 * @param {{ id: string, kind?: string, capacity?: number }} input
 * @returns {object} 重划后的分区快照
 */
export function rezone(input = {}) {
  assertId(input.id);
  const node = graph.read(nodeId(input.id));
  if (node === null || node.data === undefined) {
    throw new Error('zoning: 分区 "' + input.id + '" 不存在');
  }
  const zone = clone(node.data);
  if (input.kind !== undefined) zone.kind = normalizeKind(input.kind);
  if (typeof input.capacity === 'number' && Number.isInteger(input.capacity) && input.capacity >= 0) zone.capacity = input.capacity;
  graph.write({ id: nodeId(input.id), type: TYPE, data: zone });
  return clone(zone);
}

/**
 * 查询分区。
 * - query()        → 全部分区
 * - query('id')    → 单个分区或 null
 * - query({kind})  → 按类型过滤
 * @param {string | { kind?: string } | undefined} [query]
 * @returns {object | object[] | null}
 */
export function query(query) {
  const all = () => graph.read({ type: TYPE }).map((n) => clone(n.data));
  if (query === undefined || query === null) return all();
  if (typeof query === 'string') {
    const n = graph.read(nodeId(query));
    return n === null ? null : clone(n.data);
  }
  if (typeof query.kind === 'string') {
    const k = query.kind.toLowerCase();
    return graph.read({ type: TYPE }).filter((n) => n.data && n.data.kind === k).map((n) => clone(n.data));
  }
  return all();
}

/** 复位底层 graph store（测试用）。 */
export function __reset() {
  graph.__reset();
}
