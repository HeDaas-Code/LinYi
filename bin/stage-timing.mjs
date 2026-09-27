#!/usr/bin/env node
/**
 * truman-town 阶段计时与性能预算 / Stage Timing & Performance Budget
 *
 * 解决什么问题：「全量 npm test 超时」到底是死锁（hang）还是纯算力预算不足？
 * 两者处置方式相反——死锁要修代码，预算不足要把测试分层并给出预算与超时阈值。
 * 本工具把 loop.tickSequence 的每一次 yield 当作阶段边界逐阶段计时，同时采样
 * RSS、图节点数、人口，输出：
 *   - 每阶段 calls / 累计 / 占比 / p50 / p95 / max（阶段耗时预算）
 *   - tick 耗时随 tick 数的增长（前 1/4 与后 1/4 均值比，判定 O(n) / O(n^2)）
 *   - RSS 与图节点随 tick 的增长（长跑预算）
 *   - 人口随时间的变化（增长是否受控）
 *
 * 设计取舍：
 * - 只读：不修改任何世界语义，仅驱动既有 tickSequence。
 * - 归因方式：generator 在**完成**某单元后才 yield，故两次 yield 之间的墙钟差
 *   归属于**后一个**单元对应的阶段；逐居民单元（decide/dispatch）累加为阶段总量。
 * - 计时探针只用 clock.now().tick 判 tick 边界（O(1)），不在 yield 处调
 *   loop.snapshot()（构造成本高会污染被测数据）；采样只在每个采样 tick 做一次。
 * - phase2/phase3 需要一次性种子（企业/账户/派系/日程），故先调
 *   loop.run({ticks:0,...}) 建好世界再手工驱动 tickSequence，保证与测试同构。
 * - 默认配置刻意小（20 人 × 60 tick）使工具可频繁运行；长跑预算用 --agents 50 --ticks 200。
 *
 *   node bin/stage-timing.mjs [--agents 20] [--ticks 60] [--seed 42] [--phase2] [--phase3]
 *                             [--json <path>] [--sample-every 10]
 */

import * as loop from '../src/runtime/orchestrator/loop.js';
import * as graph from '../src/infra/store/graph.js';
import * as clock from '../src/runtime/clock.js';

function argOf(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return dflt;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) return true;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

const agents = Number(argOf('agents', 20));
const ticks = Number(argOf('ticks', 60));
const seed = argOf('seed', 42);
const phase2 = argOf('phase2', false) === true;
const phase3 = argOf('phase3', false) === true;
const jsonPath = argOf('json', null);
const sampleEvery = Math.max(1, Number(argOf('sample-every', 10)));

/** 分位数（对已排序数组，最近秩法）。 */
function pct(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
function meanOf(arr) { return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length; }
function nodeCount() {
  try { return graph.read({}).length; } catch { return -1; }
}

// 建世界：ticks:0 只做 reset + 造人 + phase2/phase3 一次性种子 + 日程/职业/角色种子。
await loop.run({ ticks: 0, agentCount: agents, seed, phase2, phase3 });

const stage = new Map();
const tickMs = [];
const rssSeries = [];
const nodeSeries = [];
const popSeries = [];

const rss0 = process.memoryUsage().rss;
const t0 = Date.now();

let prev = t0;
let tickCount = 0;

// tickSequence 每次调用恰好推进一个 tick（入口 clock.tick()），故外层循环驱动 N 个 tick。
for (let n = 0; n < ticks; n += 1) {
  const tickStart = Date.now();
  prev = tickStart;
  for await (const unit of loop.tickSequence({ phase2, phase3 })) {
    const now = Date.now();
    const dt = now - prev;
    prev = now;
    let rec = stage.get(unit.id);
    if (rec === undefined) { rec = { count: 0, totalMs: 0, samples: [] }; stage.set(unit.id, rec); }
    rec.count += 1;
    rec.totalMs += dt;
    rec.samples.push(dt);
  }
  tickMs.push(Date.now() - tickStart);
  tickCount += 1;
  const t = clock.now().tick;
  if (tickCount % sampleEvery === 0) {
    rssSeries.push({ tick: t, rssMb: Math.round(process.memoryUsage().rss / 1048576) });
    nodeSeries.push({ tick: t, nodes: nodeCount() });
    popSeries.push({ tick: t, agents: loop.snapshot().agents.length });
  }
}

const wallMs = Date.now() - t0;
const rss1 = process.memoryUsage().rss;

const stageRows = [...stage.entries()].map(([id, r]) => {
  const sorted = [...r.samples].sort((a, b) => a - b);
  return {
    stage: id,
    calls: r.count,
    totalMs: r.totalMs,
    sharePct: Number(((r.totalMs / wallMs) * 100).toFixed(2)),
    p50: pct(sorted, 50),
    p95: pct(sorted, 95),
    max: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
  };
}).sort((a, b) => b.totalMs - a.totalMs);

const q = Math.max(1, Math.floor(tickMs.length / 4));
const earlyMean = meanOf(tickMs.slice(0, q));
const lateMean = meanOf(tickMs.slice(-q));
const growthRatio = earlyMean === 0 ? 0 : Number((lateMean / earlyMean).toFixed(3));

const report = {
  config: { agents, ticks, seed, phase2, phase3, sampleEvery },
  wallMs,
  wallSec: Number((wallMs / 1000).toFixed(2)),
  tickCount,
  finalTick: clock.now().tick,
  msPerTick: tickCount === 0 ? 0 : Number((wallMs / tickCount).toFixed(2)),
  stages: stageRows,
  tickGrowth: { earlyMeanMs: Number(earlyMean.toFixed(2)), lateMeanMs: Number(lateMean.toFixed(2)), ratio: growthRatio },
  rss: { startMb: Math.round(rss0 / 1048576), endMb: Math.round(rss1 / 1048576), deltaMb: Math.round((rss1 - rss0) / 1048576), series: rssSeries },
  graphNodes: { end: nodeCount(), series: nodeSeries },
  population: { end: loop.snapshot().agents.length, series: popSeries },
};

if (typeof jsonPath === 'string') {
  const fs = await import('node:fs');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
}

console.log('阶段计时 / Stage timing  (' + agents + ' 人 × ' + ticks + ' tick, seed=' + seed
  + (phase2 ? ' +phase2' : '') + (phase3 ? ' +phase3' : '') + ')');
console.log('总墙钟 wall=' + report.wallSec + 's   ' + report.msPerTick + ' ms/tick   ticks=' + report.tickCount);
console.log('');
console.log('阶段名'.padEnd(30) + '次数'.padStart(8) + '累计ms'.padStart(11) + '占比%'.padStart(9) + 'p50ms'.padStart(9) + 'p95ms'.padStart(9));
for (const r of stageRows) {
  console.log(r.stage.padEnd(30) + String(r.calls).padStart(8) + String(r.totalMs).padStart(11)
    + String(r.sharePct).padStart(9) + String(r.p50).padStart(9) + String(r.p95).padStart(9));
}
console.log('');
console.log('tick 增长：前1/4均值=' + report.tickGrowth.earlyMeanMs + 'ms  后1/4均值=' + report.tickGrowth.lateMeanMs
  + 'ms  比值=' + report.tickGrowth.ratio + (growthRatio > 1.5 ? '  <- 超线性嫌疑' : ''));
console.log('RSS：' + report.rss.startMb + 'MB -> ' + report.rss.endMb + 'MB (Δ' + report.rss.deltaMb + 'MB)');
console.log('图节点：' + report.graphNodes.end + '   人口：' + report.population.end);
if (typeof jsonPath === 'string') console.log('JSON 已写出：' + jsonPath);
