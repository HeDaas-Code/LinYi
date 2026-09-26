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

/** @type {Map<string, Set<string>>} type → ids 索引，让 read({ type }) 免全量扫描。 */
const byType = new Map();

/** 复位代数：每次 __reset 自增，供上层派生索引检测失效。 */
let generation = 0;

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

/**
 * 惰性只读视图：对象本身是薄壳，`data` / `edges` 首次读取时才 structuredClone 一次
 * 并缓存。读取语义与 clone 完全一致，但 `read({ type })` 不必为整批节点付出克隆成本。
 * 视图不可写（无 setter），因此调用方无法通过它改动内部状态。
 */
function lazyView(node) {
  if (node === undefined) return undefined;
  let data;
  let edges;
  return {
    get id() { return node.id; },
    get type() { return node.type; },
    get data() { if (data === undefined) data = clone(node.data); return data; },
    get edges() { if (edges === undefined) edges = clone(node.edges); return edges; },
  };
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
  const prev = nodes.get(record.id);
  if (prev && prev.type !== null && byType.has(prev.type)) {
    byType.get(prev.type).delete(record.id);
  }
  nodes.set(record.id, node);
  if (node.type !== null) {
    if (!byType.has(node.type)) byType.set(node.type, new Set());
    byType.get(node.type).add(record.id);
  }
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
    // **惰性克隆**：read({ type }) 是高频调用（48 个调用点，含每 tick 的家族/空间/
    // 文化/日志查询），而返回的数组里绝大多数节点调用方根本不会碰。
    // 此前整批 structuredClone，实测单次成本随节点数线性增长：
    // 300 节点 0.65ms / 3000 节点 7.8ms / 30000 节点 83ms，
    // 长跑后图里积累数万节点（日志与记忆），整个测试套件因此多花约 4.5 分钟。
    // 改为按需克隆：调用方一读 data/edges 才真正克隆那一个节点。
    // 对外语义（深拷贝、不可改写内部状态）保持不变。
    const ids = byType.get(query.type);
    if (ids === undefined || ids.size === 0) return [];
    const out = [];
    for (const id of ids) out.push(lazyView(nodes.get(id)));
    return out;
  }
  return clone([...nodes.values()]);
}

/** 清空全部节点（测试 / 复位用）。 */
export function __reset() {
  nodes.clear();
  byType.clear();
  generation += 1;
}

/** 返回当前复位代数（供派生索引判断是否需要失效重建）。 */
export function __generation() {
  return generation;
}
