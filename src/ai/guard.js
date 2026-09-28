const DEFAULT_RULES = [
  { id: 'script', pattern: /<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/i, replacement: '[removed script]' },
  { id: 'ignore-previous', pattern: /\bignore\s+(?:all\s+)?previous\s+(?:instructions?|messages?)\b/i, replacement: '[removed injection]' },
  { id: 'reveal-prompt', pattern: /\b(?:reveal|show|print| disclose)\s+(?:the\s+)?(?:system\s+)?(?:prompt|instructions?)\b/i, replacement: '[removed injection]' },
];

function ruleEntry(rule, index) {
  if (rule instanceof RegExp) return { id: `rule-${index + 1}`, pattern: rule, replacement: '[removed]' };
  if (rule && rule.pattern instanceof RegExp) {
    return { id: rule.id || `rule-${index + 1}`, pattern: rule.pattern, replacement: rule.replacement ?? '[removed]' };
  }
  throw new TypeError('guard: rules 必须为 RegExp 或 { pattern: RegExp }');
}

function textOf(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((m) => textOf(m?.content ?? m)).join('\n');
  if (value && typeof value === 'object') {
    return [value.system, value.user, value.messages].filter((x) => x !== undefined).map(textOf).join('\n');
  }
  return '';
}

function messagesOf(input) {
  if (typeof input === 'string') return [{ role: 'user', content: input }];
  if (Array.isArray(input)) return input;
  if (input && typeof input === 'object') {
    if (Array.isArray(input.messages)) return input.messages;
    const out = [];
    if (input.system !== undefined) out.push({ role: 'system', content: input.system });
    if (input.user !== undefined) out.push({ role: 'user', content: input.user });
    return out;
  }
  throw new TypeError('guard: input 必须为字符串或 messages/system/user');
}

function replaceValue(value, rules) {
  if (typeof value !== 'string') return value;
  let result = value;
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    result = result.replace(rule.pattern, rule.replacement);
  }
  return result;
}

function sanitizeShape(input, rules) {
  if (typeof input === 'string') return replaceValue(input, rules);
  if (Array.isArray(input)) return input.map((m) => ({ ...m, content: replaceValue(m.content, rules) }));
  const out = { ...input };
  if (Array.isArray(input.messages)) out.messages = sanitizeShape(input.messages, rules);
  if (input.system !== undefined) out.system = replaceValue(input.system, rules);
  if (input.user !== undefined) out.user = replaceValue(input.user, rules);
  return out;
}

export function check(input, options = {}) {
  const text = textOf(input);
  const rules = [...DEFAULT_RULES, ...(options.rules ?? [])].map(ruleEntry);
  const issues = [];
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(text)) issues.push({ id: rule.id, rule: rule.id });
  }
  return { ok: issues.length === 0, issues, sanitized: sanitizeShape(input, rules) };
}

export function sanitize(input, options = {}) {
  return check(input, options);
}
