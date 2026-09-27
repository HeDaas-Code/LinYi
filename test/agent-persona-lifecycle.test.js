import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as agent from '../src/agent/index.js';
import * as tagsetStore from '../src/agent/traits/tagset/store.js';
import * as worldState from '../src/runtime/world-state.js';
import { loop, registry } from '../src/runtime/index.js';
import * as observer from '../src/observer/index.js';
import * as social from '../src/social/index.js';

function resetUnits() {
  tagsetStore.__reset();
  worldState.__reset();
}

test('identity: describe/update 白名单字段 + 边界', () => {
  resetUnits();
  const d0 = agent.persona.identity.describe('a1');
  assert.equal(d0.name, null);
  assert.deepEqual(d0.parents, []);

  agent.persona.identity.update('a1', {
    name: '张三', persona: '铁匠', familyId: 'fam_1', parents: ['p1', 'p2'],
    spouseId: 'b2', factionId: 'guild', socialTags: ['工匠'], unknown: 'ignored',
  });
  const d = agent.persona.identity.describe('a1');
  assert.equal(d.name, '张三');
  assert.equal(d.persona, '铁匠');
  assert.equal(d.familyId, 'fam_1');
  assert.deepEqual(d.parents, ['p1', 'p2']);
  assert.equal(d.spouseId, 'b2');
  assert.equal(d.factionId, 'guild');
  assert.deepEqual(d.socialTags, ['工匠']);
  assert.equal(d.unknown, undefined);

  assert.throws(() => agent.persona.identity.describe(''), /非空/);
  assert.throws(() => agent.persona.identity.update('a1', []), /普通对象/);
});

test('personality: profile 连续维度 + evaluate 打分 + 边界', () => {
  resetUnits();
  tagsetStore.upsert('a1', {
    brave: 1.0, curious: 0.8, timid: 0.2, cautious: 0.3,
    sociable: 0.9, kind: 0.7, hardworking: 0.9, diligent: 0.8,
  });
  const p = agent.persona.personality.profile('a1');
  assert.ok(p.dimensions.adventurous > 0.5, '冒险性应偏高');
  assert.ok(p.dimensions.sociable > 0.5, '社交性应偏高');
  assert.ok(p.dimensions.industrious > 0.5, '勤勉度应偏高');
  assert.ok(p.dimensions.cautious < 0.5, '谨慎度应偏低');
  assert.equal(p.tagCount, 8);
  assert.ok(typeof p.dominant === 'string');

  for (const dim of Object.values(p.dimensions)) {
    assert.ok(dim >= 0 && dim <= 1, '维度应在 [0,1]');
  }
  const forage = agent.persona.personality.evaluate('a1', 'forage');
  assert.ok(Number.isFinite(forage));
  assert.equal(agent.persona.personality.evaluate('a1', 'drink'), 0, '饮食中性');

  assert.equal(agent.persona.personality.profile('missing'), null);
  assert.throws(() => agent.persona.personality.profile(''), /非空/);
});

test('motivation: evaluate/rank 按需求+性格排序 + 边界', () => {
  const rank = agent.persona.motivation.rank('a1', {
    needs: { food: 0.9, water: 0.1 },
    profile: { dimensions: { industrious: 0.8, cautious: 0.3 } },
  });
  assert.equal(rank[0].action, 'eat', '饥饿应驱动进食');
  assert.ok(rank[0].weight > rank[rank.length - 1].weight);
  assert.ok(rank.every((m) => Array.isArray(m.drivers) && typeof m.weight === 'number'));

  assert.throws(() => agent.persona.motivation.evaluate(''), /非空/);
});

test('lifecycle: birth/age 分阶段 + 自然死亡路径 + 边界', () => {
  resetUnits();
  agent.lifecycle.birth('a1', { tick: 0, age: 5 });
  assert.equal(agent.lifecycle.snapshot('a1').stage, 'child');

  agent.lifecycle.age('a1', { tick: 1, ageRatePerTick: 20 }); // 5 → 25
  assert.equal(agent.lifecycle.snapshot('a1').stage, 'adult');

  agent.lifecycle.age('a1', { tick: 2, ageRatePerTick: 50 }); // 25 → 75
  assert.equal(agent.lifecycle.snapshot('a1').stage, 'elder');

  const res = agent.lifecycle.age('a1', { tick: 3, ageRatePerTick: 0, elderMortalityRate: 1 });
  assert.equal(res.died, true);
  assert.equal(res.cause, 'old_age');
  assert.equal(agent.lifecycle.snapshot('a1').alive, false);
  assert.equal(agent.lifecycle.snapshot('a1').deathCause, 'old_age');

  // 未达老年不触发死亡（死亡率=1 也如此）
  resetUnits();
  agent.lifecycle.birth('a2', { tick: 0, age: 30 });
  const r2 = agent.lifecycle.age('a2', { tick: 1, ageRatePerTick: 1, elderMortalityRate: 1 });
  assert.equal(r2.died, false, '成年阶段不触发老年死亡');

  assert.throws(() => agent.lifecycle.birth(''), /非空/);
});

test('lifecycle: 自然衰老死亡与 needs 致死路径并存且区分', async () => {
  loop.reset();
  await loop.run({ ticks: 2, seed: 1, agentCount: 5, lifecycleElderStart: 0, lifecycleElderMortalityRate: 1 });
  const deaths = observer.recorder.eventLog.list()
    .filter((n) => n.data.topic === 'agent.death')
    .map((n) => n.data.payload);
  assert.ok(deaths.length >= 5, '强制老年应发生自然死亡');
  assert.ok(deaths.every((d) => d.cause === 'old_age'), '自然死亡 cause=old_age（区别于 starvation/dehydration）');
  assert.ok(deaths.every((d) => typeof d.age === 'number'), '自然死亡应携带年龄');
});

test('evolution: drift 单调夹逼且权重有界', () => {
  resetUnits();
  tagsetStore.upsert('a1', { brave: 1.0, cautious: 0.5 });
  let prev = 1.0;
  for (let i = 0; i < 5; i += 1) {
    const r = agent.traits.evolution.drift({ agentId: 'a1', signals: { brave: 0.3 }, rate: 0.5 });
    const brave = r.tags.find((t) => t.key === 'brave').weight;
    assert.ok(brave <= prev + 1e-12, 'brave 应单调不增');
    assert.ok(brave >= 0.05, '权重不低于下界');
    prev = brave;
  }
  assert.ok(prev >= 0.3 && prev <= 1.0, '漂移后应逼近目标 0.3');

  tagsetStore.upsert('a2', { resilient: 1.0 });
  const up = agent.traits.evolution.drift({ agentId: 'a2', signals: { resilient: 100 }, rate: 1 });
  assert.ok(up.tags.find((t) => t.key === 'resilient').weight <= 10, '权重不高于上界');

  assert.throws(() => agent.traits.evolution.drift({ agentId: '' }), /非空/);
});

test('evolution: mutate 命中率、权重有界且 key 保持 50 标签结构', () => {
  const full = agent.traits.evolution.mutate({
    tags: [{ key: 'brave', weight: 1.0 }, { key: 'kind', weight: 0.6 }],
    rate: 1,
  });
  assert.equal(full.mutated, 2);
  assert.deepEqual(full.tags.map((t) => t.key), ['brave', 'kind'], 'key 保持不变（不破坏 50 标签结构）');
  for (const t of full.tags) {
    assert.ok(t.weight >= 0.05 && t.weight <= 10, '变异后权重有界');
  }
  const none = agent.traits.evolution.mutate({ tags: [{ key: 'brave', weight: 1.0 }], rate: 0 });
  assert.equal(none.mutated, 0);
  assert.deepEqual(none.tags[0], { key: 'brave', weight: 1.0 });

  // 传 agentId（无 tags）时应读取现有标签而非清空（回归：子代 50 标签不变）
  tagsetStore.__reset();
  tagsetStore.upsert('c1', { brave: 1.0, kind: 0.6 });
  const byId = agent.traits.evolution.mutate({ agentId: 'c1', rate: 1 });
  assert.equal(byId.tags.length, 2, '应读取现有标签而非清空');
  assert.deepEqual(byId.tags.map((t) => t.key).sort(), ['brave', 'kind']);
});

test('similarity: compare 对称 + neighbors 排除自身 + 边界', () => {
  resetUnits();
  tagsetStore.upsert('a1', { brave: 1.0, kind: 0.5, sociable: 0.7 });
  tagsetStore.upsert('b2', { brave: 0.9, kind: 0.6, sociable: 0.8 });
  tagsetStore.upsert('c3', { lazy: 1.0, cruel: 0.9, greedy: 0.8 });

  const ab = agent.traits.tagset.similarity.compare({ a: 'a1', b: 'b2' });
  const ba = agent.traits.tagset.similarity.compare({ a: 'b2', b: 'a1' });
  assert.ok(Math.abs(ab.similarity - ba.similarity) < 1e-12, '相似度应对称');
  assert.ok(ab.similarity > 0 && ab.similarity <= 1);
  const ac = agent.traits.tagset.similarity.compare({ a: 'a1', b: 'c3' });
  assert.ok(ab.similarity > ac.similarity, '相似者相似度更高');

  const n = agent.traits.tagset.similarity.neighbors({ agentId: 'a1', candidates: ['a1', 'b2', 'c3'], k: 1 });
  assert.equal(n.length, 1);
  assert.equal(n[0].agentId, 'b2');
  assert.ok(!n.some((x) => x.agentId === 'a1'), '排除自身');

  assert.equal(agent.traits.tagset.similarity.compare({ a: 'nobody1', b: 'nobody2' }).similarity, 0);
  assert.throws(() => agent.traits.tagset.similarity.compare({ a: '', b: 'x' }), /非空/);
  assert.throws(() => agent.traits.tagset.similarity.neighbors({ agentId: 'a1', candidates: 'nope' }), /数组/);
});

test('wiring: 6 模块被主循环真实调用（决策日志 + 事件流证据）', async () => {
  loop.reset();
  // t13：社交边现在只在「请求被**接受**」时产生（双向事实），
  // 20 tick 的窗口里回应还没发生，社交结构断言会落空。
  // 60 tick 足以让"请求 → 回应 → 建边"这条链走完。
  const report = await loop.run({ phase2: true, ticks: 60, seed: 42, agentCount: 12 });

  // identity/lifecycle：世界状态含年龄/阶段/身份
  for (const a of report.agents) {
    assert.ok(typeof report.world.agents[a.id].age === 'number', '年龄应写入世界状态');
    assert.ok(['child', 'adult', 'elder'].includes(report.world.agents[a.id].stage), '阶段应写入');
  }

  // personality/motivation：决策日志带 personality 与 topMotivation 字段
  const decisions = observer.recorder.decisionLog.list();
  assert.ok(decisions.length > 0);
  const withPersonality = decisions.filter((n) => typeof n.data.context?.personality === 'string');
  const withMotivation = decisions.filter((n) => typeof n.data.context?.topMotivation === 'string');
  assert.ok(withPersonality.length > 0, '决策日志应带 personality 字段');
  assert.ok(withMotivation.length > 0, '决策日志应带 topMotivation 字段');

  // evolution.mutate + identity.update：生育事件带相似度 + 子代有家庭归属
  const proc = observer.recorder.eventLog.list().filter((n) => n.data.topic === 'social.procreation');
  if (proc.length > 0) {
    assert.ok(typeof proc[0].data.payload.similarity === 'number', '生育事件应带相似度');
    const childId = proc[0].data.payload.childId;
    assert.equal(agent.persona.identity.describe(childId).familyId, proc[0].data.payload.familyId, '子代应登记家庭归属');
  }

  // P1：社交边改由居民的 socialize 行动产生（原先由代码的相似度生成器无条件建边，
  // 导致行动空间 4→9 时社交结构逐字节不变）。断言改为验证「社交边来自决策」。
  const socializeActs = observer.recorder.eventLog.list().filter((n) => n.data.topic === 'agent.action.socialize');
  assert.ok(socializeActs.length >= 1, '居民应产生 socialize 行动事件');
  // t13 契约变更：socialize 不再**单方面**建边。
  // 现在社交边由「结构化请求 → 对方接受」这条双向事实产生；
  // 未被回应的请求只留下待决互动，不写关系（这正是本任务要修的单向互动）。
  const acceptedSocial = observer.recorder.eventLog.list()
    .filter((n) => n.data.topic === 'social.interaction.accepted' && n.data.payload?.type === 'socialize');
  assert.ok(acceptedSocial.length >= 1, '长跑中应出现被接受的社交请求（否则双向闭环没有跑通）');
  const friendshipEdges = social.graph.edges.list().filter((e) => e.type === 'friendship');
  assert.ok(friendshipEdges.length >= 1, '被接受的 socialize 应建立 friendship 社交边');
});

test('integration: 默认 50×200×3 种子存活率 1.00 且跨种子分叉', async () => {
  const avg = (arr) => arr.reduce((s, x) => s + x, 0) / arr.length;
  const rows = [];
  for (const seed of [1, 2, 3]) {
    loop.reset();
    const report = await loop.run({ phase2: true, ticks: 200, seed, agentCount: 50 });
    const initialIds = report.agents.map((a) => a.id);
    const alive = initialIds.filter((id) => !report.world.agents[id] || report.world.agents[id].alive !== false).length;
    assert.equal(alive / initialIds.length, 1, 'seed ' + seed + ' 存活率应为 1.00');

    const oldAgeDeaths = observer.recorder.eventLog.list()
      .filter((n) => n.data.topic === 'agent.death' && n.data.payload.cause === 'old_age').length;
    assert.equal(oldAgeDeaths, 0, '默认参数 200 tick 内不得自然死亡（seed ' + seed + '）');

    const profiles = report.agents.map((a) => agent.persona.personality.profile(a.id));
    rows.push({
      seed,
      avgAdventurous: avg(profiles.map((p) => p.dimensions.adventurous)),
      avgSociable: avg(profiles.map((p) => p.dimensions.sociable)),
      avgIndustrious: avg(profiles.map((p) => p.dimensions.industrious)),
      avgAge: avg(report.agents.map((a) => report.world.agents[a.id].age)),
    });
  }
  const fields = ['avgAdventurous', 'avgSociable', 'avgIndustrious', 'avgAge'];
  const diverged = fields.filter((f) => new Set(rows.map((r) => r[f].toFixed(6))).size > 1);
  assert.ok(diverged.length >= 2, '至少 2 个字段跨种子出现差异，实际：' + JSON.stringify(diverged));
});
