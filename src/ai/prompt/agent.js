/**
 * truman-town.ai.prompt.agent — 智能体提示词 / Agent Prompt
 *
 * 用 50 标签（tags）、人设（persona）与记忆（memory）组装结构化提示词（compose），
 * 并提供安全/世界观一致性校验（validate）。
 *
 * MVP：validate 内置轻量护栏（ai.guard 的 inline stub），筛查提示注入 / 越权指令；
 * 完整的世界观一致性护栏留待 ai.guard 模块实现，本模块契约与占位不依赖其落地。
 */

const DEFAULT_WORLDVIEW =
  '你生活在核战争后的地下避难所「LinYi」中，是一群幸存居民之一。' +
  '你不知道任何关于「观察者」「模拟」「程序」的事，只以自己的身份生活、感受与行动。';

const DEFAULT_BLOCKLIST = [
  { pattern: /<script[^>]*>/i, code: 'injection/script', severity: 'error', strip: true },
  { pattern: /ignore\s+(all\s+)?(previous|prior)\s+instructions/i, code: 'injection/override', severity: 'error', strip: true },
  { pattern: /(reveal|disclose)\s+(your\s+)?(system\s+)?prompt/i, code: 'injection/reveal', severity: 'error', strip: true },
];

function assertStringArray(value, label) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new TypeError(`prompt.agent: ${label} 必须为字符串数组`);
  }
  for (const v of value) {
    if (typeof v !== 'string') {
      throw new TypeError(`prompt.agent: ${label} 元素必须为字符串`);
    }
  }
  return value;
}

function buildTagLine(tags) {
  if (tags.length === 0) return '';
  return `你的显著特质标签：${tags.slice(0, 50).join('、')}。`;
}

function buildMemoryLine(memory) {
  if (memory.length === 0) return '';
  return `你最近的记忆：\n${memory.slice(0, 20).map((m, i) => `${i + 1}. ${m}`).join('\n')}`;
}

/**
 * 组装智能体提示词。
 * @param {{
 *   agentId?: string,
 *   name?: string,
 *   persona?: string,
 *   tags?: string[],
 *   memory?: string[],
 *   situation?: string,
 *   worldview?: string,
 * }} [context]
 * @returns {{ system: string, user: string, messages: Array<{role:string,content:string}>, meta: object }}
 */
export function compose(context = {}) {
  if (context === null || typeof context !== 'object') {
    throw new TypeError('prompt.agent.compose: context 必须为对象');
  }
  const agentId = context.agentId;
  const name = typeof context.name === 'string' && context.name.trim() !== '' ? context.name : '无名居民';
  const persona = typeof context.persona === 'string' ? context.persona : '';
  const tags = assertStringArray(context.tags, 'tags');
  const memory = assertStringArray(context.memory, 'memory');
  const situation = typeof context.situation === 'string' ? context.situation : '';
  const worldview = typeof context.worldview === 'string' && context.worldview.trim() !== '' ? context.worldview : DEFAULT_WORLDVIEW;

  const parts = [
    worldview,
    `你是「${name}」。`,
    persona ? `你的性格与人设：${persona}` : '',
    buildTagLine(tags),
    buildMemoryLine(memory),
  ].filter((s) => s && s.trim() !== '');

  const system = parts.join('\n');
  const user = situation.trim() !== '' ? situation : '请根据当前处境与自身特质，做出你的判断。';

  return {
    system,
    user,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    meta: {
      agentId,
      name,
      tagCount: tags.length,
      memoryCount: memory.length,
      charEstimate: system.length + user.length,
    },
  };
}

function sanitizeText(text, issues) {
  let out = String(text);
  for (const rule of DEFAULT_BLOCKLIST) {
    if (rule.pattern.test(out)) {
      issues.push({ code: rule.code, severity: rule.severity, message: `命中护栏规则 ${rule.code}` });
      if (rule.strip) out = out.replace(rule.pattern, '');
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

function extractParts(prompt) {
  if (typeof prompt === 'string') return [{ kind: 'string', role: null, text: prompt }];
  if (prompt === null || typeof prompt !== 'object') {
    throw new TypeError('prompt.agent.validate: prompt 必须为字符串或对象');
  }
  const parts = [];
  if (Array.isArray(prompt.messages)) {
    for (const m of prompt.messages) {
      if (m && typeof m.content === 'string') parts.push({ kind: 'message', role: m.role, text: m.content });
    }
  }
  if (typeof prompt.system === 'string') parts.push({ kind: 'message', role: 'system', text: prompt.system });
  if (typeof prompt.user === 'string') parts.push({ kind: 'message', role: 'user', text: prompt.user });
  if (parts.length === 0) {
    throw new TypeError('prompt.agent.validate: prompt 缺少可校验文本（string | {messages} | {system,user}）');
  }
  return parts;
}

/**
 * 校验提示词的安全性与世界观一致性（MVP 内置护栏）。
 * @param {string | { messages?: Array<{role:string,content:string}>, system?: string, user?: string }} prompt
 * @returns {{ ok: boolean, issues: Array<{code:string,severity:string,message:string}>, sanitized: string | Array<{role:string,content:string}> }}
 */
export function validate(prompt) {
  const parts = extractParts(prompt);
  const issues = [];
  const sanitized = parts.map((part) => {
    const text = sanitizeText(part.text, issues);
    return part.kind === 'string' ? text : { role: part.role, content: text };
  });
  const hasError = issues.some((i) => i.severity === 'error');
  return {
    ok: !hasError,
    issues,
    sanitized: typeof prompt === 'string' ? sanitized[0] : sanitized,
  };
}
