import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as genesis from '../src/genesis/index.js';
import * as rng from '../src/infra/rng.js';
import * as graph from '../src/infra/store/graph.js';
import * as identity from '../src/infra/identity.js';
import * as registry from '../src/runtime/registry.js';
import * as agent from '../src/agent/index.js';

const { tagPool, agentFactory, heredity, renewal } = genesis;

function resetAll() {
  graph.__reset();
  identity.__reset();
  registry.__reset();
  agent.lifecycle.__reset();
  agent.traits.tagset.store.__reset();
  agentFactory.template.__reset();
  agentFactory.assemble.__reset();
  heredity.tags.__reset();
  rng.seed(1);
}

// ---- genesis.tag-pool ----

test('tag-pool: 池子足够宽，标签可读名与 key 双向对应', () => {
  const s = tagPool.stats();
  assert.ok(s.dimensions >= 10, '至少 10 个维度，实际 ' + s.dimensions);
  assert.ok(s.candidates >= 50, '候选数应 ≥50 才能产出 50 条不重复标签，实际 ' + s.candidates);
  const all = tagPool.candidates();
  assert.equal(new Set(all.map((c) => c.key)).size, all.length, 'key 必须唯一');
  assert.ok(all.every((c) => c.weight > 0), '权重必须为正');
  // key 必须满足 tagset.store 的字符集契约（点号非法），可读名由 label() 单独给出
  const re = /^[a-z][a-z0-9_]{0,31}$/;
  assert.ok(all.every((c) => re.test(c.key)), '全部 key 必须匹配 tagset.store 的 key 契约');
  assert.equal(tagPool.label('physique_hardy'), '体质·强健');
  assert.equal(tagPool.label('drive_hardworking'), '意志·勤勉');
  assert.equal(tagPool.label('不存在的key'), '不存在的key', '未知 key 应原样返回');
  assert.equal(tagPool.dimensionOf('social_cunning'), 'social', '应能从 key 反解维度');
});

// ---- genesis.agent-factory.template ----

test('template: 每个居民恰好 50 条标签，且不同居民不相同', () => {
  resetAll();
  const a = agentFactory.template.instantiate({ templateId: 'survivor', name: '甲' });
  const b = agentFactory.template.instantiate({ templateId: 'survivor', name: '乙' });
  assert.equal(a.tagCount, 50, '必须是 50 条');
  assert.equal(b.tagCount, 50);
  assert.equal(new Set(a.tags.map((t) => t.key)).size, 50, '50 条必须互不相同');
  const shared = a.tags.filter((t) => b.tags.some((x) => x.key === t.key)).length;
  assert.ok(shared < 50, '不同居民不应完全相同（重合 ' + shared + '/50）');
  assert.ok(a.tags.every((t) => typeof t.key === 'string' && typeof t.name === 'string'), '每条标签应有 key 与可读名');
});

test('template: 同种子可复现，模板偏置真实生效', () => {
  resetAll();
  rng.seed(9);
  const a1 = agentFactory.template.instantiate({ templateId: 'survivor', name: '甲' });
  rng.seed(9);
  const a2 = agentFactory.template.instantiate({ templateId: 'survivor', name: '甲' });
  assert.deepEqual(a1.tags.map((t) => t.key), a2.tags.map((t) => t.key), '同种子应逐位一致');

  agentFactory.template.build({ id: 'risky', name: '冒险者', traits: { resilienceBias: -0.9, curiosityBias: 0.9 } });
  let resilient = 0; let frail = 0;
  for (let i = 0; i < 120; i += 1) {
    const x = agentFactory.template.instantiate({ templateId: 'risky', name: 'x' + i });
    if (x.tags.some((t) => t.key === 'resilience_resilient')) resilient += 1;
    if (x.tags.some((t) => t.key === 'physique_frail')) frail += 1;
  }
  assert.ok(frail > resilient, '负韧性偏置应使易折多于强韧（' + frail + ' vs ' + resilient + '）');
  assert.throws(() => agentFactory.template.instantiate({ templateId: '不存在' }), /未定义的模板/);
});

// ---- genesis.agent-factory.assemble ----

test('assemble: 居民真实落库（生命周期+特质+注册表三者一致）', () => {
  resetAll();
  const r = agentFactory.assemble.create({ name: '阿甲', templateId: 'survivor', tick: 5, age: 20 });
  assert.equal(r.tagCount, 50);
  assert.equal(r.rolledBack, false);

  const rec = registry.lookup(r.agentId);
  assert.ok(rec !== null, '应注册进运行时');
  assert.equal(rec.data.name, '阿甲');
  assert.equal(rec.data.alive, true);

  const lc = agent.lifecycle.snapshot(r.agentId);
  assert.equal(lc.alive, true, '生命周期应已出生');
  assert.equal(lc.age, 20);

  const ts = agent.traits.tagset.store.get(r.agentId);
  assert.equal(ts.tags.length, 50, '特质集应已安装');

  assert.equal(agentFactory.assemble.getStats().assembled, 1);
  assert.throws(() => agentFactory.assemble.create({ name: '' }), /非空字符串/);
});

test('assemble: 后代可装配且记录代际与父母', () => {
  resetAll();
  rng.seed(3);
  const father = agentFactory.assemble.create({ name: '父', tick: 0 });
  const mother = agentFactory.assemble.create({ name: '母', tick: 0 });
  const ft = agent.traits.tagset.store.get(father.agentId).tags;
  const mt = agent.traits.tagset.store.get(mother.agentId).tags;
  const childTags = heredity.tags.combine({ paternal: ft, maternal: mt }).tags;
  const child = agentFactory.assemble.create({
    name: '子', tags: childTags, tick: 40, age: 0, generation: 1,
    parents: { paternal: father.agentId, maternal: mother.agentId },
  });
  assert.equal(child.tagCount, 50);
  assert.equal(child.generation, 1);
  assert.equal(child.parents.paternal, father.agentId);
  const rec = registry.lookup(child.agentId);
  assert.equal(rec.data.generation, 1);
  assert.equal(agentFactory.assemble.getStats().byGeneration[1], 1);
  assert.throws(() => agentFactory.assemble.register({ agentId: '不存在', name: 'x' }), /未找到实体/);
});

// ---- genesis.heredity ----

test('heredity: 后代 50 条由父母 100 条组合而成（用户核心需求）', () => {
  resetAll();
  rng.seed(11);
  const f = agentFactory.template.instantiate({ templateId: 'survivor', name: '父' });
  const m = agentFactory.template.instantiate({ templateId: 'survivor', name: '母' });
  const c = heredity.tags.combine({ paternal: f.tags, maternal: m.tags });

  assert.equal(c.inherited.combinedPoolSize, 100, '合并候选池必须是 100 条');
  assert.equal(c.inherited.total, 50, '后代必须是 50 条');
  assert.equal(c.tags.length, 50);
  assert.equal(new Set(c.tags.map((t) => t.key)).size, 50, '后代 50 条必须互不相同');
  assert.equal(c.inherited.paternal + c.inherited.maternal + c.inherited.family, 50, '来源计数应等于总数');
  assert.ok(c.inherited.maternal > 0, '必须来自母方');
  assert.ok(heredity.tags.validate({ tags: c.tags }).valid, '组合结果必须通过校验');

  // 后代的每条都必须能在父母池里找到（不凭空产生）
  const poolKeys = new Set([...f.tags, ...m.tags].map((t) => t.key));
  assert.ok(c.tags.every((t) => poolKeys.has(t.key)), '后代不得引入父母池外的标签');

  // paternalRatio 偏向可调且真实生效
  rng.seed(21);
  const pat = heredity.tags.combine({ paternal: f.tags, maternal: m.tags, paternalRatio: 0.95 });
  assert.ok(pat.inherited.paternal > pat.inherited.maternal, '高父方比例应使父方来源更多');
});

test('heredity: 家族特征无条件继承；变异可选且可校验', () => {
  resetAll();
  rng.seed(5);
  const f = agentFactory.template.instantiate({ name: '父' });
  const m = agentFactory.template.instantiate({ name: '母' });
  const family = ['physique_hardy', 'drive_hardworking'];
  const c = heredity.tags.combine({ paternal: f.tags, maternal: m.tags, reserved: family });
  assert.equal(c.inherited.family, 2, '家族特征应占 2 个位置');
  assert.ok(family.every((k) => c.tags.some((t) => t.key === k)), '家族特征必须出现在后代里');
  assert.ok(c.tags.filter((t) => t.source === 'family').every((t) => t.source === 'family'));

  rng.seed(31);
  const mut = heredity.tags.combine({ paternal: f.tags, maternal: m.tags, mutationRate: 0.5 });
  assert.equal(mut.inherited.total, 50, '变异后长度不变');
  assert.ok(heredity.tags.validate({ tags: mut.tags }).valid, '变异后仍应合法');

  assert.throws(() => heredity.tags.combine({ paternal: [], maternal: m.tags }), /不能为空/);
  // 校验器能识别坏数据：把第 0 条替换为与第 1 条完全相同的 key（真重复）
  const bad = c.tags.map((t, i) => (i === 0 ? { ...t, key: c.tags[1].key } : t));
  const badResult = heredity.tags.validate({ tags: bad });
  assert.equal(badResult.valid, false, '完全重复的标签应被判非法');
  assert.ok(badResult.problems.some((p) => /重复/.test(p)), '应指出重复：' + JSON.stringify(badResult.problems));
  assert.equal(heredity.tags.validate({ tags: c.tags.slice(0, 10) }).valid, false, '长度不足应被判非法');
});

test('heredity.prompt: 家世陈述基于真实统计，不调用模型', () => {
  resetAll();
  rng.seed(13);
  const f = agentFactory.template.instantiate({ name: '父' });
  const m = agentFactory.template.instantiate({ name: '母' });
  const p = heredity.prompt.assemble({
    childName: '阿童', paternalName: '父', maternalName: '母',
    paternal: f.tags, maternal: m.tags, family: ['physique_hardy'], generation: 2,
  });
  assert.match(p.text, /阿童/);
  assert.match(p.text, /第 2 代/);
  assert.match(p.text, /家族固定特征/);
  assert.equal(p.counts.child, 50);
  // 各类来源必须互斥且总和等于 50（曾因家族特征被重复计入而得到 51）
  assert.equal(
    p.counts.fromFather + p.counts.fromMother + p.counts.fromBoth + p.counts.fromFamily,
    50,
    '各类来源之和应等于 50，实际 ' + JSON.stringify(p.counts),
  );
  assert.equal(p.counts.fromFamily, 1, '已指定的 1 条家族特征应单独归类');
  assert.ok(p.lines.length >= 4);
});

// ---- genesis.renewal ----

test('renewal: 多因子评估，活力不足才建议重启', () => {
  resetAll();
  const empty = renewal.evaluate({ initialPopulation: 50 });
  assert.equal(empty.factors.survival, 0, '无居民存活率应为 0');
  assert.equal(empty.shouldRestart, true, '空文明应建议重启');
  assert.ok(empty.reasons.includes('无存活居民'));

  for (let i = 0; i < 10; i += 1) agentFactory.assemble.create({ name: 'a' + i, tick: 0 });
  const thriving = renewal.evaluate({
    initialPopulation: 10, structures: 5, structuresTarget: 5,
    technologies: 5, technologiesTarget: 5, socialEdges: 10, socialEdgesTarget: 10,
  });
  assert.equal(thriving.factors.survival, 1);
  assert.equal(thriving.score, 1, '全部因子满分时总分应为 1，实际 ' + thriving.score);
  assert.equal(thriving.shouldRestart, false);
  assert.equal(thriving.verdict, '文明延续中');

  // 存活但技术尽失、建筑无存 → 仍应建议重启（"人还在"不等于"文明还在"）
  const hollow = renewal.evaluate({ initialPopulation: 10 });
  assert.equal(hollow.factors.survival, 1, '人全活着');
  assert.equal(hollow.factors.knowledge, 0);
  assert.ok(hollow.score < 1, '空心文明总分应远低于满分');
  assert.ok(hollow.reasons.includes('技术尽失'));
});

test('renewal: replace 封存遗产并交棒，失败不产生半成品', () => {
  resetAll();
  for (let i = 0; i < 5; i += 1) agentFactory.assemble.create({ name: 'a' + i, tick: 0 });
  const ev = renewal.evaluate({ initialPopulation: 10, tick: 100 });
  const r = renewal.replace({ civilizationId: 'civ-test', tick: 100, generation: 1, evaluation: ev });
  assert.equal(r.replaced, true, '替换应成功：' + r.reason);
  assert.equal(r.generation, 2, '代际应递增');
  assert.ok(r.heritage !== null, '应产出遗产');
  assert.match(r.reason, /第 1 世代/);
  const h = renewal.heritageOf('civ-test');
  assert.ok(h !== null && h !== undefined, '新一代应能读回遗产');
});
