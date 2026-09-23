/**
 * truman-town.api.control — 模拟控制 / Simulation Control
 *
 * 对外控制沙盘主循环：启动、暂停与步进。
 *   POST /api/v1/sim/start  → 初始化智能体（缺省 3 个）并置为 running
 *   POST /api/v1/sim/pause  → 置为 paused
 *   POST /api/v1/sim/step   → 推进一个完整 tick（复用 loop.step 闭环）
 *
 * 难度档位（needGrowth / 采集池的产品化控制面）：
 *   GET  /api/v1/sim/difficulties → 列出可用档位（含参数与预期存活表现）
 *   GET  /api/v1/sim/difficulty    → 查询当前档位
 *   POST /api/v1/sim/difficulty    → 切换档位（切换后新建的 run 生效）
 *
 * 启动/暂停相位复用 runtime.orchestrator.cycle 的状态机（run/pause/resume），
 * 步进复用 runtime.orchestrator.loop 的 step 闭环。
 */

import * as cycle from '../runtime/orchestrator/cycle.js';
import * as loop from '../runtime/orchestrator/loop.js';
import * as config from '../infra/config.js';
import { HttpError } from './http.js';

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

/** 列出全部难度档位（含参数与预期存活表现 + 当前档位标记）。 */
export function listDifficulties() {
  const presets = config.difficultyPresets();
  const current = config.getDifficulty().id;
  return Object.keys(presets).map((id) => ({
    id,
    label: presets[id].label,
    expected: presets[id].expected,
    params: presets[id].params,
    current: id === current,
  }));
}

/** 查询当前难度档位。 */
export function getDifficulty() {
  return { ...config.getDifficulty(), current: true };
}

/**
 * 切换难度档位（切换后新建的 run 生效；不热改运行中的模拟）。
 * @param {string} id 档位 id（peaceful / standard / harsh / apocalyptic）
 * @returns {object} 切换后的档位快照
 */
export function setDifficulty(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new HttpError(400, 'difficulty id 必须为非空字符串');
  }
  if (config.difficultyParams(id) === null) {
    throw new HttpError(404, 'unknown difficulty: ' + id + '（可用：' + config.difficultyIds().join(' / ') + '）');
  }
  return { ...config.setDifficulty(id), current: true };
}

/** 复位控制相位与循环控制状态（测试用）。 */
export function __reset() {
  phase = 'idle';
  cycle.__reset();
  config.setDifficulty('standard');
}

/** 本模块 HTTP 路由表。 */
export const routes = [
  { method: 'POST', path: '/api/v1/sim/start', handler: ({ body }) => start(body ?? {}) },
  { method: 'POST', path: '/api/v1/sim/pause', handler: () => pause() },
  { method: 'POST', path: '/api/v1/sim/step', handler: ({ body }) => step(body ?? {}) },
  { method: 'GET', path: '/api/v1/sim/difficulties', handler: () => listDifficulties() },
  { method: 'GET', path: '/api/v1/sim/difficulty', handler: () => getDifficulty() },
  { method: 'POST', path: '/api/v1/sim/difficulty', handler: ({ body }) => setDifficulty((body ?? {}).id ?? (body ?? {}).difficulty) },
];
