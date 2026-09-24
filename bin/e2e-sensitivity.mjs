/**
 * truman-town 有模型 E2E · 第二部分：状态敏感性对照
 *
 * 同一候选集下，模型应随处境改变选择（这是「模型真在判断」而非「固定偏好」的证据）。
 * 独立成文件是为了避开与第一部分叠加后的超时（实测单次 6-64s）。
 *
 *   node --env-file=.env bin/e2e-sensitivity.mjs
 */

import * as gateway from '../src/ai/llm/gateway.js';
import * as decide from '../src/ai/decide.js';

const provider = gateway.useA6Api(process.env);
console.log('provider=' + provider.name + ' model=' + provider.model);

const cands = [
  { action: 'eat', why: '库存有食物，可以进食' },
  { action: 'drink', why: '库存有水，可以饮水' },
  { action: 'forage', why: '可以外出采集补给' },
  { action: 'rest', why: '可以休息恢复' },
  { action: 'work', why: '受雇于企业，上工可产出商品' },
  { action: 'socialize', why: '附近有其他居民，可以交谈' },
];
const cases = [
  ['温饱', { food: 0.05, water: 0.05 }, { food: 100, water: 100 }, 'work'],
  ['极饿', { food: 0.98, water: 0.10 }, { food: 100, water: 100 }, 'eat'],
  ['极渴', { food: 0.10, water: 0.98 }, { food: 100, water: 100 }, 'drink'],
  ['断粮', { food: 0.95, water: 0.95 }, { food: 0, water: 0 }, 'forage'],
];
let matched = 0;
for (const [name, needs, stock, expect] of cases) {
  const picked = await decide.choose({
    name: '居民1', persona: '一名普通避难所居民', tags: ['hardworking', 'cautious'],
    needs, stock, candidates: cands, tick: 10,
  });
  const ok = picked.action === expect;
  if (ok) matched += 1;
  console.log(name + ' -> ' + picked.action + '（预期 ' + expect + '）' + (ok ? ' ✓' : ' ✗')
    + ' ' + picked.meta.latencyMs + 'ms');
}
console.log('敏感性用例匹配 ' + matched + '/' + cases.length);
