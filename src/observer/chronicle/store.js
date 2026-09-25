/**
 * truman-town.observer.chronicle.store — 编年志持久化存储。
 *
 * 把观察者日志（决策/行动/事件）编译成的编年志**分段持久化**到图存储，
 * 使长时间运行的沙盘不必把所有历史都留在内存里，且可按区间回取。
 *
 * 设计取舍：
 * - **分段（segment）而非整块**：每段覆盖连续的 tick 区间。整块存储会让
 *   "取第 1000~1100 tick" 也必须反序列化全部历史；分段后按区间过滤，
 *   代价与所需数据量成正比。
 * - **段边界由 tick 决定，不由调用时机决定**：同一 tick 区间重复写入会**覆盖**
 *   同一段（幂等）。否则重放或重跑会把同一段写进去两次，区间查询出现重复。
 * - **入图而非入内存**：复用 infra.store.graph，使编年志可被 archive 一同快照，
 *   与「文明遗产」的存档需求对齐。
 */

import * as graph from '../../infra/store/graph.js';
import * as chronicle from '../chronicle/index.js';

/** 图节点类型。 */
export const TYPE = 'observer.chronicle.segment';

const DEFAULT_SEGMENT_SIZE = 50;

/** @type {Map<string, object>} 段缓存（段 id → 段） */
let segments = new Map();

function assertTick(v, name) {
  if (!Number.isInteger(v) || v < 0) {
    throw new TypeError('chronicle.store: ' + name + ' 必须为非负整数');
  }
}

function segmentId(fromTick, toTick) {
  return 'seg:' + fromTick + '-' + toTick;
}

/**
 * 把编年编译器的条目归一化为稳定形状：
 * { kind, id, tick, agentId, payload, topic, source }
 * 各日志的原始字段名不同（decision-log → data.decision；event-log → data.payload；
 * action-log → data.action），这里按 kind 分派，下游就不必再猜。
 */
function normalizeEntry(node) {
  const d = node && typeof node.data === 'object' && node.data !== null ? node.data : {};
  const kind = node.kind ?? 'unknown';
  const payload = kind === 'decision'
    ? (d.decision ?? null)
    : kind === 'action'
      ? (d.action ?? null)
      : (d.payload ?? null);
  return {
    kind,
    id: node.id ?? '',
    tick: node.tick,
    seq: node.seq,
    agentId: node.agentId ?? null,
    payload,
    topic: d.topic ?? null,
    source: kind === 'decision' ? 'observer.decision'
      : kind === 'action' ? 'observer.action' : 'observer.event',
  };
}

/**
 * 把一段 tick 区间编译并落盘。
 * 同一区间重复调用为幂等覆盖（重放安全）。
 *
 * @param {{ fromTick?: number, toTick?: number, segmentSize?: number,
 *           bucketSize?: number, agentId?: string, now?: number }} [input]
 */
export function capture(input = {}) {
  const segmentSize = Number.isInteger(input.segmentSize) && input.segmentSize > 0
    ? input.segmentSize : DEFAULT_SEGMENT_SIZE;
  assertTick(input.fromTick ?? 0, 'fromTick');
  const fromTick = input.fromTick ?? 0;
  const toTick = Number.isInteger(input.toTick) ? input.toTick : fromTick + segmentSize - 1;
  if (toTick < fromTick) throw new RangeError('chronicle.store: toTick 不能小于 fromTick');

  const compiled = chronicle.compiler.compile({
    fromTick,
    toTick,
    agentId: input.agentId,
    bucketSize: input.bucketSize ?? 1,
  });

  // 归一化：编年编译器的条目把原始字段放在 .data 下（kind/id/tick/agentId 在外层）。
  // 下游需要的是"这条记录说了什么"，故在此统一展开为 payload/topic，
  // 避免每个消费者各自猜 .payload/.decision/.data.decision（实测因此静默读到 undefined）。
  const entries = compiled.entries.map(normalizeEntry);

  const id = segmentId(fromTick, toTick);
  const segment = {
    id,
    fromTick,
    toTick,
    counts: compiled.counts,
    entryCount: entries.length,
    captures: 1,
    capturedAt: typeof input.now === 'number' ? input.now : compiled.compiledAt,
    entries,
  };
  const prev = segments.get(id);
  if (prev !== undefined) segment.captures = prev.captures + 1;

  segments.set(id, segment);
  // 入图：使编年志可随 archive 一起被快照/回滚。
  graph.write({ type: TYPE, id, data: { fromTick, toTick, counts: segment.counts, entryCount: segment.entryCount } });
  return { id, fromTick, toTick, entryCount: segment.entryCount, counts: segment.counts, replaced: prev !== undefined };
}

/**
 * 按 tick 精确查询（该 tick 落在哪个段，就返回该段的匹配条目）。
 * @param {{ tick?: number, agentId?: string, kind?: string, limit?: number }} [input]
 */
export function query(input = {}) {
  if (!Number.isInteger(input.tick)) throw new TypeError('chronicle.store.query: 需要整数 tick');
  const hits = [];
  for (const seg of orderedSegments()) {
    if (input.tick < seg.fromTick || input.tick > seg.toTick) continue;
    for (const e of seg.entries) {
      if (e.tick !== input.tick) continue;
      if (input.agentId !== undefined && e.agentId !== input.agentId) continue;
      if (input.kind !== undefined && e.kind !== input.kind) continue;
      hits.push({ ...e, segment: seg.id });
    }
  }
  const limit = Number.isInteger(input.limit) && input.limit > 0 ? input.limit : hits.length;
  return { tick: input.tick, total: hits.length, entries: hits.slice(0, limit) };
}

/**
 * 按 tick 区间查询（跨段合并，按 tick 升序）。
 * @param {{ fromTick?: number, toTick?: number, agentId?: string, kind?: string, limit?: number }} [input]
 */
export function range(input = {}) {
  const from = Number.isInteger(input.fromTick) ? input.fromTick : -Infinity;
  const to = Number.isInteger(input.toTick) ? input.toTick : Infinity;
  const out = [];
  for (const seg of orderedSegments()) {
    if (seg.toTick < from || seg.fromTick > to) continue;
    for (const e of seg.entries) {
      if (e.tick < from || e.tick > to) continue;
      if (input.agentId !== undefined && e.agentId !== input.agentId) continue;
      if (input.kind !== undefined && e.kind !== input.kind) continue;
      out.push({ ...e, segment: seg.id });
    }
  }
  out.sort((a, b) => (a.tick - b.tick) || String(a.id ?? '').localeCompare(String(b.id ?? '')));
  const limit = Number.isInteger(input.limit) && input.limit > 0 ? input.limit : out.length;
  return { fromTick: from === -Infinity ? null : from, toTick: to === Infinity ? null : to, total: out.length, entries: out.slice(0, limit) };
}

function orderedSegments() {
  return [...segments.values()].sort((a, b) => (a.fromTick - b.fromTick) || (a.toTick - b.toTick));
}

/** 已落盘段的清单（不含条目正文）。 */
export function list() {
  return orderedSegments().map((s) => ({
    id: s.id, fromTick: s.fromTick, toTick: s.toTick,
    entryCount: s.entryCount, counts: s.counts,
    captures: s.captures, capturedAt: s.capturedAt,
  }));
}

export function getStats() {
  const all = orderedSegments();
  let entries = 0;
  let minTick = null;
  let maxTick = null;
  for (const s of all) {
    entries += s.entryCount;
    if (minTick === null || s.fromTick < minTick) minTick = s.fromTick;
    if (maxTick === null || s.toTick > maxTick) maxTick = s.toTick;
  }
  return { segments: all.length, entries, minTick, maxTick };
}

export function __reset() {
  segments = new Map();
  for (const n of graph.read({ type: TYPE })) graph.write({ type: TYPE, id: n.id, data: {}, edges: [] });
}
