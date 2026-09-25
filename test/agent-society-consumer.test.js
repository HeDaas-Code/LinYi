import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as disease from '../src/survival/health/disease.js';
import * as trauma from '../src/agent/psyche/trauma.js';
import * as society from '../src/agent/role/society.js';
import { tech } from '../src/civilization/index.js';
import * as energy from '../src/civilization/tech/_energy.js';
import * as graph from '../src/infra/store/graph.js';
import { loop } from '../src/runtime/index.js';
import * as survival from '../src/survival/index.js';
import * as economy from '../src/economy/index.js';

const { research, tree } = tech;

function resetAll() {
  graph.__reset();
  disease.__reset();
  trauma.__reset();
  tree.__reset();
  research.__reset();
  energy.__reset();
  loop.reset();
  economy.__reset();
  survival.resources.food.__reset();
  survival.resources.water.__reset();
  survival.resources.energy.__reset();
}

function avgSeverity() {
  const l = disease.list();
  return l.length ? l.reduce((s, d) => s + (d.severity ?? 0), 0) / l.length : 0;
}
function lastUnlockTick() {
  return tree.query().reduce((m, t) => Math.max(m, t.unlockedAtTick ?? 0), 0);
}
function aliveRate(r) {
  const alive = r.agents.filter((a) => r.world.agents[a.id] && r.world.agents[a.id].alive !== false).length;
  return alive / r.agents.length;
}

// ---- 三个消费点：safety / literacyRate / ritualBonus ----
test('society.guard: safety 降低新感染严重度与症状推进（真实消费点）', () => {
  resetAll();
  const base = disease.infect({ agentId: 'a1', diseaseId: 'flu', severity: 0.5, tick: 0 });
  assert.equal(base.severity, 0.5, '无治安官：感染严重度 0.5');
  society.hold('g1', { role: 'guard', tick: 0 });
  const guarded = disease.infect({ agentId: 'a2', diseaseId: 'flu', severity: 0.5, tick: 0 });
  assert.ok(guarded.severity < base.severity, '治安官降低新感染严重度');
  assert.ok(Math.abs(guarded.severity - 0.45) < 1e-9, 'safety 0.1 → 0.5*0.9=0.45');
  const b1 = disease.status({ agentId: 'a1' }).severity;
  const b2 = disease.status({ agentId: 'a2' }).severity;
  disease.symptom({ agentId: 'a1', delta: 0.3, tick: 1 });
  disease.symptom({ agentId: 'a2', delta: 0.3, tick: 1 });
  const g1 = disease.status({ agentId: 'a1' }).severity - b1;
  const g2 = disease.status({ agentId: 'a2' }).severity - b2;
  assert.ok(g2 < g1, '治安官削弱症状推进速度');
  society.retire('g1', { tick: 2 });
  const after = disease.infect({ agentId: 'a3', diseaseId: 'flu', severity: 0.5, tick: 3 });
  assert.equal(after.severity, 0.5, '卸任后恢复全额感染严重度');
});

test('society.teacher: literacyRate 加速技术研究（真实消费点）', () => {
  resetAll();
  tree.unlock({ techId: 'water_purification', tick: 0 });
  research.start({ techId: 'power', researchers: ['r1'], tick: 0 });
  let p = research.progress({ n: 5, tick: 1 })[0];
  assert.equal(p.done, false, '无教师：power(cost6) 5 tick 未完成');
  resetAll();
  society.hold('t1', { role: 'teacher', tick: 0 });
  tree.unlock({ techId: 'water_purification', tick: 0 });
  research.start({ techId: 'power', researchers: ['r1'], tick: 0 });
  p = research.progress({ n: 5, tick: 1 })[0];
  assert.equal(p.done, true, '有教师：5 tick 完成（literacyRate 加速）');
});

test('society.priest: ritualBonus 减缓创伤累积（真实消费点）', () => {
  resetAll();
  const setup = (id) => {
    survival.needs.meter.update({ agentId: id, need: 'food', level: 0.9 });
    survival.needs.meter.update({ agentId: id, need: 'water', level: 0.9 });
  };
  setup('a1');
  const base = trauma.accumulate({ agentId: 'a1', rate: 0.5 });
  assert.ok(base.added > 0, '基准创伤累积 > 0');
  society.hold('p1', { role: 'priest', tick: 0 });
  setup('a2');
  const withPriest = trauma.accumulate({ agentId: 'a2', rate: 0.5 });
  assert.ok(withPriest.added < base.added, '祭司减缓创伤累积');
  society.retire('p1', { tick: 1 });
  setup('a3');
  const after = trauma.accumulate({ agentId: 'a3', rate: 0.5 });
  assert.ok(Math.abs(after.added - base.added) < 1e-9, '卸任后恢复全额累积');
});

test('society: 三效应上任/卸任增减（activeEffects 聚合）', () => {
  resetAll();
  society.hold('g1', { role: 'guard', tick: 0 });
  society.hold('t1', { role: 'teacher', tick: 0 });
  society.hold('p1', { role: 'priest', tick: 0 });
  const fx = society.activeEffects().effects;
  assert.equal(fx.safety, 0.1);
  assert.equal(fx.literacyRate, 0.05);
  assert.equal(fx.ritualBonus, 0.1);
  society.retire('g1', { tick: 1 });
  society.retire('t1', { tick: 1 });
  society.retire('p1', { tick: 1 });
  const fx2 = society.activeEffects().effects;
  assert.equal(fx2.safety, undefined, '卸任后 safety 消失');
  assert.equal(fx2.literacyRate, undefined, '卸任后 literacyRate 消失');
  assert.equal(fx2.ritualBonus, undefined, '卸任后 ritualBonus 消失');
});

// ---- 集成：生存红线 + 消融 ----
// P3 修订：原先断言「生存率恒为 1.00」。该断言只在**资源过剩**的旧参数下成立
//（旧参数实测：人均库存长期 3.8、水食顶满、52 人中无一人需求 >0.7），
// 等于把"从未短缺"当成"求生成功"。默认档压力调到临界之上后，生存率成为真实变量，
// 故改为「≥0.96」——仍能约束系统不崩溃，但不再奖励资源过剩。
test('integration: 默认 50×200×3 生存率 ≥0.96（无回退）', async () => {
  resetAll();
  for (const seed of [1, 2, 3]) {
    const r = await loop.run({ ticks: 200, agentCount: 50, seed, phase2: true, phase3: true });
    const rate = aliveRate(r);
    assert.ok(rate >= 0.96, 'seed ' + seed + ' 生存率应 ≥0.96（实测 ' + rate.toFixed(2) + '）');
  }
});

test('integration: societyEnabled 消融 — ≥2 项可观测指标差异 + 生存 ≥0.96', async () => {
  resetAll();
  const sum = { severity: 0, health: 0, copings: 0, unlock: 0 };
  const off = { severity: 0, health: 0, copings: 0, unlock: 0 };
  for (const seed of [1, 2, 3]) {
    const on = await loop.run({ ticks: 200, agentCount: 50, seed, phase2: true, phase3: true, societyEnabled: true });
    sum.severity += avgSeverity();
    sum.health += (disease.list().reduce((s, d) => s + d.health, 0) / Math.max(1, disease.list().length));
    sum.copings += on.phase3.summary.copings;
    sum.unlock += lastUnlockTick();
    assert.ok(aliveRate(on) >= 0.96, 'ON seed ' + seed + ' 生存应 ≥0.96（实测 ' + aliveRate(on).toFixed(2) + '）');
    const o = await loop.run({ ticks: 200, agentCount: 50, seed, phase2: true, phase3: true, societyEnabled: false });
    off.severity += avgSeverity();
    off.health += (disease.list().reduce((s, d) => s + d.health, 0) / Math.max(1, disease.list().length));
    off.copings += o.phase3.summary.copings;
    off.unlock += lastUnlockTick();
    assert.ok(aliveRate(o) >= 0.96, 'OFF seed ' + seed + ' 生存应 ≥0.96（实测 ' + aliveRate(o).toFixed(2) + '）');
  }
  const diffs = [
    ['健康-平均疾病严重度(safety)', sum.severity < off.severity, sum.severity, off.severity],
    ['健康-平均健康值(safety)', sum.health > off.health, sum.health, off.health],
    ['创伤-应对次数(ritualBonus)', sum.copings < off.copings, sum.copings, off.copings],
    ['事件-科技突破 tick(literacyRate)', sum.unlock < off.unlock, sum.unlock, off.unlock],
  ];
  const pass = diffs.filter((d) => d[1]);
  for (const d of diffs) console.log('  ablation', d[0], 'ON=', d[2], 'OFF=', d[3], d[1] ? 'DIFF' : 'same');
  assert.ok(pass.length >= 2, '至少 2 项指标消融差异，got ' + pass.length);
});