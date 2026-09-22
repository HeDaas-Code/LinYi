/**
 * truman-town.civilization.legacy.summary.extractor — 遗产提取器 / Legacy Extractor
 *
 * 从历史图谱中提取关键事件、人物与成就，供描述撰写与文明重启继承使用。
 */

import * as legacyGraph from '../graph.js';

function resolveGraph(input) {
  if (input?.graph) return input.graph;
  const list = legacyGraph.query(input?.civilizationId === undefined ? undefined : { civilizationId: input.civilizationId });
  const graphs = Array.isArray(list) ? list : [list].filter(Boolean);
  if (graphs.length === 0) return null;
  return graphs[graphs.length - 1];
}

/**
 * 从历史图谱提取关键事件、人物与成就。
 * @param {object} [input]
 * @param {object} [input.graph] 图谱快照；缺省取最近一张图谱
 * @param {string} [input.civilizationId] 按文明筛选
 * @returns {object} { events, people, deeds, keyEvents, keyPeople, keyDeeds, summary }
 */
export function extract(input = {}) {
  const graph = resolveGraph(input);
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];

  const events = nodes
    .filter((n) => n.kind === 'event')
    .map((n) => ({ topic: n.label, count: n.meta?.count ?? 0 }))
    .sort((a, b) => b.count - a.count);
  const people = nodes
    .filter((n) => n.kind === 'person')
    .map((n) => ({ agentId: n.label, deeds: n.meta?.deeds ?? 0, events: n.meta?.events ?? 0 }))
    .sort((a, b) => (b.deeds + b.events) - (a.deeds + a.events));
  const deeds = nodes
    .filter((n) => n.kind === 'deed')
    .map((n) => ({ action: n.label, count: n.meta?.count ?? 0 }))
    .sort((a, b) => b.count - a.count);

  return {
    events,
    people,
    deeds,
    keyEvents: events.slice(0, 5),
    keyPeople: people.slice(0, 5),
    keyDeeds: deeds.slice(0, 5),
    summary: {
      eventCount: events.length,
      peopleCount: people.length,
      deedCount: deeds.length,
      totalEntries: graph?.counts?.entries ?? 0,
    },
  };
}

/**
 * 提取事件列表。
 * - events({ graph })    → 从图谱提取事件节点（topic + count）
 * - events({ entries })  → 从编年志条目中筛出 kind === 'event'
 */
export function events(input = {}) {
  if (input?.graph) return extract({ graph: input.graph }).events;
  const entries = Array.isArray(input?.entries) ? input.entries : [];
  return entries
    .filter((e) => e?.kind === 'event')
    .map((e) => ({ tick: e.tick, topic: e?.data?.topic ?? 'unknown', agentId: e?.agentId ?? null }));
}
