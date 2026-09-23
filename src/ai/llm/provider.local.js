/**
 * truman-town.ai.llm.provider.local — 本地嵌入 provider（onnxruntime + MiniLM）
 *
 * 为 gateway.embed 提供“内嵌本地小嵌入模型”推理：WordPiece 分词 + ONNX 推理 +
 * attention_mask 加权 mean-pooling + L2 归一化，输出 384 维向量（all-MiniLM-L6-v2）。
 *
 * 零依赖原则：
 *   - 本模块不静态 import onnxruntime-node，只在首次 embed 时惰性动态 import；
 *     依赖未装 / 模型缺失 / 推理异常时自动回退到确定性 hash 向量，绝不抛出到调用方。
 *   - 默认（未显式 useLocalEmbed / TRUMAN_EMBED_PROVIDER=local）仍走 stub 嵌入。
 *
 * complete 不支持（本地仅做嵌入），调用抛明确错误，请改用 stub / A6API provider。
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const DEFAULT_DIM = 384;
export const LOCAL_MODEL_NAME = 'local-MiniLM-L6-v2';

function projectRoot() {
  // src/ai/llm -> 项目根目录（上溯三级）
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

/** 默认模型目录：TRUMAN_EMBED_MODEL_DIR 优先，否则 <project>/models/all-MiniLM-L6-v2。 */
export function defaultModelDir(env) {
  const e = env ?? process.env;
  const dir = e.TRUMAN_EMBED_MODEL_DIR;
  if (typeof dir === 'string' && dir.trim() !== '') return dir.trim();
  return path.join(projectRoot(), 'models', 'all-MiniLM-L6-v2');
}

// --- 确定性回退向量（依赖/模型不可用时的 stub 替代） ---
function hashUint(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function deterministicVector(text, dim) {
  const vec = new Array(dim);
  let s = hashUint(String(text ?? ''));
  for (let i = 0; i < dim; i += 1) {
    s = (Math.imul(s, 0x01000193) ^ (i + 0x9e3779b9)) >>> 0;
    vec[i] = ((s % 2001) - 1000) / 1000;
  }
  return vec;
}

// --- WordPiece 预分词（英文按词、中文按字、标点独立） ---
const CJK_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
const WORD_CHAR_RE = /[A-Za-z0-9_]/;

function isCjk(ch) {
  return CJK_RE.test(ch);
}

export function preTokenize(text) {
  const s = String(text ?? '').toLowerCase();
  const words = [];
  let cur = '';
  const flush = () => { if (cur) { words.push(cur); cur = ''; } };
  for (const ch of s) {
    if (/\s/.test(ch)) { flush(); continue; }
    if (isCjk(ch)) { flush(); words.push(ch); continue; }
    if (WORD_CHAR_RE.test(ch)) { cur += ch; continue; }
    flush(); words.push(ch);
  }
  flush();
  return words;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** 构建 WordPiece 分词器（贪心最长匹配）。 */
export function buildWordPieceTokenizer(vocab, opts = {}) {
  const unkId = opts.unkId ?? 100;
  const clsId = opts.clsId ?? 101;
  const sepId = opts.sepId ?? 102;
  const maxChars = opts.maxInputCharsPerWord ?? 100;
  const prefix = opts.continuingSubwordPrefix ?? '##';

  function tokenizeWord(word) {
    const ids = [];
    if (word.length > maxChars) { ids.push(unkId); return ids; }
    let start = 0;
    while (start < word.length) {
      let end = word.length;
      let matched = null;
      while (start < end) {
        const candidate = (start > 0 ? prefix : '') + word.slice(start, end);
        if (hasOwn(vocab, candidate)) { matched = candidate; break; }
        end -= 1;
      }
      if (matched === null) { ids.push(unkId); break; }
      ids.push(vocab[matched]);
      start = end;
    }
    return ids;
  }

  function tokenize(text) {
    const ids = [clsId];
    for (const w of preTokenize(text)) {
      for (const id of tokenizeWord(w)) ids.push(id);
    }
    ids.push(sepId);
    return {
      inputIds: ids,
      attentionMask: ids.map(() => 1),
      tokenTypeIds: ids.map(() => 0),
    };
  }

  return { tokenize, vocab };
}

/** attention_mask 加权 mean-pooling + L2 归一化（隐藏层 [1,T,D] → D 维单位向量）。 */
export function meanPoolNormalize(hiddenTensor, attentionMask) {
  const data = hiddenTensor.data;
  const dims = hiddenTensor.dims;
  const T = dims[1];
  const D = dims[2];
  const vec = new Array(D).fill(0);
  let maskSum = 0;
  for (let t = 0; t < T; t += 1) {
    const w = attentionMask[t];
    maskSum += w;
    for (let d = 0; d < D; d += 1) vec[d] += data[t * D + d] * w;
  }
  const denom = maskSum > 0 ? maskSum : 1;
  for (let d = 0; d < D; d += 1) vec[d] /= denom;
  let norm = 0;
  for (let d = 0; d < D; d += 1) norm += vec[d] * vec[d];
  norm = Math.sqrt(norm);
  const scale = norm > 0 ? norm : 1;
  const out = new Array(D);
  for (let d = 0; d < D; d += 1) out[d] = vec[d] / scale;
  return out;
}

/** 生产加载器：读 tokenizer.json + 惰性 import onnxruntime-node + 建会话。 */
async function loadBackend({ modelDir, dim }) {
  const tokenizerPath = path.join(modelDir, 'tokenizer.json');
  const modelPath = path.join(modelDir, 'onnx', 'model.onnx');

  const raw = await readFile(tokenizerPath, 'utf8');
  const tokenizerJson = JSON.parse(raw);
  const model = tokenizerJson?.model ?? {};
  const vocab = model.vocab;
  if (vocab === null || typeof vocab !== 'object') {
    throw new Error('provider.local: tokenizer.json 缺少 model.vocab');
  }
  const { tokenize } = buildWordPieceTokenizer(vocab, {
    unkId: hasOwn(vocab, '[UNK]') ? vocab['[UNK]'] : 100,
    clsId: hasOwn(vocab, '[CLS]') ? vocab['[CLS]'] : 101,
    sepId: hasOwn(vocab, '[SEP]') ? vocab['[SEP]'] : 102,
    continuingSubwordPrefix: model.continuing_subword_prefix,
    maxInputCharsPerWord: model.max_input_chars_per_word,
  });

  // 惰性 import：依赖未装时在此抛错，由 createProvider 回退 stub。
  const ort = await import('onnxruntime-node');
  const session = await ort.InferenceSession.create(modelPath);

  async function run({ inputIds, attentionMask, tokenTypeIds }) {
    const T = inputIds.length;
    const feeds = {
      input_ids: new ort.Tensor('int64', BigInt64Array.from(inputIds, (n) => BigInt(n)), [1, T]),
      attention_mask: new ort.Tensor('int64', BigInt64Array.from(attentionMask, (n) => BigInt(n)), [1, T]),
      token_type_ids: new ort.Tensor('int64', BigInt64Array.from(tokenTypeIds, (n) => BigInt(n)), [1, T]),
    };
    const results = await session.run(feeds);
    return results.last_hidden_state;
  }

  return { tokenize, run };
}

/**
 * 创建本地嵌入 provider（形态与 provider.a6api.js 一致：name/model/embedModel/complete/embed）。
 * @param {{ modelDir?: string, dim?: number, _load?: Function }} [opts]
 *   _load 为测试注入点：async ({ modelDir, dim }) => ({ tokenize, run })。
 */
export function createProvider(opts = {}) {
  const { modelDir, dim = DEFAULT_DIM, _load = null } = opts;
  const resolvedModelDir = modelDir || defaultModelDir();
  const state = { ready: false, loadError: null, backend: null, fallbackReason: null };

  async function ensureLoaded() {
    if (state.ready) return;
    if (state.loadError) throw state.loadError;
    try {
      state.backend = _load
        ? await _load({ modelDir: resolvedModelDir, dim })
        : await loadBackend({ modelDir: resolvedModelDir, dim });
      state.ready = true;
    } catch (err) {
      state.loadError = err;
      state.fallbackReason = '本地嵌入不可用：' + (err?.message ?? String(err));
      throw err;
    }
  }

  return {
    name: 'local',
    model: LOCAL_MODEL_NAME,
    embedModel: LOCAL_MODEL_NAME,
    get fallbackReason() {
      return state.fallbackReason;
    },
    async complete() {
      throw new Error('provider.local: 不支持 complete（本地仅嵌入），请改用 stub / A6API provider');
    },
    async embed({ texts }) {
      try {
        await ensureLoaded();
        const out = [];
        for (const t of texts) {
          const enc = state.backend.tokenize(t);
          const hidden = await state.backend.run(enc);
          out.push(meanPoolNormalize(hidden, enc.attentionMask));
        }
        state.fallbackReason = null;
        return { vectors: out, fallback: null };
      } catch (err) {
        state.fallbackReason = '本地嵌入回退 stub：' + (err?.message ?? String(err));
        return { vectors: texts.map((t) => deterministicVector(t, dim)), fallback: state.fallbackReason };
      }
    },
  };
}
