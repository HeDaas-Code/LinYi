#!/usr/bin/env node
/**
 * AI 模型基准脚本（真实 A6API 适配器）：
 *   node --env-file=.env bin/bench.js --n 3
 *
 * 依次调用 gateway.complete 若干次，打印每次墙钟耗时与 usage 统计
 *（prompt/completion/reasoning tokens、cost_in_usd_ticks）。绝不打印 A6API_KEY。
 */

import { gateway } from '../src/ai/index.js';

function arg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) {
    const v = Number(process.argv[idx + 1]);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  }
  return fallback;
}

const n = Math.max(1, Math.floor(arg('--n', 3)));

let provider;
try {
  provider = gateway.useA6Api();
} catch (err) {
  console.error('无法初始化 A6API provider：' + err.message);
  console.error('请确认已设置环境变量 A6API_KEY（可选 A6API_BASE_URL / A6API_MODEL）。');
  process.exit(1);
}

console.log('provider=' + provider.name + ' model=' + provider.model + ' n=' + n);

const messages = [{ role: 'user', content: '用一句话说明楚门小镇避难所居民面临的核心困境。' }];

const startedAt = Date.now();
for (let i = 0; i < n; i += 1) {
  const start = Date.now();
  const out = await gateway.complete({ messages });
  const u = out.usage;
  console.log(
    '#' + (i + 1) +
    ' latencyMs=' + (Date.now() - start) +
    ' prompt=' + u.promptTokens +
    ' completion=' + u.completionTokens +
    ' reasoning=' + (u.reasoningTokens ?? 0) +
    ' costInUsdTicks=' + (u.costInUsdTicks ?? 0),
  );
}

console.log('totalWallMs=' + (Date.now() - startedAt));
