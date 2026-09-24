import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as agent from '../src/agent/index.js';
import * as survival from '../src/survival/index.js';
import * as economy from '../src/economy/index.js';
import { loop } from '../src/runtime/index.js';

const { planner, executor } = agent.schedule;
const { career, society } = agent.role;

function resetAll() {
  loop.reset();
  economy.__reset();
  survival.resources.food.__reset();
  survival.resources.water.__reset();
  survival.resources.energy.__reset();
}

// ---- 日程规划 / 执行 ----
test('schedule.planner.generate: 按动机权重生成时间块日程（覆盖 [0,length)，含 eat/work）', () => {
  resetAll();
  const s = planner.generate('a1', { tick: 0, length: 10, occupation: 'guard', needs: { food: 0.6, water: 0.3 } });
  assert.equal(s.agentId, 'a1');
  assert.equal(s.startTick, 0);
  assert.equal(s.length, 10);
  assert.equal(s.replans, 0);
  assert.equal(s.trigger, 'initial');
  assert.equal(s.occupation, 'guard');
  assert.ok(Array.isArray(s.blocks) && s.blocks.length > 0, 'blocks 非空');
  assert.equal(s.blocks[0].start, 0, '首块从 0 开始');
  assert.equal(s.blocks[s.blocks.length - 1].end, 10, '末块覆盖到 length');
  const actions = new Set(s.blocks.map((b) => b.action));
  assert.ok(actions.has('eat'), '饥饿时应规划 eat');
  assert.ok(actions.has('work'), '职业应注入 work 块');
});

test('schedule.planner.replan: replans 递增 + 记录 trigger/prevTrigger', () => {
  resetAll();
  planner.generate('a1', { tick: 0, length: 10 });
  const r = planner.replan('a1', { tick: 12, trigger: 'disaster' });
  assert.equal(r.replans, 1);
  assert.equal(r.trigger, 'disaster');
  assert.equal(r.prevTrigger, 'initial');
  const r2 = planner.replan('a1', { tick: 24, trigger: 'day_boundary' });
  assert.equal(r2.replans, 2);
  assert.equal(r2.prevTrigger, 'disaster');
});

test('schedule.executor.start: 预取预想池候选并返回执行状态', () => {
  resetAll();
  planner.generate('a1', { tick: 0, length: 8 });
  const st = executor.start('a1', { tick: 0 });
  assert.equal(st.agentId, 'a1');
  assert.ok(Array.isArray(st.candidates), '预想池候选数组');
  assert.ok(st.schedule, '挂接日程');
});

test('schedule.executor.tick: 推进返回当前时间块行动', () => {
  resetAll();
  const s = planner.generate('a1', { tick: 0, length: 8, needs: { food: 0.1, water: 0.1 } });
  const firstAction = s.blocks[0].action;
  const t = executor.tick('a1', { tick: 0, interrupted: false });
  assert.equal(t.action, firstAction);
  assert.equal(t.replanned, false);
});

test('schedule.executor.tick: 跨日自动重排 + 紧急需求直接进食/饮水（不重排）', () => {
  resetAll();
  planner.generate('a1', { tick: 0, length: 5 });
  // 跨日：tick 5 >= start+length → 自动重排
  const day = executor.tick('a1', { tick: 5, interrupted: false });
  assert.equal(day.replanned, true);
  assert.equal(planner.current('a1').trigger, 'day_boundary');
  // 紧急：饥饿 → 直接 eat，不重排
  survival.needs.meter.update({ agentId: 'a1', need: 'food', level: 0.9 });
  survival.needs.meter.update({ agentId: 'a1', need: 'water', level: 0.2 });
  const before = planner.current('a1').replans;
  const em = executor.tick('a1', { tick: 6, interrupted: true, trigger: 'emergency' });
  assert.equal(em.action, 'eat');
  assert.equal(em.replanned, false);
  assert.equal(planner.current('a1').replans, before, '紧急不重排');
});

// ---- 职业角色 ----
test('role.career.assign/release: 记录职业并卸任', () => {
  resetAll();
  const rec = career.assign('a1', { occupation: 'medic', wage: 6, tick: 1 });
  assert.equal(rec.status, 'assigned');
  assert.equal(rec.occupation, 'medic');
  assert.equal(rec.wage, 6);
  const cur = career.current('a1');
  assert.equal(cur.occupation, 'medic');
  const rel = career.release('a1', { tick: 9, reason: 'retire' });
  assert.equal(rel.status, 'released');
  assert.equal(rel.reason, 'retire');
});

test('role.career.assign: 绑定真实企业职位（economy.industry.labour.hire）', () => {
  resetAll();
  const b = economy.industry.business.found({ founderId: 'boss', name: '诊所', industry: 'medical', capital: 100 });
  const rec = career.assign('a1', { occupation: 'medic', businessId: b.businessId, wage: 6, tick: 1 });
  assert.equal(rec.businessId, b.businessId);
  assert.equal(rec.businessName, '诊所');
  assert.ok(rec.hire && rec.hire.skipped === undefined, 'hire 成功（未跳过）');
  assert.equal(rec.hire.role, 'medic');
});

// ---- 公共角色 ----
test('role.society.hold/retire/activeEffects: 公共角色影响聚合', () => {
  resetAll();
  society.hold('a1', { role: 'doctor', tick: 1 });
  society.hold('a2', { role: 'doctor', tick: 1 });
  society.hold('a3', { role: 'teacher', tick: 1 });
  const fx = society.activeEffects();
  assert.equal(fx.effects.treatmentCapacity, 2, '两名医生 → 治疗名额 +2');
  assert.equal(fx.effects.literacyRate, 0.05, '一名教师 → 识字率 +0.05');
  assert.equal(fx.holders.length, 3);
  society.retire('a1', { tick: 5, reason: 'term_end' });
  assert.equal(society.activeEffects().effects.treatmentCapacity, 1, '退休后名额回落');
  assert.throws(() => society.hold('a4', { role: 'nope' }), /未知公共角色/);
});

// ---- 集成：日程驱动 + 生存无回退 + 跨种子分叉 ----
test('integration: 日程真实驱动行动（10 tick 对照，紧急才覆盖）', async () => {
  resetAll();
  const r = await loop.run({ ticks: 12, agentCount: 3, seed: 1, scheduleLength: 100 });
  const id = r.agents[0].id;
  let matches = 0;
  let emergencies = 0;
  for (let t = 0; t < 10; t += 1) {
    const ex = executor.tick(id, { tick: t, interrupted: false });
    const actual = (r.steps[t]?.decisions ?? []).find((d) => d.agentId === id)?.action;
    if (ex?.action === actual) matches += 1;
    else if (actual === 'eat' || actual === 'drink') emergencies += 1;
  }
  assert.ok(matches >= 5, '至少 5/10 tick 由日程驱动（actual matches schedule），got ' + matches);
  assert.equal(matches + emergencies, 10, '其余差异均为紧急进食/饮水覆盖');
});

test('integration: 默认 50×200×3 生存率 1.00 且跨种子分叉（≥2 字段）', async () => {
  resetAll();
  const seeds = [1, 2, 3];
  const seen = { scheduleLength: new Set(), replanCount: new Set(), careerDist: new Set(), societyHolders: new Set() };
  for (const seed of seeds) {
    const r = await loop.run({ ticks: 200, agentCount: 50, seed, phase2: true, phase3: true });
    const initialIds = r.agents.map((a) => a.id);
    const alive = initialIds.filter((id) => r.world.agents[id] && r.world.agents[id].alive !== false).length;
    assert.equal(alive / initialIds.length, 1, 'seed ' + seed + ' 生存率应为 1.00');
    seen.scheduleLength.add(r.social.schedule.averageLength);
    seen.replanCount.add(r.social.schedule.totalReplans);
    seen.careerDist.add(JSON.stringify(r.social.careers.distribution));
    seen.societyHolders.add(JSON.stringify(r.social.society.holders.map((h) => h.role)));
  }
  const diverged = [seen.scheduleLength.size, seen.replanCount.size, seen.careerDist.size, seen.societyHolders.size]
    .filter((n) => n > 1).length;
  assert.ok(diverged >= 2, '至少 2 个字段跨种子分叉，got ' + diverged);
});

