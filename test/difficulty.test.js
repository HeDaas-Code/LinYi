import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as config from '../src/infra/config.js';
import * as control from '../src/api/control.js';
import * as api from '../src/api/index.js';
import { loop } from '../src/runtime/index.js';

const REQUIRED_PARAMS = ['needGrowth', 'eventProbability', 'foragePoolCapacity', 'forageRegen', 'foragePoolPerCapita', 'forageRegenPerCapita'];

function fresh() {
  loop.reset();
  control.__reset();
  config.setDifficulty('standard');
}

test('难度档位存在且四档齐全，每档含全部难度参数', () => {
  const ids = config.difficultyIds();
  assert.deepEqual(ids, ['peaceful', 'standard', 'harsh', 'apocalyptic']);
  for (const id of ids) {
    const params = config.difficultyParams(id);
    assert.ok(params, id + ' 应有参数');
    for (const k of REQUIRED_PARAMS) {
      assert.ok(k in params, id + ' 缺参数 ' + k);
    }
  }
});

test('标准档参数等于当前默认值（既有行为不变）', () => {
  const d = config.defaults();
  const std = config.difficultyParams('standard');
  assert.deepEqual(std.needGrowth, d.needGrowth);
  assert.equal(std.eventProbability, d.eventProbability);
  assert.equal(std.foragePoolCapacity, d.foragePoolCapacity);
  assert.equal(std.forageRegen, d.forageRegen);
  assert.equal(std.foragePoolPerCapita, d.foragePoolPerCapita);
  assert.equal(std.forageRegenPerCapita, d.forageRegenPerCapita);
});

test('非法档位报错：config 抛 RangeError，control 抛 404/400', () => {
  assert.throws(() => config.setDifficulty('nope'), RangeError);
  assert.throws(() => control.setDifficulty('nope'), (e) => e.status === 404);
  assert.throws(() => control.setDifficulty(''), (e) => e.status === 400);
  assert.throws(() => control.setDifficulty(undefined), (e) => e.status === 400);
});

test('切换档位后 loop.run 参数快照反映新档位（人均缩放随档位变化）', async () => {
  fresh();
  // 和平档：forageRegen=12 / perCapita=0.2 / capacity=40 / poolPerCapita=1.5
  config.setDifficulty('peaceful');
  loop.reset();
  const r = await loop.run({ ticks: 1, agentCount: 20, seed: 1, eventProbability: 0, needGrowth: { food: 0, water: 0 } });
  const pool = r.world.resources.foragePool;
  assert.equal(pool.regen, 12 + 0.2 * 20, '和平档 regen 应 = 12 + 0.2×20');
  assert.equal(pool.capacity, 40 + 1.5 * 20, '和平档 capacity 应 = 40 + 1.5×20');

  // 切回标准档：forageRegen=8 / perCapita=0.15 / capacity=30 / poolPerCapita=1.0
  config.setDifficulty('standard');
  loop.reset();
  const r2 = await loop.run({ ticks: 1, agentCount: 20, seed: 1, eventProbability: 0, needGrowth: { food: 0, water: 0 } });
  const pool2 = r2.world.resources.foragePool;
  assert.equal(pool2.regen, 8 + 0.15 * 20, '标准档 regen 应 = 8 + 0.15×20');
  assert.equal(pool2.capacity, 30 + 1.0 * 20, '标准档 capacity 应 = 30 + 1.0×20');
});

test('既有默认行为不回归：默认档为 standard 且可正常步进', async () => {
  fresh();
  assert.equal(config.getDifficulty().id, 'standard');
  const res = await control.step({ eventProbability: 0 });
  assert.equal(res.tick, 1);
  assert.ok(res.summary.decisions.length >= 1);
});

test('http: difficulty 端点 list/get/set 与非法档位 404', async () => {
  fresh();
  const { server, port } = await api.start(0);
  const base = 'http://127.0.0.1:' + port;
  try {
    const listRes = await fetch(base + '/api/v1/sim/difficulties');
    assert.equal(listRes.status, 200);
    const list = await listRes.json();
    assert.equal(list.length, 4);
    assert.equal(list.find((d) => d.id === 'standard').current, true);

    const getRes = await fetch(base + '/api/v1/sim/difficulty');
    assert.equal(getRes.status, 200);
    assert.equal((await getRes.json()).id, 'standard');

    const setRes = await fetch(base + '/api/v1/sim/difficulty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'harsh' }),
    });
    assert.equal(setRes.status, 200);
    assert.equal((await setRes.json()).id, 'harsh');

    const badRes = await fetch(base + '/api/v1/sim/difficulty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'nope' }),
    });
    assert.equal(badRes.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
