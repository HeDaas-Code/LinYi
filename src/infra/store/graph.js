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

/**
 * 删除单个图节点（连同 byType 索引项）。
 *
 * **刻意不推进 generation**：删除是维护操作，不是「换了一个世界」。
 * 派生索引里有一部分是**内存专属**的（reputation 的 history、posts 的 replies、
 * trauma 的事件链），而 rebuildFromGraph 只能从图恢复标量、会把这些内存专属部分
 * 置空。若在这里推进代数，一次例行裁剪就会把上述历史全部抹掉。
 * 因此调用方（裁剪方）有责任同步维护自己的派生索引。
 * @param {string} id
 * @returns {boolean} 是否确实删除了一个节点
 */
export function remove(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('graph.remove: id 必须为非空字符串');
  }
  const node = nodes.get(id);
  if (node === undefined) return false;
  nodes.delete(id);
  if (node.type !== null && byType.has(node.type)) {
    const set = byType.get(node.type);
    set.delete(id);
    if (set.size === 0) byType.delete(node.type);
  }
  return true;
}

/**
 * 批量删除图节点。
 * @param {Iterable<string>} ids
 * @returns {number} 实际删除的数量
 */
export function removeMany(ids) {
  let n = 0;
  for (const id of ids ?? []) { if (remove(id)) n += 1; }
  return n;
}

/**
 * 统计节点数量。
 * - count()          → 全部节点数
 * - count({ type })  → 该类型的节点数（O(1)，走 byType 索引）
 * @param {{ type?: string } | undefined} [query]
 * @returns {number}
 */
export function count(query) {
  if (query === undefined || query === null) return nodes.size;
  if (typeof query.type === 'string') {
    const set = byType.get(query.type);
    return set === undefined ? 0 : set.size;
  }
  return nodes.size;
}

/**
 * 按类型裁剪：只保留**最新**的 keep 个节点，返回被移除节点的快照（最旧在前）。
 *
 * 「最新」= byType 索引的插入顺序。write() 对已存在的节点会先从索引摘除再重新
 * 加入，因此该顺序等价于「最后一次写入的先后」——对追加型日志即创建顺序。
 *
 * 这是热数据上限的底座原语：图是唯一的事实来源，上限必须落在图上，
 * 只在调用方的内存索引里裁剪会留下**无人引用却仍被全量查询遍历**的孤儿节点
 * （见 agent.memory.semantic 的既有缺陷）。
 * @param {{ type: string, keep: number }} input
 * @returns {Array<object>} 被移除的节点快照
 */
export function trimOldest(input = {}) {
  const { type, keep } = input;
  if (typeof type !== 'string' || type.trim() === '') {
    throw new TypeError('graph.trimOldest: type 必须为非空字符串');
  }
  if (!Number.isInteger(keep) || keep < 0) {
    throw new TypeError('graph.trimOldest: keep 必须为非负整数');
  }
  const set = byType.get(type);
  if (set === undefined) return [];
  const over = set.size - keep;
  if (over <= 0) return [];
  // Set 迭代器没有 remove()；先把待删 id 收齐再统一删除。
  const doomed = [];
  for (const id of set) {
    if (doomed.length >= over) break;
    doomed.push(id);
  }
  const removed = [];
  for (const id of doomed) {
    const node = nodes.get(id);
    if (node !== undefined) removed.push(clone(node));
    nodes.delete(id);
    set.delete(id);
  }
  if (set.size === 0) byType.delete(type);
  return removed;
}

/**
 * 按类型返回 id 列表（插入顺序 = 最后一次写入顺序）。
 * 供上层做有界裁剪时按序扫描，避免每次全量 read({type}) 的惰性视图开销。
 * @param {{ type: string }} input
 * @returns {string[]}
 */
export function ids(input = {}) {
  const { type } = input;
  if (typeof type !== 'string' || type.trim() === '') {
    throw new TypeError('graph.ids: type 必须为非空字符串');
  }
  const set = byType.get(type);
  return set === undefined ? [] : [...set];
}

/**
 * 原地替换某节点的 data，**不改变 byType 索引中的位置**。
 *
 * write() 对已存在的 id 会先从索引摘除再重新加入，节点因此被移到末尾。
 * 对追加型日志这是错的：压缩旧记录会把它们挪到最新位置，
 * 追加顺序（= 审计顺序）随之被打乱，且「最旧」的判断也会失真。
 * 本函数只换 data，保留位置与 type 索引，也不推进 generation
 * （压缩不改变「世界状态」，不应让派生索引整体失效）。
 * @param {string} id
 * @param {object} data
 * @returns {boolean} 节点是否存在并被替换
 */
export function patch(id, data) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('graph.patch: id 必须为非空字符串');
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new TypeError('graph.patch: data 必须为普通对象');
  }
  const node = nodes.get(id);
  if (node === undefined) return false;
  node.data = clone(data);
  return true;
}

/**
 * 读取某节点的**内部引用**（不克隆）。
 *
 * 仅供维护路径（有界裁剪、压缩、统计）使用：这些路径每个 tick 要检查成千上万个节点，
 * 走 read() 的深拷贝会让裁剪本身成为 O(n²) 的热点（实测长跑下 280s 超时）。
 *
 * **调用方不得修改返回值**：它指向内部状态，改写会绕过 write() 的校验与索引维护。
 * 对外/业务查询一律使用 read()。
 * @param {string} id
 * @returns {GraphNode | null}
 */
export function peek(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('graph.peek: id 必须为非空字符串');
  }
  const node = nodes.get(id);
  return node === undefined ? null : node;
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

// ---- 持久化：图存储是全系统主状态载体 ----

/**
 * 导出全部图节点（深拷贝）。
 *
 * 这是存档的主体：居民、账户、建筑、关系、规范、编年志段等都以节点形式
 * 存在这里。derived 索引（semantic/episodic/trauma/posts/tagset 的进程内 Map）
 * **不进存档**——它们全部按 graph.__generation() 失效重建，恢复后首次读取
 * 会自动从图重建，故不入档反而避免了「索引与图不一致」这一整类缺陷。
 */
export function __snapshot() {
  return { records: clone([...nodes.values()]), generation };
}

/**
 * 用一份记录集整体替换图存储（非合并），并推进代数使派生索引全部失效。
 *
 * 代数必须递增：否则恢复后仍持有旧图的派生索引（例如 semantic 的 byAgent），
 * 会返回上一个世界的记忆。这正是「恢复后缓存不读旧世界」的落点。
 * @param {{records?: Array<GraphNode>}} [data]
 */
export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('graph.__restore: 状态必须为对象');
  }
  const records = Array.isArray(data.records) ? data.records : [];
  nodes.clear();
  byType.clear();
  generation += 1;
  for (const rec of records) write(rec);
  return { records: nodes.size, generation };
}
