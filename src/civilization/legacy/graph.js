/**
 * truman-town.civilization.legacy.graph — 历史图谱 / Legacy Graph
 *
 * 把当前文明的全部历史（编年志中的事件/行为/决策日志）汇总为知识图谱：
 * 人物（people）、事件（events）、成就（deeds）三类节点，以及
 * 「文明→人物」「人物→成就」「人物→事件」三类出向边。
 * 图谱持久化到 infra.store.graph，供遗产提取与描述生成复用。
 */

import * as graphStore from '../../infra/store/graph.js';
import * as identity from '../../infra/identity.js';
import * as chronicle from '../../observer/chronicle/compiler.js';

/** 历史图谱在 graph store 中的节点类型。 */
export const TYPE = 'civilization.legacy.graph';

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function actionOf(data) {
  return typeof data?.action === 'string' ? data.action : JSON.stringify(data?.action ?? 'unknown');
}

/**
 * 把编年志条目汇总为知识图谱并持久化。
 * @param {object} [input]
 * @param {string} [input.civilizationId] 文明 ID（缺省用 identity 生成）
 * @param {Array} [input.entries] 编年志条目；缺省从 chronicle.compile() 读取
 * @returns {object} 图谱快照 { graphId, civilizationId, tick, counts, nodes, edges }
 */
export function build(input = {}) {
  const civilizationId =
    typeof input?.civilizationId === 'string' && input.civilizationId.trim() !== ''
      ? input.civilizationId
      : identity.next('civ');
  const sourceEntries = input?.entries ?? chronicle.compile().entries;
  const entries = Array.isArray(sourceEntries) ? sourceEntries : [];

  const people = new Map();
  const events = new Map();
  const deeds = new Map();

  for (const e of entries) {
    const kind = e?.kind;
    const agentId = typeof e?.agentId === 'string' ? e.agentId : null;
    if (kind === 'event') {
      const topic = typeof e?.data?.topic === 'string' ? e.data.topic : 'unknown';
      if (!events.has(topic)) events.set(topic, { id: 'event:' + topic, label: topic, count: 0 });
      events.get(topic).count += 1;
      if (agentId) {
        if (!people.has(agentId)) people.set(agentId, { id: 'person:' + agentId, label: agentId, deeds: 0, events: 0 });
        people.get(agentId).events += 1;
      }
    } else if (kind === 'action') {
      const action = actionOf(e?.data);
      if (!deeds.has(action)) deeds.set(action, { id: 'deed:' + action, label: action, count: 0 });
      deeds.get(action).count += 1;
      if (agentId) {
        if (!people.has(agentId)) people.set(agentId, { id: 'person:' + agentId, label: agentId, deeds: 0, events: 0 });
        people.get(agentId).deeds += 1;
      }
    }
  }

  const civNodeId = 'civilization:' + civilizationId;
  const nodes = [
    { id: civNodeId, label: civilizationId, kind: 'civilization', meta: { tick: num(entries[entries.length - 1]?.tick) } },
    ...[...people.values()].map((p) => ({ id: p.id, label: p.label, kind: 'person', meta: { deeds: p.deeds, events: p.events } })),
    ...[...events.values()].map((ev) => ({ id: ev.id, label: ev.label, kind: 'event', meta: { count: ev.count } })),
    ...[...deeds.values()].map((d) => ({ id: d.id, label: d.label, kind: 'deed', meta: { count: d.count } })),
  ];

  const edges = [];
  for (const p of people.values()) {
    edges.push({ from: civNodeId, to: p.id, kind: 'has_person' });
  }
  for (const e of entries) {
    if (e?.kind === 'action' && typeof e?.agentId === 'string') {
      edges.push({ from: 'person:' + e.agentId, to: 'deed:' + actionOf(e?.data), kind: 'performed' });
    }
    if (e?.kind === 'event' && typeof e?.agentId === 'string') {
      const topic = typeof e?.data?.topic === 'string' ? e.data.topic : 'unknown';
      edges.push({ from: 'person:' + e.agentId, to: 'event:' + topic, kind: 'involved_in' });
    }
  }

  const graphId = identity.next('legacy_graph');
  const record = {
    graphId,
    civilizationId,
    builtAt: Date.now(),
    tick: num(entries[entries.length - 1]?.tick),
    counts: { people: people.size, events: events.size, deeds: deeds.size, entries: entries.length },
    nodes,
    edges,
  };
  graphStore.write({ id: graphId, type: TYPE, data: record });
  return record;
}

/**
 * 查询历史图谱。
 * - query()                 → 全部图谱数组
 * - query('id')             → 单个图谱或 null
 * - query({ id })           → 单个图谱或 null
 * - query({ civilizationId }) → 该文明的全部图谱
 */
export function query(q) {
  const all = graphStore.read({ type: TYPE });
  if (q === undefined || q === null) return all.map((n) => n.data);
  if (typeof q === 'string') {
    const n = graphStore.read(q);
    return n ? n.data : null;
  }
  if (q && typeof q.id === 'string') {
    const n = graphStore.read(q.id);
    return n ? n.data : null;
  }
  if (q && typeof q.civilizationId === 'string') {
    return all.filter((n) => n.data?.civilizationId === q.civilizationId).map((n) => n.data);
  }
  return all.map((n) => n.data);
}
