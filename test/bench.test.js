import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseArgs, runBench, writeRunJson, writeMarkdown, main } from '../bin/bench.js';
import * as graph from '../src/infra/store/graph.js';
import * as config from '../src/infra/config.js';

test('parseArgs 解析 CLI 参数（含 --param 点分覆盖）', () => {
  const o = parseArgs(['--ticks', '5', '--agents', '4', '--seeds', '3', '--phase3', '--provider', 'stub', '--real-every', '2', '--out', 'tmp', '--param', 'traumaRate=0.5', '--param', 'decay.food=0.02']);
  assert.equal(o.ticks, 5);
  assert.equal(o.agents, 4);
  assert.deepEqual(o.seeds, [1, 2, 3]);
  assert.equal(o.phase3, true);
  assert.equal(o.provider, 'stub');
  assert.equal(o.realEvery, 2);
  assert.equal(o.out, 'tmp');
  assert.equal(o.params.traumaRate, 0.5);
  assert.equal(o.params.decay.food, 0.02);
});

test('parseArgs 支持逗号种子列表', () => {
  const o = parseArgs(['--seeds', '3,7,42']);
  assert.deepEqual(o.seeds, [3, 7, 42]);
});

test('runBench 小规模（stub 不联网）返回多种子指标', async () => {
  graph.__reset();
  const result = await runBench({ ticks: 3, agents: 2, seeds: [1, 2], phase3: true });
  assert.equal(result.runs.length, 2);
  assert.equal(result.provider, 'stub');
  for (const r of result.runs) {
    assert.equal(r.resourceCurve.length, 3);
    assert.equal(typeof r.survivalRate, 'number');
    assert.ok(r.survivalRate >= 0 && r.survivalRate <= 1);
    assert.equal(typeof r.logCounts.total, 'number');
    assert.equal(r.paramSnapshot.breakThreshold, 0.7);
  }
  assert.equal(result.summary.seeds, 2);
});

test('runBench 参数覆盖生效（traumaRate）', async () => {
  graph.__reset();
  const result = await runBench({ ticks: 2, agents: 3, seeds: [7], phase3: true, params: { traumaRate: 0.5 } });
  assert.equal(result.paramSnapshot.traumaRate, 0.5);
  assert.equal(result.paramSnapshot.breakThreshold, 0.7);
});

test('writeRunJson + writeMarkdown 落盘', async () => {
  graph.__reset();
  const result = await runBench({ ticks: 2, agents: 2, seeds: [1], phase2: true });
  const dir = mkdtempSync(join(tmpdir(), 'truman-bench-'));
  const files = writeRunJson(dir, result);
  assert.ok(files.length >= 2);
  assert.ok(existsSync(files[0]));
  const md = writeMarkdown(result, join(dir, 'bench.md'));
  assert.ok(existsSync(md));
  const text = readFileSync(md, 'utf8');
  assert.ok(text.includes('# truman-town 基准报告'));
  assert.ok(text.includes('| seed |'));
  assert.ok(text.includes('经济分布'));
  assert.ok(text.includes('难度档位'), '报告应记录难度档位');
});

test('parseArgs 解析 --difficulty 档位', () => {
  const o = parseArgs(['--difficulty', 'harsh']);
  assert.equal(o.difficulty, 'harsh');
  assert.equal(o.warnings.length, 0);
});

test('parseArgs --param difficulty=x 给出陷阱警告', () => {
  const o = parseArgs(['--param', 'difficulty=harsh']);
  assert.ok(o.warnings.length > 0, '应产生警告');
  assert.ok(o.warnings.some((w) => w.includes('--difficulty')), '应提示改用 --difficulty');
});

test('parseArgs --param 未知键给出警告', () => {
  const o = parseArgs(['--param', 'nonsenseKey=1']);
  assert.ok(o.warnings.length > 0, '未知键应产生警告');
  assert.ok(o.warnings.some((w) => w.includes('已知配置键')), '应提示未知配置键');
});

test('runBench --difficulty harsh 生效（needGrowth=0.12 且存活率低于 standard）', async () => {
  graph.__reset();
  try {
    const harsh = await runBench({ ticks: 80, agents: 50, seeds: [1], phase2: true, difficulty: 'harsh' });
    assert.equal(harsh.difficulty, 'harsh');
    assert.equal(harsh.paramSnapshot.needGrowth.food, 0.12);
    const standard = await runBench({ ticks: 80, agents: 50, seeds: [1], phase2: true, difficulty: 'standard' });
    assert.equal(standard.difficulty, 'standard');
    assert.equal(standard.paramSnapshot.needGrowth.food, 0.08);
    assert.ok(harsh.runs[0].survivalRate < standard.runs[0].survivalRate, 'harsh 档存活率应显著低于 standard 档');
  } finally {
    config.setDifficulty('standard');
  }
});

test('runBench 未知难度档位抛 RangeError', async () => {
  await assert.rejects(runBench({ difficulty: 'bogus', ticks: 1, agents: 1 }), /未知难度档位/);
});

test('main 未知难度档位报错退出（非零退出码）', async () => {
  const prev = process.exitCode;
  process.exitCode = 0;
  try {
    const result = await main(['--difficulty', 'bogus']);
    assert.equal(result, null);
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = prev;
  }
});
