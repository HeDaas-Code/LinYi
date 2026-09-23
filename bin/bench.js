#!/usr/bin/env node
/**
 * truman-town 基准脚本（t25）：用可配置参数跑多种子沙盘，输出 JSON 与 markdown 汇总。
 *
 *   node bin/bench.js --ticks 20 --agents 3 --seeds 3 --phase3 --difficulty harsh --out bench-out --param traumaRate=0.5
 *
 * 约束：真实 provider 通过环境变量注入（A6API_KEY 等）；本脚本绝不读取或打印 .env 内容。
 * 难度档位：用 --difficulty <id>（peaceful|standard|harsh|apocalyptic）切换；
 *           不要用 --param difficulty=x（该键无人读取，会被静默忽略并给出警告）。
 */
import { pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { loop, registry } from '../src/runtime/index.js';
import * as infra from '../src/infra/index.js';
import * as ai from '../src/ai/index.js';
import * as economy from '../src/economy/index.js';
import * as a6api from '../src/ai/llm/provider.a6api.js';

const USAGE = '用法: node bin/bench.js [--ticks N --agents N --seeds N|a,b,c --phase2 --phase3 --difficulty peaceful|standard|harsh|apocalyptic --provider stub|real --real-every N --real-cap N --out DIR --report baseline|real --param k=v]';

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
  const opts = { ticks: 20, agents: 3, seeds: [1], phase2: false, phase3: false, provider: 'stub', realEvery: 1, realCap: 150, out: 'bench-out', params: {}, report: null, difficulty: null, warnings: [], help: false };
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
    if (a === '--real-cap') { if (has) { opts.realCap = Math.max(1, intArg(next, 150)); i += 1; } continue; }
    if (a === '--report') { if (has) { opts.report = String(next); i += 1; } continue; }
    if (a === '--out') { if (has) { opts.out = String(next); i += 1; } continue; }
    if (a === '--difficulty') { if (has) { opts.difficulty = String(next); i += 1; } continue; }
    if (a === '--param') {
      if (has) {
        const eq = String(next).indexOf('=');
        if (eq > 0) {
          const key = String(next).slice(0, eq);
          setPath(opts.params, key, parseValue(String(next).slice(eq + 1)));
          // 陷阱键检测：difficulty 无人读取；其它未知键也可能静默失效
          const topKey = key.split('.')[0];
          if (topKey === 'difficulty') {
            opts.warnings.push('--param ' + key + ' 不会改变难度档位（该键无人读取），请改用 --difficulty <id>');
          } else if (!Object.prototype.hasOwnProperty.call(infra.config.defaults(), topKey)) {
            opts.warnings.push('--param 键「' + key + '」不是已知配置键，可能无人读取而静默失效，请确认参数名');
          }
        }
        i += 1;
      }
      continue;
    }
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

function selectProvider(providerOpt, realEvery, realCap) {
  if (providerOpt !== 'real') return { effective: 'stub', provider: null, realUsage: null };
  try {
    const real = a6api.createProvider();
    const cap = Math.max(1, Number.isInteger(realCap) ? realCap : 150);
    const usage = { calls: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0, costInUsdTicks: 0, latencies: [], failures: 0, capped: false };
    const stub = ai.gateway.provider('stub');
    let callCount = 0; // 全部 complete 调用（含抽样走 stub 的）
    const wrapped = {
      name: 'a6api-throttled',
      model: real.model,
      async complete(args) {
        callCount += 1;
        if (realEvery > 1 && (callCount % realEvery !== 0)) {
          return stub.complete(args);
        }
        if (usage.calls >= cap) {
          usage.capped = true;
          const err = new Error('bench: 真实调用达到上限 ' + cap + ' 次，停止运行');
          err.retryable = false;
          err.capExceeded = true;
          throw err;
        }
        usage.calls += 1;
        const start = Date.now();
        const out = await real.complete(args);
        usage.latencies.push(Date.now() - start);
        const u = out && out.usage ? out.usage : {};
        usage.promptTokens += u.promptTokens ?? 0;
        usage.completionTokens += u.completionTokens ?? 0;
        usage.reasoningTokens += u.reasoningTokens ?? 0;
        usage.costInUsdTicks += u.costInUsdTicks ?? 0;
        return out;
      },
      async embed(args) { return stub.embed(args); },
    };
    return { effective: 'a6api', provider: wrapped, realUsage: usage };
  } catch {
    return { effective: 'stub', provider: null, realUsage: null, fallback: 'A6API_KEY 未配置，回退 stub' };
  }
}

function readMedical() {
  const node = infra.graph.read('resource:medical');
  if (node && node.data && typeof node.data.stockpile === 'number') return node.data;
  return { stockpile: 0, capacity: 0, totalProduced: 0, totalConsumed: 0 };
}

function computeSurvivalDuration(worldAgents, finalTick) {
  const entries = [];
  for (const [id, rec] of Object.entries(worldAgents ?? {})) {
    if (!rec || typeof rec !== 'object') continue;
    const bornTick = typeof rec.bornTick === 'number' ? rec.bornTick : 0;
    const alive = rec.alive !== false;
    const survivedTicks = alive
      ? Math.max(0, finalTick - bornTick)
      : (typeof rec.deathTick === 'number' ? rec.deathTick - bornTick : 0);
    entries.push({ agentId: id, bornTick, alive, survivedTicks });
  }
  if (entries.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, alive: 0, buckets: [] };
  }
  const surv = entries.map((e) => e.survivedTicks);
  const min = Math.min(...surv);
  const max = Math.max(...surv);
  const mean = surv.reduce((a, b) => a + b, 0) / surv.length;
  const bucketCount = 10;
  const buckets = [];
  if (max > min) {
    const span = max - min;
    const counts = new Array(bucketCount).fill(0);
    for (const s of surv) {
      const idx = Math.min(bucketCount - 1, Math.floor((s - min) / span * bucketCount));
      counts[idx] += 1;
    }
    for (let i = 0; i < bucketCount; i += 1) {
      const lo = min + (span / bucketCount) * i;
      const hi = min + (span / bucketCount) * (i + 1);
      buckets.push({ lo: Math.round(lo), hi: Math.round(hi), count: counts[i] });
    }
  }
  return { count: entries.length, min, max, mean, alive: entries.filter((e) => e.alive).length, buckets };
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
  const ps = report.phase3?.summary ?? null;
  const collapses = ps?.collapses ?? 0;
  const logCounts = report.chronicle ?? { decision: 0, action: 0, event: 0, total: 0 };
  const medical = readMedical();

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
      bankruptcies: balances.filter((b) => b <= 0).length,
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
    firstCollapse: ps?.firstCollapse ?? null,
    breakdowns: ps?.breakdowns ?? 0,
    recoveries: ps?.recoveries ?? 0,
    techUnlocked: ps?.researchesCompleted ?? 0,
    techsLost: ps?.techsLost ?? 0,
    survivalDuration: computeSurvivalDuration(worldAgents, report.finalTick),
    medical,
    logCounts,
    economy: econ,
    phase2Summary: report.phase2?.summary ?? null,
    phase3Summary: ps,
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
    realCap: Math.max(1, Number.isInteger(options.realCap) ? options.realCap : 150),
    difficulty: (options.difficulty == null || options.difficulty === '') ? 'standard' : String(options.difficulty),
    params: (options.params && typeof options.params === 'object' && !Array.isArray(options.params)) ? options.params : {},
  };

  // 应用难度档位（未知档位 setDifficulty 抛 RangeError → CLI 非零退出）
  const diffSnap = infra.config.setDifficulty(opts.difficulty);

  ai.gateway.__reset();
  const prov = selectProvider(opts.provider, opts.realEvery, opts.realCap);
  if (prov.provider) ai.gateway.registerProvider(prov.provider);
  // 有效配置 = 默认值 + 难度档位参数 + 用户覆盖（paramSnapshot 与 fullConfig 一致）。
  // 关键：不能只用 deepMerge(defaults, params) —— 那会携带默认 needGrowth 等键，
  // 在 loop.step 的 {...DEFAULT_CONFIG, ...currentDifficultyParams(), ...config} 里
  // 把难度档位参数又覆盖回标准档，造成 --difficulty 静默失效。
  const fullConfig = deepMerge(deepMerge(infra.config.defaults(), diffSnap.params), opts.params);
  const paramSnapshot = fullConfig;

  const runs = [];
  let capped = false;
  let gatewayStats = null;
  try {
    for (const seed of opts.seeds) {
      const startedAt = Date.now();
      const report = await loop.run({
        ticks: opts.ticks,
        agentCount: opts.agents,
        seed,
        phase2: opts.phase2,
        phase3: opts.phase3,
        ...fullConfig,
      });
      const wallMs = Date.now() - startedAt;
      const run = collectRun(seed, opts, report, paramSnapshot, prov.effective);
      run.wallMs = wallMs;
      run.avgTickMs = wallMs / opts.ticks;
      runs.push(run);
    }
  } catch (err) {
    if (err && err.capExceeded) {
      capped = true;
    } else {
      throw err;
    }
  } finally {
    gatewayStats = ai.gateway.getStats();
    ai.gateway.__reset();
  }

  return {
    runs,
    paramSnapshot,
    difficulty: diffSnap.id,
    provider: prov.effective,
    realUsage: prov.realUsage ?? null,
    gatewayStats,
    capped,
    summary: aggregate(runs),
  };
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
  writeFileSync(meta, JSON.stringify({ provider: result.provider, difficulty: result.difficulty, paramSnapshot: result.paramSnapshot, summary: result.summary }, null, 2));
  files.push(meta);
  return files;
}

export function writeMarkdown(result, outPath = 'reports/bench.md') {
  const lines = [];
  lines.push('# truman-town 基准报告');
  lines.push('');
  lines.push('- 生成时间：' + new Date().toISOString());
  lines.push('- provider：' + result.provider);
  lines.push('- 难度档位：' + (result.difficulty ?? 'standard'));
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

function percentile(sorted, q) {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function fmt(n, digits = 2) {
  return typeof n === 'number' && Number.isFinite(n) ? n.toFixed(digits) : String(n);
}

/** 定位食物/水首次归零的 tick。 */
function firstZeroTick(curve) {
  for (const s of curve) {
    if ((typeof s.food === 'number' && s.food <= 0) || (typeof s.water === 'number' && s.water <= 0)) {
      return s.tick;
    }
  }
  return null;
}

/** 基线异常/结论分析。 */
function analyzeBaseline(result) {
  const anomalies = [];
  for (const r of result.runs) {
    const fc = r.firstCollapse;
    if (fc) {
      const reasons = (fc.reasons ?? []).join(',');
      if (reasons.indexOf('crisis_escalated') >= 0 && !reasons.includes('population_extinct') && !reasons.includes('resource_exhausted') && r.survivalRate >= 1 && r.finalPopulation > 0) {
        anomalies.push('seed ' + r.seed + '：tick ' + fc.tick + ' 崩溃由 crisis_escalated（平均需求压力≥0.8）触发，但无人死亡、资源未枯竭、人口未归零 → 崩溃为“压力阈值误判”，collapseRate 非有效指标（score=' + fmt(fc.score) + '，当时 population=' + fc.population + ' resourceRatio=' + fmt(fc.resourceRatio) + ' crisisLevel=' + fmt(fc.crisisLevel) + '）。');
      } else if (fc.tick < r.ticks * 0.05) {
        anomalies.push('seed ' + r.seed + '：tick ' + fc.tick + ' 过早崩溃，原因 ' + reasons + '。');
      }
    }
    const zt = firstZeroTick(r.resourceCurve);
    if (zt !== null) {
      anomalies.push('seed ' + r.seed + '：食物/水在 tick ' + zt + ' 归零。');
    }
    if (r.economy && r.economy.trades > 0 && r.economy.trades < r.ticks) {
      anomalies.push('seed ' + r.seed + '：交易在 ' + r.economy.trades + ' 笔后停滞（买方余额耗尽，破产/余额≤0 账户 ' + r.economy.bankruptcies + ' 个），经济停滞而非通胀。');
    }
    if (r.survivalRate >= 1 && r.finalPopulation >= r.agentCount) {
      anomalies.push('seed ' + r.seed + '：存活率恒为 1.0（无死亡机制），存活率非有效健康度指标，应以资源/压力/崩溃为准。');
    }
  }
  if (anomalies.length === 0) anomalies.push('未发现显著异常。');
  return anomalies;
}

/** 大基线报告（stub）。 */
export function writeBaselineMarkdown(result, outPath = 'reports/bench-baseline.md') {
  const lines = [];
  lines.push('# truman-town 调参前基线报告（stub）');
  lines.push('');
  lines.push('- 生成时间：' + new Date().toISOString());
  lines.push('- provider：' + result.provider);
  lines.push('- 难度档位：' + (result.difficulty ?? 'standard'));
  lines.push('- 参数快照：' + JSON.stringify(result.paramSnapshot));
  const r0 = result.runs[0];
  lines.push('- 复跑命令：`node bin/bench.js --ticks ' + (r0 ? r0.ticks : 0) + ' --agents ' + (r0 ? r0.agentCount : 0) + ' --seeds ' + result.runs.length + ' --phase2 --phase3 --out bench-out/baseline --report baseline`');
  lines.push('');
  lines.push('## 汇总');
  lines.push('');
  lines.push('| seed | finalTick | 存活率 | 末人口 | 崩溃 | 首次崩溃tick | 崩溃原因 | 心理崩溃 | 技术解锁 | 技术失传 | decision | action | event | total | wallMs | avgTickMs |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of result.runs) {
    const fc = r.firstCollapse;
    lines.push('| ' + r.seed + ' | ' + r.finalTick + ' | ' + r.survivalRate.toFixed(3) + ' | ' + r.finalPopulation + ' | ' + r.collapses + ' | ' + (fc ? fc.tick : '-') + ' | ' + (fc ? (fc.reasons ?? []).join(',') : '-') + ' | ' + r.breakdowns + ' | ' + r.techUnlocked + ' | ' + r.techsLost + ' | ' + r.logCounts.decision + ' | ' + r.logCounts.action + ' | ' + r.logCounts.event + ' | ' + r.logCounts.total + ' | ' + fmt(r.wallMs, 0) + ' | ' + fmt(r.avgTickMs, 2) + ' |');
  }
  lines.push('');
  lines.push('- 平均存活率：' + result.summary.avgSurvivalRate.toFixed(3));
  lines.push('- 崩溃率：' + result.summary.collapseRate.toFixed(3) + '（' + result.runs.filter((r) => r.collapses > 0).length + '/' + result.runs.length + '）');
  lines.push('');
  lines.push('## 资源曲线（末 tick 库存）');
  lines.push('');
  lines.push('> energy（能源）在本 MVP 中未实现（无对应资源节点）；medical（医疗物资）为内部资源，给出末值/累计消耗。');
  lines.push('');
  lines.push('| seed | food | water | medical.stockpile | medical.consumed |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const r of result.runs) {
    const last = r.resourceCurve[r.resourceCurve.length - 1];
    lines.push('| ' + r.seed + ' | ' + fmt(last ? last.food : null) + ' | ' + fmt(last ? last.water : null) + ' | ' + fmt(r.medical.stockpile) + ' | ' + fmt(r.medical.totalConsumed) + ' |');
  }
  lines.push('');
  lines.push('## 存活时长分布');
  lines.push('');
  for (const r of result.runs) {
    const d = r.survivalDuration;
    lines.push('- seed ' + r.seed + '：count=' + d.count + ' alive=' + d.alive + ' min=' + d.min + ' max=' + d.max + ' mean=' + fmt(d.mean));
    if (d.buckets.length > 0) {
      lines.push('  分桶（tick 区间→人数）：' + d.buckets.map((b) => b.lo + '-' + b.hi + ':' + b.count).join('  '));
    }
  }
  lines.push('');
  lines.push('## 经济分布（phase2）');
  lines.push('');
  lines.push('| seed | 账户 | 余额min | 余额max | 余额mean | 总余额 | 价格 | 交易量 | 破产(余额≤0) |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of result.runs) {
    if (!r.economy) continue;
    const e = r.economy;
    lines.push('| ' + r.seed + ' | ' + e.accounts + ' | ' + fmt(e.min) + ' | ' + fmt(e.max) + ' | ' + fmt(e.mean) + ' | ' + fmt(e.total) + ' | ' + fmt(e.price) + ' | ' + e.trades + ' | ' + e.bankruptcies + ' |');
  }
  lines.push('');
  lines.push('## 心理崩溃 / 技术');
  lines.push('');
  lines.push('| seed | 心理崩溃 | 恢复 | 技术解锁 | 技术失传 |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const r of result.runs) {
    lines.push('| ' + r.seed + ' | ' + r.breakdowns + ' | ' + r.recoveries + ' | ' + r.techUnlocked + ' | ' + r.techsLost + ' |');
  }
  lines.push('');
  lines.push('## 结论与异常清单');
  lines.push('');
  for (const a of analyzeBaseline(result)) {
    lines.push('- ' + a);
  }
  const md = lines.join('\n') + '\n';
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, md);
  return outPath;
}

/** 真实模型小基线报告。 */
export function writeRealBaselineMarkdown(result, outPath = 'reports/bench-baseline-real.md') {
  const u = result.realUsage ?? null;
  const gs = result.gatewayStats ?? {};
  const lat = u ? [...u.latencies].sort((a, b) => a - b) : [];
  const lines = [];
  lines.push('# truman-town 真实模型小基线报告（A6API）');
  lines.push('');
  lines.push('- 生成时间：' + new Date().toISOString());
  lines.push('- provider：' + result.provider + (result.provider === 'stub' ? '（注意：实际回退 stub，未走真实模型）' : ''));
  lines.push('- 难度档位：' + (result.difficulty ?? 'standard'));
  lines.push('- 参数快照：' + JSON.stringify(result.paramSnapshot));
  lines.push('- 硬上限：' + (u ? (u.capped ? '已触发上限（停止运行）' : '未触发（实际 ' + u.calls + ' 次 < 上限）') : '-'));
  lines.push('- 抽样方式：realEvery 抽样（每 N 次 complete 调用中 1 次走真实模型、其余走 stub）');
  const run = result.runs[0];
  lines.push('- 复跑命令：`timeout 1500 node --env-file=.env bin/bench.js --ticks 30 --agents 4 --seeds 1 --provider real --real-every 3 --real-cap 150 --out bench-out/real --report real`');
  lines.push('');
  lines.push('## 运行概况');
  lines.push('');
  if (run) {
    lines.push('- 规模：' + run.agentCount + ' 居民 × ' + run.ticks + ' tick，最终 tick ' + run.finalTick + '，存活率 ' + run.survivalRate.toFixed(3));
    lines.push('- 日志：decision=' + run.logCounts.decision + ' action=' + run.logCounts.action + ' event=' + run.logCounts.event + ' total=' + run.logCounts.total);
    lines.push('- 总墙钟：' + fmt(run.wallMs, 0) + ' ms，每 tick 平均 ' + fmt(run.avgTickMs, 2) + ' ms');
  } else {
    lines.push('- 无完整 run（运行被上限截停）。');
  }
  lines.push('');
  lines.push('## 真实调用统计');
  lines.push('');
  if (u) {
    lines.push('- 实际真实调用次数：' + u.calls + (u.capped ? '（已触及上限）' : ''));
    lines.push('- 总 token：prompt=' + u.promptTokens + ' completion=' + u.completionTokens + ' reasoning=' + u.reasoningTokens + ' 合计=' + (u.promptTokens + u.completionTokens + u.reasoningTokens));
    lines.push('- cost_in_usd_ticks 合计：' + u.costInUsdTicks);
    lines.push('- 失败次数：' + u.failures + '，重试次数：' + (gs.retries ?? 0));
    lines.push('- gateway 统计：requests=' + (gs.requests ?? 0) + ' successes=' + (gs.successes ?? 0) + ' failures=' + (gs.failures ?? 0));
  } else {
    lines.push('- 无真实调用数据（provider 回退 stub）。');
  }
  lines.push('');
  lines.push('## 延迟分布（真实调用，ms）');
  lines.push('');
  if (lat.length > 0) {
    const sum = lat.reduce((a, b) => a + b, 0);
    lines.push('- 样本数：' + lat.length);
    lines.push('- min=' + fmt(lat[0], 0) + ' max=' + fmt(lat[lat.length - 1], 0) + ' mean=' + fmt(sum / lat.length, 0));
    lines.push('- p50=' + fmt(percentile(lat, 0.5), 0) + ' p90=' + fmt(percentile(lat, 0.9), 0));
  } else {
    lines.push('- 无延迟样本。');
  }
  lines.push('');
  lines.push('## 结论：真实模型适合多大场景');
  lines.push('');
  if (lat.length > 0 && run) {
    const p50 = percentile(lat, 0.5);
    const callsPerTick = run.logCounts.decision / Math.max(1, run.ticks);
    const perTickMs = callsPerTick * p50;
    lines.push('- 单次调用 p50 延迟约 ' + fmt(p50, 0) + ' ms；核心主循环每 tick 约 ' + fmt(callsPerTick, 1) + ' 次 LLM 调用 → 每 tick 纯推理耗时约 ' + fmt(perTickMs, 0) + ' ms。');
    lines.push('- 线性外推（不含排队/重试）：');
    const ext = [[4, 30], [10, 100], [50, 1000]];
    for (const pair of ext) {
      const n = pair[0];
      const t = pair[1];
      lines.push('  - ' + n + ' 居民 × ' + t + ' tick ≈ ' + (n * t) + ' 次调用 ≈ ' + (n * t * p50 / 1000).toFixed(0) + ' 秒真实推理');
    }
    lines.push('- 结论：真实模型适合小规模、短时段交互/演示与抽样评估（≤10 居民 × ≤100 tick 且采用 realEvery 抽样）；50 居民 × 2000 tick 全真实调用不可行（约 10 万次调用、数小时级且成本高），应保持 stub 或抽样。');
  } else {
    lines.push('- 无足够样本给出结论。');
  }
  lines.push('');
  lines.push('## 已知限制');
  lines.push('');
  lines.push('- provider.a6api 无超时/AbortSignal：上游挂起会无限等待，本次运行靠外层 timeout 兜底（t30 后加固）。');
  lines.push('- A6API 无 embedding 模型，embed() 不支持并回退 stub。');
  lines.push('- 抽样 realEvery 只统计真实调用；token/cost 仅来自真实调用样本。');
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
  for (const w of opts.warnings) console.error('警告：' + w);
  // 未知难度档位必须报错退出（非零退出码），不得静默忽略
  if (opts.difficulty != null && !infra.config.difficultyIds().includes(opts.difficulty)) {
    console.error('错误：未知难度档位「' + opts.difficulty + '」（可用：' + infra.config.difficultyIds().join(' / ') + '）');
    process.exitCode = 1;
    return null;
  }
  const v = infra.config.validate(opts.params);
  if (!v.ok) {
    for (const e of v.errors) console.error('参数非法：' + e.key + ' ' + e.message);
    process.exitCode = 1;
    return null;
  }
  const result = await runBench({ ticks: opts.ticks, agents: opts.agents, seeds: opts.seeds, phase2: opts.phase2, phase3: opts.phase3, provider: opts.provider, realEvery: opts.realEvery, realCap: opts.realCap, difficulty: opts.difficulty, params: opts.params });
  const files = writeRunJson(opts.out, result);
  let mdPath;
  if (opts.report === 'baseline') {
    mdPath = writeBaselineMarkdown(result, join('reports', 'bench-baseline.md'));
  } else if (opts.report === 'real') {
    mdPath = writeRealBaselineMarkdown(result, join('reports', 'bench-baseline-real.md'));
  } else {
    mdPath = writeMarkdown(result, join('reports', 'bench.md'));
  }
  console.log('provider=' + result.provider);
  console.log('difficulty=' + result.difficulty);
  console.log('seeds=' + result.runs.length + ' avgSurvivalRate=' + result.summary.avgSurvivalRate.toFixed(3) + ' collapseRate=' + result.summary.collapseRate.toFixed(3));
  console.log('logTotals=' + JSON.stringify(result.summary.logTotals));
  if (result.realUsage) console.log('realCalls=' + result.realUsage.calls + ' costInUsdTicks=' + result.realUsage.costInUsdTicks + (result.capped ? ' capped=true' : ''));
  console.log('json=' + files.join(', '));
  console.log('markdown=' + mdPath);
  return result;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((err) => { console.error(err?.stack ?? err); process.exit(1); });
}
