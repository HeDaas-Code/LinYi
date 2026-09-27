/**
 * t9 — 日志、图节点与记忆的长期增长上限（retention）
 *
 * 锁定三类契约：
 *   1) 审计日志（决策/行为/事件）**不因上限而丢记录**：list()/all() 恒为全量，
 *      超出热区的旧记录只压缩载荷，仍可审计。
 *   2) 工作集（帖子）与派生记忆（语义/情景）真正淘汰，但
 *      **图与内存索引必须同步**——裁剪不得留下无人引用的孤儿图节点，
 *      且恢复/重建后上限必须重新收敛。
 *   3) 引用不悬空：lookup() 能区分 hot / compact(archived) / evicted / unknown。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as graph from '../src/infra/store/graph.js';
import * as hotLog from '../src/infra/store/hot-log.js';
import * as decisionLog from '../src/observer/recorder/decision-log.js';
import * as actionLog from '../src/observer/recorder/action-log.js';
import * as eventLog from '../src/observer/recorder/event-log.js';
import * as history from '../src/observer/history.js';
import * as recorder from '../src/observer/recorder/index.js';
import * as semantic from '../src/agent/memory/semantic.js';
import * as episodic from '../src/agent/memory/episodic/store.js';
import * as posts from '../src/social/platform/posts.js';
import * as state from '../src/runtime/state.js';

/** 把三个日志的热上限压到很小，让裁剪路径在小规模下即可触发（显式 opt-in）。 */
function shrinkLogLimits(limit) {
  hotLog.configureRetention('decision', { hotLimit: limit });
  hotLog.configureRetention('action', { hotLimit: limit });
  hotLog.configureRetention('event', { hotLimit: limit });
}

/**
 * 恢复默认（保真）上限。
 *
 * 上限是 hot-log 的**模块级**状态，会跨用例残留——不恢复的话，
 * 前面用例设过的上限会泄漏到后面，把「默认保真」的断言污染成「已开启压缩」。
 */
function restoreDefaultLimits() {
  for (const name of ['decision', 'action', 'event']) {
    hotLog.configureRetention(name, { hotLimit: Infinity });
  }
}

function resetAll() {
  restoreDefaultLimits();
  graph.__reset();
  // recorder.__reset() 复位**共享**日志序号器（_shared.nextSeq）。
  // 各日志自己的 __reset 只清各自的归档，不复位共享序号——不复位的话
  // 上一用例用掉的 seq 会顺延，本用例的 obs.decision.1 根本不存在。
  recorder.__reset();
  decisionLog.__reset();
  actionLog.__reset();
  eventLog.__reset();
  semantic.__reset();
  episodic.__reset();
  posts.__reset();
  graph.__reset();
  hotLog.__reset();
}

test('retention: graph 原语 remove/count/ids/patch 语义正确', () => {
  graph.__reset();
  for (const id of ['a', 'b', 'c']) graph.write({ id, type: 't', data: { id } });
  assert.equal(graph.count({ type: 't' }), 3);
  assert.equal(graph.count(), 3);
  assert.deepEqual(graph.ids({ type: 't' }), ['a', 'b', 'c']);

  // patch 必须原地替换，**不得**改变索引顺序（顺序即追加顺序 = 审计顺序）
  assert.equal(graph.patch('a', { id: 'a', patched: true }), true);
  assert.deepEqual(graph.ids({ type: 't' }), ['a', 'b', 'c'], 'patch 不得重排顺序');
  assert.equal(graph.read('a').data.patched, true);

  assert.equal(graph.remove('b'), true);
  assert.equal(graph.remove('b'), false, '重复删除应返回 false');
  assert.equal(graph.count({ type: 't' }), 2);
  assert.deepEqual(graph.ids({ type: 't' }), ['a', 'c']);
});

test('retention: 审计日志超出热区后 list() 仍返回全量（只压缩载荷，不删记录）', () => {
  resetAll();
  shrinkLogLimits(100);
  const N = 1200;
  for (let i = 1; i <= N; i += 1) {
    decisionLog.record({
      tick: i, agentId: 'a1', decisionId: 'd' + i, decision: { action: 'act' + i }, reason: 'r' + i,
      options: [{ big: 'x'.repeat(300) }], context: { big: 'y'.repeat(300) },
    });
  }
  const st = decisionLog.stats();
  assert.equal(decisionLog.list().length, N, 'list() 必须仍是全量——上限不得替代审计历史');
  assert.equal(decisionLog.all().length, N);
  assert.equal(st.total, N);
  // 批量压缩：一次压到上限之下若干条，避免每次写入都全图清点（否则 O(n²)）。
  // 因此稳态是 hot <= hotLimit，而不是恰好相等。
  assert.ok(st.hot <= st.hotLimit, '热区必须收敛到上限之内');
  // 压缩是批量的（一次压到上限之下若干条），故 compacted 略多于 N - hotLimit；
  // 恒等式是「热区 + 已压缩 = 全量」，记录一条都没丢。
  assert.equal(st.compacted, st.total - st.hot);
  assert.equal(st.evicted, 0, 'compact 模式不得删除记录');
  assert.equal(graph.count({ type: decisionLog.TYPE }), N);
});

test('retention: 被压缩的旧决策仍保留审计骨架（谁/何时/选了什么/为什么）', () => {
  resetAll();
  shrinkLogLimits(10);
  decisionLog.record({
    tick: 1, agentId: 'a1', decisionId: 'd1', decision: { action: 'forage' }, reason: '饿',
    options: [{ big: 'x'.repeat(500) }], context: { big: 'y'.repeat(500) },
  });
  for (let i = 2; i <= 40; i += 1) {
    decisionLog.record({ tick: i, agentId: 'a1', decisionId: 'd' + i, decision: { action: 'eat' }, reason: 'r' });
  }
  const old = decisionLog.lookup('obs.decision.1');
  assert.equal(old.found, true);
  assert.equal(old.source, 'compact');
  assert.equal(old.verbosity, 'summary');
  assert.equal(old.record.tick, 1, '归档后仍须知道发生在哪个 tick');
  assert.equal(old.record.agentId, 'a1', '归档后仍须知道是谁');
  assert.deepEqual(old.record.decision, { action: 'forage' }, '归档后仍须知道选了什么');
  assert.equal(old.record.reason, '饿', '归档后仍须知道为什么');
  // 保结构压缩：options 仍在，只是长字符串被截短、长数组被截短（不是被丢弃）。
  assert.ok(Array.isArray(old.record.options), 'options 必须保留为数组，便于候选审计');
  assert.ok(JSON.stringify(old.record.options).length < 500, 'options 必须被压缩到有界');
});

test('retention: 开启压缩后，审计判定字段仍可按路径读取（保结构而非丢字段）', () => {
  resetAll();
  shrinkLogLimits(5);
  const dNode = decisionLog.record({
    tick: 1, agentId: 'a1', decisionId: 'd1', decision: { action: 'forage' }, reason: 'r',
    options: Array.from({ length: 40 }, (_, i) => ({ id: 'opt' + i, big: 'x'.repeat(300) })),
    context: { contention: { doomedButChosen: true, remainingBefore: -1 }, big: 'y'.repeat(2000) },
    schedule: { feasible: false, suggested: 'work' },
    final: { score: 1, source: 'rule' },
  });
  const aNode = actionLog.record({
    tick: 1, agentId: 'a1', action: 'forage', decisionId: 'd1',
    outcome: { status: 'noop', reason: 'forage_pool_empty', big: 'z'.repeat(2000) },
  });
  for (let i = 2; i <= 30; i += 1) {
    decisionLog.record({ tick: i, agentId: 'a1', decision: { action: 'eat' } });
    actionLog.record({ tick: i, agentId: 'a1', action: 'eat', outcome: { status: 'ok' } });
  }

  const d = decisionLog.lookup(dNode.id);
  assert.equal(d.source, 'compact');
  // 关键：嵌套判定字段仍可按路径访问（这正是「丢字段式压缩」会毁掉的东西）
  assert.equal(d.record.context.contention.doomedButChosen, true, 'context 的嵌套判定字段必须可读');
  assert.equal(d.record.context.contention.remainingBefore, -1);
  assert.equal(d.record.schedule.feasible, false, 'schedule.feasible 必须可读');
  assert.equal(d.record.final.source, 'rule', 'final.source 必须可读');
  assert.ok(d.record.context.big.length <= 161, '长字符串必须被截短');
  assert.ok(d.record.options.length <= 12, '长数组必须被截短');

  const a = actionLog.lookup(aNode.id);
  assert.equal(a.source, 'compact');
  // 执行证据是审计链的关键：status 必须原样保留
  assert.equal(a.record.outcome.status, 'noop', 'outcome.status 必须保留——空操作不得记成功');
  assert.equal(a.record.outcome.reason, 'forage_pool_empty', 'outcome 的判定理由必须保留');
  assert.equal(a.record.decisionId, 'd1', '关联决策 id 必须保留，引用不得悬空');
  assert.ok(a.record.outcome.big.length <= 161, 'outcome 的长字符串必须被截短');
});

test('retention: 事件日志归档保留 payload 的结构与内容，审计不失真', () => {
  resetAll();
  shrinkLogLimits(5);
  // 序号器是三条日志**共享**的，因此不能假设 obs.event.1 属于本用例——
  // 必须用 record() 的返回值取真实 id。
  const first = eventLog.record({ tick: 1, topic: 'weather.changed', payload: { to: 'rain', detail: 'z'.repeat(400), nested: { k: 1 } } });
  for (let i = 2; i <= 30; i += 1) eventLog.record({ tick: i, topic: 'tick', payload: { i } });
  const old = eventLog.lookup(first.id);
  assert.equal(old.source, 'compact');
  assert.equal(old.record.topic, 'weather.changed');
  assert.equal(typeof old.record.payload, 'object', 'payload 必须保留为对象（保结构）');
  assert.equal(old.record.payload.to, 'rain', '归档载荷的关键字段仍应可读');
  assert.equal(old.record.payload.nested.k, 1, '嵌套结构仍可按路径读取');
  assert.ok(old.record.payload.detail.length <= 161, '长字符串必须被截短以保证有界');
});

test('retention: 四个日志的上限策略可断言且总记录数不因上限减少', () => {
  resetAll();
  shrinkLogLimits(20);
  for (let i = 1; i <= 60; i += 1) {
    actionLog.record({ tick: i, agentId: 'a1', action: { kind: 'move' }, outcome: { big: 'x'.repeat(200) } });
    eventLog.record({ tick: i, topic: 'tick', payload: { i } });
  }
  const bounded = history.assertBounded();
  assert.equal(bounded.ok, true, '上限必须全部生效：' + JSON.stringify(bounded.violations));
  assert.equal(actionLog.list().length, 60);
  assert.equal(eventLog.list().length, 60);
  assert.equal(history.all({ log: 'action' }).length, 60, 'history.all 也必须是全量');
});

test('retention: 语义记忆裁剪必须同步删图节点（不留孤儿），重建后仍守上限', () => {
  resetAll();
  const CAP = 8;
  for (let i = 0; i < 50; i += 1) {
    semantic.store('a1', { content: '记忆 ' + i, salience: 0.5 }, { maxEntries: CAP, persist: true });
  }
  assert.equal(semantic.list('a1').length, CAP, '内存索引守上限');
  assert.equal(graph.count({ type: 'memory.semantic' }), CAP,
    '图里不得留下无人引用的孤儿节点（这是『语义内存裁剪不能留下不可追踪的图节点』的核心契约）');

  // 重建（模拟存档恢复 / graph 复位）后上限必须重新收敛
  graph.__restore(graph.__snapshot());
  assert.equal(semantic.list('a1').length, CAP, '重建后上限不得被突破');
  assert.equal(graph.count({ type: 'memory.semantic' }), CAP, '重建后不得留孤儿');
});

test('retention: 情景记忆按主体设上限，图与索引一致且无孤儿', () => {
  resetAll();
  for (let i = 0; i < 700; i += 1) {
    episodic.write('a1', { ts: i, content: 'episode ' + i, emotion: 'joy', salience: 0.5, tags: ['t'] });
    episodic.write('a2', { ts: i, content: 'ep2 ' + i, emotion: 'fear', salience: 0.4, tags: ['t'] });
  }
  const st = episodic.stats();
  // stats().hot 是**跨主体合计**，而 hotLimit 是每主体上限，故只能逐主体断言。
  assert.ok(episodic.list('a1').length <= st.hotLimit, 'a1 热区必须守上限');
  assert.ok(episodic.list('a2').length <= st.hotLimit, 'a2 热区必须守上限');
  assert.equal(st.graphNodes, st.hot, '图节点数必须等于索引条数（无孤儿）');
  assert.ok(st.evicted > 0, '超出部分必须被淘汰并归档');
  assert.ok(st.archived > 0, '淘汰的记录必须进入归档，历史仍可查');

  graph.__restore(graph.__snapshot());
  const st2 = episodic.stats();
  assert.equal(st2.graphNodes, st2.hot, '重建后仍不得留孤儿');
  assert.ok(episodic.list('a1').length <= st2.hotLimit, '重建后 a1 仍守上限');
  assert.ok(episodic.list('a2').length <= st2.hotLimit, '重建后 a2 仍守上限');
});

test('retention: 情景记忆 lookup 四态齐备，引用不悬空', () => {
  resetAll();
  for (let i = 0; i < 400; i += 1) episodic.write('a1', { ts: i, content: 'e' + i });
  const hotId = episodic.list('a1')[0].memoryId;
  const archivedIds = episodic.archived('a1').map((r) => r.memoryId);
  assert.ok(archivedIds.length > 0, '前置条件：应已有被淘汰的情景');

  assert.equal(episodic.lookup(hotId).source, 'hot');
  assert.equal(episodic.lookup(archivedIds[0]).source, 'archived');
  assert.equal(episodic.lookup('mem_999999999999').source, 'unknown');
});

test('retention: 帖子作为工作集真正淘汰并归档，feed 仍可读', () => {
  resetAll();
  for (let i = 0; i < 700; i += 1) posts.publish({ authorId: 'a' + (i % 4), content: 'post ' + i, tick: i });
  const st = posts.stats();
  assert.ok(st.total <= st.hotLimit, '帖子必须守上限');
  assert.ok(st.archive > 0, '被淘汰的帖子必须进入归档');
  assert.equal(st.evicted, st.archive + st.dropped, '淘汰计数须与归档一致');
  assert.ok(posts.list().length > 0, 'feed 仍必须有帖子可读');

  const archivedId = posts.archived()[0].id;
  const r = posts.lookup(archivedId);
  assert.equal(r.source, 'archive');
  assert.equal(posts.lookup('post_999999999999').source, 'unknown');
});

test('retention: state.js 已注册热数据归档 section 且可往返', () => {
  resetAll();
  const names = state.inventory().map((s) => s.name);
  assert.ok(names.includes('logArchive'), 'logArchive 必须进入状态清单（否则恢复后归档丢失）');
  assert.equal(names.indexOf('graph'), 0, 'graph 必须最先恢复');
  assert.ok(names.indexOf('logArchive') > names.indexOf('graph'), '归档必须在 graph 之后恢复');

  shrinkLogLimits(5);
  for (let i = 1; i <= 40; i += 1) eventLog.record({ tick: i, topic: 'tick', payload: { i } });
  const before = eventLog.stats();
  const snapshot = state.capture();
  state.restore(snapshot);
  const after = eventLog.stats();
  assert.equal(after.total, before.total, '恢复后总记录数必须一致');
  assert.equal(after.compacted, before.compacted, '恢复后压缩计数必须一致（压缩随图节点一起入档）');
  assert.equal(after.maxSeq, before.maxSeq, '恢复后序号水位必须一致');
});

test('retention: 长跑后受控类型的节点数保持有界（不随时间线性增长）', () => {
  resetAll();
  shrinkLogLimits(200);
  // 直接构造长跑等价的写入量，避免依赖完整主循环的耗时。
  for (let tick = 1; tick <= 2000; tick += 1) {
    for (let a = 0; a < 4; a += 1) {
      decisionLog.record({ tick, agentId: 'a' + a, decision: { action: 'x' }, context: { big: 'y'.repeat(200) } });
      actionLog.record({ tick, agentId: 'a' + a, action: { kind: 'x' }, outcome: { big: 'y'.repeat(200) } });
      eventLog.record({ tick, topic: 'tick', payload: { tick, big: 'y'.repeat(200) } });
    }
  }
  const st = { d: decisionLog.stats(), a: actionLog.stats(), e: eventLog.stats() };
  for (const [k, s] of Object.entries(st)) {
    assert.ok(s.hot <= s.hotLimit, k + ': 热区必须收敛到上限之内');
    assert.ok(s.hot > 0, k + ': 热区不得被压空');
    assert.equal(s.evicted, 0, k + ': compact 模式不得删记录');
    assert.equal(s.total, 8000, k + ': 审计总量不得因上限减少');
  }
  assert.equal(history.assertBounded().ok, true);
  // 热区载荷有界 ⇒ 内存占用不随 tick 增长
  const hotBytes = decisionLog.hot().reduce((n, node) => n + JSON.stringify(node.data).length, 0);
  const totalBytes = decisionLog.all().reduce((n, node) => n + JSON.stringify(node.data).length, 0);
  assert.ok(hotBytes * 4 < totalBytes, '热区载荷应远小于全量载荷（压缩确实生效）');
});

test('retention: 默认配置下审计日志保真——不压缩、不丢字段（上限只可显式开启）', () => {
  resetAll();
  // 不调用 shrinkLogLimits：使用模块默认配置。
  const N = 2000;
  for (let i = 1; i <= N; i += 1) {
    decisionLog.record({
      tick: i, agentId: 'a1', decisionId: 'd' + i, decision: { action: 'x' }, reason: 'r' + i,
      options: [{ k: 'a' }, { k: 'b' }], context: { contention: { doomedButChosen: true } },
      intent: { action: 'y' }, model: { applied: false }, schedule: { feasible: false }, final: { score: 1 },
    });
  }
  const st = decisionLog.stats();
  assert.equal(st.hotLimit, null, '默认必须是保真模式（不设热上限）');
  assert.equal(st.unbounded, true);
  assert.equal(st.compacted, 0, '默认不得压缩任何记录');
  assert.equal(st.evicted, 0, '默认不得淘汰任何记录');
  assert.equal(st.total, N);
  assert.equal(decisionLog.list().length, N);

  // 关键：默认模式下**每个字段**都必须完整，否则读取方会静默拿到 undefined。
  const d = decisionLog.list()[0].data;
  for (const field of ['options', 'context', 'intent', 'model', 'schedule', 'final', 'decision', 'reason', 'decisionId']) {
    assert.ok(d[field] !== undefined, '保真模式下字段 ' + field + ' 不得缺失');
  }
  assert.equal(d.context.contention.doomedButChosen, true, '嵌套结构必须保持可访问（不能截断成字符串）');
  assert.equal(history.assertBounded().ok, true);
});

test('retention: 显式 configureRetention 才开启载荷分级，且 list() 仍是全量', () => {
  resetAll();
  for (let i = 1; i <= 300; i += 1) decisionLog.record({ tick: i, agentId: 'a1', decision: { action: 'x' } });
  assert.equal(decisionLog.stats().compacted, 0, '开启前不压缩');

  hotLog.configureRetention('decision', { hotLimit: 50 });
  decisionLog.record({ tick: 301, agentId: 'a1', decision: { action: 'x' } });
  const st = decisionLog.stats();
  assert.ok(st.compacted > 0, '显式开启后应开始压缩');
  assert.equal(st.total, 301, '压缩不得减少记录条数');
  assert.equal(decisionLog.list().length, 301, 'list() 仍必须是全量');
  assert.equal(st.evicted, 0, 'compact 模式永不删除记录');
  assert.equal(history.assertBounded().ok, true);
});


// ---- memoryPersist OFF → ON 的等价性 ----

/**
 * 打开记忆落盘**不得改变仿真结果**。
 *
 * memoryPersist 决定的是「语义记忆是否写进图」，属于观测/持久化开关，
 * 不是仿真参数。若打开后居民行为发生变化，说明记忆写入反过来影响了决策
 * （例如把「记录」当成了「状态」），那所有基于存档的实验都不可信。
 */
test('retention: memoryPersist OFF→ON 不改变仿真结果，只增加记忆节点', async () => {
  const loop = await import('../src/runtime/orchestrator/loop.js');
  const BASE = { seed: 11, agentCount: 4, phase2: true, phase3: true };

  const digestOf = () => {
    const snap = loop.snapshot();
    return {
      tick: snap.tick,
      committedTick: snap.committedTick,
      agents: snap.agents.map((a) => ({ id: a.id, data: a.data })),
    };
  };

  loop.reset();
  await loop.run({ ...BASE, ticks: 4, memoryPersist: false });
  const off = digestOf();
  const offMem = graph.count({ type: 'memory.semantic' });

  loop.reset();
  await loop.run({ ...BASE, ticks: 4, memoryPersist: true });
  const on = digestOf();
  const onMem = graph.count({ type: 'memory.semantic' });

  assert.equal(on.tick, off.tick, '开关不得改变推进的 tick 数');
  assert.equal(on.committedTick, off.committedTick, '开关不得改变提交边界');
  assert.deepEqual(on.agents, off.agents, '开关不得改变任何居民的状态');
  assert.ok(onMem >= offMem, '打开开关只应增加记忆节点，不应减少');
  assert.ok(onMem > 0, '打开开关后必须确实写入了记忆节点（否则开关是装饰性的）');
});

/**
 * 同一种子跑两遍，保留层的统计必须完全一致。
 * 上限策略若引入任何非确定性（例如依赖 Map 迭代顺序或时间），
 * 长跑的可复现性就会丧失。
 */
test('retention: 保留层统计在同一配置下可复现', async () => {
  const loop = await import('../src/runtime/orchestrator/loop.js');
  const runOnce = async () => {
    loop.reset();
    await loop.run({ seed: 5, agentCount: 4, phase2: true, phase3: true, ticks: 3 });
    return {
      logs: history.stats(),
      episodic: (() => { const s = episodic.stats(); return { hot: s.hot, archived: s.archived, evicted: s.evicted }; })(),
      posts: (() => { const s = posts.stats(); return { total: s.total, archive: s.archive }; })(),
    };
  };
  const a = await runOnce();
  const b = await runOnce();
  assert.deepEqual(b, a, '同种子同配置下保留层统计必须一致');
});

/**
 * 跨 run 复位：保留层的归档与计数不得跨局累加。
 *
 * hot-log / episodic 的归档是模块级状态，不随 graph.__reset 走。
 * 不复位的话新一局会继承上一局的 evicted/compacted 计数，
 * 且 lookup() 会把本局从未存在的 id 判成「已淘汰」——
 * 审计结论从「这条引用无效」静默变成「这条引用被裁剪过」。
 */
test('retention: 跨 run reset 后归档与计数不残留', async () => {
  const loop = await import('../src/runtime/orchestrator/loop.js');
  resetAll();

  // 先直接制造淘汰与归档（比跑够 tick 更快且确定），再跑一小段真实仿真。
  for (let i = 0; i < 400; i += 1) episodic.write('a1', { ts: i, content: 'e' + i });
  for (let i = 0; i < 400; i += 1) posts.publish({ authorId: 'a1', content: 'p' + i, tick: i });
  const before = { episodic: episodic.stats().evicted, posts: posts.stats().evicted };
  assert.ok(before.episodic > 0, '前置条件：应已产生情景淘汰');
  assert.ok(before.posts > 0, '前置条件：应已产生帖子淘汰');

  loop.reset();
  await loop.run({ seed: 3, agentCount: 4, phase2: true, phase3: true, ticks: 3 });

  loop.reset();
  const after = {
    episodicEvicted: episodic.stats().evicted,
    episodicArchived: episodic.stats().archived,
    postsEvicted: posts.stats().evicted,
    postsArchive: posts.stats().archive,
    decision: decisionLog.stats(),
    action: actionLog.stats(),
    event: eventLog.stats(),
  };
  assert.equal(after.episodicEvicted, 0, 'loop.reset 后情景淘汰计数必须归零');
  assert.equal(after.episodicArchived, 0, 'loop.reset 后情景归档必须清空');
  assert.equal(after.postsEvicted, 0, 'loop.reset 后帖子淘汰计数必须归零');
  assert.equal(after.postsArchive, 0, 'loop.reset 后帖子归档必须清空');
  for (const [k, st] of Object.entries({ decision: after.decision, action: after.action, event: after.event })) {
    assert.equal(st.evicted, 0, k + ': reset 后淘汰计数必须归零');
    assert.equal(st.archive, 0, k + ': reset 后归档必须清空');
    assert.equal(st.compacted, 0, k + ': reset 后压缩计数必须归零');
    assert.equal(st.maxSeq, -1, k + ': reset 后序号水位必须归零（否则未知 id 会被误判为已淘汰）');
  }

  // 新一局里，本局从未存在的 id 必须判为 unknown，而不是 evicted
  assert.equal(decisionLog.lookup('obs.decision.999999').source, 'unknown');
});
