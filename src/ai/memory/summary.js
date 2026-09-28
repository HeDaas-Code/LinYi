import * as gateway from '../llm/gateway.js';

function textOf(input) {
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) return input.map((item) => textOf(item)).join('\n');
  if (input && typeof input === 'object') return input.content ?? input.text ?? '';
  return String(input ?? '');
}

function deterministic(text, options) {
  const seen = new Set();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const unique = lines.filter((line) => {
    const key = line.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const limit = Number.isInteger(options.maxLength) && options.maxLength > 0 ? options.maxLength : 500;
  return unique.join('\n').slice(0, limit);
}

export async function summarize(input, options = {}) {
  const text = textOf(input);
  if (!options.useModel) return { text: deterministic(text, options), model: null, provider: null, deterministic: true };
  const result = await gateway.complete({ ...options, messages: [{ role: 'user', content: text }] });
  return { ...result, deterministic: false };
}

export async function compress(input, options = {}) {
  const result = await summarize(input, options);
  return { ...result, text: result.text };
}
