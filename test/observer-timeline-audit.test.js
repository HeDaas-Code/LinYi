import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as observer from '../src/observer/index.js';
import * as graph from '../src/infra/store/graph.js';
import * as identity from '../src/infra/identity.js';

const { recorder, chronicle, audit, timeline, exporter } = observer;

function resetAll() {
  graph.__reset();
  identity.__reset();
  recorder.__reset();
  chronicle.store.__reset();
  timeline.__reset();
}

/** 造一批可预期的记录：10 tick × 3 居民，行动由规则决定（便于断言分叉）。 */
function seedLogs({ offset = 0, swapAt = null } = {}) {
  const actions = ['eat', 'forage', 'craft'];
  for (let t = 0; t < 10; t += 1) {
    for (let a = 0; a < 3; a += 1) {
      const agentId = 'agent_' + a;
      let action = actions[(t + a) % 3];
      if (swapAt !== null && t >= swapAt && a === 0) action = 'rest';
      const decision = { action, confidence: 0.5 + a * 0.1, thought: 't' + t };
      // 走真实记录器（它自己写图），这里不再手工写一遍——否则同一 tick 会出现两份记录。
      recorder.decisionLog.record({ tick: t, agentId, decision });
      if (t % 3 === 0) {
        recorder.eventLog.record({ tick: t, agentId, topic: 'agent.action.socialize', payload: { peer: 'agent_1' } });
      }
    }
  }
}

// ---- observer.chronicle.store ----

test('chronicle.store: capture 分段落盘，同一区间幂等覆盖', () => {
  resetAll();
  seedLogs();
  const r1 = chronicle.store.capture({ fromTick: 0, toTick: 4, segmentSize: 5 });
  assert.equal(r1.id, 'seg:0-4');
  assert.equal(r1.replaced, false, '首次落盘不应标记覆盖');
  assert.ok(r1.entryCount > 0, '应有条目');

  const r2 = chronicle.store.capture({ fromTick: 0, toTick: 4, segmentSize: 5 });
  assert.equal(r2.replaced, true, '同区间重复落盘应标记覆盖');
  assert.equal(chronicle.store.list().length, 1, '同区间不应产生两个段');
  assert.equal(chronicle.store.list()[0].captures, 2, '应记录捕获次数');
});

test('chronicle.store: query 精确到 tick，range 跨段合并且有序', () => {
  resetAll();
  seedLogs();
  chronicle.store.capture({ fromTick: 0, toTick: 4 });
  chronicle.store.capture({ fromTick: 5, toTick: 9 });

  const q = chronicle.store.query({ tick: 3, agentId: 'agent_0' });
  assert.ok(q.total >= 1, 'tick 3 应有 agent_0 的记录');
  assert.ok(q.entries.every((e) => e.tick === 3 && e.agentId === 'agent_0'), '结果必须严格匹配');
  assert.ok(q.entries.every((e) => e.segment === 'seg:0-4'), '应标注来源段');

  const r = chronicle.store.range({ fromTick: 2, toTick: 6 });
  assert.ok(r.total > 0);
  for (let i = 1; i < r.entries.length; i += 1) {
    assert.ok(r.entries[i].tick >= r.entries[i - 1].tick, '区间结果应按 tick 升序');
  }
  assert.ok(r.entries.every((e) => e.tick >= 2 && e.tick <= 6), '不得越界');
  assert.equal(chronicle.store.getStats().segments, 2);

  assert.throws(() => chronicle.store.query({ tick: 'x' }), /整数 tick/);
  assert.throws(() => chronicle.store.capture({ fromTick: 5, toTick: 1 }), /不能小于/);
});

// ---- observer.audit ----

test('audit: trace 给出可引用的证据链，缺记录时明确说明', () => {
  resetAll();
  seedLogs();
  const tr = audit.trace({ agentId: 'agent_0', tick: 6, window: 2 });
  assert.equal(tr.found, true);
  assert.ok(tr.decision !== null, '应取出该 tick 的决策');
  assert.ok(['eat', 'forage', 'craft'].includes(tr.decision.action), '行动应来自记录');
  assert.ok(tr.evidence.length > 0, '应有前序证据');
  assert.ok(tr.evidence.every((e) => e.tick <= 6), '证据不得来自决策之后');
  assert.match(tr.explanation, /agent_0/);

  const miss = audit.trace({ agentId: 'agent_0', tick: 999 });
  assert.equal(miss.found, false, '无记录时应明确未找到');
  assert.match(miss.reason, /没有决策记录/);

  assert.throws(() => audit.trace({ tick: 1 }), /非空 agentId/);
  assert.throws(() => audit.trace({ agentId: 'a' }), /整数 tick/);
});

test('audit: compare 按 (tick,agentId) 对齐并报出首个分叉', () => {
  resetAll();
  const seq = (swapAt) => {
    graph.__reset(); identity.__reset(); recorder.__reset();
    seedLogs({ swapAt });
    // decision-log 的契约字段是 data.decision（不是 payload）
    return graph.read({ type: recorder.decisionLog.TYPE })
      .map((n) => ({ tick: n.data.tick, agentId: n.data.agentId, ...n.data.decision }))
      .sort((a, b) => a.tick - b.tick || a.agentId.localeCompare(b.agentId));
  };
  const A = seq(null);
  const B = seq(5);

  const same = audit.compare({ a: A, b: A });
  assert.equal(same.diverged, 0, '同一份记录不应有分叉');
  assert.equal(same.divergenceRate, 0);
  assert.equal(same.firstDivergence, null);

  const diff = audit.compare({ a: A, b: B, labelA: '基线', labelB: '变体' });
  assert.ok(diff.compared > 0);
  assert.ok(diff.diverged > 0, '改动后应出现分叉');
  assert.ok(diff.divergenceRate > 0 && diff.divergenceRate <= 1, '分叉率应在 (0,1]');
  assert.ok(diff.firstDivergence.tick >= 5, '首个分叉不应早于改动点，实际 ' + diff.firstDivergence.tick);
  assert.ok(diff.firstDivergence.diffs.some((d) => d.field === 'action'), '应报出 action 字段差异');
});

// ---- observer.timeline ----

test('timeline: 按 tick 聚合，get/report 结构完整', () => {
  resetAll();
  seedLogs();
  chronicle.store.capture({ fromTick: 0, toTick: 9 });
  timeline.__reset();

  const one = timeline.get({ tick: 3 });
  assert.equal(one.tick, 3);
  assert.ok(one.entryCount >= 3, 'tick 3 应有 3 名居民的记录');
  assert.equal(one.agentCount, 3);
  assert.equal(one.actions.length, 3, '应有 3 条决策行动');

  const empty = timeline.get({ tick: 500 });
  assert.equal(empty.entryCount, 0, '空 tick 应返回零值而非抛错');

  const r = timeline.range({ fromTick: 0, toTick: 9 });
  assert.equal(r.points, 10, '10 个 tick 应有 10 个时间点');
  for (let i = 1; i < r.timeline.length; i += 1) {
    assert.ok(r.timeline[i].tick > r.timeline[i - 1].tick, '时间点应按 tick 升序');
  }
  assert.equal(timeline.getStats().ticks, 10);
  assert.throws(() => timeline.get({}), /整数 tick/);
});

test('timeline: stride 降采样保留首尾与危机 tick', () => {
  resetAll();
  seedLogs();
  // 在 tick 7 造一个危机事件
  graph.write({
    type: recorder.eventLog.TYPE, id: 'crisis:7',
    data: { tick: 7, agentId: 'agent_0', topic: 'agent.death', payload: { cause: 'starvation' } },
  });
  chronicle.store.capture({ fromTick: 0, toTick: 9 });
  timeline.__reset();

  const full = timeline.range({ fromTick: 0, toTick: 9 });
  const sparse = timeline.range({ fromTick: 0, toTick: 9, stride: 4 });
  assert.ok(sparse.points < full.points, '降采样应减少时间点');
  const ticks = sparse.timeline.map((p) => p.tick);
  assert.ok(ticks.includes(7), '危机 tick 必须被保留，实际 ' + JSON.stringify(ticks));
  assert.ok(ticks.includes(0), '起点应被保留');

  const noKeep = timeline.range({ fromTick: 0, toTick: 9, stride: 4, keepCrisisTicks: false });
  assert.ok(!noKeep.timeline.map((p) => p.tick).includes(7), '关闭保留后危机 tick 应被抽掉');

  const capped = timeline.range({ fromTick: 0, toTick: 9, maxPoints: 3 });
  assert.equal(capped.points, 3);
  assert.equal(capped.truncated, true, '截断应被标记');
});

// ---- observer.export ----

test('export: report 与 markdown 自洽，空数据不报错', () => {
  resetAll();
  const emptyRep = exporter.report({});
  assert.equal(emptyRep.decisions.total, 0, '无数据时决策数应为 0');
  assert.match(exporter.markdown({}), /无决策记录/, '空数据应给出明确说明而非抛错');

  seedLogs();
  chronicle.store.capture({ fromTick: 0, toTick: 9 });
  timeline.__reset();

  const rep = exporter.report({ fromTick: 0, toTick: 9 });
  assert.equal(rep.decisions.total, 30, '10 tick × 3 居民 = 30 次决策');
  assert.equal(rep.decisions.activeAgents, 3);
  assert.ok(rep.decisions.distinctActions >= 2, '应统计出多种行动');
  const shareSum = rep.decisions.distribution.reduce((s, d) => s + d.share, 0);
  assert.ok(Math.abs(shareSum - 1) < 1e-9, '占比之和应为 1，实际 ' + shareSum);

  const md = exporter.markdown({ fromTick: 0, toTick: 9 });
  assert.match(md, /# 楚门小镇 · 观察者报告/);
  assert.match(md, /\| 行动 \| 次数 \| 占比 \|/, '应输出行动分布表');
  assert.match(md, /tick 0 ~ 9/, '应标注时间范围');
});

test('export: 对比段落引用 audit.compare 结果', () => {
  resetAll();
  seedLogs();
  chronicle.store.capture({ fromTick: 0, toTick: 9 });
  timeline.__reset();
  const A = graph.read({ type: recorder.decisionLog.TYPE })
    .map((n) => ({ tick: n.data.tick, agentId: n.data.agentId, ...n.data.decision }))
    .sort((a, b) => a.tick - b.tick || a.agentId.localeCompare(b.agentId));
  const B = A.map((d) => (d.agentId === 'agent_0' && d.tick >= 5 ? { ...d, action: 'rest' } : d));

  const rep = exporter.report({ fromTick: 0, toTick: 9, comparisons: [{ labelA: 'A', labelB: 'B', a: A, b: B }] });
  assert.equal(rep.comparisons.length, 1);
  assert.ok(rep.comparisons[0].diverged > 0, '应检出分叉');

  const md = exporter.markdown({ fromTick: 0, toTick: 9, comparisons: [{ labelA: 'A', labelB: 'B', a: A, b: B }] });
  assert.match(md, /## 决策对比/);
  assert.match(md, /A vs B/);
  assert.match(md, /分叉率/);
});
