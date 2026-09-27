#!/usr/bin/env node
/**
 * truman-town 测试分层 / Test Layering
 *
 * 解决什么问题：`npm test`（node --test 全量）在本机需要十几分钟，其中 9 个文件
 * 各自要跑 7 次「50 人 × 200 tick + phase2 + phase3」的重配置，单文件即 130–400s。
 * 这既不是死锁也不是性能回归，而是**没有分层**：把毫秒级纯单测和分钟级长跑
 * 放在同一个入口里，任何 CI/agent 的 300s 超时都会把它们一起判死。
 *
 * 分层依据（静态、确定性，不做计时猜测）：
 *   读每个 test 文件的 `ticks:` / `agentCount:` 字面量 + 是否用到 phase2/phase3/主循环，
 *   按声明的工作量归层。同一份代码永远得到同一分层，便于评审与复现。
 *
 *   层级        判据                                          预算
 *   fast        不使用主循环（纯函数/模块单测）                 < 60s
 *   integration 使用主循环，ticks<100 且 agentCount<50           < 180s
 *   long        ticks>=100 或 agentCount>=50（重配置长跑）       < 900s（按文件串行）
 *   model       外部模型 / 本地嵌入 provider（网络或 onnx）      不设预算（可离线跳过）
 *   perf        observer.perf / bench（性能与基准）            不设预算
 *
 * 用法：
 *   node bin/test-layers.mjs                 # 打印分层清单与预算
 *   node bin/test-layers.mjs --list long     # 只列出该层文件
 *   node bin/test-layers.mjs --run fast      # 运行该层（透传退出码）
 *   node bin/test-layers.mjs --json          # 机读清单
 *
 * 设计取舍：本工具是**分层的唯一事实来源**；package.json 的 test:* 脚本一律委托给它，
 * 避免「脚本里写死的文件列表」与「测试文件改名」互相腐烂。
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const TEST_DIR = join(ROOT, 'test');

const TIERS = {
  fast: { budgetSec: 60, desc: '纯单测（不使用主循环）' },
  integration: { budgetSec: 180, desc: '集成（主循环，轻配置）' },
  long: { budgetSec: 900, desc: '长跑（ticks>=100 或 agentCount>=50）' },
  model: { budgetSec: null, desc: '外部模型 / 本地嵌入 provider' },
  perf: { budgetSec: null, desc: '性能与基准' },
};

/** 取源码中某键的最大字面量数值（如 ticks: 200）。 */
function maxLiteral(src, key) {
  const re = new RegExp(key + '\\s*:\\s*(\\d+)', 'g');
  let m; let max = 0;
  while ((m = re.exec(src)) !== null) max = Math.max(max, Number(m[1]));
  return max;
}

function classify(file, src) {
  const name = basename(file);
  // 模型层：provider 测试需要网络或本地 onnx，属于可选能力，默认不纳入门禁。
  if (/^provider\./.test(name) || /llm|embed/.test(name)) return 'model';
  // 性能层：显式性能/基准用例。
  if (/\.perf\.test\.js$/.test(name) || /^bench\./.test(name)) return 'perf';

  const ticks = maxLiteral(src, 'ticks');
  const agents = maxLiteral(src, 'agentCount');
  const usesLoop = /loop\.(run|step)\(/.test(src) || /tickSequence/.test(src);

  if (ticks >= 100 || agents >= 50) return 'long';
  if (usesLoop) return 'integration';
  return 'fast';
}

const files = readdirSync(TEST_DIR).filter((f) => f.endsWith('.test.js')).sort();
const manifest = { fast: [], integration: [], long: [], model: [], perf: [] };
const features = {};
for (const f of files) {
  const src = readFileSync(join(TEST_DIR, f), 'utf8');
  const tier = classify(f, src);
  manifest[tier].push('test/' + f);
  features[f] = { tier, maxTicks: maxLiteral(src, 'ticks'), maxAgents: maxLiteral(src, 'agentCount') };
}

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf('--' + n); return i < 0 ? null : (argv[i + 1] ?? true); };

const listTier = flag('list');
const runTier = flag('run');

if (flag('json') !== null) {
  console.log(JSON.stringify({ tiers: TIERS, manifest, features }, null, 2));
} else if (typeof listTier === 'string') {
  if (manifest[listTier] === undefined) { console.error('未知层级：' + listTier); process.exit(2); }
  console.log(manifest[listTier].join('\n'));
} else if (typeof runTier === 'string') {
  const sel = manifest[runTier];
  if (sel === undefined) { console.error('未知层级：' + runTier); process.exit(2); }
  if (sel.length === 0) { console.log('层级 ' + runTier + ' 为空'); process.exit(0); }
  const budget = TIERS[runTier].budgetSec;
  const t0 = Date.now();
  const res = spawnSync(process.execPath, ['--test', ...sel], { stdio: 'inherit', cwd: ROOT });
  const sec = Number(((Date.now() - t0) / 1000).toFixed(1));
  const over = budget !== null && sec > budget;
  console.log('\n[test-layers] tier=' + runTier + ' files=' + sel.length + ' wall=' + sec + 's'
    + (budget !== null ? ' budget=' + budget + 's' + (over ? '  <- 超预算' : '  ok') : ''));
  process.exit(res.status === null ? 1 : res.status);
} else {
  console.log('测试分层 / Test layers（' + files.length + ' 个测试文件）');
  console.log('');
  for (const [tier, meta] of Object.entries(TIERS)) {
    const sel = manifest[tier];
    console.log('[' + tier + ']  ' + meta.desc + '  文件=' + sel.length
      + (meta.budgetSec !== null ? '  预算<' + meta.budgetSec + 's' : '  预算=不设'));
    for (const f of sel) console.log('    ' + f);
    console.log('');
  }
}
