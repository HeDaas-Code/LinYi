/**
 * truman-town.ai.llm.gateway — 模型调用 / Model Gateway
 *
 * 统一执行补全（complete）与嵌入（embed）请求，支持可插拔适配器（provider）。
 * MVP 默认使用确定性的 stub 适配器，可随时 registerProvider() 无缝换成真实模型
 *（DeepSeek / OpenAI / 本地模型等），无需改动上层调用方。
 *
 * 内置限流（最小请求间隔）与重试（指数退避）：输入校验发生在重试循环之外，
 * 校验错误立即抛出、不重试；provider 执行错误才进入退避重试。
 */

import { createProvider as createA6Provider } from './provider.a6api.js';
import { createProvider as createLocalProvider } from './provider.local.js';

const STUB_DIM = 16;
const DEFAULT_MODEL = 'stub-0';
const EMBED_MODEL = 'stub-embed';

/** 字符串 → 32 位无符号整数哈希（FNV-1a 风格，确定性）。 */
function hashUint(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 用确定性整数流生成 dim 维、分量 ∈ [-1, 1] 的嵌入向量。 */
function embedVector(text, dim) {
  const vec = new Array(dim);
  let s = hashUint(text);
  for (let i = 0; i < dim; i += 1) {
    s = (Math.imul(s, 0x01000193) ^ (i + 0x9e3779b9)) >>> 0;
    const n = s % 2001; // 0..2000
    vec[i] = (n - 1000) / 1000;
  }
  return vec;
}

/** 取最后一条 user 消息文本（stub 生成确定性回显用）。 */
function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m && m.role === 'user') {
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content)) {
        return m.content.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
      }
      return String(m.content);
    }
  }
  return '';
}

/** 确定性 stub 适配器：回显最后一条用户输入，嵌入用哈希向量。 */
const stubProvider = {
  name: 'stub',
  model: DEFAULT_MODEL,
  embedModel: EMBED_MODEL,
  async complete({ model, messages }) {
    const last = lastUserText(messages ?? []);
    return { text: `[${model || DEFAULT_MODEL}] ${last}`.trim() };
  },
  async embed({ texts }) {
    return texts.map((t) => embedVector(t, STUB_DIM));
  },
};

let activeProvider = stubProvider;
let activeEmbedProvider = stubProvider;
/** @type {Map<string, object>} */
const providersByName = new Map([[stubProvider.name, stubProvider]]);

const DEFAULT_CONFIG = Object.freeze({
  // 5 次重试 = 最多 6 次尝试；模拟网络波动下的韧性调用。
  maxRetries: 5,
  retryBaseDelayMs: 250,
  retryMaxDelayMs: 8000,
  minIntervalMs: 0,
});
let config = { ...DEFAULT_CONFIG };
let lastCallAt = 0;
const stats = { requests: 0, successes: 0, failures: 0, retries: 0, limitedWaits: 0 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assertProvider(p) {
  if (p === null || typeof p !== 'object') {
    throw new TypeError('gateway: provider 必须为对象');
  }
  if (typeof p.name !== 'string' || p.name.trim() === '') {
    throw new TypeError('gateway: provider.name 必须为非空字符串');
  }
  if (typeof p.complete !== 'function') {
    throw new TypeError('gateway: provider.complete 必须为函数');
  }
  if (typeof p.embed !== 'function') {
    throw new TypeError('gateway: provider.embed 必须为函数');
  }
}

function resolveProvider(ref) {
  if (ref === undefined || ref === null) return activeProvider;
  if (typeof ref === 'string') {
    const p = providersByName.get(ref);
    if (!p) throw new Error(`gateway: 未注册的 provider "${ref}"`);
    return p;
  }
  assertProvider(ref);
  return ref;
}

/**
 * 注册一个 provider 适配器，同时置为默认。返回该 provider。
 * @param {{ name: string, model?: string, complete: Function, embed: Function }} provider
 */
export function registerProvider(provider) {
  assertProvider(provider);
  providersByName.set(provider.name, provider);
  activeProvider = provider;
  activeEmbedProvider = provider;
  return provider;
}

/**
 * 从环境变量创建并登记 A6API 真实模型 provider（不切换默认 provider）。
 * 返回该 provider，供 complete({ provider }) / registerProvider() 使用。
 * 缺 A6API_KEY 时抛出明确错误。
 * @param {Record<string, string>} [env] 可选注入环境变量（测试用）；缺省读 process.env
 */
export function registerFromEnv(env) {
  const e = env ?? process.env;
  const p = createA6Provider(e);
  assertProvider(p);
  providersByName.set(p.name, p);
  // 可选本地嵌入（默认 stub）：TRUMAN_EMBED_PROVIDER=local 时切换为本地嵌入。
  if (e.TRUMAN_EMBED_PROVIDER === 'local') {
    try {
      useLocalEmbed({ modelDir: e.TRUMAN_EMBED_MODEL_DIR });
    } catch {
      // 本地嵌入初始化失败不抛出，保持 stub；embed 侧首次调用时也会回退。
    }
  }
  return p;
}

/**
 * 从环境变量创建 A6API provider 并切换为当前默认 provider。
 * 等价于 registerFromEnv() + 设为 active。缺 A6API_KEY 时抛出明确错误。
 * @param {Record<string, string>} [env] 可选注入环境变量（测试用）；缺省读 process.env
 */
export function useA6Api(env) {
  const p = registerFromEnv(env);
  activeProvider = p;
  return p;
}

/**
 * 从本地模型创建并登记本地嵌入 provider（不切换默认嵌入 provider）。
 * 返回该 provider，供 embed({ provider }) / useLocalEmbed() 使用；不会因依赖/模型缺失而抛错。
 * @param {{ modelDir?: string, dim?: number }} [opts]
 */
export function registerLocalEmbed(opts) {
  const p = createLocalProvider(opts);
  assertProvider(p);
  providersByName.set(p.name, p);
  return p;
}

/**
 * 创建本地嵌入 provider 并切换为当前默认嵌入 provider（不影响 complete 的默认 provider）。
 * 依赖/模型缺失时会在首次 embed 调用时自动回退 stub，并在返回值 fallback 字段标注原因。
 * @param {{ modelDir?: string, dim?: number }} [opts]
 */
export function useLocalEmbed(opts) {
  const p = registerLocalEmbed(opts);
  activeEmbedProvider = p;
  return p;
}

/** 按名称取已注册 provider；缺省返回当前默认 provider。 */
export function provider(name) {
  if (name === undefined || name === null) return activeProvider;
  return providersByName.get(name) ?? null;
}

/** 当前默认 provider。 */
export function getProvider() {
  return activeProvider;
}

/** 合并运行配置（maxRetries / retryBaseDelayMs / minIntervalMs）。 */
export function configure(opts = {}) {
  if (opts === null || typeof opts !== 'object') {
    throw new TypeError('gateway.configure: opts 必须为对象');
  }
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    if (opts[key] !== undefined) config[key] = opts[key];
  }
  return { ...config };
}

/** 当前运行配置快照。 */
export function getConfig() {
  return { ...config };
}

/** 累计调用统计快照。 */
export function getStats() {
  return { ...stats };
}

async function throttle() {
  if (config.minIntervalMs <= 0) return;
  const now = Date.now();
  if (lastCallAt > 0) {
    const elapsed = now - lastCallAt;
    if (elapsed < config.minIntervalMs) {
      stats.limitedWaits += 1;
      await sleep(config.minIntervalMs - elapsed);
    }
  }
  lastCallAt = Date.now();
}

async function withRetry(fn) {
  let lastErr;
  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    if (attempt > 0) {
      stats.retries += 1;
      // 指数退避 + 抖动：模拟不稳定网络，避免同时重试打满上游。
      const base = Math.min(config.retryBaseDelayMs * 2 ** (attempt - 1), config.retryMaxDelayMs);
      await sleep(base * (0.5 + Math.random() * 0.5));
    }
    await throttle();
    try {
      const value = await fn();
      stats.successes += 1;
      return { value, attempts: attempt + 1 };
    } catch (err) {
      lastErr = err;
      stats.failures += 1;
      if (err && err.retryable === false) throw err;
    }
  }
  throw lastErr;
}

function typeError(msg) {
  const err = new TypeError(msg);
  err.retryable = false;
  return err;
}

function assertMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw typeError('gateway.complete: messages 必须为非空数组');
  }
  for (const m of messages) {
    if (m === null || typeof m !== 'object') {
      throw typeError('gateway.complete: 每条 message 必须为对象');
    }
    if (m.role !== 'system' && m.role !== 'user' && m.role !== 'assistant') {
      throw typeError(`gateway.complete: 非法 message.role "${m.role}"`);
    }
    if (typeof m.content !== 'string' && !Array.isArray(m.content)) {
      throw typeError('gateway.complete: message.content 必须为字符串或数组');
    }
  }
  return messages;
}

function assertTexts(texts) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw typeError('gateway.embed: texts 必须为非空数组');
  }
  for (const t of texts) {
    if (typeof t !== 'string') throw typeError('gateway.embed: 每个 text 必须为字符串');
  }
  return texts;
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text ?? '').length / 4));
}

function normalizeCompletion(p, model, raw, latencyMs, attempts, promptTokens) {
  let text;
  let usage;
  if (typeof raw === 'string') {
    text = raw;
  } else if (raw && typeof raw === 'object' && typeof raw.text === 'string') {
    text = raw.text;
    usage = raw.usage;
  } else {
    throw typeError('gateway: provider.complete 必须返回 string 或 { text }');
  }
  const completionTokens = usage?.completionTokens ?? estimateTokens(text);
  const prompt = usage?.promptTokens ?? promptTokens;
  // 透传 provider 声明的其余 usage 字段（如 reasoningTokens / costInUsdTicks），
  // 不改动既有 stub 的 usage 形状。
  const KNOWN = new Set(['promptTokens', 'completionTokens', 'totalTokens']);
  const extra = {};
  if (usage && typeof usage === 'object') {
    for (const [k, v] of Object.entries(usage)) {
      if (!KNOWN.has(k)) extra[k] = v;
    }
  }
  return {
    text,
    model: model || p.model || DEFAULT_MODEL,
    provider: p.name,
    usage: {
      promptTokens: prompt,
      completionTokens,
      totalTokens: usage?.totalTokens ?? (prompt + completionTokens),
      ...extra,
    },
    latencyMs,
    attempts,
  };
}

function normalizeVectors(vectors) {
  if (!Array.isArray(vectors) || vectors.length === 0) {
    throw typeError('gateway: provider.embed 必须返回非空向量数组');
  }
  const dim = Array.isArray(vectors[0]) ? vectors[0].length : 0;
  if (dim === 0) throw typeError('gateway: provider.embed 返回的向量必须为非空数组');
  for (const v of vectors) {
    if (!Array.isArray(v) || v.length !== dim) {
      throw typeError('gateway: provider.embed 返回的向量维度不一致');
    }
    for (const n of v) {
      if (typeof n !== 'number' || !Number.isFinite(n)) {
        throw typeError('gateway: provider.embed 返回的向量分量必须为有限数值');
      }
    }
  }
  return vectors;
}

/**
 * 执行一次补全请求。
 * @param {{ provider?: object|string, model?: string, messages: Array<{role:string,content:string|string[]}>, temperature?: number, maxTokens?: number }} opts
 * @returns {Promise<{ text: string, model: string, provider: string, usage: object, latencyMs: number, attempts: number }>}
 */
export async function complete(opts = {}) {
  if (opts === null || typeof opts !== 'object') {
    throw typeError('gateway.complete: opts 必须为对象');
  }
  const { provider, model, messages, ...forward } = opts;
  const msgs = assertMessages(messages);
  const p = resolveProvider(provider);
  const promptTokens = msgs.reduce((n, m) => n + estimateTokens(m.content), 0);
  stats.requests += 1;

  const { value, attempts } = await withRetry(async () => {
    const start = Date.now();
    const raw = await p.complete({ model, messages: msgs, ...forward });
    return { raw, latencyMs: Date.now() - start };
  });

  return normalizeCompletion(p, model, value.raw, value.latencyMs, attempts, promptTokens);
}

/**
 * 把文本列表编码为向量。
 * @param {{ provider?: object|string, texts: string[] }} opts
 * @returns {Promise<{ vectors: number[][], dim: number, model: string, provider: string, latencyMs: number, attempts: number }>}
 */
export async function embed(opts = {}) {
  if (opts === null || typeof opts !== 'object') {
    throw typeError('gateway.embed: opts 必须为对象');
  }
  const texts = assertTexts(opts.texts);
  const p = (opts.provider === undefined || opts.provider === null)
    ? activeEmbedProvider
    : resolveProvider(opts.provider);
  const model = opts.model || p.embedModel || p.model || EMBED_MODEL;
  stats.requests += 1;

  const { value, attempts } = await withRetry(async () => {
    const start = Date.now();
    const raw = await p.embed({ texts });
    return { raw, latencyMs: Date.now() - start };
  });

  // provider 可返回 number[][]（stub/a6api）或 { vectors, fallback }（local）。
  const vectorsRaw = Array.isArray(value.raw) ? value.raw : value.raw?.vectors;
  const fallback = Array.isArray(value.raw) ? undefined : value.raw?.fallback;
  const vectors = normalizeVectors(vectorsRaw);
  return {
    vectors,
    dim: vectors[0].length,
    model,
    provider: p.name,
    fallback: fallback ?? undefined,
    latencyMs: value.latencyMs,
    attempts,
  };
}

/** 复位 provider 注册表、默认 provider、运行配置与统计（测试用）。 */
export function __reset() {
  providersByName.clear();
  providersByName.set(stubProvider.name, stubProvider);
  activeProvider = stubProvider;
  activeEmbedProvider = stubProvider;
  config = { ...DEFAULT_CONFIG };
  lastCallAt = 0;
  for (const k of Object.keys(stats)) stats[k] = 0;
}
