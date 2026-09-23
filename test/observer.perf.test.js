/**
 * observer / graph 性能回归测试（t31）
 *
 * 覆盖两项 O(t²) 消除的索引改动：
 *  1) graph store 的 type 索引 —— read({ type }) 不再全量扫描所有节点；
 *  2) episodic store 的 agentId 索引 —— list(agentId) 不再全量扫描所有记忆。
 * 语义回归：read({ type }) 仍按插入顺序返回匹配节点；list 仍按 ts 升序返回该主体记忆。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import * as graph from '../src/infra/store/graph.js';
import * as episodic from '../src/agent/memory/episodic/store.js';

test('graph.read({type}) 类型索引保持插入顺序与内容', () => {
  graph.__reset();
  graph.write({ id: 'a1', type: 'A', data: { v: 1 } });
  graph.write({ id: 'b1', type: 'B', data: { v: 2 } });
  graph.write({ id: 'a2', type: 'A', data: { v: 3 } });

  const a = graph.read({ type: 'A' });
  assert.deepEqual(a.map((n) => n.id), ['a1', 'a2']);
  assert.deepEqual(a.map((n) => n.data.v), [1, 3]);
  assert.deepEqual(graph.read({ type: 'B' }).map((n) => n.id), ['b1']);
  assert.deepEqual(graph.read({ type: 'C' }), []);
});

test('graph 类型索引在 upsert 换类型时正确迁移', () => {
  graph.__reset();
  graph.write({ id: 'x', type: 'A', data: { v: 0 } });
  graph.write({ id: 'x', type: 'B', data: { v: 1 } }); // upsert 换 type
  assert.deepEqual(graph.read({ type: 'A' }), []);
  assert.deepEqual(graph.read({ type: 'B' }).map((n) => [n.id, n.data.v]), [['x', 1]]);
});

test('episodic.list(agentId) 只返回该主体记忆且按 ts 升序', () => {
  episodic.__reset();
  episodic.write('a1', { content: 'm1', ts: 10 });
  episodic.write('a2', { content: 'other', ts: 20 });
  episodic.write('a1', { content: 'm2', ts: 30 });
  episodic.write('a1', { content: 'm0', ts: 5 });

  assert.deepEqual(episodic.list('a1').map((m) => m.content), ['m0', 'm1', 'm2']);
  assert.deepEqual(episodic.list('a2').map((m) => m.content), ['other']);
  assert.deepEqual(episodic.list('nobody'), []);
});

test('graph.read({type}) 读少量目标类型不受大量无关节点影响（类型索引性能）', () => {
  graph.__reset();
  const N = 50000;
  for (let i = 0; i < N; i += 1) graph.write({ id: 'bulk:' + i, type: 'bulk', data: { i } });
  for (let i = 0; i < 10; i += 1) graph.write({ id: 'small:' + i, type: 'small', data: { i } });

  // 预热 JIT
  graph.read({ type: 'small' });
  graph.read({ type: 'bulk' });

  const t0 = performance.now();
  const small = graph.read({ type: 'small' });
  const t1 = performance.now();
  const bulk = graph.read({ type: 'bulk' });
  const t2 = performance.now();

  assert.equal(small.length, 10);
  assert.equal(bulk.length, N);

  const smallMs = t1 - t0;
  const bulkMs = t2 - t1;
  // 读 10 个节点应远快于读 50000 个节点：类型索引使 small 读为 O(10)，
  // 而 bulk 读为 O(50000)；若无索引，两者都需全量扫描 50010 个节点、耗时相当。
  assert.ok(
    smallMs * 20 < bulkMs,
    '类型索引疑似未生效：读10节点 ' + smallMs.toFixed(2) + 'ms vs 读50000节点 ' + bulkMs.toFixed(2) + 'ms',
  );
});
