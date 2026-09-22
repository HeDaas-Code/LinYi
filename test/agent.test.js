import { test } from 'node:test';
import assert from 'node:assert/strict';

import { graph, rng, identity } from '../src/infra/index.js';
import { traits, anticipation, decision, memory } from '../src/agent/index.js';

const tagsetStore = traits.tagset.store;
const tagsetSampler = traits.tagset.sampler;
const inheritSampler = traits.inherit.sampler;
const inheritValidator = traits.inherit.validator;
const poolStore = anticipation.pool.store;
const poolSelector = anticipation.pool.selector;
const decisionContext = decision.context;
const decisionSelector = decision.selector;
const episodicStore = memory.episodic.store;
const episodicRecaller = memory.episodic.recaller;

function resetAll() {
  graph.__reset();
  rng.__reset();
  identity.__reset();
}

function makeTags(prefix, n) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push({ key: `${prefix}${i}`, weight: 1 });
  return out;
}

test('tagset.store: 对象输入 upsert 后 get 可读且按 key 排序', () => {
  resetAll();
  const written = tagsetStore.upsert('agent_a', { brave: 2, agile: 1 });
  assert.equal(written.tags.length, 2);
  assert.deepEqual(written.tags.map((t) => t.key), ['agile', 'brave']);

  const read = tagsetStore.get('agent_a');
  assert.equal(read.agentId, 'agent_a');
  assert.deepEqual(read.tags, written.tags);
  assert.equal(tagsetStore.get('missing'), null);
});

test('tagset.store: 数组二元组输入与深拷贝隔离', () => {
  resetAll();
  tagsetStore.upsert('agent_a', [['brave', 2], ['agile', 1]]);
  const snap = tagsetStore.get('agent_a');
  snap.tags[0].weight = 999;
  assert.equal(tagsetStore.get('agent_a').tags[0].weight, 1);
});

test('tagset.store: 非法 key / 权重被拒绝', () => {
  resetAll();
  assert.throws(() => tagsetStore.upsert('a', { Brave: 1 }), /非法 tag\.key/);
  assert.throws(() => tagsetStore.upsert('a', { brave: 0 }), /weight 必须为正/);
});

test('tagset.sampler: weighted 无放回返回 n 个不同 key', () => {
  resetAll();
  const tags = makeTags('t', 10);
  const picked = tagsetSampler.weighted(tags, 3);
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked.map((t) => t.key)).size, 3);
  assert.throws(() => tagsetSampler.weighted(tags, 11), /只有 10 个标签/);
});

test('tagset.sampler: sample 可 seed 复现，无标签返回 null', () => {
  resetAll();
  tagsetStore.upsert('agent_a', makeTags('t', 50));
  rng.seed('sampler-42');
  const a = tagsetSampler.sample('agent_a');
  rng.seed('sampler-42');
  const b = tagsetSampler.sample('agent_a');
  assert.deepEqual(a, b);
  assert.equal(tagsetSampler.sample('nobody'), null);
});

test('inherit.sampler: combine 生成 50 个唯一子代标签且全部可溯源', () => {
  resetAll();
  const paternal = makeTags('p', 50);
  const maternal = makeTags('m', 50);
  const child = inheritSampler.combine(paternal, maternal);
  assert.equal(child.length, 50);
  assert.equal(new Set(child.map((t) => t.key)).size, 50);
  const known = new Set([...paternal, ...maternal].map((t) => t.key));
  for (const tag of child) assert.ok(known.has(tag.key));
  for (const tag of child) assert.ok(tag.source === 'paternal' || tag.source === 'maternal');
});

test('inherit.sampler: combine 尊重 size 与 paternalRatio', () => {
  resetAll();
  const paternal = makeTags('p', 10);
  const maternal = makeTags('m', 10);
  const onlyPaternal = inheritSampler.combine(paternal, maternal, { size: 5, paternalRatio: 1 });
  assert.equal(onlyPaternal.length, 5);
  assert.ok(onlyPaternal.every((t) => t.source === 'paternal'));

  const onlyMaternal = inheritSampler.combine(paternal, maternal, { size: 5, paternalRatio: 0 });
  assert.ok(onlyMaternal.every((t) => t.source === 'maternal'));
});

test('inherit.sampler: ratio 统计父本/母本/新变异', () => {
  resetAll();
  const ratio = inheritSampler.ratio(
    [{ key: 'p0' }, { key: 'm1' }, { key: 'both' }, { key: 'novel' }],
    [{ key: 'p0' }, { key: 'both' }],
    [{ key: 'm1' }, { key: 'both' }],
  );
  assert.equal(ratio.paternal, 1);
  assert.equal(ratio.maternal, 1);
  assert.equal(ratio.shared, 1);
  assert.equal(ratio.novel, 1);
  assert.equal(ratio.inherited, 3);
  assert.equal(ratio.inheritedRatio, 0.75);
});

test('inherit.validator: validate 校验数量/唯一/权重', () => {
  resetAll();
  assert.equal(inheritValidator.validate(makeTags('t', 50)).ok, true);
  const tooFew = inheritValidator.validate(makeTags('t', 49));
  assert.equal(tooFew.ok, false);
  assert.ok(tooFew.errors.some((e) => e.includes('数量')));

  const dup = makeTags('t', 50);
  dup[10] = { key: 't0', weight: 1 };
  const dupRes = inheritValidator.validate(dup);
  assert.equal(dupRes.ok, false);
  assert.ok(dupRes.errors.some((e) => e.includes('重复')));

  const badWeight = makeTags('t', 50);
  badWeight[3] = { key: 't3', weight: -1 };
  assert.equal(inheritValidator.validate(badWeight).ok, false);
});

test('inherit.validator: audit 给出继承比例与 plausible', () => {
  resetAll();
  const child = [...makeTags('p', 40), ...makeTags('x', 10)];
  const res = inheritValidator.audit(child, makeTags('p', 50), makeTags('m', 50));
  assert.equal(res.total, 50);
  assert.equal(res.inherited, 40);
  assert.equal(res.novel, 10);
  assert.equal(res.inheritedRatio, 0.8);
  assert.equal(res.plausible, true);
});

test('anticipation.pool.store: add/list 与同 id upsert', () => {
  resetAll();
  poolStore.add('agent_a', { id: 'c1', action: 'eat', score: 1 });
  poolStore.add('agent_a', { id: 'c2', action: 'drink', score: 2 });
  assert.equal(poolStore.list('agent_a').length, 2);

  poolStore.add('agent_a', { id: 'c1', action: 'eat_better', score: 9 });
  const list = poolStore.list('agent_a');
  assert.equal(list.length, 2);
  assert.equal(list.find((c) => c.id === 'c1').action, 'eat_better');
  assert.equal(poolStore.list('other').length, 0);
});

test('anticipation.pool.selector: shortlist/select 按评分降序', () => {
  resetAll();
  poolStore.add('agent_a', { id: 'low', action: 'a', score: 1 });
  poolStore.add('agent_a', { id: 'high', action: 'b', score: 10 });
  poolStore.add('agent_a', { id: 'mid', action: 'c', score: 5 });

  const short = poolSelector.shortlist('agent_a', { limit: 2 });
  assert.deepEqual(short.map((c) => c.id), ['high', 'mid']);

  const best = poolSelector.select('agent_a');
  assert.equal(best.id, 'high');
  assert.equal(poolSelector.select('nobody'), null);
});

test('decision.context: assemble 归一化与 rank 排序（pressure 权重更高）', () => {
  const ctx = decisionContext.assemble({
    agentId: 'agent_a',
    motivations: [{ id: 'm1', label: 'hunger', score: 0.4 }],
    anticipations: [{ id: 'a1', action: 'eat', score: 0.6 }],
    pressures: [{ id: 'p1', need: 'food', level: 0.8 }],
  });
  assert.equal(ctx.items.length, 3);
  const ranked = decisionContext.rank(ctx);
  assert.equal(ranked[0].id, 'p1'); // 0.8 * 1.5 = 1.2 最高
  assert.equal(ranked[0].source, 'pressure');
});

test('decision.selector: choose 选最高分并给出置信度', () => {
  const chosen = decisionSelector.choose({
    candidates: [
      { id: 'a', action: 'x', score: 1 },
      { id: 'b', action: 'y', score: 10 },
      { id: 'c', action: 'z', score: 1 },
    ],
  });
  assert.equal(chosen.id, 'b');
  assert.equal(chosen.score, 10);
  assert.ok(chosen.confidence > 0.5 && chosen.confidence <= 1);
  assert.equal(decisionSelector.choose({ candidates: [] }), null);
});

test('decision.selector: confidence 定位指定候选', () => {
  const candidates = [
    { id: 'a', score: 1 },
    { id: 'b', score: 10 },
  ];
  const conf = decisionSelector.confidence({ chosen: candidates[1], candidates });
  assert.ok(conf > 0.9);
  assert.equal(decisionSelector.confidence({ chosen: { id: 'zzz' }, candidates }), 0);
});

test('episodic.store: write/list 按 ts 排序', () => {
  resetAll();
  const older = episodicStore.write('agent_a', { ts: 100, content: 'first', emotion: 'calm', salience: 0.3 });
  const newer = episodicStore.write('agent_a', { ts: 200, content: 'second', emotion: 'fear', salience: 0.9 });
  assert.equal(older.memoryId.startsWith('mem_'), true);
  const list = episodicStore.list('agent_a');
  assert.equal(list.length, 2);
  assert.equal(list[0].content, 'first');
  assert.equal(list[1].content, 'second');
  assert.equal(newer.emotion, 'fear');
});

test('episodic.store: tag 合并去重，缺失返回 null', () => {
  resetAll();
  const mem = episodicStore.write('agent_a', { ts: 1, content: 'x', tags: ['a'] });
  const updated = episodicStore.tag(mem.memoryId, ['b', 'a']);
  assert.deepEqual(updated.tags, ['a', 'b']);
  assert.equal(episodicStore.tag('missing', ['x']), null);
});

test('episodic.recaller: recall 按标签与时间窗过滤，rank 按显著性排序', () => {
  resetAll();
  episodicStore.write('agent_a', { ts: 100, content: 'old-fear', salience: 0.1, tags: ['fear'] });
  episodicStore.write('agent_a', { ts: 200, content: 'new-fear', salience: 0.9, tags: ['fear'] });
  episodicStore.write('agent_a', { ts: 300, content: 'joy', salience: 0.5, tags: ['joy'] });

  const byTag = episodicRecaller.recall('agent_a', { tags: ['fear'] });
  assert.equal(byTag.length, 2);

  const since = episodicRecaller.recall('agent_a', { since: 150 });
  assert.equal(since.length, 2);

  const ranked = episodicRecaller.rank(episodicStore.list('agent_a'));
  assert.equal(ranked[0].memory.content, 'new-fear'); // salience 0.9 最高
});
