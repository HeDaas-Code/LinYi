#!/usr/bin/env node
/**
 * truman-town 冒烟报告（t9）：用 N 个智能体跑 M 个 tick，输出资源衰减、
 * 生存压力、决策、AI 思考、观察者日志与存活时长的可读报告。
 *
 *   node bin/smoke.js --ticks 20 --agents 3 --seed 42
 */

import { loop } from '../src/runtime/index.js';
import * as survival from '../src/survival/index.js';

function arg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) {
    const v = process.argv[idx + 1];
    const n = Number(v);
    return Number.isFinite(n) ? n : v;
  }
  return fallback;
}

const ticks = Math.max(1, Math.floor(arg('--ticks', 20)));
const agentCount = Math.max(1, Math.floor(arg('--agents', 3)));
const seed = arg('--seed', 42);

const report = await loop.run({ ticks, seed, agentCount });

console.log('==== truman-town 冒烟报告 ====');
console.log('tick 数: ' + report.finalTick + ' / 智能体: ' + report.agents.length + ' / 种子: ' + seed);
console.log('');

console.log('--- 存活时长 ---');
for (const spawned of report.agents) {
  const world = report.world.agents ? report.world.agents[spawned.id] : undefined;
  const bornTick = world ? world.bornTick : null;
  const alive = world ? world.alive : false;
  const survived = world && typeof bornTick === 'number' ? report.finalTick - bornTick : null;
  console.log('  ' + spawned.name + ' (' + spawned.id + ') alive=' + alive + ' bornTick=' + bornTick + ' survivedTicks=' + survived);
}
console.log('');

console.log('--- 资源衰减 ---');
console.log('  food  stockpile=' + report.resources.food.stockpile.toFixed(2) + ' produced=' + report.resources.food.totalProduced.toFixed(2) + ' consumed=' + report.resources.food.totalConsumed.toFixed(2));
console.log('  water stockpile=' + report.resources.water.stockpile.toFixed(2) + ' produced=' + report.resources.water.totalProduced.toFixed(2) + ' consumed=' + report.resources.water.totalConsumed.toFixed(2));
console.log('');

console.log('--- 生存压力 ---');
for (const spawned of report.agents) {
  const meter = survival.needs.meter.query({ agentId: spawned.id });
  const score = survival.needs.pressure.scorer.score({ agentId: spawned.id });
  console.log('  ' + spawned.name + ' needs={food:' + meter.needs.food.toFixed(2) + ', water:' + meter.needs.water.toFixed(2) + '} pressure=' + score.normalized.toFixed(2));
}
console.log('');

console.log('--- 决策 / AI / 观察者 ---');
console.log('  decision=' + report.chronicle.decision + ' action=' + report.chronicle.action + ' event=' + (report.chronicle.event ?? 0));
const sample = report.steps[report.steps.length - 1];
if (sample) {
  for (const d of sample.decisions.slice(0, 3)) {
    console.log('  [' + d.agentId + '] ' + d.action + ' (conf=' + d.confidence.toFixed(2) + ') → ' + d.thought);
  }
}
console.log('');
console.log('==== 完成 ====');
