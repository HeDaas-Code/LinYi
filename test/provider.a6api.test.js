import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { createProvider } from '../src/ai/llm/provider.a6api.js';
import { gateway } from '../src/ai/index.js';

// 离线测试用假 key（仅占位，绝非真实 A6API_KEY）。
const FAKE_KEY = 'test-key';

function startMock(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        url: 'http://127.0.0.1:' + server.address().port,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw);
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function okCompletion(text = 'ok') {
  return {
    choices: [{ message: { content: text } }],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
      reasoning_tokens: 40,
      cost_in_usd_ticks: 12345,
    },
  };
}

test('provider.a6api: 请求构造正确（POST /chat/completions + 默认 reasoning_effort=minimal）', async () => {
  let captured = null;
  const { url, close } = await startMock(async (req, res) => {
    captured = { method: req.method, path: req.url, headers: req.headers, body: await readBody(req) };
    json(res, 200, okCompletion('hello'));
  });
  try {
    const provider = createProvider({ A6API_KEY: FAKE_KEY, A6API_BASE_URL: url, A6API_MODEL: 'grok-4.6' });
    const out = await provider.complete({ messages: [{ role: 'user', content: 'hi' }] });

    assert.equal(captured.method, 'POST');
    assert.equal(captured.path, '/chat/completions');
    assert.equal(captured.headers.authorization, 'Bearer ' + FAKE_KEY);
    assert.equal(captured.headers['content-type'], 'application/json');
    assert.equal(captured.body.model, 'grok-4.6');
    assert.equal(captured.body.reasoning_effort, 'minimal');
    assert.deepEqual(captured.body.messages, [{ role: 'user', content: 'hi' }]);
    assert.equal(out.text, 'hello');
  } finally {
    await close();
  }
});

test('provider.a6api: 解析 usage（含 reasoning_tokens / cost_in_usd_ticks）', async () => {
  const { url, close } = await startMock(async (req, res) => {
    await readBody(req);
    json(res, 200, okCompletion('parsed'));
  });
  try {
    const provider = createProvider({ A6API_KEY: FAKE_KEY, A6API_BASE_URL: url });
    const out = await provider.complete({ messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(out.usage.promptTokens, 10);
    assert.equal(out.usage.completionTokens, 20);
    assert.equal(out.usage.totalTokens, 30);
    assert.equal(out.usage.reasoningTokens, 40);
    assert.equal(out.usage.costInUsdTicks, 12345);
  } finally {
    await close();
  }
});

test('provider.a6api: reasoning_effort 可覆盖', async () => {
  let captured = null;
  const { url, close } = await startMock(async (req, res) => {
    captured = await readBody(req);
    json(res, 200, okCompletion('ok'));
  });
  try {
    const provider = createProvider({ A6API_KEY: FAKE_KEY, A6API_BASE_URL: url });
    await provider.complete({ messages: [{ role: 'user', content: 'hi' }], reasoning_effort: 'high' });
    assert.equal(captured.reasoning_effort, 'high');
  } finally {
    await close();
  }
});

test('provider.a6api: 缺 A6API_KEY 明确报错', () => {
  assert.throws(() => createProvider({}), /A6API_KEY/);
  assert.throws(() => createProvider({ A6API_BASE_URL: 'http://x' }), /A6API_KEY/);
  assert.throws(() => createProvider({ A6API_KEY: '   ' }), /A6API_KEY/);
});

test('provider.a6api: embed 不支持（回退 stub）', async () => {
  const provider = createProvider({ A6API_KEY: FAKE_KEY });
  await assert.rejects(() => provider.embed({ texts: ['a'] }), /不支持/);
});

test('gateway.complete: 透传 reasoningTokens / costInUsdTicks', async () => {
  gateway.__reset();
  const { url, close } = await startMock(async (req, res) => {
    await readBody(req);
    json(res, 200, okCompletion('via-gateway'));
  });
  try {
    const provider = createProvider({ A6API_KEY: FAKE_KEY, A6API_BASE_URL: url });
    const out = await gateway.complete({ provider, messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(out.provider, 'a6api');
    assert.equal(out.text, 'via-gateway');
    assert.equal(out.usage.promptTokens, 10);
    assert.equal(out.usage.reasoningTokens, 40);
    assert.equal(out.usage.costInUsdTicks, 12345);
  } finally {
    await close();
  }
});

test('gateway.complete: HTTP 500 后重试成功', async () => {
  gateway.__reset();
  let calls = 0;
  const { url, close } = await startMock(async (req, res) => {
    await readBody(req);
    calls += 1;
    if (calls === 1) {
      json(res, 500, { error: { message: 'boom' } });
      return;
    }
    json(res, 200, okCompletion('recovered'));
  });
  try {
    const provider = createProvider({ A6API_KEY: FAKE_KEY, A6API_BASE_URL: url });
    const out = await gateway.complete({ provider, messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(out.text, 'recovered');
    assert.equal(out.attempts, 2);
  } finally {
    await close();
  }
});

test('gateway.registerFromEnv/useA6Api: 登记不切换、useA6Api 切换默认', () => {
  gateway.__reset();
  const env = { A6API_KEY: FAKE_KEY, A6API_BASE_URL: 'http://127.0.0.1:1', A6API_MODEL: 'grok-4.6' };

  const p = gateway.registerFromEnv(env);
  assert.equal(p.name, 'a6api');
  assert.equal(gateway.getProvider().name, 'stub'); // 登记不切换默认
  assert.equal(gateway.provider('a6api').name, 'a6api'); // 已可按名取

  const active = gateway.useA6Api(env);
  assert.equal(active.name, 'a6api');
  assert.equal(gateway.getProvider().name, 'a6api'); // 切换默认
});
