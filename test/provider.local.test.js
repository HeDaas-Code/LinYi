import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createProvider,
  meanPoolNormalize,
  preTokenize,
  buildWordPieceTokenizer,
  deterministicVector,
  DEFAULT_DIM,
  LOCAL_MODEL_NAME,
} from '../src/ai/llm/provider.local.js';
import { gateway } from '../src/ai/index.js';

// 全部离线：不依赖真实模型文件 / onnxruntime。

test('meanPoolNormalize: attention_mask 加权均值 + L2 归一化', () => {
  // [1,3,2] = [[1,0],[0,1],[1,1]]，mask [1,1,0]：仅前两行参与均值。
  const tensor = { data: [1, 0, 0, 1, 1, 1], dims: [1, 3, 2] };
  const vec = meanPoolNormalize(tensor, [1, 1, 0]);
  // mean = (0.5, 0.5)，L2 归一化后 = (1/√2, 1/√2)
  const inv = 1 / Math.sqrt(2);
  assert.ok(Math.abs(vec[0] - inv) < 1e-6);
  assert.ok(Math.abs(vec[1] - inv) < 1e-6);
  assert.ok(Math.abs(Math.hypot(vec[0], vec[1]) - 1) < 1e-6);
});

test('preTokenize: 英文按词、中文按字、标点独立、小写化', () => {
  assert.deepEqual(preTokenize('Hello, 世界'), ['hello', ',', '世', '界']);
  assert.deepEqual(preTokenize('test  case'), ['test', 'case']);
});

test('buildWordPieceTokenizer: 贪心最长匹配 + 中文按字 + UNK', () => {
  const vocab = { '[UNK]': 0, '[CLS]': 1, '[SEP]': 2, test: 3, '##ing': 4, 我: 5, a: 6 };
  const { tokenize } = buildWordPieceTokenizer(vocab, { unkId: 0, clsId: 1, sepId: 2 });
  const enc = tokenize('testing 我 x');
  assert.deepEqual(enc.inputIds, [1, 3, 4, 5, 0, 2]);
  assert.deepEqual(enc.attentionMask, [1, 1, 1, 1, 1, 1]);
  assert.deepEqual(enc.tokenTypeIds, [0, 0, 0, 0, 0, 0]);
});

test('deterministicVector: 同文同向量、不同文不同向量', () => {
  assert.deepEqual(deterministicVector('abc', 8), deterministicVector('abc', 8));
  assert.notDeepEqual(deterministicVector('abc', 8), deterministicVector('abd', 8));
  assert.equal(deterministicVector('abc', 8).length, 8);
});

test('provider.local: 模型缺失回退 stub 且不抛错', async () => {
  const provider = createProvider({ modelDir: '/nonexistent-dir-xyz' });
  const r = await provider.embed({ texts: ['hello', '世界'] });
  assert.equal(r.vectors.length, 2);
  assert.equal(r.vectors[0].length, DEFAULT_DIM);
  assert.equal(r.vectors[1].length, DEFAULT_DIM);
  assert.ok(r.fallback);
  assert.match(r.fallback, /回退 stub/);
});

test('provider.local: 注入 fake session 验证同文同向量/不同文不同向量/维度一致', async () => {
  const DIM = 4;
  const fakeLoad = async () => ({
    tokenize: (text) => {
      const ids = text === 'same' ? [101, 1, 102] : [101, 2, 3, 102];
      return { inputIds: ids, attentionMask: ids.map(() => 1), tokenTypeIds: ids.map(() => 0) };
    },
    run: async ({ inputIds }) => {
      const T = inputIds.length;
      const data = new Float32Array(T * DIM);
      for (let t = 0; t < T; t += 1) {
        for (let d = 0; d < DIM; d += 1) data[t * DIM + d] = (inputIds[t] + d) % 5;
      }
      return { data, dims: [1, T, DIM] };
    },
  });
  const provider = createProvider({ modelDir: '/unused', dim: DIM, _load: fakeLoad });

  const a = await provider.embed({ texts: ['same'] });
  const b = await provider.embed({ texts: ['same'] });
  const c = await provider.embed({ texts: ['other'] });

  assert.equal(a.fallback, null);
  assert.deepEqual(a.vectors, b.vectors);
  assert.notDeepEqual(a.vectors, c.vectors);
  for (const v of [...a.vectors, ...c.vectors]) assert.equal(v.length, DIM);
});

test('provider.local: complete 不支持（抛明确错误）', async () => {
  const provider = createProvider({ modelDir: '/unused' });
  await assert.rejects(() => provider.complete({ messages: [{ role: 'user', content: 'hi' }] }), /不支持 complete/);
});

test('gateway.embed: local 模式返回 dim/model/provider/fallback', async () => {
  gateway.__reset();
  gateway.useLocalEmbed({ modelDir: '/nonexistent-dir-xyz' });
  const r = await gateway.embed({ texts: ['食物', '水源'] });
  assert.equal(r.dim, DEFAULT_DIM);
  assert.equal(r.model, LOCAL_MODEL_NAME);
  assert.equal(r.provider, 'local');
  assert.ok(r.fallback);
  assert.equal(r.vectors.length, 2);
  assert.equal(r.vectors[0].length, DEFAULT_DIM);
});

test('gateway: registerLocalEmbed 不切换、useLocalEmbed 切换、TRUMAN_EMBED_PROVIDER=local', async () => {
  gateway.__reset();
  gateway.registerLocalEmbed({ modelDir: '/nonexistent-dir-xyz' });
  let r = await gateway.embed({ texts: ['a'] });
  assert.equal(r.provider, 'stub'); // 登记不切换默认嵌入

  gateway.useLocalEmbed({ modelDir: '/nonexistent-dir-xyz' });
  r = await gateway.embed({ texts: ['a'] });
  assert.equal(r.provider, 'local');
  assert.ok(r.fallback);

  gateway.__reset();
  gateway.registerFromEnv({
    A6API_KEY: 'test-key',
    TRUMAN_EMBED_PROVIDER: 'local',
    TRUMAN_EMBED_MODEL_DIR: '/nonexistent-dir-xyz',
  });
  r = await gateway.embed({ texts: ['a'] });
  assert.equal(r.provider, 'local');
  assert.ok(r.fallback);
});
