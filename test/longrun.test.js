import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as graph from '../src/infra/store/graph.js';
import * as recorder from '../src/observer/recorder/index.js';
import { compile } from '../src/observer/chronicle/compiler.js';
import { loop } from '../src/runtime/index.js';

test('chronicle.compile 处理 20 万+ 条目不抛错（无 spread 栈溢出）', () => {
  graph.__reset();
  const N = 200000;
  for (let i = 0; i < N; i += 1) {
    graph.write({ id: 'stress.dec.' + i, type: recorder.decisionLog.TYPE, data: { tick: i % 5000, seq: i, ts: i, agentId: 'a' + (i % 50) } });
  }
  const result = compile();
  assert.equal(result.counts.total, N);
  assert.equal(result.startTick, 0);
  assert.equal(result.endTick, 4999);
});

test('长跑后 snapshot 可调用（20 万条日志编年编译不崩）', () => {
  loop.reset();
  const N = 200000;
  for (let i = 0; i < N; i += 1) {
    graph.write({ id: 'stress.evt.' + i, type: recorder.decisionLog.TYPE, data: { tick: i % 4000, seq: i, ts: i, agentId: null } });
  }
  const snap = loop.snapshot();
  assert.ok(snap.chronicle && typeof snap.chronicle.total === 'number');
  assert.ok(snap.chronicle.total >= N);
});
