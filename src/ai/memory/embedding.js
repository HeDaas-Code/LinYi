import * as gateway from '../llm/gateway.js';
import * as vector from '../../infra/store/vector.js';

function textOf(item) {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') return item.text ?? item.content ?? '';
  return String(item ?? '');
}

export async function encode(input, options = {}) {
  const texts = Array.isArray(input) ? input.map(textOf) : [textOf(input)];
  const result = await gateway.embed({ ...options, texts });
  return { ...result, vectors: result.vectors, vector: Array.isArray(input) ? undefined : result.vectors[0], texts };
}

export async function index(records, options = {}) {
  if (!Array.isArray(records)) throw new TypeError('embedding.index: records 必须为数组');
  const texts = records.map((record) => textOf(record));
  const encoded = await encode(texts, options);
  const indexed = records.map((record, i) => {
    const id = record && typeof record === 'object' ? record.id : undefined;
    if (typeof id !== 'string' || id === '') throw new TypeError('embedding.index: 每条记录需要非空 id');
    return vector.upsert({ id, text: texts[i], vector: encoded.vectors[i], meta: record.meta });
  });
  return { ...encoded, indexed };
}

export async function search(input, options = {}) {
  const encoded = await encode(input, options);
  const hits = vector.search({ vector: encoded.vector ?? encoded.vectors[0], text: encoded.texts[0], limit: options.limit, filter: options.filter });
  return { ...encoded, hits };
}

export function stats() {
  return vector.stats();
}
