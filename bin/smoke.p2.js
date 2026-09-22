#!/usr/bin/env node
/**
 * truman-town 第二阶段冒烟报告（t16）：用 N 名居民跑 M 个 tick 的 phase2 场景，
 * 输出家庭/经济/制作/居住/健康子系统摘要、日志计数、事件/行为样例与存活时长。
 *
 *   node bin/smoke.p2.js --ticks 15 --agents 4 --seed 42
 */

import { loop, registry } from '../src/runtime/index.js';
import * as observer from '../src/observer/index.js';
import * as town from '../src/town/index.js';
import * as social from '../src/social/index.js';
import * as tagsetStore from '../src/agent/traits/tagset/store.js';

function arg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) {
    const v = process.argv[idx + 1];
    const n = Number(v);
    return Number.isFinite(n) ? n : v;
  }
  return fallback;
}

const ticks = Math.max(1, Math.floor(arg('--ticks', 15)));
const agentCount = Math.max(1, Math.floor(arg('--agents', 4)));
const seed = arg('--seed', 42);

const report = await loop.run({ phase2: true, ticks, seed, agentCount });
const agents = registry.lookup({ type: 'agent' });
const topics = [...new Set(observer.recorder.eventLog.list().map((n) => n.data.topic))];
const actions = [...new Set(observer.recorder.actionLog.list().map((n) => n.data.action))];

console.log('==== truman-town 第二阶段冒烟报告 ====');
console.log('tick 数: ' + report.finalTick + ' / 居民: ' + agents.length + ' / 种子: ' + seed);
console.log('');

console.log('--- 存活时长 ---');
for (const id of Object.keys(report.world.agents ?? {})) {
  const w = report.world.agents[id];
  const survived = typeof w.bornTick === 'number' ? report.finalTick - w.bornTick : null;
  console.log('  ' + w.name + ' (' + id + ') alive=' + w.alive + ' bornTick=' + w.bornTick + ' survivedTicks=' + survived);
}
console.log('');

console.log('--- 子系统摘要 ---');
const s = report.phase2.summary;
console.log('  生育=' + s.childrenBorn + ' 交易=' + s.trades + ' 制作=' + s.crafted + ' 建造=' + s.built + ' 治疗=' + s.treated + ' 隔离=' + s.quarantined);
console.log('  初始避难所=' + report.phase2.seed.shelter + ' 开户=' + report.phase2.seed.accounts + ' 初始价格=' + report.phase2.seed.price);
console.log('');

console.log('--- 子代 50 标签（来自父母 100 标签）---');
for (const a of agents) {
  if (!(a.data.name ?? '').startsWith('新生儿')) continue;
  const childTags = tagsetStore.get(a.id).tags;
  const trace = social.family.lineage.trace({ agentId: a.id });
  const p1 = tagsetStore.get(trace.parents[0]).tags;
  const p2 = tagsetStore.get(trace.parents[1]).tags;
  const parentKeys = new Set([...p1, ...p2].map((t) => t.key));
  const inherited = childTags.filter((t) => parentKeys.has(t.key)).length;
  console.log('  ' + a.data.name + ' (' + a.id + ') 标签=' + childTags.length + ' 可追溯=' + inherited + '/50 双亲=' + trace.parents.join(','));
}
console.log('');

console.log('--- 日志计数（决策/行为/事件）---');
console.log('  decision=' + report.chronicle.decision + ' action=' + report.chronicle.action + ' event=' + report.chronicle.event + ' total=' + report.chronicle.total);
console.log('  事件主题: ' + topics.join('、'));
console.log('  行为种类: ' + actions.join('、'));
console.log('');

console.log('--- 资源衰减 ---');
console.log('  food  stockpile=' + report.resources.food.stockpile.toFixed(2) + ' produced=' + report.resources.food.totalProduced.toFixed(2) + ' consumed=' + report.resources.food.totalConsumed.toFixed(2));
console.log('  water stockpile=' + report.resources.water.stockpile.toFixed(2) + ' produced=' + report.resources.water.totalProduced.toFixed(2) + ' consumed=' + report.resources.water.totalConsumed.toFixed(2));
console.log('');

console.log('--- 居住分配 ---');
for (const a of agents) {
  console.log('  ' + a.data.name + ' -> ' + town.residence.residenceOf(a.id));
}
console.log('');
console.log('==== 完成 ====');
