import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as graph from '../src/infra/store/graph.js';
import * as rng from '../src/infra/rng.js';
import * as identity from '../src/infra/identity.js';
import * as tagsetStore from '../src/agent/traits/tagset/store.js';
import * as social from '../src/social/index.js';

const { relationship, procreation, family } = social;

function resetAll() {
  graph.__reset();
  rng.__reset();
  identity.__reset();
}

function makeTags(prefix, n = 50) {
  return Array.from({ length: n }, (_, i) => ({ key: prefix + i, weight: 1.0 }));
}

test('friendship: 更新强度并夹在 [0,1]，双向去重', () => {
  resetAll();
  assert.equal(relationship.friendship.update({ a: 'alice', b: 'bob', delta: 0.3 }).strength, 0.3);
  assert.equal(relationship.friendship.update({ a: 'bob', b: 'alice', delta: 0.5 }).strength, 0.8);
  const s3 = relationship.friendship.update({ a: 'alice', b: 'bob', delta: 0.5 });
  assert.equal(s3.strength, 1.0);
  assert.equal(relationship.friendship.strength({ a: 'alice', b: 'bob' }), 1.0);
  assert.equal(relationship.friendship.strength({ a: 'bob', b: 'alice' }), 1.0);
  assert.equal(s3.history.length, 3);
});

test('friendship: 非法 delta 抛错', () => {
  resetAll();
  assert.throws(() => relationship.friendship.update({ a: 'x', b: 'y', delta: NaN }), TypeError);
});

test('romance: 表白→接受→分手 状态机', () => {
  resetAll();
  assert.equal(relationship.romance.state({ a: 'a', b: 'b' }), 'none');
  relationship.romance.propose({ from: 'a', to: 'b' });
  assert.equal(relationship.romance.state({ a: 'a', b: 'b' }), 'proposed');
  assert.equal(relationship.romance.accept({ from: 'a', to: 'b' }).state, 'paired');
  relationship.romance.breakup({ a: 'a', b: 'b' });
  assert.equal(relationship.romance.state({ a: 'a', b: 'b' }), 'broken');
});

test('romance: 无表白直接接受抛错；已婚不能重复表白', () => {
  resetAll();
  assert.throws(() => relationship.romance.accept({ from: 'a', to: 'b' }), Error);
  relationship.romance.propose({ from: 'a', to: 'b' });
  relationship.romance.accept({ from: 'a', to: 'b' });
  assert.throws(() => relationship.romance.propose({ from: 'a', to: 'b' }), Error);
});

test('match: evaluate 计算契合度（特质相似 + 纽带）', () => {
  resetAll();
  tagsetStore.upsert('a', makeTags('t', 50));
  tagsetStore.upsert('b', makeTags('t', 50));
  const r = procreation.match.evaluate({ a: 'a', b: 'b' });
  assert.equal(r.tagSimilarity, 1.0);
  assert.equal(r.compatible, true);
  assert.ok(r.score >= 0 && r.score <= 1);
});

test('match: pair 按契合度排序取前 k', () => {
  resetAll();
  tagsetStore.upsert('a', makeTags('t', 50));
  tagsetStore.upsert('b', makeTags('t', 50));
  tagsetStore.upsert('c', makeTags('u', 50));
  const pairs = procreation.match.pair({ agentIds: ['a', 'b', 'c'], k: 1 });
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].a, 'a');
  assert.equal(pairs[0].b, 'b');
});

test('offspring: compose 父母各 50 tag → 子代 50 tag（可追溯）', () => {
  resetAll();
  rng.seed(7);
  const paternal = makeTags('p', 50);
  const maternal = makeTags('m', 50);
  const out = procreation.offspring.compose({ paternalTags: paternal, maternalTags: maternal });
  assert.equal(out.tags.length, 50);
  assert.equal(out.valid, true);
  const parentKeys = new Set([...paternal, ...maternal].map((t) => t.key));
  for (const t of out.tags) {
    assert.ok(parentKeys.has(t.key), '子代标签应可追溯至父母: ' + t.key);
  }
  assert.equal(new Set(out.tags.map((t) => t.key)).size, 50);
});

test('offspring: request 读父母标签建子代并写回标签集', () => {
  resetAll();
  tagsetStore.upsert('p', makeTags('p', 50));
  tagsetStore.upsert('m', makeTags('m', 50));
  const child = procreation.offspring.request({ a: 'p', b: 'm', name: '小明' });
  assert.ok(child.id.startsWith('agent_'));
  assert.equal(child.name, '小明');
  assert.deepEqual(child.parents, ['p', 'm']);
  assert.equal(child.tags.length, 50);
  assert.equal(child.valid, true);
  assert.equal(tagsetStore.get(child.id).tags.length, 50);
});

test('offspring: request 合并家族特质', () => {
  resetAll();
  tagsetStore.upsert('p', makeTags('p', 50));
  tagsetStore.upsert('m', makeTags('m', 50));
  const child = procreation.offspring.request({
    a: 'p', b: 'm', familyTraits: [{ key: 'brave' }, { key: 'loyal' }],
  });
  const keys = new Set(child.tags.map((t) => t.key));
  assert.ok(keys.has('brave'));
  assert.ok(keys.has('loyal'));
  assert.deepEqual(child.familyTraitsApplied, ['brave', 'loyal']);
});

test('lineage: register/trace 追踪父母与祖先', () => {
  resetAll();
  family.lineage.register({ agentId: 'g0', familyId: 'f1', parents: [], generation: 0 });
  family.lineage.register({ agentId: 'g1', familyId: 'f1', parents: ['g0'], generation: 1 });
  family.lineage.register({ agentId: 'g2', familyId: 'f1', parents: ['g1'], generation: 2 });
  const t = family.lineage.trace({ agentId: 'g2' });
  assert.deepEqual(t.parents, ['g1']);
  assert.ok(t.ancestors.includes('g0'));
  assert.ok(t.ancestors.includes('g1'));
  assert.equal(t.generation, 2);
  assert.ok(family.lineage.trace({ agentId: 'g0' }).children.includes('g1'));
});

test('lineage: generation 按代际分组', () => {
  resetAll();
  family.lineage.register({ agentId: 'g0', familyId: 'f1', generation: 0 });
  family.lineage.register({ agentId: 'g1a', familyId: 'f1', parents: ['g0'], generation: 1 });
  family.lineage.register({ agentId: 'g1b', familyId: 'f1', parents: ['g0'], generation: 1 });
  const groups = family.lineage.generation({ familyId: 'f1' });
  assert.deepEqual(groups[0], ['g0']);
  assert.equal(groups[1].length, 2);
});

test('family.inherit.applier: apply 合并家族特质（保证 50 且含特质 key）', () => {
  resetAll();
  const out = family.inherit.applier.apply({
    paternal: makeTags('p', 50), maternal: makeTags('m', 50),
    familyTraits: ['brave', 'loyal', 'swift'],
  });
  assert.equal(out.tags.length, 50);
  assert.equal(out.valid, true);
  const keys = new Set(out.tags.map((t) => t.key));
  assert.ok(keys.has('brave'));
  assert.ok(keys.has('loyal'));
  assert.ok(keys.has('swift'));
});

test('family.inherit.applier: merge 缺失时替换最低权重非家族标签', () => {
  resetAll();
  const tags = Array.from({ length: 5 }, (_, i) => ({ key: 'k' + i, weight: 1.0 }));
  const merged = family.inherit.applier.merge(tags, ['brave']);
  assert.equal(merged.length, 5);
  assert.ok(merged.some((t) => t.key === 'brave'));
});

test('family.inherit.verifier: query/audit 覆盖统计', () => {
  resetAll();
  tagsetStore.upsert('x', [{ key: 'brave', weight: 1 }, { key: 'calm', weight: 1 }]);
  tagsetStore.upsert('y', [{ key: 'brave', weight: 1 }]);
  const q = family.inherit.verifier.query({ agentId: 'x', familyTraits: ['brave', 'loyal'] });
  assert.deepEqual(q.carried, ['brave']);
  assert.deepEqual(q.missing, ['loyal']);
  const audit = family.inherit.verifier.audit({ agentIds: ['x', 'y'], familyTraits: ['brave', 'loyal'] });
  assert.equal(audit.coverage.brave.carried, 2);
  assert.equal(audit.coverage.loyal.carried, 0);
  assert.equal(audit.coverage.brave.ratio, 1.0);
});

test('family.trait.detector: 三代未遗失判定', () => {
  resetAll();
  const gens = [['a', 'b'], ['a', 'b', 'c'], ['a', 'b']];
  assert.equal(family.trait.detector.three_generations(gens, 'a').survived, true);
  assert.equal(family.trait.detector.three_generations(gens, 'b').survived, true);
  assert.equal(family.trait.detector.three_generations(gens, 'c').survived, false);
});

test('family.trait.detector: 中断一代即未固化', () => {
  resetAll();
  const gens = [['a'], ['b'], ['a']];
  const r = family.trait.detector.three_generations(gens, 'a');
  assert.equal(r.survived, false);
  assert.equal(r.survivedCount, 1);
});

test('family.trait.detector: detect 输出候选', () => {
  resetAll();
  const gens = [['x', 'y'], ['x', 'y'], ['x', 'y', 'z']];
  const res = family.trait.detector.detect(gens);
  const map = new Map(res.map((r) => [r.tagKey, r.survived]));
  assert.equal(map.get('x'), true);
  assert.equal(map.get('y'), true);
  assert.equal(map.get('z'), false);
});

test('family.trait.enforcer: set 固化并强制最多 5 个', () => {
  resetAll();
  const node = family.trait.enforcer.set({ familyId: 'f1', traits: ['brave', 'loyal', 'swift', 'calm', 'fierce'] });
  assert.equal(node.traits.length, 5);
  assert.equal(family.trait.enforcer.limit(), 5);
  assert.deepEqual(family.trait.enforcer.list('f1').map((t) => t.key), ['brave', 'loyal', 'swift', 'calm', 'fierce']);
});

test('family.trait.enforcer: 超过 5 个抛 RangeError', () => {
  resetAll();
  assert.throws(
    () => family.trait.enforcer.set({ familyId: 'f1', traits: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'] }),
    RangeError,
  );
});

test('端到端：三代未遗失 → 固化特质 → 遗传合并 → 审计', () => {
  resetAll();
  const gens = [['brave', 'loyal'], ['brave', 'loyal', 'swift'], ['brave', 'loyal']];
  const detected = family.trait.detector.detect(gens).filter((r) => r.survived).map((r) => r.tagKey);
  assert.deepEqual(detected.sort(), ['brave', 'loyal']);
  const fixed = family.trait.enforcer.set({ familyId: 'f1', traits: detected });
  assert.equal(fixed.traits.length, 2);
  const child = family.inherit.applier.apply({
    paternal: makeTags('p', 50), maternal: makeTags('m', 50), familyTraits: fixed.traits,
  });
  assert.equal(child.valid, true);
  const childKeys = new Set(child.tags.map((t) => t.key));
  assert.ok(childKeys.has('brave') && childKeys.has('loyal'));
  tagsetStore.upsert('kid', child.tags);
  const audit = family.inherit.verifier.audit({ agentIds: ['kid'], familyTraits: fixed.traits });
  assert.equal(audit.coverage.brave.carried, 1);
  assert.equal(audit.coverage.loyal.carried, 1);
});
