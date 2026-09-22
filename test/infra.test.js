import { test } from 'node:test';
import assert from 'node:assert/strict';

import { config } from '../src/infra/index.js';
import { rng } from '../src/infra/index.js';
import { identity } from '../src/infra/index.js';
import { graph } from '../src/infra/index.js';
import { pubsub } from '../src/infra/index.js';

test('rng: seed 后 next 可复现', () => {
  rng.seed('truman-42');
  const a = [rng.next(), rng.next(), rng.next()];
  rng.seed('truman-42');
  const b = [rng.next(), rng.next(), rng.next()];
  assert.deepEqual(a, b);
  for (const v of a) {
    assert.ok(v >= 0 && v < 1);
  }
});

test('rng: 不同 seed 序列不同', () => {
  rng.seed('a');
  const a = [rng.next(), rng.next(), rng.next()];
  rng.seed('b');
  const b = [rng.next(), rng.next(), rng.next()];
  assert.notDeepEqual(a, b);
});

test('identity: next 单调递增且带前缀', () => {
  identity.__reset();
  const a = identity.next('agent');
  const b = identity.next('agent');
  const c = identity.next('item');
  assert.match(a, /^agent_\d{12}$/);
  assert.ok(a < b);
  assert.match(c, /^item_\d{12}$/);
});

test('graph: write/read 单节点与类型查询', () => {
  graph.__reset();
  graph.write({ id: 'n1', type: 'person', data: { name: 'Ada' } });
  graph.write({ id: 'n2', type: 'person', data: { name: 'Bo' } });
  graph.write({ id: 'e1', type: 'edge', data: { weight: 3 } });

  const node = graph.read('n1');
  assert.equal(node.id, 'n1');
  assert.equal(node.data.name, 'Ada');

  const persons = graph.read({ type: 'person' });
  assert.equal(persons.length, 2);

  const all = graph.read();
  assert.equal(all.length, 3);
  assert.equal(graph.read('missing'), null);
});

test('graph: read 返回深拷贝，外部修改不影响内部', () => {
  graph.__reset();
  graph.write({ id: 'x', type: 't', data: { n: 1 } });
  const snap = graph.read('x');
  snap.data.n = 999;
  assert.equal(graph.read('x').data.n, 1);
});

test('config: set/get 与 get() 全量', () => {
  config.__reset();
  config.set('world.tick', 120);
  config.set('survival.decay', 0.05);
  assert.equal(config.get('world.tick'), 120);
  assert.equal(config.get('survival.decay'), 0.05);
  assert.equal(config.get('missing'), undefined);

  const all = config.get();
  assert.equal(all['world.tick'], 120);
  assert.equal(all['survival.decay'], 0.05);
});

test('config: set 深拷贝，外部对象改动不回写', () => {
  config.__reset();
  const obj = { a: 1 };
  config.set('k', obj);
  obj.a = 2;
  assert.deepEqual(config.get('k'), { a: 1 });
});

test('pubsub: publish/subscribe 派发与退订', () => {
  pubsub.__reset();
  const got = [];
  const off = pubsub.subscribe('tick', (payload, meta) => {
    got.push({ payload, topic: meta.topic });
  });
  assert.equal(pubsub.publish('tick', { n: 1 }), 1);
  off();
  assert.equal(pubsub.publish('tick', { n: 2 }), 0);
  assert.deepEqual(got, [{ payload: { n: 1 }, topic: 'tick' }]);
});

test('pubsub: 通配订阅收到全部事件，异常被隔离', () => {
  pubsub.__reset();
  const seen = [];
  pubsub.subscribe('*', (payload, meta) => seen.push(meta.topic));
  pubsub.subscribe('boom', () => {
    throw new Error('ignore me');
  });
  const delivered = pubsub.publish('boom', null);
  pubsub.publish('other', null);
  assert.equal(delivered, 1); // 精确订阅抛错不计数，通配订阅正常
  assert.deepEqual(seen, ['boom', 'other']);
});
