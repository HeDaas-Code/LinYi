/**
 * truman-town.ai.llm.provider.a6api — A6API 真实模型适配器 / A6API Provider
 *
 * OpenAI 兼容 /chat/completions 适配器，把 ai.llm.gateway 接到真实推理模型
 *（默认 grok-4.6）。配置从环境变量读取：
 *   - A6API_KEY       必填，API Key
 *   - A6API_BASE_URL  可选，默认 https://api.a6api.com/v1
 *   - A6API_MODEL     可选，默认 grok-4.6
 *
 * 关键约束：
 *   - grok-4.6 是推理模型，complete 必须透传 reasoning_effort（默认 "minimal"），
 *     否则 completion_tokens 会膨胀到 200+。
 *   - /models 仅提供 5 个 chat 模型、没有任何 embedding 模型，因此 embed() 不支持，
 *     调用即抛错，由上层回退到 stub 适配器。
 *   - 本模块绝不打印 API Key：key 仅在内存中拼进 Authorization 头。
 */

const DEFAULT_BASE_URL = 'https://api.a6api.com/v1';
const DEFAULT_MODEL = 'grok-4.6';

function readConfig(env) {
  const e = env ?? process.env;
  const base = typeof e.A6API_BASE_URL === 'string' && e.A6API_BASE_URL.trim() !== ''
    ? e.A6API_BASE_URL.trim()
    : DEFAULT_BASE_URL;
  const model = typeof e.A6API_MODEL === 'string' && e.A6API_MODEL.trim() !== ''
    ? e.A6API_MODEL.trim()
    : DEFAULT_MODEL;
  const apiKey = e.A6API_KEY;
  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    const err = new Error(
      'provider.a6api: 缺少 A6API_KEY，请设置环境变量 A6API_KEY（可选 A6API_BASE_URL / A6API_MODEL）',
    );
    err.retryable = false;
    throw err;
  }
  return { base, model, apiKey };
}

function parseCompletion(json) {
  const choice = json && Array.isArray(json.choices) ? json.choices[0] : undefined;
  const content = choice?.message?.content;
  const text = typeof content === 'string' ? content : String(content ?? '');
  const u = json?.usage ?? {};
  return {
    text,
    usage: {
      promptTokens: u.prompt_tokens ?? 0,
      completionTokens: u.completion_tokens ?? 0,
      totalTokens: u.total_tokens ?? 0,
      reasoningTokens: u.reasoning_tokens ?? 0,
      costInUsdTicks: u.cost_in_usd_ticks ?? 0,
    },
  };
}

/**
 * 创建 A6API provider 适配器。
 * @param {Record<string, string>} [env] 可选注入环境变量（测试用）；缺省读 process.env
 * @returns {{ name: string, model: string, complete: Function, embed: Function }}
 */
export function createProvider(env) {
  const { base, model, apiKey } = readConfig(env);
  const baseUrl = base.replace(/\/+$/, '');

  return {
    name: 'a6api',
    model,

    async complete({ model: modelOverride, messages, temperature, maxTokens, reasoning_effort, reasoningEffort }) {
      const url = baseUrl + '/chat/completions';
      const body = {
        model: modelOverride || model,
        messages,
        reasoning_effort: reasoning_effort ?? reasoningEffort ?? 'minimal',
        ...(temperature === undefined ? {} : { temperature }),
        ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
      };

      let res;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey,
          },
          body: JSON.stringify(body),
        });
      } catch (err) {
        const e = new Error('provider.a6api.complete: 请求失败：' + (err?.message ?? String(err)));
        e.retryable = true;
        throw e;
      }

      if (!res.ok) {
        const err = new Error('provider.a6api.complete: HTTP ' + res.status + ' ' + res.statusText);
        err.status = res.status;
        err.retryable = res.status === 429 || res.status >= 500;
        throw err;
      }

      let json;
      try {
        json = await res.json();
      } catch (err) {
        const e = new Error('provider.a6api.complete: 响应不是合法 JSON：' + (err?.message ?? String(err)));
        e.retryable = true;
        throw e;
      }
      return parseCompletion(json);
    },

    async embed() {
      // A6API 无 embedding 模型，真实嵌入不支持；由上层回退到 stub 适配器。
      throw new Error('provider.a6api.embed: 不支持嵌入（A6API 无 embedding 模型），请回退 stub 适配器');
    },
  };
}

export { DEFAULT_BASE_URL, DEFAULT_MODEL };
