import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { graph, identity, rng, pubsub } from '../src/infra/index.js';
import { clock } from '../src/runtime/index.js';
import { recorder } from '../src/observer/index.js';
import * as survival from '../src/survival/index.js';
import * as traitsStore from '../src/agent/traits/tagset/store.js';
import * as medical from '../src/survival/health/_medical.js';

const { disease, treatment, epidemic } = survival.health;
const scorer = survival.needs.pressure.scorer;

function resetAll() {
  graph.__reset();
  identity.__reset();
  rng.__reset();
  pubsub.__reset();
  clock.__reset();
  recorder.__reset();
  medical.__reset();
  disease.__reset();
  epidemic.__reset();
}

beforeEach(() => {
  resetAll();
});

test('disease.infect: 无免疫居民感染，健康下降', () => {
  const r = disease.infect({ agentId: 'a1', diseaseId: 'flu', severity: 0.5 });
  assert.equal(r.infected, true);
  assert.equal(r.severity, 0.5);
  assert.equal(r.health, 80);
  assert.equal(r.diseases.length, 1);
  assert.equal(disease.status({ agentId: 'a1' }).infected, true);
});

test('disease.infect: 高免疫特质抵抗感染', () => {
  traitsStore.upsert('a1', { immune: 10 });
  const r = disease.infect({ agentId: 'a1', diseaseId: 'flu', severity: 0.8 });
  assert.equal(r.infected, false);
  assert.equal(r.reason, '免疫');
  assert.equal(disease.status({ agentId: 'a1' }).infected, false);
});

test('disease.infect: 部分免疫削弱症状', () => {
  traitsStore.upsert('a1', { immune: 5 });
  const r = disease.infect({ agentId: 'a1', diseaseId: 'flu', severity: 0.8 });
  assert.equal(r.infected, true);
  assert.ok(Math.abs(r.severity - 0.4) < 1e-9);
  assert.equal(r.health, 84);
});

test('disease.symptom: 症状恶化（severity 升、健康降）', () => {
  disease.infect({ agentId: 'a1', diseaseId: 'flu', severity: 0.2 });
  const r = disease.symptom({ agentId: 'a1', delta: 0.3, tick: 3 });
  assert.equal(r.severity, 0.5);
  assert.equal(r.health, 83);
  assert.equal(r.diseases[0].stage, 2);
});

test('disease.recover: 康复受医疗物资加成', () => {
  disease.infect({ agentId: 'a1', diseaseId: 'flu', severity: 0.8 });
  const r = disease.recover({ agentId: 'a1', amount: 0.2, tick: 1 });
  assert.ok(Math.abs(r.severity - 0.1) < 1e-9);
  assert.equal(r.health, 89);
});

test('disease.recover: 完全康复移除疾病', () => {
  disease.infect({ agentId: 'a1', diseaseId: 'flu', severity: 0.2 });
  const r = disease.recover({ agentId: 'a1', amount: 1.0 });
  assert.equal(r.infected, false);
  assert.equal(r.diseases.length, 0);
});

test('disease.status/list: 查询健康状态', () => {
  disease.infect({ agentId: 'a1', diseaseId: 'flu', severity: 0.3 });
  disease.infect({ agentId: 'a2', diseaseId: 'flu', severity: 0.7 });
  assert.equal(disease.status({ agentId: 'a1' }).severity, 0.3);
  assert.equal(disease.status({ agentId: 'a2' }).severity, 0.7);
  const all = disease.list();
  assert.deepEqual(all.map((s) => s.agentId), ['a1', 'a2']);
  assert.equal(all.filter((s) => s.infected).length, 2);
});

test('treatment.apply: 消耗医疗物资并治愈', () => {
  const before = medical.query().stockpile; // 100
  disease.infect({ agentId: 'a1', diseaseId: 'flu', severity: 0.8 });
  const r = treatment.apply({ agentId: 'a1', amount: 0.2, tick: 2 });
  assert.equal(r.consumed, 10);
  assert.equal(medical.query().stockpile, before - 10);
  assert.ok(Math.abs(r.severity - 0.1) < 1e-9);
});

test('treatment.triage: 按病情严重度降序分诊', () => {
  disease.infect({ agentId: 'a1', diseaseId: 'flu', severity: 0.3 });
  disease.infect({ agentId: 'a2', diseaseId: 'flu', severity: 0.7 });
  disease.infect({ agentId: 'a3', diseaseId: 'flu', severity: 0.5 });
  const order = treatment.triage();
  assert.deepEqual(order.map((s) => s.agentId), ['a2', 'a3', 'a1']);
});

test('epidemic.detect: 感染率与阈值判定 + 疫情日志', () => {
  disease.infect({ agentId: 'a1', diseaseId: 'flu', severity: 0.5 });
  disease.infect({ agentId: 'a2', diseaseId: 'flu', severity: 0.5 });
  const residents = ['a1', 'a2', 'a3', 'a4', 'a5'];

  const below = epidemic.detect({ residents, threshold: 0.5, tick: 1 });
  assert.equal(below.epidemic, false);
  assert.ok(Math.abs(below.infectionRate - 0.4) < 1e-9);
  assert.equal(below.infectedCount, 2);

  const above = epidemic.detect({ residents, threshold: 0.3, tick: 1 });
  assert.equal(above.epidemic, true);
  assert.equal(recorder.eventLog.list().length, 1);
  assert.equal(recorder.eventLog.list()[0].data.topic, 'health.epidemic');
});

test('epidemic.quarantine: 隔离并记录观察日志', () => {
  const r = epidemic.quarantine({ agentId: 'a1', tick: 5 });
  assert.equal(r.quarantined, true);
  assert.equal(epidemic.isQuarantined('a1'), true);
  const logs = recorder.eventLog.list();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].data.topic, 'health.quarantine');
  assert.equal(logs[0].data.agentId, 'a1');
  assert.equal(logs[0].data.tick, 5);
});

test('闭环：感染传播 → 疫情检测 → 隔离 → 治疗康复', () => {
  const residents = ['a1', 'a2', 'a3'];
  disease.infect({ agentId: 'a1', diseaseId: 'flu', severity: 0.6 });
  disease.infect({ agentId: 'a2', diseaseId: 'flu', severity: 0.6 });

  const det = epidemic.detect({ residents, threshold: 0.5, tick: 1 });
  assert.equal(det.epidemic, true);
  assert.ok(Math.abs(det.infectionRate - 2 / 3) < 1e-9);

  epidemic.quarantine({ agentId: 'a1', tick: 1 });
  epidemic.quarantine({ agentId: 'a2', tick: 1 });
  assert.equal(epidemic.isQuarantined('a1'), true);
  assert.equal(epidemic.isQuarantined('a2'), true);

  const before = medical.query().stockpile;
  treatment.apply({ agentId: 'a1', amount: 0.3, tick: 2 });
  treatment.apply({ agentId: 'a2', amount: 0.3, tick: 2 });
  assert.equal(medical.query().stockpile, before - 20);
  assert.equal(disease.status({ agentId: 'a1' }).infected, false);
  assert.equal(disease.status({ agentId: 'a2' }).infected, false);

  assert.equal(recorder.eventLog.list().length, 3);
});

test('健康状况影响生存压力（severity 作为 health 需求接入 scorer）', () => {
  disease.infect({ agentId: 'a1', diseaseId: 'flu', severity: 0.8 });
  const s = disease.status({ agentId: 'a1' });

  const weights = { food: 1, water: 1, health: 1.5 };
  const healthy = scorer.score({ needs: { food: 0, water: 0, health: 0 }, scarcity: { food: 0, water: 0, health: 0 }, weights });
  const sick = scorer.score({ needs: { food: 0, water: 0, health: s.severity }, scarcity: { food: 0, water: 0, health: 0 }, weights });

  assert.ok(sick.score > healthy.score);
  assert.ok(Math.abs(sick.factors.health - 1.2) < 1e-9);
});

test('disease: 非法入参抛出', () => {
  assert.throws(() => disease.infect({ agentId: '', diseaseId: 'flu' }), /agentId/);
  assert.throws(() => disease.infect({ agentId: 'a1', diseaseId: '' }), /diseaseId/);
  assert.throws(() => treatment.apply({ agentId: '' }), /agentId/);
  assert.throws(() => epidemic.quarantine({ agentId: '' }), /agentId/);
});
