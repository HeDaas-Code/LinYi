import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseArgs, runBench, writeRunJson, writeMarkdown } from '../bin/bench.js';
import * as graph from '../src/infra/store/graph.js';

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
});
