/**
 * truman-town.ai.laya — LAYA 结构化判断 / LAYA Structured Judgment
 *
 * 调用本地 LAYA System One 做**语义判断**（是/否、分级、多选），用于替代
 * 硬编码的数值阈值——阈值只能看数量，判断不了「这个人是不是真的撑不住了」。
 *
 * 实测契约（本模块依赖，改动需重验）：
 * - POST {LAYA_BASE_URL}，Bearer {LAYA_KEY}；body = { state:{message}, questions:{...}, model }
 * - state **必须是自然语言**：裸 JSON 键值几乎不被读取（不同处境分布近似相同）。
 * - choice 的 criteria 必须给**描述文案**（{action: 描述}），只给行动名会导致
 *   输出退化为近似均匀分布（曾据此误判 choice 不可用）。
 * - 返回值 answers[id] = { type, choice|value, probabilities, confidence }。
 * - 延迟实测 77-107ms（远低于早先记录的 360ms），output_tokens 恒为 0。
 *
 * 缓存：同一 (量化状态, 问题) 结果确定 ⇒ 按桶缓存，把 50×200 的调用量压到桶数量级。
 */

const DEFAULT_TIMEOUT_MS = 5000;

function env(key, fallback) {
  const v = process.env[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : fallback;
}

/** 量化状态 → 缓存键：粗粒度分桶，避免浮点抖动导致缓存失效。 */
export function stateKey(questions, message) {
  return JSON.stringify({ q: Object.keys(questions ?? {}).sort(), m: message });
}

const cache = new Map();
const stats = { calls: 0, hits: 0, failures: 0, totalMs: 0 };

/** 清空缓存与统计（测试与每局重置用）。 */
export function __reset() {
  cache.clear();
  stats.calls = 0; stats.hits = 0; stats.failures = 0; stats.totalMs = 0;
}

/** 缓存与调用统计快照。 */
export function getStats() {
  return { ...stats, cacheSize: cache.size };
}

/**
 * 发起一次 LAYA 判断。失败时抛出（由调用方决定回落策略）。
 * @param {{ state: { message: string }, questions: object, model?: string, timeoutMs?: number,
 *           baseUrl?: string, key?: string, useCache?: boolean }} input
 * @returns {Promise<{ answers: object, model: string|null, latencyMs: number, cached: boolean }>}
 */
export async function judge(input = {}) {
  const message = input?.state?.message;
  if (typeof message !== 'string' || message.trim() === '') {
    throw new TypeError('laya.judge: state.message 必须为非空字符串（choice 不读裸 JSON）');
  }
  const questions = input.questions;
  if (questions === null || typeof questions !== 'object' || Array.isArray(questions)) {
    throw new TypeError('laya.judge: questions 必须为对象');
  }
  const useCache = input.useCache !== false;
  const key = stateKey(questions, message);
  if (useCache && cache.has(key)) {
    stats.hits += 1;
    return { ...cache.get(key), cached: true };
  }

  const baseUrl = input.baseUrl ?? env('LAYA_BASE_URL', 'http://127.0.0.1:7780/v1/systemone');
  const apiKey = input.key ?? process.env.LAYA_KEY;
  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new Error('laya.judge: 缺少 LAYA_KEY');
  }
  const timeoutMs = Number.isInteger(input.timeoutMs) ? input.timeoutMs : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const resp = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ state: { message }, questions, model: input.model ?? 'auto' }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      stats.failures += 1;
      throw new Error('laya.judge: HTTP ' + resp.status + ' ' + (await resp.text()).slice(0, 160));
    }
    const json = await resp.json();
    const out = {
      answers: json.answers ?? {},
      model: json.routing?.model ?? json.model ?? null,
      latencyMs: Date.now() - t0,
      cached: false,
    };
    stats.calls += 1;
    stats.totalMs += out.latencyMs;
    if (useCache) cache.set(key, out);
    return out;
  } catch (err) {
    if (err?.name === 'AbortError') {
      stats.failures += 1;
      throw new Error('laya.judge: 超时 ' + timeoutMs + 'ms');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 从 score 型答案计算期望档位。
 * LAYA 的 score 只给 probabilities（{ "0": p0, ..., "4": p4 }），不给 value；
 * 期望值 E = Σ i·p_i 是对有序档位的正确聚合。
 * 若上游某天开始返回 value/score，则优先采用之（显式值比聚合更权威）。
 */
export function scoreExpectation(answer = {}) {
  if (typeof answer.value === 'number' && Number.isFinite(answer.value)) return answer.value;
  if (typeof answer.score === 'number' && Number.isFinite(answer.score)) return answer.score;
  const probs = answer.probabilities;
  if (probs === null || typeof probs !== 'object') return 0;
  let sum = 0;
  let mass = 0;
  for (const [k, p] of Object.entries(probs)) {
    const i = Number(k);
    if (!Number.isFinite(i) || typeof p !== 'number' || !Number.isFinite(p)) continue;
    sum += i * p;
    mass += p;
  }
  return mass > 0 ? sum / mass : 0;
}

/**
 * 生存紧迫度判断：把「是否真的撑不住」交给语义模型，而不是一个固定的人均库存阈值。
 * 返回紧迫度 0..1 与是否处于危机；失败时抛出，由调用方回落到数值判据。
 * @param {{ message: string, model?: string }} input
 */
export async function survivalUrgency(input = {}) {
  const r = await judge({
    state: { message: input.message },
    questions: {
      crisis: { type: 'noul', instructions: 'Is this person in immediate danger of dying if they do nothing right now?' },
      urgency: { type: 'score', instructions: 'How urgent is this person\'s survival situation?',
        criteria: ['完全没有压力', '有些担心', '明显紧张', '非常紧迫', '生死攸关'] },
    },
    model: input.model,
  });
  const crisisAns = r.answers?.crisis ?? {};
  const urgencyAns = r.answers?.urgency ?? {};
  const crisisProb = typeof crisisAns.confidence === 'number' ? crisisAns.confidence : 0;
  const crisis = crisisAns.choice === true || crisisAns.choice === 'true' || crisisAns.value === true;
  // P2 修正（实测关键）：score 型**不返回 value/score 字段**，只返回 probabilities
  //（键为档位索引 0..4 的字符串）。原先只读 value/score，两者皆 undefined → raw 恒为 0，
  // 造成"LAYA 对处境不敏感"的假象。对照实验显示概率分布其实**随处境单调右移**
  //（温饱众数 1 / 断粮众数 2），因此必须取期望值 E = Σ i·p_i，再归一化到 0..1。
  const raw = scoreExpectation(urgencyAns);
  return {
    crisis,
    crisisProb: crisis ? crisisProb : 0,
    urgency: Math.max(0, Math.min(1, raw / 4)),
    raw,
    latencyMs: r.latencyMs,
    cached: r.cached,
  };
}
