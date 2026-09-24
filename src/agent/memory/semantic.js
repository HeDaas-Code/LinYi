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
    byAgent.clear();
    lastGeneration = gen;
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
  return {
    memoryId,
    agentId,
    ts,
    content,
    salience,
    tags: normalizeTags(entry.tags),
    // 预分词缓存：入库时一次性分词，recall 直接复用，避免每 tick 重复分词（性能关键路径）。
    tokens: tokenize(content),
  };
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
  graph.write({ id: nodeId(memoryId), type: TYPE, data: normalized });
  if (!byAgent.has(agentId)) byAgent.set(agentId, []);
  const arr = byAgent.get(agentId);
  arr.push(normalized);
  const max = Number.isInteger(options.maxEntries) && options.maxEntries > 0 ? options.maxEntries : DEFAULT_MAX_ENTRIES;
  while (arr.length > max) arr.shift();
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
