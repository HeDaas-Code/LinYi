import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tech } from '../src/civilization/index.js';
import * as graph from '../src/infra/store/graph.js';
import * as energy from '../src/civilization/tech/_energy.js';
import * as eventLog from '../src/observer/recorder/event-log.js';
import * as actionLog from '../src/observer/recorder/action-log.js';

const { tree, research, lock } = tech;

function resetAll() {
  graph.__reset();
  tree.__reset();
  research.__reset();
  energy.__reset();
}

function eventsByTopic(topic) {
  return eventLog.list().filter((n) => n.data.topic === topic);
}

test('tree.query: 返回 5 个技术节点且前置关系正确', () => {
  resetAll();
  const all = tree.query();
  assert.equal(all.length, 5);

  const wp = tree.query({ techId: 'water_purification' });
  assert.deepEqual(wp.prerequisites, []);
  assert.equal(wp.available, true); // 根技术无前置，初始可研究

  const gh = tree.query({ techId: 'greenhouse' });
  assert.deepEqual(gh.prerequisites, ['water_purification']);
  assert.equal(gh.available, false); // 前置未解锁

  const med = tree.query({ techId: 'medicine' });
  assert.deepEqual(med.prerequisites, ['greenhouse']);
  const comms = tree.query({ techId: 'comms' });
  assert.deepEqual(comms.prerequisites, ['power']);
});

test('tree.unlock: 前置未满足时报错', () => {
  resetAll();
  assert.throws(() => tree.unlock({ techId: 'greenhouse' }), /前置/);
});

test('tree.unlock: 解锁根技术后其后继变为可研究', () => {
  resetAll();
  const wp = tree.unlock({ techId: 'water_purification', holders: ['eng_1'], tick: 3 });
  assert.equal(wp.state, 'unlocked');
  assert.deepEqual(wp.holders, ['eng_1']);
  assert.equal(wp.available, false); // 已解锁不可再研究

  const gh = tree.query({ techId: 'greenhouse' });
  assert.equal(gh.available, true);
});

test('tree.lock: 失传后技术不可用', () => {
  resetAll();
  tree.unlock({ techId: 'water_purification' });
  const locked = tree.lock({ techId: 'water_purification', tick: 7 });
  assert.equal(locked.state, 'locked');
  assert.equal(locked.available, false);
  assert.deepEqual(locked.holders, []);
});

test('tree.unlock: 已失传技术不能直接重新解锁', () => {
  resetAll();
  tree.unlock({ techId: 'water_purification' });
  tree.lock({ techId: 'water_purification' });
  assert.throws(() => tree.unlock({ techId: 'water_purification' }), /失传/);
});

test('research.start: 不可研究技术报错', () => {
  resetAll();
  assert.throws(() => research.start({ techId: 'greenhouse' }), /不可研究/);
  assert.throws(() => research.start({ techId: 'missing_tech' }), /未知技术/);
});

test('research: 完整 start→progress→complete 流程解锁技术', () => {
  resetAll();
  const task = research.start({ techId: 'water_purification', researchers: ['eng_1', 'eng_2'], tick: 1 });
  assert.equal(task.progress, 0);
  assert.equal(task.cost, 3);
  assert.equal(task.done, false);

  let states = research.progress({ n: 2, tick: 2 });
  assert.equal(states[0].progress, 2);
  assert.equal(states[0].done, false);

  states = research.progress({ n: 1, tick: 3 });
  assert.equal(states[0].progress, 3);
  assert.equal(states[0].done, true);

  const done = research.complete({ techId: 'water_purification', tick: 4 });
  assert.equal(done.techId, 'water_purification');
  assert.deepEqual(done.researchers, ['eng_1', 'eng_2']);
  assert.equal(done.unlocked.state, 'unlocked');

  assert.equal(tree.query({ techId: 'water_purification' }).state, 'unlocked');
  assert.deepEqual(tree.query({ techId: 'water_purification' }).holders, ['eng_1', 'eng_2']);
});

test('research.progress: 消耗能源推进研究', () => {
  resetAll();
  assert.equal(energy.query().stockpile, 100);
  research.start({ techId: 'water_purification', tick: 0 });
  research.progress({ n: 2, tick: 1 }); // energyCost=1，2 tick 消耗 2 能源
  assert.equal(energy.query().stockpile, 98);
});

test('research.complete: 进度不足报错', () => {
  resetAll();
  research.start({ techId: 'water_purification' });
  research.progress({ n: 1 });
  assert.throws(() => research.complete({ techId: 'water_purification' }), /未完成/);
});

test('research.start: 重复研究同一技术报错', () => {
  resetAll();
  research.start({ techId: 'water_purification' });
  assert.throws(() => research.start({ techId: 'water_purification' }), /已在研究/);
});

test('research.start: 已解锁技术不能再研究', () => {
  resetAll();
  tree.unlock({ techId: 'water_purification' });
  assert.throws(() => research.start({ techId: 'water_purification' }), /不可研究/);
});

test('lock.detect: 掌握者全部死亡判失传', () => {
  resetAll();
  tree.unlock({ techId: 'water_purification', holders: ['eng_1', 'eng_2'] });

  const partial = lock.detect({ techId: 'water_purification', living: ['eng_1'] });
  assert.equal(partial[0].lost, false);
  assert.deepEqual(partial[0].survivingHolders, ['eng_1']);

  const allDead = lock.detect({ techId: 'water_purification', living: ['other'] });
  assert.equal(allDead[0].lost, true);
  assert.deepEqual(allDead[0].survivingHolders, []);
});

test('lock.detect: 无掌握者或未解锁不判失传', () => {
  resetAll();
  const pending = lock.detect({ techId: 'water_purification', living: [] });
  assert.equal(pending[0].lost, false); // state=pending

  tree.unlock({ techId: 'water_purification', holders: [] }); // 无掌握者
  const noHolders = lock.detect({ techId: 'water_purification', living: [] });
  assert.equal(noHolders[0].lost, false);
});

test('lock.apply: 失传锁定并写 observer 日志', () => {
  resetAll();
  tree.unlock({ techId: 'water_purification', holders: ['eng_1'] });
  const result = lock.apply({ techId: 'water_purification', tick: 9 });
  assert.equal(result.locked, true);
  assert.deepEqual(result.holders, ['eng_1']);
  assert.equal(result.state, 'locked');
  assert.equal(tree.query({ techId: 'water_purification' }).state, 'locked');

  const lossEvents = eventsByTopic('civilization.tech.loss');
  assert.ok(lossEvents.some((n) => n.data.payload.techId === 'water_purification'));
});

test('observer 日志: unlock/complete/progress 均有记录', () => {
  resetAll();
  research.start({ techId: 'water_purification', researchers: ['eng_1'], tick: 0 });
  research.progress({ n: 3, tick: 1 });
  research.complete({ techId: 'water_purification', tick: 2 });

  assert.ok(eventsByTopic('civilization.tech.research.start').some((n) => n.data.payload.techId === 'water_purification'));
  assert.ok(eventsByTopic('civilization.tech.research.complete').some((n) => n.data.payload.techId === 'water_purification'));
  assert.ok(eventsByTopic('civilization.tech.unlock').some((n) => n.data.payload.techId === 'water_purification'));

  const progressLogs = actionLog.list().filter((n) => n.data.action === 'research:progress:water_purification');
  assert.equal(progressLogs.length, 1);
  assert.equal(progressLogs[0].data.outcome.progress, 3);
});
