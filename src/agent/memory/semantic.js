/**
 * truman-town.agent.memory.semantic — 语义记忆 / Semantic Memory
 *
 * 存可检索的语义记忆条目（事件 → 摘要），recall 按相关度返回。
 *
 * 检索默认采用纯词面 / 标签匹配（字符级 Dice + 标签重合），不依赖 MiniLM
 * 语义质量——t36 实测 MiniLM 对中文短句区分度不足（top-3 6.3% vs stub 18.8%），
 * 故语义检索保持确定性、零依赖；未来若上中文语义模型再评估嵌入路径。
 */

import * as graph from '../../infra/store/graph.js';
import * as identity from '../../infra/identity.js';

const TYPE = 'memory.semantic';
const PREFIX = 'memory:semantic:';

const DEFAULT_WEIGHTS = Object.freeze({ lexicalWeight: 1, tagWeight: 1, salienceWeight: 0.3 });
const DEFAULT_MAX_ENTRIES = 64;

/** @type {Map<string, Array<object>>} agentId → 该主体语义记忆 data（追加，写序=ts 升序）。 */
const byAgent = new Map();
let lastGeneration = -1;

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
 * 只覆盖 **persist:true** 的条目（主循环默认 persist:false，那些条目图里没有）。
 * 重建的意义：旧档（v1，无 sections）恢复后至少能把落图的语义记忆找回来，
 * 而不是像原实现那样一律清空。
 */
function rebuildFromGraph() {
  byAgent.clear();
  for (const node of graph.read({ type: TYPE })) {
    const d = node.data;
    if (!d || typeof d.agentId !== 'string' || d.agentId === '') continue;
    if (!byAgent.has(d.agentId)) byAgent.set(d.agentId, []);
    byAgent.get(d.agentId).push(d);
  }
  // 必须在这里**重新施加上限**：图里可能存着超过 maxEntries 的历史
  //（例如旧档、或裁剪逻辑变更前的存档）。不裁剪的话，恢复一次就把内存上限
  // 突破了——实测 50 条入图、上限 8，重建后索引变成 50 条。
  // 同时把超出部分从**图**中删除：图是唯一事实来源，内存裁剪不删图
  // 就会留下无人引用却仍被每次 read({type}) 遍历的孤儿节点。
  for (const [agentId, arr] of byAgent) {
    arr.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
    if (arr.length > DEFAULT_MAX_ENTRIES) {
      const dropped = arr.splice(0, arr.length - DEFAULT_MAX_ENTRIES);
      graph.removeMany(dropped.map((d) => nodeId(d.memoryId)));
    }
  }
}

function nodeId(memoryId) {
  return PREFIX + memoryId;
}

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('memory.semantic: agentId 必须为非空字符串');
  }
}

function normalizeTags(tags) {
  const list = Array.isArray(tags) ? tags : tags === undefined ? [] : [tags];
  return [...new Set(list.map((t) => String(t)))];
}

function normalizeEntry(entry, memoryId, agentId) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new TypeError('memory.semantic: entry 必须为对象');
  }
  const ts = typeof entry.ts === 'number' ? entry.ts : Date.now();
  const salience = typeof entry.salience === 'number' && Number.isFinite(entry.salience) ? entry.salience : 0.5;
  const content = entry.content;
  const normalized = {
    memoryId,
    agentId,
    ts,
    content,
    salience,
    tags: normalizeTags(entry.tags),
    // 预分词缓存：入库时一次性分词，recall 直接复用，避免每 tick 重复分词（性能关键路径）。
    tokens: tokenize(content),
  };
  // D02：记忆必须能区分「意图」与「后果」，并携带可追溯的执行引用与成本收益。
  // 这两个字段是可选的：不带时形状与历史完全一致（老调用方与老测试不受影响）。
  if (entry.phase === 'intent' || entry.phase === 'outcome') normalized.phase = entry.phase;
  if (entry.ref !== null && typeof entry.ref === 'object') normalized.ref = structuredClone(entry.ref);
  if (entry.outcome !== null && typeof entry.outcome === 'object') {
    normalized.outcome = structuredClone(entry.outcome);
    // 结果记忆的可信度以实际结果为准：失败/空操作降低显著度，真实收益提高显著度。
    if (typeof entry.salience !== 'number') {
      normalized.salience = entry.outcome.ok === true ? 0.6 : 0.7;
    }
  }
  return normalized;
}

/** 词面分词：中文逐字、英文按词，供 Dice 相似度。 */
function tokenize(text) {
  const s = String(text ?? '').toLowerCase();
  const terms = [];
  let cur = '';
  const flush = () => { if (cur) { terms.push(cur); cur = ''; } };
  for (const ch of s) {
    if (/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(ch)) { flush(); terms.push(ch); continue; }
    if (/[a-z0-9_]/.test(ch)) { cur += ch; continue; }
    flush();
  }
  flush();
  return terms;
}

/** Dice 相似度：queryTerms/querySet 为查询侧（一次构建），entryTerms 为记忆条目预分词。 */
function dice(queryTerms, querySet, entryTerms) {
  if (queryTerms.length === 0 || entryTerms.length === 0) return 0;
  const sb = new Set(entryTerms);
  let inter = 0;
  for (const t of queryTerms) if (sb.has(t)) inter += 1;
  return (2 * inter) / (querySet.size + sb.size);
}

function tagOverlap(memoryTags, queryTags) {
  if (queryTags.length === 0) return 0;
  const set = new Set(memoryTags ?? []);
  let hit = 0;
  for (const t of queryTags) if (set.has(t)) hit += 1;
  return hit / queryTags.length;
}

/**
 * 写入一条语义记忆（事件 → 摘要）。每个主体最多保留 maxEntries 条（丢最旧）。
 * @param {string} agentId
 * @param {{ id?: string, ts?: number, content: unknown, salience?: number, tags?: string[] }} entry
 * @returns 已落盘快照
 */
export function store(agentId, entry, options = {}) {
  assertAgentId(agentId);
  ensureFresh();
  const memoryId = typeof entry?.id === 'string' && entry.id.trim() !== '' ? entry.id : identity.next('sem');
  const normalized = normalizeEntry({ ...entry }, memoryId, agentId);
  // 默认写图存储（跨模块可查、可持久化）；高频主循环传入 persist:false，
  // 只保留内存索引 —— 见 loop.js 调用点的说明：图里每多一个节点，
  // 所有 read({ type }) 全量查询都要为它付出代价。
  if (options.persist !== false) {
    graph.write({ id: nodeId(memoryId), type: TYPE, data: normalized });
  }
  if (!byAgent.has(agentId)) byAgent.set(agentId, []);
  const arr = byAgent.get(agentId);
  arr.push(normalized);
  const max = Number.isInteger(options.maxEntries) && options.maxEntries > 0 ? options.maxEntries : DEFAULT_MAX_ENTRIES;
  // 裁剪必须**同时**作用于内存索引与图。
  //
  // 既有缺陷：这里原先只 arr.shift()（内存），persist:true 时图里的节点被留了下来。
  // 实测 50 条写入 + 上限 8 → 索引 8 条、图里 50 条，留下 42 个**无人引用**的孤儿节点；
  // 它们没有任何查询路径能读到，却让每次 read({type:'memory.semantic'}) 都要遍历，
  // 并且会在下一次 ensureFresh 重建时被当作有效记忆重新灌回索引（上限被突破）。
  // 语义内存裁剪不得留下不可追踪的图节点——这是本模块的核心契约。
  while (arr.length > max) {
    const dropped = arr.shift();
    if (options.persist !== false) graph.remove(nodeId(dropped.memoryId));
  }
  return structuredClone(normalized);
}

/** 列出某主体全部语义记忆（ts 升序，深拷贝）。 */
export function list(agentId) {
  assertAgentId(agentId);
  ensureFresh();
  const arr = byAgent.get(agentId);
  if (arr === undefined || arr.length === 0) return [];
  return structuredClone([...arr].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0)));
}

function compareScoreDesc(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  return (a.entry.ts ?? 0) - (b.entry.ts ?? 0);
}

/**
 * 按相关度召回语义记忆（词面 + 标签 + 显著性，top-K）。
 * @param {string} agentId
 * @param {string | { text?: string, tags?: string[] }} query
 * @param {{ limit?: number, lexicalWeight?: number, tagWeight?: number, salienceWeight?: number }} [options]
 * @returns {Array<object>}
 */
export function recall(agentId, query, options = {}) {
  assertAgentId(agentId);
  ensureFresh();
  const q = typeof query === 'string' ? { text: query } : (query ?? {});
  const queryText = typeof q.text === 'string' ? q.text : String(q.text ?? '');
  const queryTags = normalizeTags(q.tags);
  const queryTerms = tokenize(queryText);
  const querySet = new Set(queryTerms);

  const weights = { ...DEFAULT_WEIGHTS };
  if (typeof options.lexicalWeight === 'number') weights.lexicalWeight = options.lexicalWeight;
  if (typeof options.tagWeight === 'number') weights.tagWeight = options.tagWeight;
  if (typeof options.salienceWeight === 'number') weights.salienceWeight = options.salienceWeight;

  const arr = byAgent.get(agentId) ?? [];
  const scored = [];
  for (const entry of arr) {
    const lex = dice(queryTerms, querySet, entry.tokens ?? tokenize(entry.content));
    const tag = tagOverlap(entry.tags, queryTags);
    const sal = typeof entry.salience === 'number' ? entry.salience : 0;
    scored.push({ entry, score: weights.lexicalWeight * lex + weights.tagWeight * tag + weights.salienceWeight * sal });
  }
  scored.sort(compareScoreDesc);

  const limit = Number.isInteger(options.limit) && options.limit >= 0 ? options.limit : undefined;
  const sliced = limit === undefined ? scored : scored.slice(0, limit);
  return structuredClone(sliced.map((s) => ({ ...s.entry, score: s.score })));
}

/** 复位底层 graph store 与派生索引（测试用）。 */
export function __reset() {
  byAgent.clear();
  lastGeneration = -1;
  graph.__reset();
  identity.__reset();
}

// ---- 持久化：内存索引必须进存档 ----

/**
 * 导出内存索引。
 *
 * **为什么必须显式入档**：主循环用 persist:false 写语义记忆（性能取舍：
 * 每多一个图节点，所有 read({type}) 全量查询都要付代价）。这些条目**只在
 * byAgent 里**、图里没有；而 byAgent 又按 graph.__generation() 失效重建——
 * 如果只靠图重建，这些记忆会全部消失，恢复后居民的语义召回为空。
 * 故这里显式采集整个 byAgent 索引。
 */
export function __snapshot() {
  return { byAgent: structuredClone([...byAgent.entries()]) };
}

/**
 * 恢复内存索引。
 *
 * 顺序要求：必须在 graph.__restore 之后调用，且把 lastGeneration 对齐到
 * 当前代数——否则 ensureFresh() 会认为索引过期并在下一次读写时清空它。
 * @param {{byAgent?: Array}} [data]
 */
export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('memory.semantic.__restore: 状态必须为对象');
  }
  byAgent.clear();
  const list = Array.isArray(data.byAgent) ? data.byAgent : [];
  for (const pair of list) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    if (typeof pair[0] !== 'string' || pair[0] === '') continue;
    byAgent.set(pair[0], structuredClone(pair[1]));
  }
  // 对齐代数，避免刚恢复的索引被 ensureFresh 当作过期数据清掉。
  lastGeneration = graph.__generation();
  return { agents: byAgent.size };
}
