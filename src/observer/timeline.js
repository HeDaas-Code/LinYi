/**
 * truman-town.observer.timeline — 时间线。
 *
 * 把编年志段拉平成**按 tick 排序的连续时间线**，供导出与人工回看。
 * 与 chronicle.store 的分工：store 负责"存得住"，timeline 负责"读得顺"。
 *
 * 设计取舍：
 * - **按 tick 聚合**：同一 tick 的决策/行动/事件会被归入同一个时间点。
 *   观察者想知道的是"那一刻发生了什么"，而不是三份互不相干的日志。
 * - **不丢信息**：聚合结果保留每条原始记录的 kind/source，聚合只是**视图**。
 * - **可降采样**：长跑（数千 tick）产生的时间线无法人读，
 *   stride 参数按固定间隔抽稀，且**永远保留首尾与危机 tick**。
 */

import * as chronicle from './chronicle/index.js';
import * as audit from './audit.js';

/** @type {Array<object>|null} 惰性缓存 */
let cache = null;

function build() {
  const out = [];
  for (const seg of chronicle.store.list()) {
    const r = chronicle.store.range({ fromTick: seg.fromTick, toTick: seg.toTick });
    for (const e of r.entries) out.push(e);
  }
  out.sort((a, b) => (a.tick - b.tick) || String(a.id ?? '').localeCompare(String(b.id ?? '')));
  return out;
}

function ensure() {
  if (cache === null) cache = build();
  return cache;
}

function groupByTick(entries, fromTick, toTick) {
  const byTick = new Map();
  for (const e of entries) {
    if (e.tick < fromTick || e.tick > toTick) continue;
    if (!byTick.has(e.tick)) byTick.set(e.tick, { tick: e.tick, entries: [], agents: new Set(), actions: [] });
    const g = byTick.get(e.tick);
    g.entries.push(e);
    if (e.agentId !== null && e.agentId !== undefined) g.agents.add(e.agentId);
    // 决策内容可能是纯字符串（主循环）或对象（其它调用方），统一归一化。
    if (e.kind === 'decision') g.actions.push(audit.describeDecision(e.payload).action);
  }
  return [...byTick.values()]
    .sort((a, b) => a.tick - b.tick)
    .map((g) => ({
      tick: g.tick,
      entryCount: g.entries.length,
      agentCount: g.agents.size,
      actions: g.actions,
      entries: g.entries,
    }));
}

/**
 * 取某一 tick 的时间点。
 * @param {{ tick?: number }} [input]
 */
export function get(input = {}) {
  if (!Number.isInteger(input.tick)) throw new TypeError('observer.timeline.get: 需要整数 tick');
  const points = groupByTick(ensure(), input.tick, input.tick);
  return points.length > 0
    ? points[0]
    : { tick: input.tick, entryCount: 0, agentCount: 0, actions: [], entries: [] };
}

/**
 * 取一段 tick 区间的时间线。
 * @param {{ fromTick?: number, toTick?: number, stride?: number,
 *           keepCrisisTicks?: boolean, maxPoints?: number }} [input]
 */
export function range(input = {}) {
  const all = ensure();
  const ticks = all.map((e) => e.tick);
  const fromTick = Number.isInteger(input.fromTick) ? input.fromTick : (ticks.length > 0 ? Math.min(...ticks) : 0);
  const toTick = Number.isInteger(input.toTick) ? input.toTick : (ticks.length > 0 ? Math.max(...ticks) : 0);
  let points = groupByTick(all, fromTick, toTick);

  // 危机 tick：该 tick 出现了死亡/破产类事件，降采样时永不丢弃。
  const keepCrisis = input.keepCrisisTicks !== false;
  const isCrisis = (p) => p.entries.some((e) => {
    const t = String(e.topic ?? '');
    return t.includes('death') || t.includes('bankrupt') || t.includes('crisis');
  });

  if (Number.isInteger(input.stride) && input.stride > 1) {
    const kept = [];
    for (const p of points) {
      if ((p.tick - fromTick) % input.stride === 0 || (keepCrisis && isCrisis(p))) kept.push(p);
    }
    points = kept;
  }
  const maxPoints = Number.isInteger(input.maxPoints) && input.maxPoints > 0 ? input.maxPoints : null;
  const truncated = maxPoints !== null && points.length > maxPoints;
  if (truncated) points = points.slice(0, maxPoints);

  return {
    fromTick,
    toTick,
    totalTicks: toTick - fromTick + 1,
    points: points.length,
    truncated,
    stride: input.stride ?? 1,
    timeline: points,
  };
}

export function getStats() {
  const all = ensure();
  const ticks = all.map((e) => e.tick);
  return {
    entries: all.length,
    ticks: new Set(ticks).size,
    minTick: ticks.length > 0 ? Math.min(...ticks) : null,
    maxTick: ticks.length > 0 ? Math.max(...ticks) : null,
  };
}

export function __reset() { cache = null; }
