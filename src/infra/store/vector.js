/**
 * truman-town.infra.store.vector — 向量存储。
 *
 * 为记忆检索提供「语义近邻」能力：写入带向量的记录，按余弦相似度检索。
 *
 * 设计取舍：
 * - **默认零依赖**：不引入任何 embedding 模型，向量由调用方（ai.memory.embedding）
 *   提供。本模块只负责存储与相似度检索，因此在没有 onnxruntime 的环境下也能工作。
 * - **确定性**：同一批向量与查询，检索结果逐位一致（按 score 降序、id 升序打破并列），
 *   否则同种子重放会得到不同的记忆召回，破坏可复现性。
 * - 若记录未带向量，则退化为**词面重叠**打分（bag-of-words 的 Jaccard），
 *   保证即使没有 embedding 也能给出可用排序，而不是静默失败。
 */

/** 维度一致性：首次写入确定维度，之后拒绝不匹配的维度（早失败优于静默错配）。 */
let dim = null;
const rows = new Map();

/** 极小的停用词表：中文虚词 + 英文常见功能词。词面打分时剔除。 */
const STOPWORDS = new Set([
  '的', '了', '在', '是', '和', '与', '也', '就', '都', '而', '及', '或', '等', '被', '把', '对', '为',
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'of', 'to', 'in', 'on', 'and', 'or', 'for', 'with',
]);

/**
 * 词面切分：中文按单字 + 二元组（弥补无分词器），英文按单词。
 * 二元组让「避难所」与「避难」部分重叠，比纯单字更有区分度。
 */
function tokenize(text) {
  const out = [];
  const s = String(text ?? '').toLowerCase();
  for (const m of s.matchAll(/[a-z0-9]+/g)) {
    if (!STOPWORDS.has(m[0])) out.push(m[0]);
  }
  for (const m of s.matchAll(/[\u4e00-\u9fa5]+/g)) {
    const seg = m[0];
    for (let i = 0; i < seg.length; i += 1) {
      const ch = seg[i];
      if (STOPWORDS.has(ch)) continue;
      out.push(ch);
      if (i + 1 < seg.length) out.push(ch + seg[i + 1]);
    }
  }
  return out;
}

function cosine(a, b) {
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function jaccard(aTokens, bTokens) {
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  const a = new Set(aTokens); const b = new Set(bTokens);
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/**
 * 写入或覆盖一条向量记录。
 * @param {{id: string, vector?: number[], text?: string, meta?: object}} record
 */
export function upsert(record = {}) {
  const id = record.id;
  if (typeof id !== 'string' || id === '') throw new TypeError('vector.upsert: 需要非空 id');
  const vector = record.vector;
  if (vector !== undefined && vector !== null) {
    if (!Array.isArray(vector) || vector.some((x) => typeof x !== 'number' || !Number.isFinite(x))) {
      throw new TypeError('vector.upsert: vector 必须是有限数值数组');
    }
    if (dim === null) dim = vector.length;
    else if (vector.length !== dim) {
      throw new RangeError('vector.upsert: 维度不一致（期望 ' + dim + '，收到 ' + vector.length + '）');
    }
  }
  const text = typeof record.text === 'string' ? record.text : '';
  rows.set(id, {
    id,
    vector: vector ? vector.slice() : null,
    text,
    tokens: tokenize(text),
    meta: record.meta && typeof record.meta === 'object' ? { ...record.meta } : {},
  });
  return { id, dimension: dim, indexed: rows.size };
}

/**
 * 检索最相近的若干条。
 * 有向量时用余弦相似度；查询或记录缺向量时用词面 Jaccard 兜底。
 * @param {{vector?: number[], text?: string, limit?: number, filter?: object}} query
 */
export function search(query = {}) {
  const limit = Number.isInteger(query.limit) && query.limit > 0 ? query.limit : 5;
  const qVec = Array.isArray(query.vector) ? query.vector : null;
  const qTokens = tokenize(query.text ?? '');
  const useVector = qVec !== null && dim !== null && qVec.length === dim;
  const filter = query.filter && typeof query.filter === 'object' ? query.filter : null;
  const hits = [];
  for (const row of rows.values()) {
    if (filter) {
      let ok = true;
      for (const [k, v] of Object.entries(filter)) if (row.meta[k] !== v) { ok = false; break; }
      if (!ok) continue;
    }
    const score = useVector && row.vector ? cosine(qVec, row.vector) : jaccard(qTokens, row.tokens);
    if (score <= 0) continue;
    hits.push({ id: row.id, score, text: row.text, meta: row.meta });
  }
  // 确定性排序：score 降序，同分按 id 升序。
  hits.sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return hits.slice(0, limit);
}

export function list() {
  return [...rows.values()].map((r) => ({ id: r.id, text: r.text, meta: { ...r.meta }, hasVector: r.vector !== null }));
}

export function stats() {
  return { indexed: rows.size, dimension: dim };
}

export function __reset() {
  rows.clear();
  dim = null;
}
