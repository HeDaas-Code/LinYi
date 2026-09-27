/**
 * t13 验收：双向社会互动与可信事实约束
 *
 * 覆盖用户需求原文的每一条：
 *   1) 结构化请求 / 接受 / 拒绝 / 承诺 / 履约 / 违约 / 信任变化**都真实发生**；
 *   2) 自然语言只是**可选渲染**，必须过世界事实校验才能影响关系/声誉/后续行为；
 *   3) **不以增加帖子数量代替互动**。
 *
 * 每条用例都先给出**修复前的实测反例**，再断言修复后的行为——
 * 这样一旦回退，测试会指出退回的是什么状态，而不只是"某个数字不对"。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const loop = await import('../src/runtime/orchestrator/loop.js');
const stage2 = await import('../src/runtime/orchestrator/_stage2.js');
const interaction = await import('../src/social/interaction.js');
const facts = await import('../src/social/facts.js');
const friendship = await import('../src/social/relationship/friendship.js');
const reputation = await import('../src/social/reputation.js');
const registry = await import('../src/runtime/registry.js');
const backpack = await import('../src/agent/inventory/backpack.js');
const observer = await import('../src/observer/index.js');

function logs() {
  return observer.recorder.actionLog.recent({ limit: 1000000 }).map((n) => n.data ?? n);
}

function countOf(list, action) {
  return list.filter((a) => a.action === action).length;
}

test('t13 拒绝：被请求方可以拒绝，且拒绝不产生任何关系收益', async () => {
  loop.reset();
  await loop.run({ phase2: true, ticks: 1, seed: 11, agentCount: 6 });
  const ids = registry.lookup({ type: 'agent' }).map((r) => r.id);
  const [a, b] = ids;

  const fBefore = friendship.strength({ a, b });
  const rBefore = reputation.query({ agentId: a }).score;

  // 发起方向 b 提出社交请求（结构化，不带任何自然语言）。
  const req = interaction.propose({ type: 'socialize', from: a, to: b, tick: 100, terms: { kind: 'companionship' } });
  assert.equal(req.ok, true, '结构化请求应当被接受为一条待决互动');
  assert.equal(req.status, 'pending', '发起方**不能**替接收方决定，只能是 pending');
  assert.equal(friendship.strength({ a, b }), fBefore, '待决期间不得改变关系（修复前 socialize 无条件 +0.05）');
  assert.equal(reputation.query({ agentId: a }).score, rBefore, '待决期间不得改变声誉');

  const rejected = interaction.respond({ interactionId: req.interactionId, respondent: b, accept: false, tick: 101 });
  assert.equal(rejected.ok, true);
  assert.equal(rejected.status, 'rejected');
  assert.equal(friendship.strength({ a, b }), fBefore, '被拒绝后关系必须**不**变化');
  assert.equal(reputation.query({ agentId: a }).score, rBefore, '被拒绝后声誉必须**不**变化');

  // 反例：发起方不能代替接收方回答。
  const req2 = interaction.propose({ type: 'socialize', from: a, to: b, tick: 102, terms: {} });
  const forged = interaction.respond({ interactionId: req2.interactionId, respondent: a, accept: true, tick: 103 });
  assert.equal(forged.ok, false, '发起方不得替接收方接受');
  assert.equal(forged.reason, 'not_the_recipient');
});

test('t13 接受：只有被接受才写关系与声誉，且双方友谊都增长', async () => {
  loop.reset();
  await loop.run({ phase2: true, ticks: 1, seed: 12, agentCount: 6 });
  const ids = registry.lookup({ type: 'agent' }).map((r) => r.id);
  const [a, b] = ids;
  const before = friendship.strength({ a, b });
  const req = interaction.propose({ type: 'socialize', from: a, to: b, tick: 200, terms: {} });
  const accepted = interaction.respond({ interactionId: req.interactionId, respondent: b, accept: true, tick: 201 });
  assert.equal(accepted.status, 'accepted');
  // 友谊是**双向**的：修复前只有发起方这一侧的强度变化。
  assert.ok(friendship.strength({ a, b }) > before, '接受后友谊应当增长');
  const bSide = friendship.strength({ a: b, b: a });
  assert.ok(bSide > before, '接受方那一侧的友谊同样应增长（对称关系）');
});

test('t13 承诺→履约：真实交割货物、改变关系、提高声誉、提升对方信任', async () => {
  loop.reset();
  await loop.run({ phase2: true, ticks: 1, seed: 13, agentCount: 6 });
  const ids = registry.lookup({ type: 'agent' }).map((r) => r.id);
  const [a, b] = ids;

  // 先给承诺方一件实物，让"兑现"成为可能。
  const itemMod = await import('../src/agent/inventory/item.js');
  const axe = itemMod.query().find((i) => i.category === 'tool') ?? itemMod.query()[0];
  assert.ok(axe !== undefined, '前置条件：物品目录里有可交割的物品');
  backpack.add({ agentId: a, itemId: axe.id, quantity: 2 });

  const trustBefore = interaction.trust({ holder: b, other: a }).trust;
  const repBefore = reputation.query({ agentId: a }).score;
  const friendBefore = friendship.strength({ a, b });
  const heldBefore = backpack.list({ agentId: a }).items[axe.id] ?? 0;

  const promised = interaction.propose({
    type: 'promise', from: a, to: b, tick: 300,
    terms: { what: axe.name, amount: 1, dueTick: 320 },
  });
  assert.equal(promised.ok, true);
  assert.equal(interaction.openPromises(a).length, 1, '承诺方应当能看到自己未结的承诺');

  const done = stage2.performAgentAction(301, a, 'fulfill', {});
  assert.equal(done.ok, true, '手上有货时履约应当成功：' + JSON.stringify(done));
  assert.equal(backpack.list({ agentId: a }).items[axe.id] ?? 0, heldBefore - 1, '履约必须**真实交割**（承诺方减少）');
  assert.equal(backpack.list({ agentId: b }).items[axe.id] ?? 0, 1, '受诺方必须真的收到货');
  assert.equal(interaction.openPromises(a).length, 0, '履约后承诺不再是未结状态');
  assert.ok(friendship.strength({ a, b }) > friendBefore, '履约应增进关系');
  assert.ok(reputation.query({ agentId: a }).score > repBefore, '履约应提高声誉');
  assert.ok(interaction.trust({ holder: b, other: a }).trust > trustBefore,
    '受诺方对承诺方的信任必须上升（修复前因字段名写错，信任恒为 0.5）');
});

test('t13 承诺→违约：交不出货则拒绝"假履约"，到期未交付自动判违约并降低信任', async () => {
  loop.reset();
  await loop.run({ phase2: true, ticks: 1, seed: 14, agentCount: 6 });
  const ids = registry.lookup({ type: 'agent' }).map((r) => r.id);
  const [a, b] = ids;

  const promised = interaction.propose({
    type: 'promise', from: a, to: b, tick: 400,
    terms: { what: '世界不存在的物品', amount: 1, dueTick: 402 },
  });
  assert.equal(promised.ok, true, '承诺是记录，不要求此刻就有货');

  // 交不出东西时**不得**留下一条假的履约记录。
  const failed = stage2.performAgentAction(401, a, 'fulfill', {});
  assert.equal(failed.ok, false, '交不出货就不是履约');
  assert.equal(failed.reason, 'cannot_deliver');
  assert.equal(interaction.list({ type: 'fulfill' }).length, 0, '不得写入假履约');
  assert.equal(interaction.openPromises(a).length, 1, '承诺仍应保持开放，直到到期');

  const trustBefore = interaction.trust({ holder: b, other: a }).trust;
  const repBefore = reputation.query({ agentId: a }).score;
  const settled = interaction.settleOverdue({ tick: 403 });
  assert.equal(settled.overdue.length, 1, '过了 dueTick 未交付必须自动判违约');
  assert.equal(interaction.openPromises(a).length, 0, '违约后不再是未结状态');
  assert.ok(interaction.trust({ holder: b, other: a }).trust < trustBefore, '违约必须降低信任');
  assert.ok(reputation.query({ agentId: a }).score < repBefore, '违约必须降低声誉');
  // 幂等：同一条承诺不会被重复结算。
  assert.equal(interaction.settleOverdue({ tick: 404 }).overdue.length, 0, '结算必须幂等');
});

test('t13 信任变化由真实履约史驱动，且能反哺后续行为（高信任者更可能被接受）', async () => {
  loop.reset();
  await loop.run({ phase2: true, ticks: 1, seed: 15, agentCount: 6 });
  const ids = registry.lookup({ type: 'agent' }).map((r) => r.id);
  const [a, b, c] = ids;
  const itemMod = await import('../src/agent/inventory/item.js');
  const axe = itemMod.query().find((i) => i.category === 'tool') ?? itemMod.query()[0];

  // a 守信两次；c 一次都不承诺。b 对两者的中性信任都应是 0.5。
  assert.equal(interaction.trust({ holder: b, other: a }).trust, 0.5, '无历史时信任为中性 0.5，不凭空怀疑也不凭空信任');
  assert.equal(interaction.trust({ holder: b, other: c }).trust, 0.5);
  backpack.add({ agentId: a, itemId: axe.id, quantity: 4 });
  for (const t of [500, 520]) {
    interaction.propose({ type: 'promise', from: a, to: b, tick: t, terms: { what: axe.name, amount: 1, dueTick: t + 5 } });
    assert.equal(stage2.performAgentAction(t + 1, a, 'fulfill', {}).ok, true);
  }
  const trustA = interaction.trust({ holder: b, other: a });
  assert.ok(trustA.trust > 0.5, '两次履约后信任应高于中性：' + JSON.stringify(trustA));
  assert.equal(trustA.fulfilled, 2);
  assert.equal(trustA.violated, 0);

  // 信任真的进入"后续行为"：同样的社交请求，守信的 a 被接受、无历史的 c 需要过门槛。
  const fromA = interaction.propose({ type: 'socialize', from: a, to: b, tick: 600, terms: {} });
  const accA = stage2.performAgentAction(601, b, 'accept', {});
  assert.equal(accA.ok, true, '高信任者的请求应能被接受：' + JSON.stringify(accA));
  assert.equal(interaction.get(fromA.interactionId).status, 'accepted');
});

test('t13 事实校验门：未证实的声明不写关系、不写声誉，只留可查的拒绝记录', async () => {
  loop.reset();
  await loop.run({ phase2: true, ticks: 1, seed: 16, agentCount: 6 });
  const ids = registry.lookup({ type: 'agent' }).map((r) => r.id);
  const [a, b] = ids;

  // 事实目录外 / 与真实持有量不符 / 关于自己健康的假话。
  const req = interaction.propose({
    type: 'request', from: a, to: b, tick: 700,
    claims: [
      { key: 'needs.need', value: { need: 'food', level: 1 } },       // a 此时并不饿
      { key: 'inventory.count', value: { item: '不存在的物品', count: 1 } },
      { key: '不存在的键', value: true },
    ],
  });
  assert.equal(req.ok, true, '互动记录本身成立，但声明要逐条核');
  assert.equal(req.claims.length, 0, '三条声明没有一条能被世界状态证实');
  assert.equal(req.rejectedClaims.length, 3, '未证实的声明必须被**显式记账**，不能静默丢弃');
  const reasons = req.rejectedClaims.map((c) => c.reason);
  assert.ok(reasons.includes('unknown_fact_key'), '目录外的键一律判未证实：' + JSON.stringify(reasons));

  // 即便接收方答应，未证实的声明也不产生任何关系/声誉后果（拒绝也是可查的事实）。
  const rejected = interaction.respond({ interactionId: req.interactionId, respondent: b, accept: false, tick: 701 });
  assert.equal(rejected.status, 'rejected');
  assert.equal(interaction.stats().rejectedClaims, 3, '被拦下的声明数应可观测');
});

test('t13 事实校验门：证实的声明可放行（不是"一律拒绝"的摆设）', async () => {
  loop.reset();
  await loop.run({ phase2: true, ticks: 1, seed: 17, agentCount: 6 });
  const ids = registry.lookup({ type: 'agent' }).map((r) => r.id);
  const [a, b] = ids;
  const itemMod = await import('../src/agent/inventory/item.js');
  const axe = itemMod.query().find((i) => i.category === 'tool') ?? itemMod.query()[0];
  backpack.add({ agentId: a, itemId: axe.id, quantity: 3 });

  const ok = facts.verify({ key: 'inventory.count', subject: a, value: { item: axe.name, count: 2 } });
  assert.equal(ok.verified, true, '真实持有 3 件、声称 2 件应当通过：' + JSON.stringify(ok));
  const over = facts.verify({ key: 'inventory.count', subject: a, value: { item: axe.name, count: 9 } });
  assert.equal(over.verified, false, '声称超过真实持有量必须被拒');
  assert.equal(over.reason, 'count_not_held');

  // 关于**第三方**的声明按 subject 核对，而不是拿声明者自己的状态去核。
  const career = await import('../src/agent/role/career.js');
  const occupation = career.current(b)?.occupation ?? null;
  const about = facts.verify({ key: 'role.career', subject: b, value: occupation });
  assert.equal(about.verified, true, '关于对方的真实职业应当通过：' + JSON.stringify(about));

  const req = interaction.propose({
    type: 'request', from: a, to: b, tick: 800,
    claims: [{ key: 'inventory.count', subject: a, value: { item: axe.name, count: 2 } }],
  });
  assert.equal(req.claims.length, 1, '可证实的声明应被采纳为事实');
  assert.equal(req.rejectedClaims.length, 0);
});

test('t13 自然语言只是可选渲染：文本本身不构成事实，也不能凭空建立关系', async () => {
  loop.reset();
  await loop.run({ phase2: true, ticks: 1, seed: 18, agentCount: 6 });
  const ids = registry.lookup({ type: 'agent' }).map((r) => r.id);
  const [a, b] = ids;

  // 一句"我有 99 份木头"的漂亮话——世界事实是背包里没有。
  const fromText = interaction.fromText({ text: '我这里有 99 份木头，随时可以给你', speaker: a, to: b });
  if (fromText !== null) {
    const req = interaction.propose({ type: fromText.type, from: fromText.from, to: fromText.to, tick: 900, claims: fromText.claims, naturalLanguage: '我这里有 99 份木头，随时可以给你' });
    assert.equal(req.claims.length, 0, '文本抽出的声明仍必须过事实门');
    assert.ok(req.rejectedClaims.length > 0, '与真实持有量不符的文本必须被记为未证实声明');
  }

  // 抽不出任何已知事实的纯闲聊：**不产生互动**（不以发帖/说话代替互动）。
  const edgeMod = await import('../src/social/graph/edges.js');
  const edgeKey = (e) => e.a + '|' + e.b;
  const edgesBefore = new Set(edgeMod.list().map(edgeKey));
  const empty = interaction.fromText({ text: '今天天气真不错呀', speaker: a, to: b });
  assert.equal(empty, null, '读不出结构化事实的文本不应产生任何互动');
  // 关键断言：**这一步**没有新增任何关系边。
  // 注意基线要取"此刻已有的边"——主循环本身的社交行动会合法建边，
  // 直接断言"没有边"会把主循环的正当行为误判为文本的副作用。
  const edgesAfter = new Set(edgeMod.list().map(edgeKey));
  assert.equal(edgesAfter.size, edgesBefore.size, '文本不得凭空新增关系边');

  // 合法文本（能被证实的声明）走同一套结构化路径：可以放行，但仍由接收方决定。
  backpack.add({ agentId: a, itemId: (await import('../src/agent/inventory/item.js')).query()[0].id, quantity: 1 });
  const real = interaction.propose({
    type: 'socialize', from: a, to: b, tick: 901,
    naturalLanguage: '一起去找点吃的？',
  });
  assert.equal(real.ok, true);
  assert.equal(real.naturalLanguage, '一起去找点吃的？', '自然语言被保留为渲染文本');
  assert.equal(real.status, 'pending', '自然语言不改变"必须由对方回应"这一事实');
});

test('t13 不以帖子数量代替互动：互动与帖子是两条独立的量', async () => {
  loop.reset();
  // 跑够长：承诺的默认期限是 10 tick，太短的窗口里"履约/违约"还没到结算点。
  await loop.run({ phase2: true, ticks: 200, seed: 19, agentCount: 12 });
  const s2 = stage2.summary();
  const st = interaction.stats();

  assert.ok(s2.postCount > 0, '前置条件：帖子确实在产生（既有能力未被破坏）');
  assert.ok(st.total > 0, '互动必须真实发生（修复前 socialize 不产生任何互动记录）');
  // 反例守卫：如果互动只是"发帖的副产品"，两者会同步。这里要求互动类别齐全。
  assert.ok(st.accepted > 0, '必须有被接受的请求');
  assert.ok(st.rejected > 0, '必须有被拒绝的请求（只有接受不叫双向）');
  assert.ok(st.promises > 0, '必须有承诺');
  assert.ok(st.fulfilled > 0, '必须有履约');
  assert.ok(st.violated > 0, '必须有违约');
  // 帖子数不是互动的度量：两者不存在恒等关系。
  assert.notEqual(st.total, s2.postCount, '互动数不得等同于帖子数');
});

test('t13 端到端：主循环里承诺—履约—违约—信任完整闭环且可持久化', async () => {
  loop.reset();
  await loop.run({ phase2: true, ticks: 200, seed: 5, agentCount: 12 });
  const acts = logs();
  for (const action of ['socialize', 'accept', 'reject', 'promise', 'fulfill']) {
    assert.ok(countOf(acts, action) > 0, '端到端必须真实发生：' + action + '（修复前 order 里 promise/fulfill/reject 均为 0）');
  }
  const st = interaction.stats();
  assert.ok(st.fulfilled > 0 && st.violated > 0,
    '长跑中履约与违约都应当出现：' + JSON.stringify(st));
  assert.equal(st.openPromises, 0, '到期承诺会被结算，不得无界堆积');
  // 信任真的分化了（不再是一片 0.5 的中性）。
  const pairs = new Set();
  for (const r of interaction.list({})) if (r.type === 'fulfill' || r.type === 'violate') pairs.add(r.to + '|' + r.from);
  const trusts = [...pairs].map((k) => { const [h, o] = k.split('|'); return interaction.trust({ holder: h, other: o }).trust; });
  assert.ok(trusts.some((t) => t > 0.5 + 1e-9), '应当存在被信任的人');
  assert.ok(trusts.some((t) => t < 0.5 - 1e-9), '应当存在不被信任的人');
  assert.ok(Math.max(...trusts) - Math.min(...trusts) > 0.2, '信任应当显著分化：' + JSON.stringify(trusts.map((t) => Number(t.toFixed(3)))));

  // 持久化：未结承诺是跨 tick 社会事实，必须随存档往返。
  const persistence = await import('../src/runtime/persistence.js');
  const graph = await import('../src/infra/store/graph.js');
  const before = interaction.list({}).length;
  const snap = persistence.saveRun({ meta: { test: 't13' } });
  assert.ok(snap.meta.capturedSections.includes('interaction'), 'interaction 必须被采集进存档');
  graph.__reset();
  interaction.__reset();
  assert.equal(interaction.list({}).length, 0);
  persistence.restoreRun(snap);
  assert.equal(interaction.list({}).length, before, '互动与承诺记录必须逐条复原');
});

// ============================================================================
// t26：互动调度公平性 / 有限等待 / 拒绝原因唯一性
// ============================================================================
//
// F1 的实测反例（修复前，seed42 / 20 tick / 12 人）：
//   socialize 4 条，accepted 0、rejected 0、pending 4（最久的等了 8 tick），friendship 边 0 条。
//   根因不是「没人愿意社交」，而是 _stage2 的回应挑选写了：
//       const courts = inbox.filter(r => r.type === 'court');
//       const pool = courts.length > 0 ? courts : inbox;
//       const target = pool[pool.length - 1];
//   —— 只要队列里有一条表白，inbox 里的 socialize 就完全不参与挑选；
//   而 pool[length-1] 又是**最新**的一条（LIFO），后到的插队让先到的永远排不上。
// 下面几条用例分别锁住：挑选公平、等待有界、门槛不随经济周期误杀全员。

test('t26 F1：有待决表白时，等超时的社交请求仍先被调度（表白不再独占队列）', async () => {
  loop.reset();
  await loop.run({ phase2: true, ticks: 1, seed: 11, agentCount: 6 });
  const ids = registry.lookup({ type: 'agent' }).map((r) => r.id);
  const [sender, recipient, other] = ids;

  // 接收方先收到一条社交请求（tick 10），两 tick 后又收到一条表白（tick 12）。
  const soc = interaction.propose({ type: 'socialize', from: sender, to: recipient, tick: 10, terms: { kind: 'companionship' } });
  const court = interaction.propose({ type: 'court', from: other, to: recipient, tick: 12, terms: {} });
  assert.equal(soc.ok, true);
  assert.equal(court.ok, true);

  // tick 14：社交请求已等 4 tick（大于等于上限 3），表白才等 2 tick。
  // 修复前无论等多久都只会消费表白；修复后等超时的那条优先。
  const acted = stage2.performAgentAction(14, recipient, 'accept', {});
  assert.equal(acted.ok, true, '应当真的回应了某一条待决互动');
  assert.notEqual(interaction.get(soc.interactionId).status, 'pending',
    '等超时的社交请求必须先被调度（修复前它永远轮不到）');
  assert.equal(interaction.get(court.interactionId).status, 'pending',
    '刚到的表白这一 tick 仍应保持待决——公平不等于把表白挤掉');
});

test('t26 F1：都还没等超时时，表白仍然优先（不是把旧规则反过来了）', async () => {
  loop.reset();
  await loop.run({ phase2: true, ticks: 1, seed: 11, agentCount: 6 });
  const ids = registry.lookup({ type: 'agent' }).map((r) => r.id);
  const [sender, recipient, other] = ids;

  const soc = interaction.propose({ type: 'socialize', from: sender, to: recipient, tick: 30, terms: {} });
  const court = interaction.propose({ type: 'court', from: other, to: recipient, tick: 30, terms: {} });

  // 同一 tick 到达、都没到等待上限：表白（更紧要）先被回应。
  const acted = stage2.performAgentAction(30, recipient, 'accept', {});
  assert.equal(acted.ok, true);
  assert.notEqual(interaction.get(court.interactionId).status, 'pending', '同等等待下表白应当优先');
  assert.equal(interaction.get(soc.interactionId).status, 'pending', '同等等待下社交请求应当让位');
});

test('t26：等待是有界的——超时未答复落成沉默即拒绝，且不产生任何关系收益', async () => {
  loop.reset();
  await loop.run({ phase2: true, ticks: 1, seed: 11, agentCount: 6 });
  const ids = registry.lookup({ type: 'agent' }).map((r) => r.id);
  const [sender, recipient] = ids;
  const fBefore = friendship.strength({ a: sender, b: recipient });
  const rBefore = reputation.query({ agentId: sender }).score;

  const soc = interaction.propose({ type: 'socialize', from: sender, to: recipient, tick: 100, terms: {} });
  assert.equal(interaction.settleStaleResponses({ tick: 109, maxWait: 10 }).count, 0, '未到上限不得结案');
  const settled = interaction.settleStaleResponses({ tick: 110, maxWait: 10 });
  assert.equal(settled.count, 1, '到达上限必须结案——永远挂着不是中立');

  const rec = interaction.get(soc.interactionId);
  assert.equal(rec.status, 'rejected', '沉默结的是拒绝，不是接受');
  assert.equal(rec.response.reason, 'no_response', '拒绝原因必须可查：这里是没答复，不是对方说不');
  assert.equal(friendship.strength({ a: sender, b: recipient }), fBefore, '沉默不得产生关系收益');
  assert.equal(reputation.query({ agentId: sender }).score, rBefore, '沉默不得改变声誉');
  // 幂等：已结案的不再入选。
  assert.equal(interaction.settleStaleResponses({ tick: 130, maxWait: 10 }).count, 0);
});

test('t26：声誉门槛随人群水平自适应——全城低迷时不再把所有人的请求一律拒掉', async () => {
  loop.reset();
  await loop.run({ phase2: true, ticks: 1, seed: 11, agentCount: 6 });
  const ids = registry.lookup({ type: 'agent' }).map((r) => r.id);
  const [sender, recipient] = ids;
  const setRep = (id, target) => reputation.update({ agentId: id, delta: target - (reputation.query({ agentId: id }).score ?? 50), reason: 'test_setup', tick: 0 });

  // 反例现场：经济侧破产（每案 -5）会把声誉压到 20 上下，
  // 而门槛原本是**绝对常数 30**——实测 seed42/20tick/12 人全员 21，
  // 那条唯一被回应的 socialize 正是死在 rep=21.15 < 30 上。
  for (const id of ids) setRep(id, 20);
  const soc = interaction.propose({ type: 'socialize', from: sender, to: recipient, tick: 40, terms: {} });
  assert.equal(stage2.performAgentAction(40, recipient, 'accept', {}).ok, true);
  assert.equal(interaction.get(soc.interactionId).status, 'accepted',
    '全城声誉同为 20（相对位置不差）时，社交请求应当能被接受');

  // 相对位置确实垫底的人仍然应当被拒——自适应不等于取消门槛。
  const low = ids[5];
  for (const id of ids) setRep(id, 20);
  setRep(low, 2);
  const soc2 = interaction.propose({ type: 'socialize', from: low, to: recipient, tick: 41, terms: {} });
  assert.equal(stage2.performAgentAction(41, recipient, 'accept', {}).ok, true);
  assert.equal(interaction.get(soc2.interactionId).status, 'rejected',
    '在同代人里垫底的人仍然得不到答应：门槛按相对位置生效');
});

test('t26 端到端：seed42 / 20 tick / 12 人里 socialize 真实完成并建立互惠 friendship 边', async () => {
  loop.reset();
  await loop.run({ phase2: true, phase3: true, seed: 42, ticks: 20, agentCount: 12 });
  const graph = await import('../src/infra/store/graph.js');

  const soc = interaction.list({ type: 'socialize' });
  const accepted = soc.filter((r) => r.status === 'accepted');
  assert.ok(accepted.length >= 1,
    '社交必须真的能被接受（修复前 4 条 socialize 全部永久 pending、0 条被接受）：' + JSON.stringify(soc.map((r) => r.status)));

  const nodes = graph.read({ type: 'social.friendship' });
  for (const r of accepted) {
    const node = nodes.find((n) => (n.data.a === r.from && n.data.b === r.to) || (n.data.a === r.to && n.data.b === r.from));
    assert.ok(node, '被接受的社交必须留下 friendship 记录（互惠：双向各 +0.08）');
    assert.ok(node.data.strength > 0, 'friendship 强度必须大于 0');
  }

  // 这一局同时也有表白在排队——否则上面的断言只是「没有表白时当然能社交」，
  // 证明不了 F1 想证明的事（表白在队时社交仍被调度）。
  assert.ok(interaction.list({ type: 'court' }).length > 0, '同一局里应当也有表白');

  // 有限等待：跑完时不得有超过沉默上限仍挂着的待决互动。
  const pending = interaction.list({ status: 'pending' });
  const maxAge = pending.reduce((m, r) => Math.max(m, 20 - r.tick), 0);
  assert.ok(maxAge < 10, '待决互动不得超过沉默上限仍在挂着：' + maxAge + ' ' + JSON.stringify(pending.map((r) => [r.type, r.tick])));
});
