/**
 * truman-town.infra.store.graph — 图存储 / Graph Store
 *
 * 最小可用的内存图存储：以节点（node）为单位做幂等写入，按 id / type 读取，
 * 每个节点可携带出向边（edges）。作为沙盘底层持久化基座，被 config、社交图、
 * 空间拓扑等上层模块复用。
 *
 * 注意：MVP 阶段为进程内内存存储；所有读取返回深拷贝，避免调用方意外改写内部状态。
 */

/** @typedef {{ to: string, kind?: string, data?: Record<string, unknown> }} GraphEdge */
/** @typedef {{ id: string, type?: string, data?: Record<string, unknown>, edges?: GraphEdge[] }} GraphNode */

/** @type {Map<string, GraphNode>} */
const nodes = new Map();

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function validateNode(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError('graph.write: record 必须为对象');
  }
  if (typeof record.id !== 'string' || record.id.trim() === '') {
    throw new TypeError('graph.write: record.id 必须为非空字符串');
  }
  if (record.type !== undefined && typeof record.type !== 'string') {
    throw new TypeError('graph.write: record.type 必须为字符串');
  }
  if (record.data !== undefined && (record.data === null || typeof record.data !== 'object' || Array.isArray(record.data))) {
    throw new TypeError('graph.write: record.data 必须为普通对象');
  }
  if (record.edges !== undefined) {
    if (!Array.isArray(record.edges)) {
      throw new TypeError('graph.write: record.edges 必须为数组');
    }
    for (const edge of record.edges) {
      if (edge === null || typeof edge !== 'object' || typeof edge.to !== 'string' || edge.to.trim() === '') {
        throw new TypeError('graph.write: 每条 edge.to 必须为非空字符串');
      }
    }
  }
}

/**
 * 幂等写入（upsert）一个图节点及其出向边。
 * @param {GraphNode} record
 * @returns {GraphNode} 已落盘的节点快照
 */
export function write(record) {
  validateNode(record);
  const node = {
    id: record.id,
    type: record.type ?? null,
    data: clone(record.data ?? {}),
    edges: clone(record.edges ?? []),
  };
  nodes.set(record.id, node);
  return clone(node);
}

/**
 * 读取图节点。
 * - read()                → 全部节点数组
 * - read('id')            → 单个节点或 null
 * - read({ id })          → 单个节点或 null
 * - read({ type })        → 匹配 type 的节点数组
 * @param {string | { id?: string, type?: string } | undefined} [query]
 * @returns {GraphNode | GraphNode[] | null}
 */
export function read(query) {
  if (query === undefined || query === null) {
    return clone([...nodes.values()]);
  }
  if (typeof query === 'string') {
    const node = nodes.get(query);
    return node === undefined ? null : clone(node);
  }
  if (typeof query.id === 'string') {
    const node = nodes.get(query.id);
    return node === undefined ? null : clone(node);
  }
  if (typeof query.type === 'string') {
    return clone([...nodes.values()].filter((n) => n.type === query.type));
  }
  return clone([...nodes.values()]);
}

/** 清空全部节点（测试 / 复位用）。 */
export function __reset() {
  nodes.clear();
}
