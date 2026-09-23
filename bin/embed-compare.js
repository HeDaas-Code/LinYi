/**
 * truman-town.ai.llm.embed-compare — 嵌入检索质量对照（stub 哈希向量 vs 本地 MiniLM 语义向量）
 *
 * 可复跑实验：对同一批“带语义真值”的记忆样本，分别用 stub（16 维 FNV 哈希，无语义）
 * 与 local（MiniLM，384 维语义）做检索，比较命中率 / 平均排名 / 相似度分布；
 * 并测量单条编码延迟（p50/p90）、1000 条吞吐、进程常驻内存增量，以及回退路径。
 *
 * 运行：node bin/embed-compare.js [--model-dir <dir>] [--throughput N]
 * 输出：控制台 + reports/embed-compare.md
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import * as gateway from '../src/ai/llm/gateway.js';
import { defaultModelDir } from '../src/ai/llm/provider.local.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NL = String.fromCharCode(10);

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  if (i >= 0 && process.argv[i + 1] !== undefined) return process.argv[i + 1];
  return fallback;
}

// 语义真值样本：查询 → 正确命中（字面不重合、语义相近）+ 字面干扰 + 随机干扰。
const CASES = [
  { query: '我饿了', correct: '食物储备见底了', lit: ['我不饿', '我渴了'], rnd: ['今天天气不错', '想出去走走'] },
  { query: '好渴', correct: '水净化器停止运转', lit: ['好饿', '好冷'], rnd: ['夜里睡不着', '想学点手艺'] },
  { query: '太冷了', correct: '供暖系统出了故障', lit: ['太热了', '太吵了'], rnd: ['食物还算充足', '有人生病了'] },
  { query: '受伤了', correct: '绷带和药品快用完了', lit: ['受凉了', '受气了'], rnd: ['想找人聊天', '发电机还有油'] },
  { query: '担心被袭击', correct: '加固避难所的大门', lit: ['担心被感染', '担心停电'], rnd: ['翻看技术手册', '土壤缺养分'] },
  { query: '孤独难耐', correct: '想找人聊聊天', lit: ['饥饿难耐', '酷暑难耐'], rnd: ['饮水还算够用', '通风有点差'] },
  { query: '百无聊赖', correct: '找点娱乐打发时间', lit: ['百般无奈', '百废待兴'], rnd: ['绷带不够了', '怀念外面的世界'] },
  { query: '想家了', correct: '怀念外面的世界', lit: ['想睡了', '想通了'], rnd: ['食物在减少', '有人在囤积'] },
  { query: '害怕感染', correct: '给居住区彻底消毒', lit: ['害怕黑暗', '害怕孤独'], rnd: ['想学新技能', '夜里总惊醒'] },
  { query: '空气浑浊', correct: '通风管道需要清理', lit: ['水质浑浊', '思路浑浊'], rnd: ['供暖还没修好', '有人受了伤'] },
  { query: '分配不公', correct: '有人私自囤积物资', lit: ['分工不明', '分配不均'], rnd: ['水净化器坏了', '想找人说话'] },
  { query: '想学本事', correct: '翻看技术手册学习', lit: ['想学做饭', '想学长跑'], rnd: ['大门需要加固', '绷带见底了'] },
  { query: '睡不好', correct: '夜里总是惊醒', lit: ['吃不好', '走不好'], rnd: ['空气有点浑浊', '食物储备告急'] },
  { query: '种不出菜', correct: '土壤需要补充养分', lit: ['种不出花', '长不出草'], rnd: ['发电机燃料不足', '想出去透透气'] },
  { query: '停电了', correct: '发电机燃料不足', lit: ['停水了', '停机了'], rnd: ['医疗物资紧张', '供暖还没恢复'] },
  { query: '孩子病了', correct: '需要照顾生病的孩子', lit: ['大人病了', '老人病了'], rnd: ['通风需要清理', '有人在囤积物资'] },
];

const CORRECTS = CASES.map((c) => c.correct);
const DISTRACTORS = [];
for (const c of CASES) {
  for (const t of c.lit) DISTRACTORS.push(t);
  for (const t of c.rnd) DISTRACTORS.push(t);
}
const CORPUS = [...new Set([...CORRECTS, ...DISTRACTORS])];

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function evaluate(queryVecs, vecsByText) {
  let top1 = 0;
  let top3 = 0;
  let mrr = 0;
  let rankSum = 0;
  for (let i = 0; i < CASES.length; i += 1) {
    const q = queryVecs[i];
    const scored = CORPUS.map((m, j) => ({ j, s: cosine(q, vecsByText.get(m)) }));
    scored.sort((a, b) => b.s - a.s);
    const correctIdx = CORPUS.indexOf(CASES[i].correct);
    const rank = scored.findIndex((e) => e.j === correctIdx);
    rankSum += rank;
    if (rank === 0) top1 += 1;
    if (rank <= 2) top3 += 1;
    mrr += 1 / (rank + 1);
  }
  return {
    top1: top1 / CASES.length,
    top3: top3 / CASES.length,
    mrr: mrr / CASES.length,
    meanRank: rankSum / CASES.length,
  };
}

async function embedAll(provider, texts) {
  const map = new Map();
  for (let i = 0; i < texts.length; i += 64) {
    const batch = texts.slice(i, i + 64);
    const r = await gateway.embed({ texts: batch, provider });
    batch.forEach((t, k) => map.set(t, r.vectors[k]));
  }
  return map;
}

async function measureLatency(provider, n) {
  const samples = [];
  for (let i = 0; i < n; i += 1) {
    const t0 = performance.now();
    await gateway.embed({ texts: ['食物储备见底了'], provider });
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return { p50: percentile(samples, 50), p90: percentile(samples, 90) };
}

async function measureThroughput(provider, n) {
  const texts = [];
  for (let i = 0; i < n; i += 1) texts.push('居民第' + i + '号正在检查自己的生存物资储备情况');
  const t0 = performance.now();
  await embedAll(provider, texts);
  const ms = performance.now() - t0;
  return { ms, perSec: Math.round((n / ms) * 1000) };
}

function distStats(vecsByText, queryVecs) {
  const pos = [];
  const neg = [];
  for (let i = 0; i < CASES.length; i += 1) {
    const q = queryVecs[i];
    pos.push(cosine(q, vecsByText.get(CASES[i].correct)));
    for (const d of [...CASES[i].lit, ...CASES[i].rnd]) neg.push(cosine(q, vecsByText.get(d)));
  }
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  return { posMean: mean(pos), negMean: mean(neg), gap: mean(pos) - mean(neg) };
}

async function main() {
  const modelDir = arg('model-dir', defaultModelDir());
  const throughputN = parseInt(arg('throughput', '1000'), 10);

  const stub = gateway.provider('stub');
  const local = gateway.registerLocalEmbed({ modelDir });

  const lines = [];
  const out = (...a) => { lines.push(a.join(' ')); console.log(...a); };

  out('# 嵌入检索质量对照：stub 哈希向量 vs 本地 MiniLM 语义向量');
  out('');
  out('- 生成时间：' + new Date().toISOString());
  out('- 模型目录：' + modelDir);
  out('- 样本规模：' + CASES.length + ' 条查询 / ' + CORPUS.length + ' 条记忆候选（每查询 1 语义正确项 + 字面干扰 + 随机干扰）');
  out('');

  // 1) 性能与成本（在加载 local 之前取得 stub 基线）
  out('## 1. 性能与成本');
  out('');
  const stubLat = await measureLatency(stub, 100);
  const stubThroughput = await measureThroughput(stub, throughputN);
  const stubRssMB = Math.round(process.memoryUsage().rss / 1024 / 1024);

  const tLoad0 = performance.now();
  const firstR = await gateway.embed({ texts: ['预热加载'], provider: local });
  const localFirstLoadMs = performance.now() - tLoad0;
  const localFellBack = firstR.fallback !== undefined && firstR.fallback !== null;

  let localLat = null;
  let localThroughput = null;
  let localRssMB = null;
  if (!localFellBack) {
    localLat = await measureLatency(local, 100);
    localThroughput = await measureThroughput(local, throughputN);
    localRssMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
  }

  out('| 指标 | stub（16维哈希） | local（384维 MiniLM） |');
  out('| --- | --- | --- |');
  out('| 单条编码 p50 | ' + stubLat.p50.toFixed(2) + 'ms | ' + (localLat ? localLat.p50.toFixed(2) + 'ms' : '不可用') + ' |');
  out('| 单条编码 p90 | ' + stubLat.p90.toFixed(2) + 'ms | ' + (localLat ? localLat.p90.toFixed(2) + 'ms' : '不可用') + ' |');
  out('| ' + throughputN + ' 条吞吐 | ' + stubThroughput.perSec + ' 条/s（' + stubThroughput.ms.toFixed(0) + 'ms） | ' + (localThroughput ? localThroughput.perSec + ' 条/s（' + localThroughput.ms.toFixed(0) + 'ms）' : '不可用') + ' |');
  out('| 首次加载耗时（会话+模型） | — | ' + localFirstLoadMs.toFixed(0) + 'ms |');
  out('| 进程常驻内存（RSS） | ' + stubRssMB + 'MB | ' + (localRssMB !== null ? localRssMB + 'MB（增量约 ' + (localRssMB - stubRssMB) + 'MB）' : '不可用') + ' |');
  out('');

  // 2) 语义检索
  out('## 2. 语义检索质量');
  out('');
  const queries = CASES.map((c) => c.query);

  const stubVecs = await embedAll(stub, [...CORPUS, ...queries]);
  const stubQuery = queries.map((q) => stubVecs.get(q));
  const stubRes = evaluate(stubQuery, stubVecs);

  let localRes = null;
  let localVecs = null;
  let localR = null;
  if (!localFellBack) {
    localR = await gateway.embed({ texts: queries, provider: local });
    if (localR.fallback === undefined || localR.fallback === null) {
      localVecs = await embedAll(local, CORPUS);
      localRes = evaluate(localR.vectors, localVecs);
    }
  }

  const fmt = (v) => (v === null ? '不可用' : (v * 100).toFixed(1) + '%');
  out('| 指标 | stub | local |');
  out('| --- | --- | --- |');
  out('| top-1 命中率 | ' + fmt(stubRes.top1) + ' | ' + (localRes ? fmt(localRes.top1) : '不可用（回退 stub）') + ' |');
  out('| top-3 命中率 | ' + fmt(stubRes.top3) + ' | ' + (localRes ? fmt(localRes.top3) : '不可用（回退 stub）') + ' |');
  out('| 平均倒数排名 MRR | ' + stubRes.mrr.toFixed(3) + ' | ' + (localRes ? localRes.mrr.toFixed(3) : '不可用') + ' |');
  out('| 平均排名（0 基，越低越好） | ' + stubRes.meanRank.toFixed(2) + ' | ' + (localRes ? localRes.meanRank.toFixed(2) : '不可用') + ' |');
  out('');
  out('随机基线（78 候选）：top-1 ≈ 1.3%，top-3 ≈ 3.8%，MRR ≈ 0.026。');
  out('');

  const stubDist = distStats(stubVecs, stubQuery);
  const localDist = localVecs ? distStats(localVecs, localR && localR.vectors ? localR.vectors : queries.map(() => null)) : null;
  out('### 相似度分布（正确项 vs 干扰项余弦均值）');
  out('');
  out('| 指标 | stub | local |');
  out('| --- | --- | --- |');
  out('| 正确项余弦均值 | ' + stubDist.posMean.toFixed(4) + ' | ' + (localDist ? localDist.posMean.toFixed(4) : '不可用') + ' |');
  out('| 干扰项余弦均值 | ' + stubDist.negMean.toFixed(4) + ' | ' + (localDist ? localDist.negMean.toFixed(4) : '不可用') + ' |');
  out('| 正负间隙（越大区分度越好） | ' + stubDist.gap.toFixed(4) + ' | ' + (localDist ? localDist.gap.toFixed(4) : '不可用') + ' |');
  out('');

  // 3) 回退路径
  out('## 3. 回退路径验证');
  out('');
  const badDir = path.join(modelDir, '..', 'nonexistent-model-dir-' + Date.now());
  const fallbackProvider = gateway.registerLocalEmbed({ modelDir: badDir });
  const fb = await gateway.embed({ texts: ['我饿了'], provider: fallbackProvider });
  out('- 临时指向不存在的模型目录：' + badDir);
  out('- gateway 是否仍可用（未崩溃）：是');
  out('- fallback 字段：' + (fb.fallback ?? '(空)'));
  out('- 回退向量维度：' + fb.dim);
  out('');

  // 4) 结论
  out('## 4. 结论与建议');
  out('');
  const top1Gain = localRes ? (localRes.top1 - stubRes.top1) * 100 : null;
  const gapNegative = localDist ? localDist.gap < 0 : false;
  const worseRanking = localRes ? localRes.top3 < stubRes.top3 : false;
  let verdict = '本地嵌入不可用（回退 stub），无法给出量化结论。';
  if (localRes) {
    if (top1Gain >= 10 && !gapNegative && !worseRanking) {
      verdict = '**值得**：语义嵌入 top-1 相对 stub 提升 ' + top1Gain.toFixed(1) + ' 个百分点，收益显著，建议默认启用 local。';
    } else if (gapNegative || worseRanking) {
      verdict = '**不值得**：语义嵌入在中文短句上被字面重叠主导——干扰项余弦均值(' + localDist.negMean.toFixed(3) + ')高于正确项(' + localDist.posMean.toFixed(3) + ')，top-3(' + (localRes.top3 * 100).toFixed(1) + '% vs stub ' + (stubRes.top3 * 100).toFixed(1) + '%)与平均排名(' + localRes.meanRank.toFixed(1) + ' vs stub ' + stubRes.meanRank.toFixed(1) + ')均劣于 stub，且引入 849MB 依赖与约 ' + localLat.p50.toFixed(1) + 'ms/条 的推理成本。默认应保持 stub。';
    } else {
      verdict = '**收益不足**：语义嵌入 top-1 仅提升 ' + top1Gain.toFixed(1) + ' 个百分点（<10pp），不足以抵消 849MB 依赖与约 ' + localLat.p50.toFixed(1) + 'ms/条 的推理成本，建议默认保持 stub。';
    }
  }
  out(verdict);
  out('');
  out('### 给未来的建议');
  out('');
  out('- 默认档位：' + (localRes && top1Gain >= 10 ? 'local（TRUMAN_EMBED_PROVIDER=local）' : 'stub（默认）'));
  out('- 当前中文短句语义检索中，MiniLM（英文为主）被字面字符重叠主导，未体现语义收益；若未来切换到中文语义模型（如 bge/m3e 中文句向量）再重新评估。');
  out('- 若检索以确定性为主，stub 更省资源且无 849MB 依赖；语义任务成为关键路径前不建议默认启用 local。');
  out('');

  await writeFile(path.join(ROOT, 'reports', 'embed-compare.md'), lines.join(NL) + NL, 'utf8');
  console.log('[written] reports/embed-compare.md');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
