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

/**
 * 每个主体在**图与索引**中保留的最近情景条数。
 *
 * 情景记忆此前**完全没有上限**，是长跑里最大的增长源：
 * 实测 12 居民 100 tick 产生 8193 个 memory.episodic 节点（约 89 节点/tick，7.5 条/居民/tick），
 * 占全部图节点的 43%。照此每 1000 tick 将积累约 9 万个节点，
 * 而每次 read({type}) 都要遍历它们。
 */
const DEFAULT_HOT_LIMIT = 256;
/** 每个主体归档摘要的上限（超出后最旧的摘要丢弃）。 */
const DEFAULT_ARCHIVE_LIMIT = 1024;

/** @type {Map<string, Array<object>>} agentId → 该主体记忆 data（追加、写序=ts 升序）。 */
const byAgent = new Map();

/**
 * @type {Map<string, Array<object>>} agentId → 已淘汰情景的摘要（插入序 = 淘汰序）。
 * 摘要保留 ts/emotion/salience/tags 与截断后的 content，
 * 使「这个居民曾经经历过什么」在裁剪后仍可查询，而不是静默消失。
 */
const archive = new Map();

/** 累计淘汰 / 摘要丢弃计数（有界统计）。 */
let evicted = 0;
let dropped = 0;
/** 情景 id 的发号水位，用于区分「已淘汰」与「从未存在」。 */
let maxSeq = -1;

/** 上次校验的 graph 复位代数；graph 被直接 __reset 时使本索引失效。 */
let lastGeneration = -1;

/** graph 被上层直接 __reset 后，重建本派生索引（保证与图一致）。 */
function ensureFresh() {
  const gen = graph.__generation();
  if (gen !== lastGeneration) {
    rebuildFromGraph();
    lastGeneration = gen;
  }
}

/**
 * 从图重建索引。
 *
 * 情景记忆**全部**落图（write 无条件 graph.write），图即完整事实来源。
 * 原实现只 clear() 不重建：graph 复位（loop.reset / 存档恢复）后 list/recall
 * 一律返回空，而图里明明存着这些记忆。重建让索引与图重新一致。
 */
function rebuildFromGraph() {
  byAgent.clear();
  for (const node of graph.read({ type: TYPE })) {
    const d = node.data;
    if (!d || typeof d.agentId !== 'string' || d.agentId === '') continue;
    if (!byAgent.has(d.agentId)) byAgent.set(d.agentId, []);
    byAgent.get(d.agentId).push(d);
  }
  for (const [agentId, arr] of byAgent) {
    arr.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
    // 图里可能存有超过上限的历史（旧档，或上限引入前写入的存档）。
    // 重建后必须重新收敛，否则恢复一次就突破上限；超出部分一并从图删除。
    enforceLimit(agentId);
  }
}

// ---- 持久化：索引入档（与图互为印证，恢复后无需重扫全图） ----

/** 导出情景记忆索引。 */
export function __snapshot() {
  return {
    byAgent: [...byAgent.entries()].map(([k, v]) => [k, structuredClone(v)]),
    // 归档与水位必须入档：否则恢复后「已淘汰」会退化成「从未存在」，
    // 审计结论把「有界裁剪过」误报成「这条记忆从来没有过」。
    archive: [...archive.entries()].map(([k, v]) => [k, structuredClone(v)]),
    evicted,
    dropped,
    maxSeq,
  };
}

/**
 * 恢复情景记忆索引（整体替换）。
 * 必须在 graph.__restore 之后调用，并把 lastGeneration 对齐到新代数。
 * @param {{byAgent?: Array}} [data]
 */
export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('memory.episodic.__restore: 状态必须为对象');
  }
  byAgent.clear();
  for (const pair of (Array.isArray(data.byAgent) ? data.byAgent : [])) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    if (typeof pair[0] !== 'string' || pair[0] === '') continue;
    byAgent.set(pair[0], structuredClone(pair[1]));
  }
  archive.clear();
  for (const pair of (Array.isArray(data.archive) ? data.archive : [])) {
    if (!Array.isArray(pair) || pair.length < 2 || typeof pair[0] !== 'string') continue;
    archive.set(pair[0], structuredClone(pair[1]));
  }
  evicted = Number.isInteger(data.evicted) && data.evicted >= 0 ? data.evicted : 0;
  dropped = Number.isInteger(data.dropped) && data.dropped >= 0 ? data.dropped : 0;
  maxSeq = Number.isInteger(data.maxSeq) ? data.maxSeq : -1;
  lastGeneration = graph.__generation();
  return { agents: byAgent.size, archived: [...archive.values()].reduce((n, a) => n + a.length, 0) };
}

function nodeId(memoryId) {
  return PREFIX + memoryId;
}

/** 从 memory_000000000123 形式的情景 id 取出序号。 */
function seqOf(memoryId) {
  const m = /(\\d+)$/.exec(typeof memoryId === 'string' ? memoryId : '');
  if (m === null) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** 压缩成归档摘要：保留情感与时间骨架，content 截断以有界。 */
function summarize(ep) {
  const content = typeof ep.content === 'string' ? ep.content : '';
  return {
    memoryId: ep.memoryId,
    agentId: ep.agentId,
    ts: ep.ts,
    emotion: ep.emotion ?? null,
    salience: ep.salience,
    tags: ep.tags ?? [],
    content: content.length > 120 ? content.slice(0, 120) + '…' : content,
  };
}

/** 把一条被淘汰的情景压入该主体的归档（按主体有界）。 */
function pushArchive(agentId, ep) {
  if (!archive.has(agentId)) archive.set(agentId, []);
  const arr = archive.get(agentId);
  arr.push(summarize(ep));
  evicted += 1;
  while (arr.length > DEFAULT_ARCHIVE_LIMIT) {
    arr.shift();
    dropped += 1;
  }
  const seq = seqOf(ep.memoryId);
  if (seq !== null && seq > maxSeq) maxSeq = seq;
}

/**
 * 把某主体的情景收敛回上限之内。
 *
 * 必须**同时**从图与索引移除：只 shift 索引会留下无人引用的图节点，
 * 它们仍会被每次 read({type}) 遍历，并会在下一次 ensureFresh 重建时
 * 被当作有效记忆全部灌回索引——上限形同虚设。
 */
function enforceLimit(agentId) {
  const arr = byAgent.get(agentId);
  if (arr === undefined) return 0;
  let n = 0;
  while (arr.length > DEFAULT_HOT_LIMIT) {
    const oldest = arr.shift();
    graph.remove(nodeId(oldest.memoryId));
    pushArchive(agentId, oldest);
    n += 1;
  }
  return n;
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
  // D02：情景记忆承载「执行成本收益与失败原因」，并带执行引用（decisionId/actionId）
  // 以便从记忆反查 observer 日志。可选字段：不带时形状不变。
  if (episode.ref !== null && typeof episode.ref === 'object') normalized.ref = structuredClone(episode.ref);
  if (episode.outcome !== null && typeof episode.outcome === 'object') {
    normalized.outcome = structuredClone(episode.outcome);
  }
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
  const seq = seqOf(memoryId);
  if (seq !== null && seq > maxSeq) maxSeq = seq;
  // 热数据上限：超出后最旧的记忆从图与索引同时移除并归档。
  enforceLimit(agentId);
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
  archive.clear();
  evicted = 0;
  dropped = 0;
  maxSeq = -1;
  graph.__reset();
  identity.__reset();
}

// ---- 归档与查询面 ----

/**
 * 某主体已淘汰情景的摘要（插入序 = 淘汰序）。
 * 不传 agentId 时返回全部主体的扁平列表。
 */
export function archived(agentId) {
  ensureFresh();
  if (agentId === undefined) {
    return [...archive.values()].flat();
  }
  assertAgentId(agentId);
  return [...(archive.get(agentId) ?? [])];
}

/**
 * 解析一个情景引用，四态：
 *   hot（在图与索引中）/ archived（已淘汰，仅有摘要）
 *   / evicted（已淘汰且摘要也已丢弃）/ unknown（从未存在）。
 * 调用方据此能区分「历史被有界裁剪」与「这个 id 本就不存在」。
 * @param {string} memoryId
 */
export function lookup(memoryId) {
  ensureFresh();
  if (typeof memoryId !== 'string' || memoryId.trim() === '') {
    throw new TypeError('episodic.store.lookup: memoryId 必须为非空字符串');
  }
  const node = graph.read(nodeId(memoryId));
  if (node !== null && node !== undefined) {
    return { found: true, source: 'hot', id: memoryId, record: node.data, seq: seqOf(memoryId) };
  }
  const seq = seqOf(memoryId);
  for (const arr of archive.values()) {
    for (const rec of arr) {
      if (rec.memoryId === memoryId) {
        return { found: true, source: 'archived', id: memoryId, record: rec, seq };
      }
    }
  }
  if (seq !== null && seq <= maxSeq) return { found: false, source: 'evicted', id: memoryId, seq };
  return { found: false, source: 'unknown', id: memoryId, seq };
}

/** 有界统计：热区、归档、淘汰计数与覆盖区间。 */
export function stats() {
  ensureFresh();
  let hot = 0;
  let archivedCount = 0;
  let first = null;
  let last = null;
  for (const arr of byAgent.values()) {
    hot += arr.length;
    for (const ep of arr) {
      if (Number.isInteger(ep.ts)) {
        if (first === null || ep.ts < first) first = ep.ts;
        if (last === null || ep.ts > last) last = ep.ts;
      }
    }
  }
  for (const arr of archive.values()) archivedCount += arr.length;
  return {
    agents: byAgent.size,
    hot,
    hotLimit: DEFAULT_HOT_LIMIT,
    archived: archivedCount,
    archiveLimit: DEFAULT_ARCHIVE_LIMIT,
    evicted,
    dropped,
    maxSeq,
    tsRange: { first, last },
    graphNodes: graph.count({ type: TYPE }),
  };
}
