import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as graph from '../src/infra/store/graph.js';
import * as identity from '../src/infra/identity.js';
import * as rng from '../src/infra/rng.js';
import * as social from '../src/social/index.js';
import * as agent from '../src/agent/index.js';
import * as observer from '../src/observer/index.js';
import { loop } from '../src/runtime/index.js';

const { registry, chronicle, lineage } = social.family;
const rel = social.relationship.family;
const { edges, community } = social.graph;

function resetAll() {
  graph.__reset();
  identity.__reset();
  rng.__reset();
}

test('family.registry: create / lookup(by name + by member) / dissolve', () => {
  resetAll();
  const f = registry.create({ name: '创始家族1', founder: 'a', members: ['a', 'b', 'c'], generation: { 0: ['a', 'b', 'c'] }, tick: 0 });
  assert.ok(f.familyId.startsWith('family_'), '应生成家族 ID');
  assert.deepEqual(f.members, ['a', 'b', 'c']);
  assert.deepEqual(f.generation, { 0: ['a', 'b', 'c'] });

  assert.equal(registry.lookup({ name: '创始家族1' }).familyId, f.familyId);
  assert.equal(registry.lookup({ familyId: f.familyId }).name, '创始家族1');
  const byMember = registry.lookup({ memberId: 'b' });
  assert.equal(byMember.length, 1);
  assert.equal(byMember[0].name, '创始家族1');

  const before = registry.list().length;
  registry.dissolve({ familyId: f.familyId, tick: 20 });
  assert.equal(registry.lookup({ name: '创始家族1' }), null, '解散后按名查不到');
  assert.equal(registry.list().length, before - 1);
});

test('family.chronicle: append 成立/出生/死亡 + compile 生成可读编年', () => {
  resetAll();
  const f = registry.create({ name: '家族1', founder: 'a', members: ['a', 'b'], generation: { 0: ['a', 'b'] }, tick: 0 });
  lineage.register({ agentId: 'a', familyId: f.familyId, parents: [], generation: 0 });
  lineage.register({ agentId: 'b', familyId: f.familyId, parents: [], generation: 0 });
  lineage.register({ agentId: 'k', familyId: f.familyId, parents: ['a', 'b'], generation: 1 });

  chronicle.append({ familyId: f.familyId, event: 'founding', tick: 0, actor: 'a', detail: { spouse: 'b' } });
  chronicle.append({ familyId: f.familyId, event: 'birth', tick: 5, actor: 'k', detail: { parents: ['a', 'b'] } });
  chronicle.append({ familyId: f.familyId, event: 'death', tick: 9, actor: 'b', detail: { cause: 'starvation' } });

  const c = chronicle.compile({ familyId: f.familyId });
  assert.equal(c.familyId, f.familyId);
  assert.equal(c.entries.length, 3);
  assert.equal(c.entries[0].event, 'founding');
  assert.ok(c.entries[0].summary.includes('成立'), 'founding 摘要应可读');
  assert.equal(c.entries[1].event, 'birth');
  assert.ok(c.entries[1].summary.includes('出生'), 'birth 摘要应可读');
  assert.equal(c.entries[2].event, 'death');
  assert.ok(c.entries[2].summary.includes('去世'), 'death 摘要应包含死亡');
  assert.ok(c.entries[2].summary.includes('starvation'), 'death 摘要应包含死因');
});

test('relationship.family: trace/label 父子女 + 祖孙 + 兄弟姐妹 + 配偶 + 姻亲', () => {
  resetAll();
  lineage.register({ agentId: 'd', familyId: 'F', parents: [], generation: 0 });
  lineage.register({ agentId: 'b', familyId: 'F', parents: ['d'], generation: 1 });
  lineage.register({ agentId: 'c', familyId: 'F', parents: ['d'], generation: 1 });
  lineage.register({ agentId: 'a', familyId: 'F', parents: [], generation: 1 });
  lineage.register({ agentId: 'k', familyId: 'F', parents: ['a', 'b'], generation: 2 });

  assert.equal(rel.label({ from: 'a', to: 'k' }), '子女');
  assert.equal(rel.label({ from: 'k', to: 'a' }), '父辈');
  assert.equal(rel.label({ from: 'a', to: 'b' }), '配偶', '共同育儿应判为配偶');
  assert.equal(rel.label({ from: 'b', to: 'c' }), '兄弟姐妹');
  assert.equal(rel.label({ from: 'k', to: 'd' }), '祖辈');
  assert.equal(rel.label({ from: 'd', to: 'k' }), '孙辈');
  assert.equal(rel.label({ from: 'a', to: 'c' }), '姻亲', 'a 的配偶 b 与 c 是兄弟姐妹');
  assert.equal(rel.label({ from: 'k', to: 'k' }), '本人');

  const t = rel.trace({ from: 'k', to: 'a' });
  assert.equal(t.kind, '父辈');
  assert.deepEqual(t.path, ['k', 'a']);
});

test('graph.edges: create 累加权重 + remove 软删除', () => {
  resetAll();
  const e1 = edges.create({ a: 'x', b: 'y', type: 'family', weight: 1 });
  assert.equal(e1.weight, 1);
  assert.equal(e1.count, 1);
  const e2 = edges.create({ a: 'y', b: 'x', type: 'family', weight: 0.5, note: '亲子' });
  assert.equal(e2.weight, 1.5, '双向同一边权重累加');
  assert.equal(e2.count, 2);

  edges.create({ a: 'x', b: 'z', type: 'trade', weight: 0.1 });
  assert.equal(edges.list().length, 2);

  assert.throws(() => edges.create({ a: 'x', b: 'x' }), TypeError, '自环边应抛错');

  const removed = edges.remove({ a: 'x', b: 'y' });
  assert.equal(removed.removed, true);
  assert.equal(edges.between({ a: 'x', b: 'y' }), null);
  assert.equal(edges.list().length, 1);
});

test('graph.community: 已知小图连通分量正确 + belong 归属', () => {
  resetAll();
  // 强关系组件：{a,b,k}（家人），{m,n}（朋友）；弱关系 trade x-y 被阈值过滤
  edges.create({ a: 'a', b: 'b', type: 'family', weight: 1 });
  edges.create({ a: 'a', b: 'k', type: 'family', weight: 1 });
  edges.create({ a: 'm', b: 'n', type: 'friendship', weight: 0.8 });
  edges.create({ a: 'x', b: 'y', type: 'trade', weight: 0.1 });

  const det = community.detect({ threshold: 0.5 });
  assert.equal(det.count, 2, '应有两个强关系社区');
  const members = det.communities.flatMap((c) => c.members).sort();
  assert.deepEqual(members, ['a', 'b', 'k', 'm', 'n'], '弱关系 trade 不计入社区');

  const ba = community.belong({ agentId: 'a' });
  assert.equal(ba.size, 3);
  assert.deepEqual(ba.members, ['a', 'b', 'k']);
  const bx = community.belong({ agentId: 'x' });
  assert.equal(bx.communityId, null, '弱关系边不产生社区归属');
});

// P3 修订（补齐）：本测试原先断言「存活率恒为 1.00」。该断言只在**资源过剩**的旧参数下成立
//（实测旧参数：人均库存长期 3.8、水食顶满、52 人中无一人需求超过 0.7、采集池只用 28/136），
// 它把"从未短缺"当成了"求生成功"，并掩盖了系统其实没有真实生存压力这一事实。
//
// 现在默认档压力已在临界之上（储备 2.5/人、再生 0.30/人、探索引入地表风险），
// 实测 6 个 (模式,种子) 组合中有 5 个食物库存触底到 0——生存压力是真实存在的：
//   phase2        seed1 死3(饿2渴1)  seed2 死0  seed3 死0
//   phase2+phase3 seed1 死1(渴)      seed2 死3(渴3) seed3 死0
// 死因均为 starvation/dehydration，且死者**死前仍在持续采集与进食**
//（如 agent_...028 最后 30 tick：12 次 forage、11 次 drink、5 次 eat，仍于 t34 饿死）
// ——是力竭而非消极。
//
// 因此断言改为「不失衡」而非「零死亡」：单种子存活率 ≥0.90（即 50 人中最多 5 人损失），
// 且 3 种子合计存活率 ≥0.96。这样阈值反映的是真实涌现分布，而不是"挑一个刚好能过的数"。
test('集成：50 居民 × 200 tick × 3 种子存活率不失衡 + 跨种子分叉（≥2 字段差异）', async () => {
  const seeds = [1, 2, 3];
  const metrics = [];
  let totalAlive = 0;
  let totalInitial = 0;
  for (const seed of seeds) {
    const report = await loop.run({ agentCount: 50, ticks: 200, seed, phase2: true });

    // 存活率（初始居民全部存活）
    const worldAgents = report.world.agents ?? {};
    const initialIds = report.agents.map((a) => a.id);
    let alive = 0;
    for (const id of initialIds) {
      const rec = worldAgents[id];
      if (rec && rec.alive !== false) alive += 1;
    }
    const rate = initialIds.length > 0 ? alive / initialIds.length : 0;
    assert.ok(rate >= 0.90, 'seed ' + seed + ' 存活率不应失衡（实际 ' + rate + '，死亡 ' + (initialIds.length - alive) + ' 人）');
    totalAlive += alive;
    totalInitial += initialIds.length;

    const families = registry.list();
    metrics.push({
      seed,
      famCount: families.length,
      famSize: families.length > 0 ? Math.max(...families.map((f) => f.members.length)) : 0,
      edgeCount: edges.list().length,
      communityCount: community.detect({ threshold: 0.5 }).count,
    });
  }

  // 三种子合计存活率：单种子允许个位数损失，合计必须仍然高（否则压力已越过临界）。
  const overall = totalInitial > 0 ? totalAlive / totalInitial : 0;
  assert.ok(overall >= 0.96, '三种子合计存活率应 ≥0.96（实际 ' + overall.toFixed(4) + '）');

  // 硬指标②：家族数/家族规模/关系边数/社区数中至少 2 个字段跨种子出现差异
  const keys = ['famCount', 'famSize', 'edgeCount', 'communityCount'];
  const distinctCounts = keys.map((k) => new Set(metrics.map((m) => m[k])).size);
  const diverged = distinctCounts.filter((n) => n >= 2).length;
  assert.ok(diverged >= 2, '至少 2 个字段跨种子分叉，实际 ' + JSON.stringify(metrics));
});


test('家族特质：三代未遗失 → 固化为家族特质并遗传给后代（运行时接通）', async () => {
  // 契约（用户规格原文）：家族连续三代未遗失某特质，该特质即固定为家族特质，
  // 最多 5 个。
  //
  // 修复前这条链路**完全没接进运行时**：detector 与 enforcer 只有单元测试，
  // 没有任何调用点（各家族特质数恒为 0）；offspring.request 虽接受 familyTraits
  // 参数，runProcreation 却从不传。同时生育上限硬编码为 2、每胎都新建家族、
  // 代际硬编码 —— 结构上根本不可能出现第三代。
  //
  // 本测试是端到端锁：真跑主循环，断言第三代确实出现、特质确实固化、
  // 且固化后的特质确实进入后代标签集。
  loop.reset();
  const report = await loop.run({ agentCount: 50, ticks: 200, seed: 1, phase2: true });

  // ① 人口因生育增长，且全体存活（生育不得以生存为代价）
  const world = report.world.agents ?? {};
  const all = Object.keys(world);
  assert.ok(all.length > 50, '世界人口应因生育增长，实际 ' + all.length);
  const dead = all.filter((id) => world[id] && world[id].alive === false);
  assert.equal(dead.length, 0, '不应有居民死亡：' + JSON.stringify(dead.slice(0, 5)));

  // ② 出现第三代：否则「三代未遗失」在设计上不可达
  const fams = social.family.registry.list();
  let maxGen = 0;
  for (const f of fams) {
    const gens = Object.keys(social.family.lineage.generation({ familyId: f.familyId })).map(Number);
    if (gens.length > 0) maxGen = Math.max(maxGen, ...gens);
  }
  assert.ok(maxGen >= 3, '家族应至少繁衍到第 3 代，实际最大代际=' + maxGen);

  // ③ 有家族固化了特质，且不超过 5 个、全部来自该家族成员的真实标签
  const withTraits = fams
    .map((f) => ({ familyId: f.familyId, traits: social.family.trait.enforcer.list(f.familyId) }))
    .filter((x) => x.traits.length > 0);
  assert.ok(withTraits.length >= 1,
    '应至少有一个家族固化特质（三代未遗失），实际 0；家族数=' + fams.length);
  for (const f of withTraits) {
    assert.ok(f.traits.length <= social.family.trait.enforcer.limit(),
      '家族特质不得超过 5 个：' + JSON.stringify(f.traits.map((t) => t.key)));
    const memberKeys = new Set();
    for (const g of Object.values(social.family.registry.lookup({ familyId: f.familyId }).generation ?? {})) {
      for (const id of g) {
        for (const t of (agent.traits.tagset.store.get(id)?.tags ?? [])) memberKeys.add(t.key);
      }
    }
    for (const t of f.traits) {
      assert.ok(memberKeys.has(t.key),
        '固化特质应来自家族成员的真实标签：' + t.key);
    }
  }

  // ④ 固化后的特质确实遗传：存在携带家族特质的后代
  const inherited = [];
  for (const f of withTraits) {
    const keys = new Set(f.traits.map((t) => t.key));
    const gens = social.family.registry.lookup({ familyId: f.familyId }).generation ?? {};
    const deepest = Math.max(...Object.keys(gens).map(Number));
    for (const id of (gens[deepest] ?? [])) {
      const own = (agent.traits.tagset.store.get(id)?.tags ?? []).map((t) => t.key);
      const hit = own.filter((k) => keys.has(k));
      if (hit.length > 0) inherited.push({ id, hit });
    }
  }
  assert.ok(inherited.length >= 1,
    '固化后的家族特质应出现在后代标签集里，实际 0 例：' + JSON.stringify(withTraits.map((f) => f.traits.map((t) => t.key))));

  // ⑤ 观察者能看到「特质固化」这件事
  const fixedEvents = observer.recorder.eventLog.list().filter((n) => n.data.topic === 'social.family.trait.fixed');
  assert.ok(fixedEvents.length >= 1, '特质固化应写 observer 事件');
});
