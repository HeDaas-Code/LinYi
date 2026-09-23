import { loop } from '../src/runtime/index.js';
import * as graph from '../src/infra/store/graph.js';
import * as fs from 'node:fs';

const SEEDS = [1, 2, 3];
const AGENTS = 20;
const TICKS = 80; // 受 observer 记忆召回 O(t²) 限制（t31 待处理），扫描降为 80 tick

const PARAMS = [
  { key: 'decay', zh: '资源自然损耗率', levels: [0.001, 0.01, 0.03] },
  { key: 'needGrowth', zh: '每 tick 需求增长', levels: [0.04, 0.08, 0.16] },
  { key: 'eventProbability', zh: '突发事件概率', levels: [0, 0.15, 0.3, 0.5] },
  { key: 'forageYield', zh: '采集单次产量', levels: [1, 2, 4] },
  { key: 'eatThreshold', zh: '进食/饮水阈值', levels: [0.3, 0.4, 0.6] },
  { key: 'starvationTicks', zh: '饥饿持续致死 tick', levels: [3, 5, 8] },
  { key: 'epidemicThreshold', zh: '疫情阈值', levels: [0.3, 0.5, 0.7] },
  { key: 'ritualInterval', zh: '仪式间隔', levels: [1, 2, 4] },
  { key: 'traumaRate', zh: '创伤率', levels: [0.05, 0.2, 0.4] },
  { key: 'breakThreshold', zh: '崩溃阈值', levels: [0.5, 0.7, 0.9] },
  { key: 'procreationMatchThreshold', zh: '生育匹配阈值', levels: [0.1, 0.3, 0.5] },
];

const flat = [];
for (const p of PARAMS) for (const l of p.levels) flat.push({ param: p, level: l });

function median(arr) {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function metricsOf(report) {
  const agents = Object.values(report.world.agents ?? {});
  const total = agents.length;
  const alive = agents.filter((w) => w.alive).length;
  const survived = agents.map((w) => (w.deathTick ?? report.finalTick) - (w.bornTick ?? 0));
  let foodZero = 0, waterZero = 0;
  for (const s of report.steps) {
    if (s.resources.food.stockpile === 0) foodZero += 1;
    if (s.resources.water.stockpile === 0) waterZero += 1;
  }
  const accts = graph.read({ type: 'economy.account' }).map((n) => n.data.balance);
  const bankrupt = accts.filter((b) => b === 0).length;
  return {
    survivalRate: total > 0 ? alive / total : 0,
    medianSurvival: median(survived),
    firstCollapseTick: report.phase3.summary.firstCollapse ? report.phase3.summary.firstCollapse.tick : null,
    foodFinal: report.resources.food.stockpile,
    waterFinal: report.resources.water.stockpile,
    foodZeroTicks: foodZero,
    waterZeroTicks: waterZero,
    trades: report.phase2.summary.trades,
    childrenBorn: report.phase2.summary.childrenBorn,
    breakdowns: report.phase3.summary.breakdowns,
    collapses: report.phase3.summary.collapses,
    bankrupt,
  };
}

function avg(list, key) {
  const vals = list.map((m) => m[key]).filter((v) => v !== null && v !== undefined);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function overrideFor(key, level) {
  if (key === 'decay') return { decay: { food: level, water: level } };
  if (key === 'needGrowth') return { needGrowth: { food: level, water: level } };
  return { [key]: level };
}

const idx = Number.parseInt(process.argv.find((a) => a.startsWith('--index='))?.split('=')[1] ?? '-1', 10);
if (idx < 0 || idx >= flat.length) { console.error('usage: node bin/sweep.js --index=N (0..' + (flat.length - 1) + ')'); process.exit(2); }

const { param, level } = flat[idx];
const runs = [];
for (const seed of SEEDS) {
  const report = await loop.run({ phase2: true, phase3: true, ticks: TICKS, agentCount: AGENTS, seed, ...overrideFor(param.key, level) });
  runs.push(metricsOf(report));
}
const row = { param: param.key, zh: param.zh, level, ...Object.fromEntries(Object.keys(runs[0]).map((k) => [k, avg(runs, k)])) };
fs.mkdirSync('bench-out/sweep', { recursive: true });
fs.appendFileSync('bench-out/sweep/results.jsonl', JSON.stringify(row) + '\n');
console.log('OK', param.key + '=' + level, 'rate', (row.survivalRate*100).toFixed(0)+'%', 'medSurv', row.medianSurvival?.toFixed(1), 'collapse', row.firstCollapseTick?.toFixed(1), 'foodZ', row.foodZeroTicks?.toFixed(0), 'waterZ', row.waterZeroTicks?.toFixed(0), 'trades', row.trades?.toFixed(0), 'born', row.childrenBorn?.toFixed(0), 'breakdown', row.breakdowns?.toFixed(1), 'bankrupt', row.bankrupt?.toFixed(0));