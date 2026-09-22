#!/usr/bin/env node
/**
 * truman-town 基准脚本（t25）：用可配置参数跑多种子沙盘，输出 JSON 与 markdown 汇总。
 *
 *   node bin/bench.js --ticks 20 --agents 3 --seeds 3 --phase3 --out bench-out --param traumaRate=0.5
 *
 * 约束：真实 provider 通过环境变量注入（A6API_KEY 等）；本脚本绝不读取或打印 .env 内容。
 */
import { pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { loop, registry } from '../src/runtime/index.js';
import * as infra from '../src/infra/index.js';
import * as ai from '../src/ai/index.js';
import * as economy from '../src/economy/index.js';
import * as a6api from '../src/ai/llm/provider.a6api.js';

const USAGE = '用法: node bin/bench.js [--ticks N --agents N --seeds N|a,b,c --phase2 --phase3 --provider stub|real --real-every N --out DIR --param k=v]';

function intArg(v, fb) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fb;
}

function parseSeeds(v) {
  const s = String(v);
  if (s.indexOf(',') >= 0) {
    const list = s.split(',').map((x) => Number(x.trim())).filter(Number.isFinite);
    return list.length > 0 ? list : [1];
  }
  const n = intArg(v, 1);
  return Array.from({ length: Math.max(1, n) }, (_, i) => i + 1);
}

function parseValue(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  const n = Number(v);
  if (v.trim() !== '' && Number.isFinite(n)) return n;
  return v;
}

function setPath(obj, path, value) {
  const parts = path.split('.').filter(Boolean);
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const p = parts[i];
    if (cur[p] === null || typeof cur[p] !== 'object' || Array.isArray(cur[p])) cur[p] = {};
    cur = cur[p];
  }
  if (parts.length > 0) cur[parts[parts.length - 1]] = value;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const opts = { ticks: 20, agents: 3, seeds: [1], phase2: false, phase3: false, provider: 'stub', realEvery: 1, out: 'bench-out', params: {}, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--phase2') { opts.phase2 = true; continue; }
    if (a === '--phase3') { opts.phase3 = true; continue; }
    if (a === '--help' || a === '-h') { opts.help = true; continue; }
    const next = argv[i + 1];
    const has = next !== undefined && String(next).indexOf('--') !== 0;
    if (a === '--ticks') { if (has) { opts.ticks = intArg(next, 20); i += 1; } continue; }
    if (a === '--agents') { if (has) { opts.agents = intArg(next, 3); i += 1; } continue; }
    if (a === '--seeds') { if (has) { opts.seeds = parseSeeds(next); i += 1; } continue; }
    if (a === '--provider') { if (has) { opts.provider = next === 'real' ? 'real' : 'stub'; i += 1; } continue; }
    if (a === '--real-every') { if (has) { opts.realEvery = Math.max(1, intArg(next, 1)); i += 1; } continue; }
    if (a === '--out') { if (has) { opts.out = String(next); i += 1; } continue; }
    if (a === '--param') { if (has) { const eq = String(next).indexOf('='); if (eq > 0) { setPath(opts.params, String(next).slice(0, eq), parseValue(String(next).slice(eq + 1))); } i += 1; } continue; }
  }
  return opts;
}

function deepMerge(base, override) {
  const out = { ...base };
  for (const [k, v] of Object.entries(override ?? {})) {
    if (v === undefined) continue;
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && out[k] !== null && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function selectProvider(providerOpt, realEvery) {
  if (providerOpt !== 'real') return { effective: 'stub', provider: null };
  try {
    const real = a6api.createProvider();
    if (realEvery > 1) {
      const stub = ai.gateway.provider('stub');
      let callCount = 0;
      return {
        effective: 'a6api',
        provider: {
          name: 'a6api-throttled',
          model: real.model,
          async complete(args) { callCount += 1; return (callCount % realEvery === 0) ? real.complete(args) : stub.complete(args); },
          async embed(args) { return stub.embed(args); },
        },
      };
    }
    return { effective: 'a6api', provider: real };
  } catch {
    return { effective: 'stub', provider: null, fallback: 'A6API_KEY 未配置，回退 stub' };
  }
}

function collectRun(seed, opts, report, paramSnapshot, provider) {
  const resourceCurve = report.steps.map((s) => ({ tick: s.tick, food: s.resources.food.stockpile, water: s.resources.water.stockpile }));
  const initialIds = report.agents.map((a) => a.id);
  const world = report.world ?? {};
  const worldAgents = world.agents ?? {};
  let aliveInitial = 0;
  for (const id of initialIds) {
    const rec = worldAgents[id];
    if (rec && rec.alive !== false) aliveInitial += 1;
  }
  const survivalRate = initialIds.length > 0 ? aliveInitial / initialIds.length : 0;
  const finalPopulation = registry.lookup({ type: 'agent' }).length;
  const collapses = report.phase3?.summary?.collapses ?? 0;
  const logCounts = report.chronicle ?? { decision: 0, action: 0, event: 0, total: 0 };

  let econ = null;
  if (opts.phase2) {
    const accounts = infra.graph.read({ type: 'economy.account' });
    const balances = accounts.map((n) => (Number.isFinite(n.data?.balance) ? n.data.balance : 0));
    const total = balances.reduce((s, b) => s + b, 0);
    let price = null;
    try { price = economy.market.price.quote({ symbol: 'food' }); } catch { price = null; }
    econ = {
      accounts: balances.length,
      balances,
      total,
      min: balances.length ? Math.min(...balances) : 0,
      max: balances.length ? Math.max(...balances) : 0,
      mean: balances.length ? total / balances.length : 0,
      price,
      trades: report.phase2?.summary?.trades ?? 0,
    };
  }

  return {
    seed,
    ticks: opts.ticks,
    agentCount: opts.agents,
    finalTick: report.finalTick,
    resourceCurve,
    survivalRate,
    finalPopulation,
    collapses,
    logCounts,
    economy: econ,
    phase2Summary: report.phase2?.summary ?? null,
    phase3Summary: report.phase3?.summary ?? null,
    provider,
    paramSnapshot,
  };
}

function aggregate(runs) {
  const n = runs.length || 1;
  const avgSurvivalRate = runs.reduce((s, r) => s + r.survivalRate, 0) / n;
  const collapseRate = runs.filter((r) => r.collapses > 0).length / n;
  const logTotals = runs.reduce((acc, r) => {
    acc.decision += r.logCounts.decision ?? 0;
    acc.action += r.logCounts.action ?? 0;
    acc.event += r.logCounts.event ?? 0;
    acc.total += r.logCounts.total ?? 0;
    return acc;
  }, { decision: 0, action: 0, event: 0, total: 0 });
  return { seeds: runs.length, avgSurvivalRate, collapseRate, logTotals };
}

export async function runBench(options = {}) {
  const opts = {
    ticks: Math.max(1, Number.isInteger(options.ticks) ? options.ticks : 20),
    agents: Math.max(1, Number.isInteger(options.agents) ? options.agents : 3),
    seeds: Array.isArray(options.seeds) ? options.seeds : [1],
    phase2: options.phase2 === true,
    phase3: options.phase3 === true,
    provider: options.provider === 'real' ? 'real' : 'stub',
    realEvery: Math.max(1, Number.isInteger(options.realEvery) ? options.realEvery : 1),
    params: (options.params && typeof options.params === 'object' && !Array.isArray(options.params)) ? options.params : {},
  };

  ai.gateway.__reset();
  const prov = selectProvider(opts.provider, opts.realEvery);
  if (prov.provider) ai.gateway.registerProvider(prov.provider);
  const paramSnapshot = deepMerge(infra.config.defaults(), opts.params);
  const fullConfig = deepMerge(infra.config.defaults(), opts.params);

  const runs = [];
  try {
    for (const seed of opts.seeds) {
      const report = await loop.run({
        ticks: opts.ticks,
        agentCount: opts.agents,
        seed,
        phase2: opts.phase2,
        phase3: opts.phase3,
        ...fullConfig,
      });
      runs.push(collectRun(seed, opts, report, paramSnapshot, prov.effective));
    }
  } finally {
    ai.gateway.__reset();
  }

  return { runs, paramSnapshot, provider: prov.effective, summary: aggregate(runs) };
}

export function writeRunJson(outDir, result) {
  mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const r of result.runs) {
    const p = join(outDir, 'bench-seed-' + r.seed + '.json');
    writeFileSync(p, JSON.stringify(r, null, 2));
    files.push(p);
  }
  const meta = join(outDir, 'bench-summary.json');
  writeFileSync(meta, JSON.stringify({ provider: result.provider, paramSnapshot: result.paramSnapshot, summary: result.summary }, null, 2));
  files.push(meta);
  return files;
}

export function writeMarkdown(result, outPath = 'reports/bench.md') {
  const lines = [];
  lines.push('# truman-town 基准报告');
  lines.push('');
  lines.push('- 生成时间：' + new Date().toISOString());
  lines.push('- provider：' + result.provider);
  lines.push('- 参数快照：' + JSON.stringify(result.paramSnapshot));
  lines.push('');
  lines.push('## 汇总');
  lines.push('');
  lines.push('| seed | finalTick | 存活率 | 末人口 | 崩溃 | decision | action | event | total |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of result.runs) {
    lines.push('| ' + r.seed + ' | ' + r.finalTick + ' | ' + r.survivalRate.toFixed(3) + ' | ' + r.finalPopulation + ' | ' + r.collapses + ' | ' + r.logCounts.decision + ' | ' + r.logCounts.action + ' | ' + r.logCounts.event + ' | ' + r.logCounts.total + ' |');
  }
  lines.push('');
  lines.push('- 平均存活率：' + result.summary.avgSurvivalRate.toFixed(3));
  lines.push('- 崩溃率：' + result.summary.collapseRate.toFixed(3) + '（' + result.runs.filter((r) => r.collapses > 0).length + '/' + result.runs.length + '）');
  lines.push('');
  lines.push('## 资源曲线（末 tick 库存）');
  lines.push('');
  for (const r of result.runs) {
    const last = r.resourceCurve[r.resourceCurve.length - 1];
    const f = typeof last?.food === 'number' ? last.food.toFixed(2) : String(last?.food);
    const w = typeof last?.water === 'number' ? last.water.toFixed(2) : String(last?.water);
    lines.push('- seed ' + r.seed + '：food=' + f + ' water=' + w);
  }
  const econRuns = result.runs.filter((r) => r.economy);
  if (econRuns.length > 0) {
    lines.push('');
    lines.push('## 经济分布（phase2）');
    lines.push('');
    for (const r of econRuns) {
      const e = r.economy;
      lines.push('- seed ' + r.seed + '：账户=' + e.accounts + ' 价格=' + e.price + ' 交易=' + e.trades + ' 余额=[' + e.balances.map((b) => b.toFixed(2)).join(', ') + ']');
    }
  }
  const md = lines.join('\n') + '\n';
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, md);
  return outPath;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(USAGE);
    return null;
  }
  const v = infra.config.validate(opts.params);
  if (!v.ok) {
    for (const e of v.errors) console.error('参数非法：' + e.key + ' ' + e.message);
    process.exitCode = 1;
    return null;
  }
  const result = await runBench({ ticks: opts.ticks, agents: opts.agents, seeds: opts.seeds, phase2: opts.phase2, phase3: opts.phase3, provider: opts.provider, realEvery: opts.realEvery, params: opts.params });
  const files = writeRunJson(opts.out, result);
  const mdPath = writeMarkdown(result, join('reports', 'bench.md'));
  console.log('provider=' + result.provider);
  console.log('seeds=' + result.runs.length + ' avgSurvivalRate=' + result.summary.avgSurvivalRate.toFixed(3) + ' collapseRate=' + result.summary.collapseRate.toFixed(3));
  console.log('logTotals=' + JSON.stringify(result.summary.logTotals));
  console.log('json=' + files.join(', '));
  console.log('markdown=' + mdPath);
  return result;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((err) => { console.error(err?.stack ?? err); process.exit(1); });
}
