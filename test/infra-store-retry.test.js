import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as vector from '../src/infra/store/vector.js';
import * as archive from '../src/infra/store/archive.js';
import * as retry from '../src/infra/events/retry.js';
import * as graph from '../src/infra/store/graph.js';

// ---- infra.store.vector ----

test('vector: 写入后可按余弦相似度检索，且结果确定', () => {
  vector.__reset();
  vector.upsert({ id: 'a', vector: [1, 0, 0], text: '避难所食物储备' });
  vector.upsert({ id: 'b', vector: [0, 1, 0], text: '工具与建造材料' });
  vector.upsert({ id: 'c', vector: [0.9, 0.1, 0], text: '食物分配方案' });
  const hits = vector.search({ vector: [1, 0, 0], limit: 2 });
  assert.equal(hits.length, 2);
  assert.equal(hits[0].id, 'a', '完全同向的 a 应排第一');
  assert.equal(hits[1].id, 'c', '接近同向的 c 应排第二');
  // 确定性：重复检索逐位一致
  const again = vector.search({ vector: [1, 0, 0], limit: 2 });
  assert.deepEqual(again, hits, '同查询应逐位一致');
});

test('vector: 无向量时退化为词面重叠，不静默失败', () => {
  vector.__reset();
  vector.upsert({ id: 'x', text: '今天在避难所里制作了一把工具' });
  vector.upsert({ id: 'y', text: '外面天气很糟，辐射很强' });
  const hits = vector.search({ text: '避难所 工具', limit: 2 });
  assert.ok(hits.length >= 1, '应至少命中一条');
  assert.equal(hits[0].id, 'x', '词面重叠更高的 x 应排第一');
});

test('vector: fm 与 filter 生效，维度不一致时早失败', () => {
  vector.__reset();
  vector.upsert({ id: 'm1', vector: [1, 0], meta: { agentId: 'A' } });
  vector.upsert({ id: 'm2', vector: [1, 0], meta: { agentId: 'B' } });
  const onlyA = vector.search({ vector: [1, 0], filter: { agentId: 'A' }, limit: 5 });
  assert.deepEqual(onlyA.map((h) => h.id), ['m1']);
  assert.throws(() => vector.upsert({ id: 'm3', vector: [1, 0, 0] }), /维度不一致/);
});

// ---- infra.store.archive ----

test('archive: save/load 往返保真，且携带记录数', () => {
  graph.__reset();
  graph.write({ type: 'agent', id: 'a1', data: { name: '甲' } });
  graph.write({ type: 'agent', id: 'a2', data: { name: '乙' } });
  const snap = archive.save({ graph, meta: { tick: 42 }, now: 42 });
  assert.equal(snap.schemaVersion, archive.SCHEMA_VERSION);
  assert.equal(snap.counts.records, 2);

  graph.__reset();
  assert.equal(graph.read({}).length, 0, '清空后应为空');
  const res = archive.load(snap, { graph, __reset: graph.__reset });
  assert.equal(res.loaded, 2);
  assert.equal(graph.read({}).length, 2, '还原后记录数应恢复');
  assert.equal(res.meta.tick, 42);
});

test('archive: 版本不兼容与写入失败都会明确报错并回滚', () => {
  graph.__reset();
  assert.throws(() => archive.load({ schemaVersion: 999, records: [] }, { graph }), /版本不兼容/);
  assert.throws(() => archive.load(null, { graph }), /必须为对象/);

  // 写入中途失败 → 回滚到调用前状态
  graph.__reset();
  graph.write({ type: 'agent', id: 'keep', data: {} });
  let n = 0;
  const flaky = {
    read: (q) => graph.read(q),
    write: (rec) => { n += 1; if (n === 2) throw new Error('磁盘写满'); return graph.write(rec); },
  };
  assert.throws(() => archive.load({ schemaVersion: 1, records: [{ type: 'agent', id: 'x', data: {} }, { type: 'agent', id: 'y', data: {} }] },
    { graph: flaky, __reset: graph.__reset }), /已回滚/);
  const after = graph.read({}).map((r) => r.id);
  assert.deepEqual(after, ['keep'], '失败后应回滚到唯一的 keep');
});

// ---- infra.events.retry ----

test('retry: 指数退避后成功投递', () => {
  retry.__reset();
  retry.enqueue({ key: 'e1', topic: 'test.topic', payload: { v: 1 }, now: 0, baseDelay: 2 });
  const calls = [];
  const deliver = (topic, payload) => { calls.push({ topic, payload }); };
  // t=0 时未到期（delay = baseDelay * 2^0 = 2）
  let r = retry.run({ now: 0, deliver });
  assert.equal(r.delivered.length, 0, 't=0 未到期不应投递');
  assert.equal(r.pending, 1);
  r = retry.run({ now: 2, deliver });
  assert.equal(r.delivered.length, 1, 't=2 应投递');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].topic, 'test.topic');
  assert.equal(r.pending, 0);
});

test('retry: 超过上限进入死信且不丢弃', () => {
  retry.__reset();
  retry.enqueue({ key: 'e2', topic: 'bad.topic', now: 0, baseDelay: 1, maxAttempts: 3 });
  const boom = () => { throw new Error('订阅者报错'); };
  let t = 0;
  for (let i = 0; i < 6; i += 1) { retry.run({ now: t, deliver: boom }); t += 10; }
  const d = retry.dead();
  assert.equal(d.length, 1, '应恰好有 1 条死信');
  assert.equal(d[0].topic, 'bad.topic');
  assert.match(d[0].error, /订阅者报错/, '死信应带最后错误');
  assert.equal(retry.getStats().dropped, 1);
  assert.equal(retry.getStats().pending, 0);
});

test('retry: 同 key 重复入队按更新处理，不重复计数', () => {
  retry.__reset();
  retry.enqueue({ key: 'same', topic: 't', now: 0 });
  retry.enqueue({ key: 'same', topic: 't', now: 5 });
  assert.equal(retry.getStats().enqueued, 1, '同 key 应视为更新');
  assert.equal(retry.pending().length, 1);
  assert.throws(() => retry.enqueue({ key: '', topic: 't' }), /非空 key/);
  assert.throws(() => retry.run({ now: 0 }), /需要 deliver/);
});
