/**
 * truman-town.ai.decide — 模型决策 / Model-driven Decision
 *
 * 让真实大模型从居民**当前可行**的候选行动中做出选择（而非仅事后叙述）。
 * 这是「有模型 E2E」的核心：模型进入决策环，其输出直接决定居民的行动。
 *
 * 设计约束：
 * - 只在显式开启（llmDecideEnabled）时调用，默认关闭，保证空跑与测试的确定性与速度；
 * - 候选集来自 decision.candidates（居民状态派生），模型只能在**可行集**内选择，
 *   不能凭空发明行动，也不能绕过生存门的可行性约束；
 * - 模型返回不可解析或不在候选集内时回落到确定性评分结果（fail-soft），
 *   并在 meta 中标注 fallback 原因，便于审计；
 * - 采样式接入：llmDecideEveryTicks / llmDecideMaxAgents 控制调用规模，
 *   因为实测 grok-4.6 单次约 18s，全量 50×200 不可行。
 */

import * as gateway from './llm/gateway.js';

const DECIDE_SYSTEM =
  '你是核战后地下避难所「LinYi」中的幸存居民。'
  + '你只知道自己的处境与周遭，不知道任何关于观察者、模拟或程序的事。'
  + '请从给定的可选行动中选出**你此刻最该做的一个**，只输出行动名本身，不要解释、不要标点、不要多余文字。';

function num(v, dflt) {
  return (typeof v === 'number' && Number.isFinite(v)) ? v : dflt;
}

/**
 * 组装决策提示词：处境 + 候选行动（含可行性理由）。
 * @param {{ name?: string, persona?: string, tags?: string[], needs?: object, stock?: object,
 *           populationContext?: object, memories?: string[], candidates?: Array<{ action: string, why?: string|null }>, tick?: number }} input
 * @returns {{ messages: Array<{role:string,content:string}>, allowed: string[] }}
 */
export function composePrompt(input = {}) {
  const name = typeof input.name === 'string' && input.name.trim() !== '' ? input.name : '无名居民';
  const persona = typeof input.persona === 'string' && input.persona.trim() !== '' ? input.persona : '一名普通避难所居民';
  const tags = Array.isArray(input.tags) ? input.tags.slice(0, 12) : [];
  const needs = input.needs ?? {};
  const stock = input.stock ?? {};
  const cands = Array.isArray(input.candidates) ? input.candidates : [];
  const populationContext = input.populationContext ?? input.socialContext ?? {};
  const recentGroupActions = Array.isArray(input.recentGroupActions) ? input.recentGroupActions : [];
  const memories = Array.isArray(input.memories) ? input.memories : [];

  const lines = [];
  lines.push('你是「' + name + '」。' + persona);
  if (tags.length > 0) lines.push('你的显著特质：' + tags.join('、') + '。');
  lines.push('当前 tick：' + num(input.tick, 0) + '。');
  lines.push('你的饥饿程度：' + num(needs.food, 0).toFixed(2) + '（0=不饿，1=极饿）；'
    + '口渴程度：' + num(needs.water, 0).toFixed(2) + '（0=不渴，1=极渴）。');
  lines.push('避难所食物库存：' + num(stock.food, 0).toFixed(0) + '；水源库存：' + num(stock.water, 0).toFixed(0) + '。');
  lines.push('群体库存：食物 ' + num(populationContext.food, num(stock.food, 0)).toFixed(0) + '，水 ' + num(populationContext.water, num(stock.water, 0)).toFixed(0) + '，能源 ' + num(populationContext.energy, 0).toFixed(0) + '，医疗 ' + num(populationContext.medical, 0).toFixed(0) + '；存活人口 ' + num(populationContext.alivePopulation, 0).toFixed(0) + '；危机：' + (populationContext.crisis ?? '暂无已知危机') + '。');
  if (recentGroupActions.length) lines.push('最近群体行动：' + recentGroupActions.map((a) => typeof a === 'string' ? a : a.action + '×' + a.count).join('、') + '。');
  if (memories.length) lines.push('你的个体记忆：' + memories.map((m) => typeof m === 'string' ? m : m.content).filter(Boolean).join('；') + '。');
  lines.push('');
  lines.push('你可选的行动：');
  for (const c of cands) {
    lines.push('- ' + c.action + (c.why ? '（' + c.why + '）' : ''));
  }
  lines.push('');
  lines.push('只输出一个行动名。');

  return {
    messages: [
      { role: 'system', content: DECIDE_SYSTEM },
      { role: 'user', content: lines.join('\n') },
    ],
    allowed: cands.map((c) => c.action),
  };
}

/** 从模型自由文本中提取行动名（容忍标点、引号、大小写、前后缀）。 */
export function parseAction(text, allowed) {
  if (typeof text !== 'string') return null;
  const list = Array.isArray(allowed) ? allowed : [];
  const cleaned = text.trim().toLowerCase();
  // 1) 精确匹配
  for (const a of list) if (cleaned === a.toLowerCase()) return a;
  // 2) 整词匹配（按长度降序，避免 eat 命中 create 之类）
  const sorted = [...list].sort((a, b) => b.length - a.length);
  for (const a of sorted) {
    const re = new RegExp('(^|[^a-z])' + a.toLowerCase() + '([^a-z]|$)');
    if (re.test(cleaned)) return a;
  }
  return null;
}

/**
 * 调用模型进行一次行动选择。
 * @param {object} input 见 composePrompt
 * @param {{ model?: string }} [opts]
 * @returns {Promise<{ action: string|null, raw: string, meta: object }>}
 */
export async function choose(input = {}, opts = {}) {
  const { messages, allowed } = composePrompt(input);
  const completion = await gateway.complete({ messages, model: opts.model, maxTokens: 16, temperature: 0 });
  const action = parseAction(completion.text, allowed);
  return {
    action,
    raw: completion.text,
    meta: {
      provider: completion.provider,
      model: completion.model,
      latencyMs: completion.latencyMs,
      usage: completion.usage,
      allowed: allowed.length,
    },
  };
}
