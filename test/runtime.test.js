import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clock } from '../src/runtime/index.js';
import { worldState } from '../src/runtime/index.js';
import { registry } from '../src/runtime/index.js';
import { cycle } from '../src/runtime/index.js';
import { perception } from '../src/runtime/index.js';
import { dispatch } from '../src/runtime/index.js';

test('clock: now 从 0 开始，tick 单调推进', () => {
  clock.__reset();
  assert.deepEqual(clock.now(), { tick: 0, startedAt: null });
  const a = clock.tick();
  const b = clock.tick();
  assert.equal(a.tick, 1);
  assert.equal(b.tick, 2);
  assert.ok(a.startedAt !== null);
  assert.deepEqual(clock.now(), { tick: 2, startedAt: a.startedAt });
});

test('clock: schedule 按 interval 周期触发，offset 生效', () => {
  clock.__reset();
  const seen = [];
  clock.schedule({ id: 'every2', interval: 2, fn: (now) => seen.push(now.tick) });
  clock.schedule({ id: 'every3-off1', interval: 3, offset: 1, fn: (now) => seen.push(`off:${now.tick}`) });
  for (let i = 0; i < 6; i += 1) clock.tick();
  // every2 在 tick 2,4,6 触发；every3-off1 在 tick 1,4 触发
  assert.deepEqual(seen, ['off:1', 2, 4, 'off:4', 6]);
});

test('clock: schedule 校验非法参数，cancel 取消任务', () => {
  clock.__reset();
  assert.throws(() => clock.schedule({ interval: 0, fn: () => {} }), /interval/);
  assert.throws(() => clock.schedule({ interval: 2 }), /fn/);

  const fired = [];
  const { id, cancel } = clock.schedule({ interval: 1, fn: () => fired.push(1) });
  clock.tick();
  cancel();
  clock.tick();
  assert.deepEqual(fired, [1]);

  // 已存在的 id 直接注册报错
  clock.schedule({ id: 'dup', interval: 1, fn: () => {} });
  assert.throws(() => clock.schedule({ id: 'dup', interval: 1, fn: () => {} }), /已存在/);
});

test('world-state: snapshot 深拷贝，set/get 路径读写', () => {
  worldState.__reset();
  worldState.set('agents.a.hp', 10);
  worldState.set('time.day', 1);
  assert.equal(worldState.get('agents.a.hp'), 10);
  assert.deepEqual(worldState.get('agents'), { a: { hp: 10 } });

  const snap = worldState.snapshot();
  snap.agents.a.hp = 999;
  assert.equal(worldState.get('agents.a.hp'), 10);
});

test('world-state: diff 识别 changed/added，restore 回滚', () => {
  worldState.__reset();
  worldState.set('agents.a.hp', 10);
  worldState.set('agents.a.food', 3);
  const before = worldState.snapshot();

  worldState.set('agents.a.hp', 7);
  worldState.set('agents.a.water', 5);

  const after = worldState.snapshot();
  const diffs = worldState.diff(before, after);
  assert.deepEqual(diffs, [
    { path: 'agents.a.hp', op: 'changed', prev: 10, next: 7 },
    { path: 'agents.a.water', op: 'added', prev: undefined, next: 5 },
  ]);

  worldState.restore(before);
  assert.deepEqual(worldState.snapshot(), before);
  assert.throws(() => worldState.restore([]), /普通对象/);
});

test('world-state: removed 场景与数组差异', () => {
  worldState.__reset();
  worldState.set('x', { a: 1, b: 2 });
  const withBoth = worldState.snapshot();
  worldState.set('x', { a: 1 });
  const removed = worldState.diff(withBoth, worldState.snapshot());
  assert.deepEqual(removed, [{ path: 'x.b', op: 'removed', prev: 2, next: undefined }]);

  worldState.__reset();
  worldState.set('list', [1, 2]);
  const arrA = worldState.snapshot();
  worldState.set('list', [1, 3]);
  const arrDiff = worldState.diff(arrA, worldState.snapshot());
  assert.deepEqual(arrDiff, [{ path: 'list', op: 'changed', prev: [1, 2], next: [1, 3] }]);
});

test('registry: register/lookup/unregister 与类型查询', () => {
  registry.__reset();
  registry.register({ id: 'agent_1', type: 'agent', data: { name: 'Ada' } });
  registry.register({ id: 'agent_2', type: 'agent', data: { name: 'Bo' } });
  registry.register({ id: 'bld_1', type: 'building', data: { kind: 'shelter' } });

  assert.equal(registry.lookup('agent_1').data.name, 'Ada');
  assert.equal(registry.lookup('missing'), null);

  const agents = registry.lookup({ type: 'agent' });
  assert.equal(agents.length, 2);
  assert.equal(registry.count(), 3);

  const removed = registry.unregister('bld_1');
  assert.equal(removed.id, 'bld_1');
  assert.equal(registry.unregister('bld_1'), null);
  assert.equal(registry.count(), 2);
});

test('registry: 深拷贝与校验', () => {
  registry.__reset();
  const data = { hp: 10 };
  registry.register({ id: 'a', type: 'agent', data });
  data.hp = 999;
  assert.equal(registry.lookup('a').data.hp, 10);
  assert.throws(() => registry.register({ type: 'agent' }), /id/);
  assert.throws(() => registry.register({ id: 'x', data: [] }), /data/);
});

test('cycle: run 推进 clock 并调用 step，支持 pause 提前结束', () => {
  clock.__reset();
  cycle.__reset();
  const seen = [];
  const st = cycle.run({
    steps: 5,
    step: (ctx) => {
      seen.push({ tick: ctx.tick, step: ctx.step });
      if (ctx.step === 2) cycle.pause();
    },
  });
  assert.equal(st.phase, 'paused');
  assert.deepEqual(seen, [
    { tick: 1, step: 1 },
    { tick: 2, step: 2 },
  ]);

  cycle.resume();
  const st2 = cycle.run({ steps: 3 });
  assert.equal(st2.phase, 'running');
  assert.equal(st2.tick, 5);
  assert.equal(st2.step, 5);
});

test('cycle: 缺少 step 与非法 steps 报错', () => {
  cycle.__reset();
  assert.throws(() => cycle.run({}), /step/);
  assert.throws(() => cycle.run({ steps: -1, step: () => {} }), /steps/);
});

test('perception: collect 归一化，route 广播到全体 agent', () => {
  registry.__reset();
  perception.__reset();
  registry.register({ id: 'a1', type: 'agent', data: {} });
  registry.register({ id: 'a2', type: 'agent', data: {} });
  registry.register({ id: 'b1', type: 'building', data: {} });

  const percepts = perception.collect([
    { topic: 'rain', data: { level: 2 }, ts: 100 },
    { id: 'e2', topic: 'food', data: { amount: 1 } },
  ]);
  assert.equal(percepts.length, 2);
  assert.equal(percepts[0].id, 'event_1');
  assert.equal(percepts[1].id, 'e2');

  const inbox = perception.route();
  assert.deepEqual(Object.keys(inbox).sort(), ['a1', 'a2']);
  assert.equal(inbox.a1.length, 2);
  assert.equal(inbox.a1[0].topic, 'rain');
});

test('perception: targets 定向分发', () => {
  registry.__reset();
  perception.__reset();
  registry.register({ id: 'a1', type: 'agent', data: {} });
  registry.register({ id: 'a2', type: 'agent', data: {} });

  const inbox = perception.route(
    perception.collect([{ topic: 'whisper', targets: ['a2'] }]),
  );
  assert.equal(inbox.a1.length, 0);
  assert.equal(inbox.a2.length, 1);
});

test('dispatch: resolve 归一化并校验，actions 写入 world-state', () => {
  worldState.__reset();
  dispatch.__reset();
  const ops = dispatch.resolve([
    { agentId: 'a1', action: 'eat', params: { food: 1 }, reason: 'hungry', confidence: 0.8 },
    { agentId: 'a2' },
  ]);
  assert.equal(ops.length, 2);
  assert.equal(ops[0].action, 'eat');
  assert.equal(ops[1].action, 'noop');
  assert.match(ops[0].id, /^op_\d+$/);

  const applied = dispatch.actions(ops);
  assert.equal(applied.length, 2);
  assert.equal(worldState.get('agents.a1.last_action.action'), 'eat');
  assert.equal(worldState.get('agents.a2.last_action.action'), 'noop');
});

test('dispatch: effect 自定义世界变更与 onApplied 回调', () => {
  worldState.__reset();
  dispatch.__reset();
  const observed = [];
  const op = dispatch.resolve({
    agentId: 'a1',
    action: 'drink',
    effect: (world) => world.set('agents.a1.water', -1),
  })[0];
  dispatch.actions(op, { onApplied: (record) => observed.push(record.action) });
  assert.equal(worldState.get('agents.a1.water'), -1);
  assert.deepEqual(observed, ['drink']);
  assert.throws(() => dispatch.resolve({ action: 'x' }), /agentId/);
});
