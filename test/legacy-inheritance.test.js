/**
 * test/legacy-inheritance.test.js — 遗产、遗物与跨文明知识继承闭环（t14）
 *
 * 验收目标（用户需求原文）：
 *   实现或补齐 relic artifact/discover 与知识来源链；遗产必须转为**有来源、可误解、可丢失**的
 *   技能/研究前提或行动偏好，并通过**有遗产/无遗产同条件对照**证明下一代行为改变。
 *
 * 本文件按"性质"而不是"函数"组织断言：
 *   1. 来源（provenance）——每一项继承来的能力都能反查到文明/图谱/遗物。
 *   2. 可误解（fallibility）——读歪会产出**错的**能力，并且照样生效。
 *   3. 可丢失（losability）——知识只活在具体的人身上，人没了知识就没了。
 *   4. 有界（boundedness）——偏好能塑造倾向，不能推翻生存。
 *   5. 同条件对照（controlled comparison）——同一起点存档分叉，唯一差异是遗产。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import * as civilization from '../src/civilization/index.js';
import * as graph from '../src/infra/store/graph.js';
import * as identity from '../src/infra/identity.js';
import * as registry from '../src/runtime/registry.js';
import * as persistence from '../src/runtime/persistence.js';
import * as loop from '../src/runtime/orchestrator/loop.js';
import * as actionLog from '../src/observer/recorder/action-log.js';
import * as decisionLog from '../src/observer/recorder/decision-log.js';

const relic = civilization.relic.artifact;
const discover = civilization.relic.discover;
const inherit = civilization.legacy.inherit;

/** 造一份**真实的**遗产图谱：只包含真正发生过的成就。 */
function legacyFixture(deeds, civilizationId = 'civ_fixture') {
  return {
    graph: {
      graphId: 'legacy_graph_fixture',
      civilizationId,
      tick: 42,
      counts: { people: 1, events: 0, deeds: deeds.length, entries: deeds.length },
      nodes: deeds.map((d) => ({ id: 'deed:' + d.action, label: d.action, kind: 'deed', meta: { count: d.count } })),
      edges: [],
    },
  };
}

async function freshWorld() {
  await loop.reset();
  await graph.__reset();
  await actionLog.__reset();
  await decisionLog.__reset();
}

test('遗物只由**真实发生过的成就**铸造，且带完整来源链', async () => {
  await freshWorld();
  // 只有采集与写作发生过：机械/账本/蓝图/药方都不该出现。
  const forged = relic.forge({
    legacy: legacyFixture([{ action: 'forage', count: 40 }, { action: 'write', count: 12 }]),
    tick: 42,
  });
  const kinds = forged.relics.map((r) => r.kind).sort();
  assert.deepEqual(kinds, ['notes', 'seeds'], '只有 forage/write 两类成就应留下遗物');
  assert.deepEqual(forged.skipped.sort(), ['blueprint', 'ledger', 'machine', 'remedy']);

  for (const r of forged.relics) {
    assert.equal(r.sourceGraphId, 'legacy_graph_fixture', '遗物必须记住它出自哪张遗产图谱');
    assert.equal(r.sourceCivilizationId, 'civ_fixture', '遗物必须记住它出自哪一代文明');
    assert.ok(r.sourceDeeds.length > 0, '遗物必须记住它对应哪些成就');
    assert.ok(r.integrity > 0 && r.integrity < 1, '任何物证都在时间里损失了一部分（完整度 < 1）');
    assert.ok(r.inscribed !== null, '遗物上刻着的内容（可能被读歪）必须存在');
  }
  // 成就规模越大 → 物证越完整（单调性，而不是拍脑袋常数）。
  const big = relic.forge({ legacy: legacyFixture([{ action: 'forage', count: 500 }]), tick: 42 });
  assert.ok(big.relics[0].integrity > forged.relics.find((r) => r.kind === 'seeds').integrity,
    '成就越多，留下的物证越完整');
});

test('遗物是物理对象：可查询、可被丢弃（可丢失）', async () => {
  await freshWorld();
  const forged = relic.forge({ legacy: legacyFixture([{ action: 'forage', count: 10 }]), tick: 1 });
  const id = forged.relics[0].relicId;
  assert.equal(relic.query({ relicId: id }).relicId, id);
  assert.equal(relic.remove({ relicId: id }), true);
  assert.equal(relic.query({ relicId: id }), null, '丢掉的遗物不能再被解读');
  assert.equal(relic.remove({ relicId: id }), false, '重复丢弃是幂等的');
});

test('解读是确定性的：同一遗物、同一人、同一素养必得同一结果', async () => {
  await freshWorld();
  const forged = relic.forge({ legacy: legacyFixture([{ action: 'forage', count: 30 }]), tick: 1 });
  const r0 = discover.interpret({ relic: forged.relics[0], agentId: 'a1', literacy: 0.6, tick: 1 });
  const r1 = discover.interpret({ relic: forged.relics[0], agentId: 'a1', literacy: 0.6, tick: 1 });
  assert.equal(r0.discovery.fidelity, r1.discovery.fidelity);
  assert.deepEqual(r0.discovery.interpreted, r1.discovery.interpreted);
});

test('素养不足读不动物证，且**不消耗**遗物', async () => {
  await freshWorld();
  const forged = relic.forge({ legacy: legacyFixture([{ action: 'forage', count: 30 }]), tick: 1 });
  const id = forged.relics[0].relicId;
  const res = discover.discover({ agentId: 'a1', relicId: id, literacy: 0.1, tick: 1 });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'cannot_read');
  assert.equal(relic.query({ relicId: id }).discoveredBy, undefined, '读不懂的人不会"用掉"物证');
});

test('可误解：素养×完整度决定读对读歪，读歪时内容真的被改变', async () => {
  await freshWorld();
  const forged = relic.forge({ legacy: legacyFixture([{ action: 'trade', count: 1 }]), tick: 1 });
  const item = { ...forged.relics[0], integrity: 0.55 };

  // 素养拉满 + 完整度极高 → 一定读对（否则"保真"就是空话）。
  const sure = { ...item, integrity: 0.99 };
  const faithful = discover.interpret({ relic: sure, agentId: 'agent_f', literacy: 1, tick: 1 }).discovery;
  assert.equal(faithful.fidelity, 'faithful');
  assert.deepEqual(faithful.interpreted, sure.inscribed, '读对 = 刻的内容原样照搬');

  // 素养一般 + 完整度中下 → 两种结果都会出现（"可误解"是概率事实，不是标记位）。
  let nFaithful = 0;
  let nGarbled = 0;
  for (let i = 0; i < 60; i += 1) {
    const d = discover.interpret({ relic: item, agentId: 'probe_' + i, literacy: 0.3, tick: 1 }).discovery;
    if (d.fidelity === 'faithful') {
      nFaithful += 1;
      assert.deepEqual(d.interpreted, item.inscribed);
    } else {
      nGarbled += 1;
      assert.notDeepEqual(d.interpreted, item.inscribed, '读歪 = 内容真的被改变');
      assert.equal(typeof d.interpreted.garbledFrom, 'string', '必须记录"它是从什么读歪的"');
    }
  }
  assert.ok(nFaithful > 0 && nGarbled > 0, '同一件物证在不同人手里会读出不同结果');
  assert.ok(nGarbled > nFaithful, '素养不足时读歪应当是常态而非例外');

  // 读歪的三种语义错法：技能改名 / 技术改向 / 偏好取反。
  const skillRelic = { relicId: 'r1', kind: 'notes', integrity: 0.5, inscribed: { type: 'skill', key: 'reading' },
    sourceGraphId: 'g', sourceCivilizationId: 'c', sourceDeeds: [] };
  const prefRelic = { relicId: 'r2', kind: 'seeds', integrity: 0.5, inscribed: { type: 'preference', key: 'forage', bias: 0.3 },
    sourceGraphId: 'g', sourceCivilizationId: 'c', sourceDeeds: [] };
  const gSkill = discover.interpret({ relic: skillRelic, agentId: 'agent_g', literacy: 0.3, tick: 1 }).discovery;
  const gPref = discover.interpret({ relic: prefRelic, agentId: 'agent_g', literacy: 0.3, tick: 1 }).discovery;
  assert.equal(gSkill.fidelity, 'garbled');
  assert.notEqual(gSkill.interpreted.key, 'reading', '技能读歪会落到另一个技能上');
  assert.equal(gPref.fidelity, 'garbled');
  assert.ok(gPref.interpreted.bias < 0, '偏好读歪 = 方向读反（"多去采集"读成"少去采集"）');
});

test('解读落盘后可查，且同一件遗物不会被解读两次', async () => {
  await freshWorld();
  const forged = relic.forge({ legacy: legacyFixture([{ action: 'write', count: 20 }]), tick: 1 });
  const id = forged.relics[0].relicId;
  const first = discover.discover({ agentId: 'a1', relicId: id, literacy: 0.95, tick: 5 });
  assert.equal(first.ok, true);
  const second = discover.discover({ agentId: 'a2', relicId: id, literacy: 0.95, tick: 6 });
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'already_discovered');
  assert.equal(discover.list().length, 1);
  assert.equal(discover.byAgent('a1').length, 1);
  const stored = relic.query({ relicId: id });
  assert.equal(stored.discoveredBy, 'a1', '遗物上要留下"谁读的、读成什么样"');
  assert.equal(stored.discoveryFidelity, first.discovery.fidelity);
});

test('有来源：技能/研究前提/偏好都带来源，且来源链可一路追到文明', async () => {
  await freshWorld();
  const heritage = legacyFixture([{ action: 'craft', count: 30 }, { action: 'forage', count: 30 }], 'civ_src');
  const seeded = inherit.applier.seedFromHeritage({
    heritage, agents: [{ id: 'a1' }, { id: 'a2' }], tick: 7, literacyOf: () => 1,
    maxDiscoveries: Infinity,
  });
  assert.ok(seeded.relics >= 2);
  assert.equal(seeded.discoveries, seeded.relics, '素养拉满 + 读全时每件遗物都应被读懂');
  assert.equal(seeded.garbled, 0);

  const t1 = inherit.trace.of('a1');
  assert.ok(t1.chain.length > 0, '来源链不能为空');
  for (const link of t1.chain) {
    assert.equal(link.relicFound, true, '来源指向的遗物必须真实存在');
    assert.equal(link.sourceGraphId, 'legacy_graph_fixture');
    assert.equal(link.sourceCivilizationId, 'civ_src', '能力必须能反查到出自哪一代文明');
    assert.ok(typeof link.discoveryId === 'string' && link.discoveryId !== '');
  }
  assert.equal(inherit.trace.verify({ agents: ['a1', 'a2'] }).ok, true);

  // 反例：凭空塞一条没有来源的能力 → 必须被指出来。
  graph.write({ id: 'skills:ghost', type: inherit.skill.TYPE,
    data: { agentId: 'ghost', skills: [{ skillId: 'metalwork', title: '金属加工', source: null, learnedAtTick: 1 }] } });
  const v = inherit.trace.verify({ agents: ['ghost'] });
  assert.equal(v.ok, false);
  assert.ok(v.broken.some((b) => b.reason === 'missing_source'), '无来源的能力必须判为断链');
  graph.remove('skills:ghost');
});

test('读歪的解读会落成**错的**能力，并且照样生效', async () => {
  await freshWorld();
  const discovery = {
    discoveryId: 'd_garbled', agentId: 'a1', relicId: 'r_x', relicKind: 'seeds',
    sourceGraphId: 'g1', sourceCivilizationId: 'c1', sourceDeeds: [],
    fidelity: 'garbled', inscribed: { type: 'preference', key: 'forage', bias: 0.3 },
    interpreted: { type: 'preference', key: 'forage', bias: -0.3, garbledFrom: 'forage' },
    literacy: 0.3, relicIntegrity: 0.5, pFaithful: 0.15, tick: 1,
  };
  const applied = inherit.applier.apply({ discovery, tick: 1 });
  assert.equal(applied.applied, 'preference');
  assert.ok(inherit.preference.biasFor({ agentId: 'a1', action: 'forage' }) < 0,
    '读歪的偏好方向相反，并且**真的**写进了行为偏置');
  const trace = inherit.trace.of('a1');
  assert.equal(trace.preferences[0].sources[0].fidelity, 'garbled', '来源里要留下"这次是读歪的"');
});

test('研究前提只是"知道它存在"，不等于解锁（捡到蓝图 ≠ 会造）', async () => {
  await freshWorld();
  const discovery = {
    discoveryId: 'd_tech', agentId: 'a1', relicId: 'r_bp', relicKind: 'blueprint',
    sourceGraphId: 'g1', sourceCivilizationId: 'c1', sourceDeeds: [],
    fidelity: 'faithful', inscribed: { type: 'tech', key: 'water_purification' },
    interpreted: { type: 'tech', key: 'water_purification' },
    literacy: 1, relicIntegrity: 0.9, pFaithful: 0.9, tick: 1,
  };
  inherit.applier.apply({ discovery, tick: 1 });
  assert.equal(inherit.applier.hasHeadStart('a1', 'water_purification'), true);
  const node = civilization.tech.tree.query({ techId: 'water_purification' });
  assert.equal(node.state, 'pending', '继承**不能**直接把技术解锁——那是研究的职责');
  assert.equal(inherit.applier.registerHeadStart({ agentId: 'a1', techId: 'water_purification' }).registered, false,
    '同一研究前提不重复登记');
  // 继承来的技能确实让研究更省力，但有下界（不能越继承越免费）。
  inherit.skill.grant({ agentId: 'a1', skillId: 'metalwork', tick: 1 });
  const discount = inherit.applier.researchDiscount('a1');
  assert.ok(discount < 1 && discount >= 0.5, '研究折扣有下界');
});

test('可丢失：掌握者全部死亡后技能失传、偏好消失', async () => {
  await freshWorld();
  inherit.skill.grant({ agentId: 'a1', skillId: 'reading', tick: 1 });
  inherit.skill.grant({ agentId: 'a2', skillId: 'reading', tick: 1 });
  inherit.preference.add({ agentId: 'a1', action: 'forage', bias: 0.3, tick: 1 });
  assert.deepEqual(inherit.skill.holders('reading').sort(), ['a1', 'a2']);

  // a2 还活着 → 不失传。
  assert.equal(inherit.skill.detectLoss({ living: ['a2'], tick: 2 }).lost.length, 0);

  // 两个人都死了 → 失传，且技能从他们身上被抹掉。
  const lost = inherit.skill.detectLoss({ living: [], tick: 3 });
  assert.deepEqual(lost.lost.map((l) => l.skillId), ['reading']);
  assert.equal(inherit.skill.has('a1', 'reading'), false, '死者不再"掌握"任何东西');
  assert.deepEqual(inherit.skill.holders('reading'), []);

  const dropped = inherit.preference.detectLoss({ living: [], tick: 3 });
  assert.equal(dropped.dropped.length, 1);
  assert.equal(inherit.preference.biasFor({ agentId: 'a1', action: 'forage' }), 0);
});

test('有界：偏好可叠加但永远出不了 ±MAX_BIAS 的带', async () => {
  await freshWorld();
  for (let i = 0; i < 5; i += 1) {
    inherit.preference.add({ agentId: 'a1', action: 'forage', bias: 0.3, tick: i, source: { discoveryId: 'd' + i, relicId: 'r' + i } });
  }
  const p = inherit.preference.of('a1')[0];
  assert.equal(p.bias, inherit.preference.MAX_BIAS, '累加后被夹在上限');
  assert.equal(p.rawBias, 1.5, '原始累加值仍保留（可审计）');
  assert.equal(p.sources.length, 5, '每个来源都留痕');
  assert.equal(inherit.preference.biasFor({ agentId: 'a1', action: 'forage' }), inherit.preference.MAX_BIAS);
});

test('有界（行为）：继承偏好**不能**推翻生存——饿的人照样吃饭', async () => {
  await freshWorld();
  const cfg = { phase2: false, phase3: false, seed: 5, agentCount: 4 };
  await loop.run({ ...cfg, ticks: 12 });
  const agents = registry.lookup({ type: 'agent' }).map((r) => r.id);
  assert.ok(agents.length > 0);
  // 给所有人灌一条"极度厌恶吃饭"的继承偏好（方向被读反的极端情形）。
  for (const id of agents) {
    inherit.preference.add({ agentId: id, action: 'eat', bias: -inherit.preference.MAX_BIAS, tick: 12, source: { discoveryId: 'd', relicId: 'r' } });
  }
  await actionLog.__reset();
  await loop.resume({ ...cfg, ticks: 40 });
  const eaten = actionLog.list().filter((r) => (r.data?.action ?? r.action) === 'eat').length;
  assert.ok(eaten > 0, '即便背上"厌恶吃饭"的遗产，饥饿仍然会让他们吃饭（生存门量级远大于偏好上限）');
  const alive = registry.lookup({ type: 'agent' }).filter((r) => (r.data ?? {}).alive !== false).length;
  assert.ok(alive > 0, '文明不会因为一条坏遗产就灭绝');
});

test('接线：交接时注入遗产 → 下一代真的拿到能力；关掉开关 → 一个都没有', async () => {
  const base = { phase2: true, phase3: true, seed: 5, agentCount: 6 };
  async function runHandover(enabled) {
    await freshWorld();
    const opt = enabled ? {} : { legacyInheritance: false };
    await loop.run({ ...base, ...opt, ticks: 40 });
    await loop.resume({ ...base, ...opt, ticks: 3, collapseForce: true });
    const agents = registry.lookup({ type: 'agent' }).map((r) => r.id);
    const status = loop.legacyStatus({ config: { legacyInheritance: enabled } });
    const holders = agents.filter((id) => {
      const t = inherit.trace.of(id);
      return t.skills.length + t.preferences.length + t.headStarts.length > 0;
    });
    return { agents, status, holders };
  }
  const on = await runHandover(true);
  const off = await runHandover(false);

  assert.ok(on.status.relics.total > 0, '有遗产时交接必须铸出遗物');
  assert.ok(on.status.discoveries > 0, '有遗产时下一代必须真的解读了物证');
  assert.ok(on.holders.length > 0, '有遗产时下一代必须真的持有能力');
  assert.equal(on.status.provenance.ok, true, '全部继承能力都必须有可追溯来源');

  assert.equal(off.status.relics.total, 0, '关掉开关后不应铸出任何遗物');
  assert.equal(off.status.discoveries, 0);
  assert.equal(off.holders.length, 0, '关掉开关后下一代不应持有任何继承能力');
  assert.equal(off.status.skills.total + off.status.preferences.total + off.status.headStarts, 0);
});

test('同条件对照：同一起点存档分叉，唯一差异是遗产 → 下一代行为改变', async () => {
  const cfg = { phase2: true, phase3: true, seed: 5, agentCount: 6 };
  await freshWorld();
  await loop.run({ ...cfg, ticks: 30 });
  const archive = await persistence.saveRun({ label: 't14-fork' });

  const histogram = () => {
    const h = {};
    for (const r of actionLog.list()) {
      const a = r.data?.action ?? r.action;
      h[a] = (h[a] ?? 0) + 1;
    }
    return h;
  };

  // 分支 A：走**真实的**遗产链（铸遗物 → 解读 → 落成技能/偏好/研究前提）。
  await persistence.restoreRun(archive);
  await actionLog.__reset();
  const agents = registry.lookup({ type: 'agent' }).map((r) => r.id);
  const legacyGraph = civilization.legacy.graph.build({ civilizationId: 'civ_fork' });
  const seeded = inherit.applier.seedFromHeritage({
    heritage: { graph: legacyGraph }, agents: agents.map((id) => ({ id })), tick: 30, literacyOf: () => 0.95,
  });
  await loop.resume({ ...cfg, ticks: 60 });
  const withHeritage = histogram();
  const statusA = loop.legacyStatus({});

  // 分支 B：同一起点，什么都不注入。
  // 把随机标识消耗对齐（A 铸遗物/解读各消耗一个 id），否则两个分支的 id 序列不同，
  // 分叉就不可比——那会让"行为差异"变成"编号差异"。
  await persistence.restoreRun(archive);
  await actionLog.__reset();
  for (let i = 0; i < seeded.relics + seeded.discoveries; i += 1) identity.next('pad');
  await loop.resume({ ...cfg, ticks: 60 });
  const withoutHeritage = histogram();
  const statusB = loop.legacyStatus({});

  assert.ok(statusA.relics.total > 0 && statusA.discoveries > 0, 'A 分支必须真的走完遗产链');
  assert.equal(statusB.relics.total + statusB.discoveries, 0, 'B 分支必须完全没有遗产');

  const actions = new Set([...Object.keys(withHeritage), ...Object.keys(withoutHeritage)]);
  const differing = [...actions].filter((a) => (withHeritage[a] ?? 0) !== (withoutHeritage[a] ?? 0));
  assert.ok(differing.length >= 3,
    '同条件下唯一差异是遗产，下一代的行为分布必须改变（实际差异动作数：' + differing.length + '）');
});

test('同条件对照（机制级）：继承偏好使被偏置行动的得分**恰好**抬升偏置量', async () => {
  const cfg = { phase2: false, phase3: false, seed: 5, agentCount: 6 };
  await freshWorld();
  await loop.run({ ...cfg, ticks: 30 });
  const archive = await persistence.saveRun({ label: 't14-score' });
  const BIAS = 0.4;

  const decisionsAt = (tick) => decisionLog.list()
    .filter((r) => r.data.tick === tick)
    .map((r) => ({ id: r.data.agentId, action: r.data.decision, score: r.data.final?.score }));

  async function branch(bias) {
    await persistence.restoreRun(archive);
    if (bias !== 0) {
      for (const id of registry.lookup({ type: 'agent' }).map((r) => r.id)) {
        inherit.preference.add({
          agentId: id, action: 'forage', bias, tick: 30,
          source: { discoveryId: 'd1', relicId: 'r1', sourceGraphId: 'g1', sourceCivilizationId: 'c1', fidelity: 'faithful' },
        });
      }
    }
    await loop.resume({ ...cfg, ticks: 1 });
    return decisionsAt(31);
  }

  const plain = await branch(0);
  const biased = await branch(BIAS);
  const byId = new Map(plain.map((d) => [d.id, d]));
  const sameAction = biased.filter((d) => byId.get(d.id)?.action === d.action);
  assert.ok(sameAction.length > 0, '至少要有一个居民在两个分支里选了同一行动，才能对比得分');
  const exact = sameAction.filter((d) => Math.abs((d.score - byId.get(d.id).score) - BIAS) < 1e-9);
  assert.ok(exact.length > 0,
    '选了同一行动的居民，其得分差必须**恰好**等于继承偏置（证明偏好真的进入了决策打分，而不是被记在别处）');
});

test('继承能力随存档往返：恢复后遗物、解读、技能、偏好、研究前提逐条复原', async () => {
  const cfg = { phase2: true, phase3: true, seed: 5, agentCount: 6 };
  await freshWorld();
  await loop.run({ ...cfg, ticks: 40 });
  await loop.resume({ ...cfg, ticks: 3, collapseForce: true });
  await loop.resume({ ...cfg, ticks: 20 });
  const before = loop.legacyStatus({});
  assert.ok(before.relics.total > 0 && before.discoveries > 0, '存档前必须已经产生遗产链');

  const archive = await persistence.saveRun({ label: 't14-persist' });
  await loop.reset();
  assert.equal(loop.legacyStatus({}).relics.total, 0, 'reset 之后遗产链必须归零（跨 run 不残留）');

  await persistence.restoreRun(archive);
  const after = loop.legacyStatus({});
  assert.deepEqual(after.relics, before.relics, '遗物逐项复原（含完整度与已解读标记）');
  assert.equal(after.discoveries, before.discoveries);
  assert.deepEqual(after.skills, before.skills);
  assert.deepEqual(after.preferences, before.preferences);
  assert.equal(after.headStarts, before.headStarts);
  assert.equal(after.provenance.ok, true, '恢复后来源链依然完整');
});

test('端到端：常态运行中遗物真的会被捡到，且继承技能让人识字', async () => {
  const cfg = { phase2: true, phase3: true, seed: 5, agentCount: 6 };
  await freshWorld();
  await loop.run({ ...cfg, ticks: 40 });
  await loop.resume({ ...cfg, ticks: 3, collapseForce: true });
  const status0 = loop.legacyStatus({});
  assert.ok(status0.relics.total > 0, '交接后世界上必须有物证');
  assert.ok(status0.relics.undiscovered > 0,
    '交接不能一次读完祖先的全部遗产——必须留下物证给后来的世代（否则考古一步到位，没有过程）');

  await loop.resume({ ...cfg, ticks: 40 });
  const status1 = loop.legacyStatus({});
  assert.ok(status1.discoveries > status0.discoveries, '常态运行中遗物必须继续被捡到、被解读');

  // 继承的读写技能优先于人口比例判定：拿到 reading 的人一定识字。
  const agents = registry.lookup({ type: 'agent' }).map((r) => r.id);
  const readers = agents.filter((id) => inherit.skill.has(id, 'reading'));
  for (const id of readers) {
    const st = loop.legacyStatus({ agentId: id });
    assert.equal(st.literate, true, '继承来的读写技能必须让他识字（而不是只在技能表里挂个名）');
  }
  // 没有读写技能的人仍然走人口比例判定，不该被"继承"这个名头连带成识字。
  const others = agents.filter((id) => !inherit.skill.has(id, 'reading'));
  for (const id of others.slice(0, 3)) {
    assert.equal(typeof loop.legacyStatus({ agentId: id }).literate, 'boolean');
  }
});
