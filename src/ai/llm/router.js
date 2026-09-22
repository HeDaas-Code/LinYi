/**
 * truman-town.ai.llm.router — 模型路由 / Model Router
 *
 * 按任务类型选择模型（route），并提供降级路由（fallback）：沿 provider 列表依次
 * 尝试，前一个失败自动切到下一个，全部失败则抛出聚合错误。实际请求交给
 * truman-town.ai.llm.gateway 执行（依赖 gateway 的 complete / embed）。
 */

import * as gateway from './gateway.js';

const TASK_MODEL_HINTS = {
  thought: 'stub-0',
  speech: 'stub-0',
  embed: 'stub-embed',
  default: 'stub-0',
};

function asProviderList(providers) {
  if (providers === undefined || providers === null) return [gateway.getProvider()];
  const arr = Array.isArray(providers) ? providers : [providers];
  const out = [];
  for (const p of arr) {
    if (typeof p === 'string') {
      const named = gateway.provider(p);
      if (named) out.push(named);
      else throw new Error(`router: 未注册的 provider "${p}"`);
    } else if (p && typeof p === 'object') {
      out.push(p);
    } else {
      throw new TypeError('router: provider 必须是适配器对象或已注册的名称字符串');
    }
  }
  return out;
}

function modelsOf(p) {
  if (Array.isArray(p.models) && p.models.length > 0) return p.models;
  if (typeof p.model === 'string') return [p.model];
  return [];
}

/**
 * 按任务类型选择一个 provider 与其模型。
 * @param {string} [task] 任务类型（thought / speech / embed / default）
 * @param {{ providers?: Array<object|string>, model?: string }} [options]
 * @returns {{ provider: string, model: string, reason: string, providerIndex: number }}
 */
export function route(task = 'default', options = {}) {
  if (options === null || typeof options !== 'object') {
    throw new TypeError('router.route: options 必须为对象');
  }
  const providers = asProviderList(options.providers);
  const preferred = options.model ?? TASK_MODEL_HINTS[task] ?? TASK_MODEL_HINTS.default;

  for (let i = 0; i < providers.length; i += 1) {
    const p = providers[i];
    if (modelsOf(p).includes(preferred)) {
      return {
        provider: p.name,
        model: preferred,
        reason: `task="${task}" 命中首选模型 ${preferred}`,
        providerIndex: i,
      };
    }
  }

  const first = providers[0];
  const fallbackModel = modelsOf(first)[0] ?? first.model ?? 'default';
  return {
    provider: first.name,
    model: fallbackModel,
    reason: `task="${task}" 无首选命中，回退 ${first.name}/${fallbackModel}`,
    providerIndex: 0,
  };
}

/**
 * 降级路由：按顺序尝试多个 provider，返回首个成功结果。
 * @param {Array<object|string>} providers 按优先级排列的 provider 列表
 * @param {{ kind?: 'complete'|'embed', messages?: Array, texts?: string[], model?: string }} request
 *   kind='embed' 时走 gateway.embed；否则走 gateway.complete（其余字段透传）。
 * @returns {Promise<object>}
 */
export async function fallback(providers, request = {}) {
  if (request === null || typeof request !== 'object') {
    throw new TypeError('router.fallback: request 必须为对象');
  }
  const list = asProviderList(providers);
  if (list.length === 0) {
    throw new TypeError('router.fallback: 至少需要一个 provider');
  }

  const errors = [];
  for (const p of list) {
    try {
      if (request.kind === 'embed') {
        return await gateway.embed({ provider: p, texts: request.texts, model: request.model });
      }
      const { kind, ...rest } = request;
      return await gateway.complete({ provider: p, ...rest });
    } catch (err) {
      errors.push({ provider: p.name, error: err?.message ?? String(err) });
    }
  }

  const err = new Error('router.fallback: 全部 provider 均失败');
  err.causes = errors;
  throw err;
}

export { TASK_MODEL_HINTS };
