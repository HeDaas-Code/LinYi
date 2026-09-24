/**
 * truman-town 有模型 E2E 验证 / LLM-in-the-loop E2E
 *
 * 验证真实大模型进入决策环：状态 → 候选集 → 模型选择 → 行动执行。
 * 默认规模很小（3 居民 × 3 tick，每 tick 仅 1 个居民走模型），
 * 因为实测 grok-4.6 单次约 6-19s，全量 50×200 不可行。
 *
 *   node --env-file=.env bin/e2e-llm.mjs
 *
 * 判定标准：
 *   - provider=a6api 且 model 为真实模型（非 stub-0）；
 *   - 产生 ai.decide 事件，且 fallback 事件为 0（模型输出可解析并落在候选集内）；
 *   - 同参数下输出具有状态敏感性（见下方对照用例）。
 */

import * as loop from '../src/runtime/orchestrator/loop.js';
import * as observer from '../src/observer/index.js';
import * as gateway from '../src/ai/llm/gateway.js';

const provider = gateway.useA6Api(process.env);
console.log('provider=' + provider.name + ' model=' + provider.model);

console.log('');
console.log('=== 1) 决策环接入：模型从居民候选集内选择行动 ===');
const r = await loop.run({
  ticks: 3, seed: 42, agentCount: 3, phase2: true,
  llmDecideEnabled: true, llmDecideEveryTicks: 1, llmDecideMaxAgents: 1,
});
const evs = observer.recorder.eventLog.list().filter((n) => String(n.data.topic).startsWith('ai.decide'));
console.log('ai.decide 事件数=' + evs.length);
for (const e of evs) {
  const p = e.data.payload;
  console.log('  t' + e.data.tick + ' ' + String(e.data.agentId).slice(-4)
    + ' action=' + p.action + ' model=' + p.model + ' latency=' + p.latencyMs + 'ms allowed=' + p.allowed);
}
const fb = observer.recorder.eventLog.list().filter((n) => String(n.data.topic) === 'ai.decide.fallback');
console.log('fallback 事件数=' + fb.length + (fb.length ? '（模型输出未被采纳）' : '（模型输出全部被采纳）'));
console.log('alive=' + Object.values(r.world.agents).filter((a) => a.alive !== false).length);

console.log('');
console.log('gateway 统计=' + JSON.stringify(gateway.getStats()));
console.log('（状态敏感性对照见 bin/e2e-sensitivity.mjs，拆分以避免两次运行叠加超时）');
