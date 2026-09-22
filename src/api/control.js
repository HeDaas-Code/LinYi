/**
 * truman-town.api.control — 模拟控制 / Simulation Control
 *
 * 对外控制沙盘主循环：启动、暂停与步进。
 *   POST /api/v1/sim/start  → 初始化智能体（缺省 3 个）并置为 running
 *   POST /api/v1/sim/pause  → 置为 paused
 *   POST /api/v1/sim/step   → 推进一个完整 tick（复用 loop.step 闭环）
 *
 * 启动/暂停相位复用 runtime.orchestrator.cycle 的状态机（run/pause/resume），
 * 步进复用 runtime.orchestrator.loop 的 step 闭环。
 */

import * as cycle from '../runtime/orchestrator/cycle.js';
import * as loop from '../runtime/orchestrator/loop.js';

/** 控制侧相位镜像（cycle 不导出 status，这里自行维护）。 */
let phase = 'idle';

/** 若尚无智能体则按数量补足（缺省 3 个）。 */
function ensureAgents(agentCount) {
  const existing = loop.snapshot().agents.length;
  if (existing > 0) return existing;
  const count = Number.isInteger(agentCount) && agentCount > 0 ? agentCount : 3;
  for (let i = 0; i < count; i += 1) {
    loop.spawnAgent({ name: '居民' + (i + 1) });
  }
  return count;
}

/** 当前相位快照（供 API 响应）。 */
function status() {
  return {
    phase,
    tick: loop.snapshot().tick,
    agentCount: loop.snapshot().agents.length,
  };
}

/**
 * 启动主循环：补足智能体并置为 running。
 * @param {{ agentCount?: number }} [input]
 * @returns {{ phase: string, tick: number, agentCount: number, spawned: number }}
 */
export function start(input = {}) {
  const spawned = ensureAgents(input?.agentCount);
  if (phase === 'paused') {
    cycle.resume();
  } else {
    cycle.configure({ step: () => {} });
    cycle.run({ steps: 0 });
  }
  phase = 'running';
  return { ...status(), spawned };
}

/** 暂停主循环。 */
export function pause() {
  cycle.pause();
  phase = 'paused';
  return status();
}

/**
 * 推进一个 tick（完整闭环，含 AI 思考，异步）。
 * @param {{ agentCount?: number, eventProbability?: number, decay?: object, needGrowth?: object }} [input]
 * @returns {Promise<object>}
 */
export async function step(input = {}) {
  ensureAgents(input?.agentCount);
  const summary = await loop.step(input ?? {});
  return { ...status(), summary };
}

/** 复位控制相位与循环控制状态（测试用）。 */
export function __reset() {
  phase = 'idle';
  cycle.__reset();
}

/** 本模块 HTTP 路由表。 */
export const routes = [
  { method: 'POST', path: '/api/v1/sim/start', handler: ({ body }) => start(body ?? {}) },
  { method: 'POST', path: '/api/v1/sim/pause', handler: () => pause() },
  { method: 'POST', path: '/api/v1/sim/step', handler: ({ body }) => step(body ?? {}) },
];
