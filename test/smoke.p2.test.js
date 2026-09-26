import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loop, registry, worldState } from '../src/runtime/index.js';
import * as observer from '../src/observer/index.js';
import * as town from '../src/town/index.js';
import * as agent from '../src/agent/index.js';
import * as social from '../src/social/index.js';
import * as tagsetStore from '../src/agent/traits/tagset/store.js';

function eventTopics() {
  return observer.recorder.eventLog.list().map((n) => n.data.topic);
}

function actionKinds() {
  return observer.recorder.actionLog.list().map((n) => n.data.action);
}

function survivalTable(report) {
  const table = {};
  const agents = report.world.agents ?? {};
  for (const id of Object.keys(agents)) {
    const w = agents[id];
    table[id] = {
      name: w.name,
      bornTick: w.bornTick,
      alive: w.alive,
      survivedTicks: typeof w.bornTick === 'number' ? report.finalTick - w.bornTick : null,
    };
  }
  return table;
}

test('phase2 冒烟：4 居民跑 30 tick，家庭/经济/制作/居住/健康全链路 + 日志 + 存活时长', async () => {
  loop.reset();
  // 15 → 30 tick：识字已改为**个人化**（社会有识字供给时，成年居民中 literacyShare
  // 比例识字，默认 0.4），不再是「有教师则全体识字」。4 人局里识字者仅 2 人，
  // 且前 15 tick 城镇尚处早期短缺（threatened 为真时窗口收缩为生存骨架），
  // 写书被生存行动压制 —— 实测 15 tick write=0、30 tick write=2、60 tick write=5。
  // 写书是**城镇稳定后**才出现的行动，15 tick 的预算已不足以观察全链路。
  const report = await loop.run({ phase2: true, ticks: 30, seed: 42, agentCount: 4 });

  // 1) 至少 4 名居民 + 产生子代（恋爱与后代）
  const agents = registry.lookup({ type: 'agent' });
  assert.ok(agents.length >= 4, '居民数应 >= 4');
  assert.ok(report.phase2, 'run 报告应含 phase2 摘要');
  assert.ok(report.phase2.summary.childrenBorn >= 1, '应产生子代');

  // 2) 子代 50 tag 来自父母 100 tag（父母各 50），并注册谱系
  const children = agents.filter((a) => (a.data.name ?? '').startsWith('新生儿'));
  assert.ok(children.length >= 1, '应存在子代');
  for (const c of children) {
    const childTags = tagsetStore.get(c.id).tags;
    assert.equal(childTags.length, 50, '子代应有 50 个特质标签');
    const trace = social.family.lineage.trace({ agentId: c.id });
    assert.ok(trace && trace.parents.length === 2, '子代谱系应有双亲');
    const p1 = tagsetStore.get(trace.parents[0]).tags;
    const p2 = tagsetStore.get(trace.parents[1]).tags;
    const parentKeys = new Set([...p1, ...p2].map((t) => t.key));
    for (const t of childTags) {
      assert.ok(parentKeys.has(t.key), '子代标签应来自父母 100 标签: ' + t.key);
    }
  }

  // 3) 交易 / 制作 / 建造 / 写书 / 疾病处理 / 空间入住
  assert.ok(report.phase2.summary.trades >= 1, '市场交易应发生');
  assert.ok(report.phase2.summary.crafted >= 1, '制作应发生');
  assert.ok(report.phase2.summary.built >= 1, '建造应发生');
  assert.ok(report.phase2.summary.treated >= 1, '疾病治疗应发生');
  const actions = actionKinds();
  assert.ok(actions.includes('craft:axe'), '制作石斧应写 action-log');
  assert.ok(actions.includes('build:barn'), '建造谷仓应写 action-log');
  assert.ok(actions.includes('write_book'), '写书应写 action-log');
  assert.ok(actions.includes('treatment'), '治疗应写 action-log');

  // 4) 事件日志持续写入（生育/交易/疫情/隔离/居住）
  const topics = eventTopics();
  assert.ok(topics.includes('social.procreation'), '生育事件应写 event-log');
  assert.ok(topics.includes('economy.trade'), '市场交易应写 event-log');
  assert.ok(topics.includes('health.epidemic'), '疫情检测应写 event-log');
  assert.ok(topics.includes('health.quarantine'), '隔离应写 event-log');
  assert.ok(topics.includes('town.residence'), '居住分配应写 event-log');

  // 5) 决策/行为/事件日志持续写入（编年志计数 > 0）
  assert.ok(report.chronicle.decision > 0, '决策日志应持续写入');
  assert.ok(report.chronicle.action > 0, '行为日志应持续写入');
  assert.ok(report.chronicle.event > 0, '事件日志应持续写入');

  // 6) 空间入住：每个居民（含子代）都有住所
  for (const a of agents) {
    assert.ok(town.residence.residenceOf(a.id) !== null, a.id + ' 应有住所');
  }

  // 7) 世界状态持续变化：tick 推进 + 资源衰减 + 居民增长
  assert.equal(report.world.tick, 30, '世界 tick 应推进到 30');
  assert.ok(report.resources.water.stockpile < 100, '水源应随 tick 衰减');
  assert.ok(report.resources.food.stockpile > 0 && report.resources.food.stockpile <= 100, '食物应被采集补充并夹在 (0, capacity] 内');
  assert.ok(Object.keys(report.world.agents ?? {}).length > 4, '世界居民应随子代增长');

  // 8) 存活时长可观测
  const table = survivalTable(report);
  assert.ok(Object.keys(table).length >= 4, '存活表应覆盖全部居民');
  for (const row of Object.values(table)) {
    assert.equal(row.alive, true, '居民应存活');
    assert.ok(typeof row.survivedTicks === 'number' && row.survivedTicks >= 0, '存活时长应可观测');
  }
  const founders = Object.values(table).filter((r) => r.bornTick === 0);
  assert.equal(founders.length, 4, '初始 4 居民 bornTick=0');
  for (const f of founders) assert.equal(f.survivedTicks, 30, '初始居民存活时长应=30');
  console.log('[smoke.p2] 存活时长记录: ' + JSON.stringify(table));
});

test('家族特质：三代未遗失检测 + 固化（最多 5）+ 遗传合并', () => {
  const gens = [['a', 'b'], ['a', 'b', 'c'], ['a', 'b']];
  assert.equal(social.family.trait.detector.three_generations(gens, 'a').survived, true);
  assert.equal(social.family.trait.detector.three_generations(gens, 'b').survived, true);
  assert.equal(social.family.trait.detector.three_generations(gens, 'c').survived, false);
  const detected = social.family.trait.detector.detect(gens).filter((r) => r.survived).map((r) => r.tagKey);
  assert.deepEqual(detected.sort(), ['a', 'b']);

  // 固化并强制最多 5 个
  const fixed = social.family.trait.enforcer.set({ familyId: 'fam', traits: detected });
  assert.equal(fixed.traits.length, 2);
  assert.equal(social.family.trait.enforcer.limit(), 5);
  assert.throws(
    () => social.family.trait.enforcer.set({ familyId: 'fam', traits: ['t1', 't2', 't3', 't4', 't5', 't6'] }),
    RangeError,
  );

  // 把家族特质合并进子代 50 标签
  const paternal = Array.from({ length: 50 }, (_, i) => ({ key: 'p' + i, weight: 1.0 }));
  const maternal = Array.from({ length: 50 }, (_, i) => ({ key: 'm' + i, weight: 1.0 }));
  const child = social.family.inherit.applier.apply({ paternal, maternal, familyTraits: fixed.traits });
  assert.equal(child.tags.length, 50);
  assert.equal(child.valid, true);
  const keys = new Set(child.tags.map((t) => t.key));
  assert.ok(keys.has('a') && keys.has('b'), '家族特质应合并进子代标签');
});

test('phase2 世界状态持续变化（diff 非空）', async () => {
  loop.reset();
  const before = worldState.snapshot();
  await loop.run({ phase2: true, ticks: 5, seed: 1, agentCount: 4 });
  const after = worldState.snapshot();
  const changes = worldState.diff(before, after);
  assert.ok(changes.length > 0, '世界状态应产生变化');
  const paths = changes.map((c) => c.path);
  assert.ok(
    paths.some((p) => p === 'agents' || p.startsWith('agents.') || p === 'resources' || p.startsWith('resources.') || p === 'needs' || p.startsWith('needs.')),
    '变化应涉及居民/资源/需求: ' + paths.join(','),
  );
});
