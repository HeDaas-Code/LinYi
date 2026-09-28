import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as config from '../src/infra/config.js';
import * as graph from '../src/infra/store/graph.js';

test('config.defaults 快照含全部外提参数', () => {
  const d = config.defaults();
  assert.equal(d.decay.food, 0.01);
  assert.equal(d.decay.water, 0.01);
  assert.equal(d.needGrowth.food, 0.08);
  assert.equal(d.needGrowth.water, 0.08);
  assert.equal(d.eventProbability, 0.3);
  assert.equal(d.epidemicThreshold, 0.5);
  assert.equal(d.procreationMatchThreshold, 0.3);
  assert.equal(d.tagCount, 50);
  assert.equal(d.sharedTagCount, 45);
  assert.equal(d.ritualInterval, 2);
  assert.equal(d.traumaRate, 0.2);
  assert.equal(d.breakThreshold, 0.7);
});

test('config.defaults 返回深拷贝（修改不影响默认值）', () => {
  const d = config.defaults();
  d.decay.food = 0.99;
  d.tagCount = 1;
  assert.equal(config.defaults().decay.food, 0.01);
  assert.equal(config.defaults().tagCount, 50);
});

test('config.validate 校验合法配置并忽略未知键', () => {
  assert.equal(config.validate({}).ok, true);
  assert.equal(config.validate({ eventProbability: 0.5, traumaRate: 0.3, tagCount: 60, sharedTagCount: 50 }).ok, true);
  assert.equal(config.validate({ unknownKey: 123 }).ok, true, '未知键应被忽略');
});

test('config.validate 拒绝非法配置', () => {
  const bad = config.validate({ eventProbability: 1.5, tagCount: 0, breakThreshold: -1, traumaRate: NaN, ritualInterval: 0 });
  assert.equal(bad.ok, false);
  const keys = bad.errors.map((e) => e.key);
  assert.ok(keys.includes('eventProbability'));
  assert.ok(keys.includes('tagCount'));
  assert.ok(keys.includes('breakThreshold'));
  assert.ok(keys.includes('traumaRate'));
  assert.ok(keys.includes('ritualInterval'));
});

test('config.validate 跨字段 sharedTagCount <= tagCount', () => {
  assert.equal(config.validate({ tagCount: 10, sharedTagCount: 20 }).ok, false);
  assert.equal(config.validate({ tagCount: 50, sharedTagCount: 50 }).ok, true);
});

test('config.resolve 深度合并覆盖默认值', () => {
  const r = config.resolve({ decay: { food: 0.02 }, traumaRate: 0.5 });
  assert.equal(r.ok, true);
  assert.equal(r.config.decay.food, 0.02);
  assert.equal(r.config.decay.water, 0.01, '未覆盖的水衰减保持默认');
  assert.equal(r.config.traumaRate, 0.5);
  assert.equal(r.config.breakThreshold, 0.7);
});

test('config.set/get/setMany 统一读写（点分 key）', () => {
  graph.__reset();
  config.set('survival.eventProbability', 0.42);
  assert.equal(config.get('survival.eventProbability'), 0.42);
  config.setMany({ 'stage3.traumaRate': 0.9, 'stage2.tagCount': 60 });
  const all = config.get();
  assert.equal(all['stage3.traumaRate'], 0.9);
  assert.equal(all['stage2.tagCount'], 60);
  assert.equal(all['survival.eventProbability'], 0.42);
});

test('LLM decision defaults and validation', () => {
  const d = config.defaults();
  assert.equal(d.llmDecideMode, 'off');
  assert.equal(d.llmDecideEnabled, false);
  assert.equal(d.llmDecideConcurrency, 4);
  assert.equal(d.llmDecidePopulationShare, 1);
  assert.equal(config.validate({ llmDecideMaxAgents: 0, llmDecideMode: 'population', llmDecideConcurrency: 2, llmDecidePopulationShare: 0.5 }).ok, true);
  assert.equal(config.validate({ llmDecideMode: 'invalid', llmDecideConcurrency: 0, llmDecidePopulationShare: 1.1 }).ok, false);
});
