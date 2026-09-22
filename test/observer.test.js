import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { graph, pubsub } from '../src/infra/index.js';
import * as observer from '../src/observer/index.js';

const { recorder, chronicle } = observer;
const { decisionLog, actionLog, eventLog } = recorder;
const { compiler } = chronicle;

beforeEach(() => {
  graph.__reset();
  pubsub.__reset();
  recorder.__reset();
});

test('decision-log: record 写入不可变日志并返回快照', () => {
  const node = decisionLog.record({
    tick: 10,
    agentId: 'agent_1',
    decision: { type: 'eat', target: 'food' },
    options: [{ type: 'eat' }, { type: 'drink' }],
    context: { hunger: 0.8 },
    reason: 'hunger high',
  });
  assert.equal(node.type, 'observer.decision');
  assert.match(node.id, /^obs\.decision\.\d+$/);
  assert.equal(node.data.tick, 10);
  assert.equal(node.data.agentId, 'agent_1');
  assert.deepEqual(node.data.decision, { type: 'eat', target: 'food' });
  assert.deepEqual(node.data.options, [{ type: 'eat' }, { type: 'drink' }]);
  assert.equal(node.data.reason, 'hunger high');

  const list = decisionLog.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, node.id);
});

test('decision-log: 非法输入抛出 TypeError', () => {
  assert.throws(() => decisionLog.record({ tick: 1.5, agentId: 'a', decision: {} }), /tick/);
  assert.throws(() => decisionLog.record({ tick: -1, agentId: 'a', decision: {} }), /tick/);
  assert.throws(() => decisionLog.record({ tick: 0, agentId: '', decision: {} }), /agentId/);
  assert.throws(() => decisionLog.record({ tick: 0, agentId: 'a' }), /decision/);
});

test('action-log: record 记录行为与结果', () => {
  const node = actionLog.record({
    tick: 11,
    agentId: 'agent_1',
    action: { type: 'move', target: 'room_b' },
    outcome: { ok: true },
  });
  assert.equal(node.type, 'observer.action');
  assert.equal(node.data.tick, 11);
  assert.deepEqual(node.data.action, { type: 'move', target: 'room_b' });
  assert.deepEqual(node.data.outcome, { ok: true });
  assert.equal(actionLog.list().length, 1);
});

test('event-log: record 记录世界事件', () => {
  const node = eventLog.record({ tick: 5, topic: 'weather.storm', payload: { level: 3 } });
  assert.equal(node.type, 'observer.event');
  assert.equal(node.data.topic, 'weather.storm');
  assert.deepEqual(node.data.payload, { level: 3 });
  assert.equal(eventLog.list().length, 1);
});

test('event-log: attach 订阅总线自动记录，退订后停止', () => {
  const off = eventLog.attach({ tick: 7 });
  pubsub.publish('survival.quake', { magnitude: 5 });
  off();
  pubsub.publish('ignored', {});
  const list = eventLog.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].data.tick, 7);
  assert.equal(list[0].data.topic, 'survival.quake');
  assert.deepEqual(list[0].data.payload, { magnitude: 5 });
});

test('chronicle.compile: 按 tick 编译并统计三类日志', () => {
  decisionLog.record({ tick: 1, agentId: 'a', decision: { type: 'eat' } });
  actionLog.record({ tick: 1, agentId: 'a', action: { type: 'move' } });
  eventLog.record({ tick: 2, topic: 'tick2', payload: {} });
  decisionLog.record({ tick: 3, agentId: 'b', decision: { type: 'drink' } });

  const ch = compiler.compile({ bucketSize: 1 });
  assert.equal(ch.startTick, 1);
  assert.equal(ch.endTick, 3);
  assert.deepEqual(ch.counts, { decision: 2, action: 1, event: 1, total: 4 });
  assert.equal(ch.buckets.length, 3);
  assert.equal(ch.buckets[0].startTick, 1);
  assert.equal(ch.buckets[0].entries.length, 2);
  assert.equal(ch.buckets[2].startTick, 3);
  assert.equal(ch.entries.length, 4);
});

test('chronicle.compile: 支持 agentId 与 tick 区间过滤', () => {
  decisionLog.record({ tick: 1, agentId: 'a', decision: { type: 'x' } });
  decisionLog.record({ tick: 5, agentId: 'b', decision: { type: 'y' } });
  decisionLog.record({ tick: 9, agentId: 'a', decision: { type: 'z' } });

  const byAgent = compiler.compile({ agentId: 'a' });
  assert.equal(byAgent.counts.total, 2);
  assert.deepEqual(byAgent.entries.map((e) => e.data.decision.type), ['x', 'z']);

  const byRange = compiler.compile({ fromTick: 2, toTick: 8 });
  assert.equal(byRange.counts.total, 1);
  assert.equal(byRange.entries[0].data.decision.type, 'y');
});

test('chronicle.bucket: 按 size 分桶并保持 tick/seq 排序', () => {
  const entries = [
    { tick: 12, seq: 2, kind: 'action' },
    { tick: 1, seq: 1, kind: 'decision' },
    { tick: 2, seq: 3, kind: 'event' },
    { tick: 22, seq: 4, kind: 'event' },
  ];
  const buckets = compiler.bucket(entries, { size: 10 });
  assert.equal(buckets.length, 3);
  assert.equal(buckets[0].startTick, 0);
  assert.equal(buckets[0].endTick, 9);
  assert.equal(buckets[0].entries.length, 2);
  assert.deepEqual(buckets[0].entries.map((e) => e.tick), [1, 2]);
  assert.equal(buckets[1].startTick, 10);
  assert.equal(buckets[1].entries.length, 1);
  assert.equal(buckets[2].startTick, 20);
  assert.equal(buckets[2].entries.length, 1);
});
