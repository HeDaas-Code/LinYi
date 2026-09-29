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
 * 相位语义（t2 修复）：
 *   真实推进器是 loop.step()，不是 cycle.run()——cycle.run 是同步步进模型
 *   （每次自增 clock 并调用同步 stepFn），无法承载 async 主循环。因此这里只把
 *   cycle 当作相位状态机复用（run/pause/resume），tick 推进统一走 loop。
 *   - idle → running：start()
 *   - running → paused：pause()
 *   - paused → running：start() 恢复
 *   - paused 时 step() 返回 409，不再"暂停却照常推进"
 *
 * 挂机节拍器（t8）：
 *   默认**不启动后台推进器**——start() 仍只是把相位置为 running，tick 只在显式
 *   step() 时前进（这正是 t16 观测 API 会诚实报告 state='ready' 的原因）。
 *   要真正挂机，必须显式 start({ background: true, ... })，此时：
 *     - metronome 开始按真实时间驱动 tick，并向 stageProgress 登记；
 *     - /api/v1/sim/status 的 background 变为 true、driver 变为 'metronome'、
 *       state 变为 'running'（不再是 'ready'）。
 *   停止用 stop()：**当前 tick 会跑完**再停，随后相位进入 'stopped'
 *   （不是 'idle'——"从未开始"与"跑过之后停下"是两件不同的事，
 *    把后者报成 not_started 正是 t16 要消除的那类失真）。
 */

import * as cycle from '../runtime/orchestrator/cycle.js';
import * as loop from '../runtime/orchestrator/loop.js';
import * as metronome from '../runtime/orchestrator/metronome.js';
import * as config from '../infra/config.js';
import { HttpError } from './http.js';

/** 控制侧相位（idle | running | paused | stopped）。 */
let phase = 'idle';
let aiRuntime = null;

export function configureAiRuntime(profile = null) {
  aiRuntime = profile === null ? null : structuredClone(profile);
  return getAiRuntimeStatus();
}

export function getAiRuntimeStatus() {
  const p = aiRuntime;
  const endpoints = ['/api/v1/sim/decisions', '/api/v1/decisions/:decision_id', '/api/v1/sim/stream', '/api/v1/sim/logs'];
  return p ? { ...p, enabled: p.mode !== 'off', tickPacing: p.mode === 'off' ? 'clock' : 'work-complete', traceEndpoints: endpoints } : {
    mode: 'off', enabled: false, provider: 'stub', model: 'stub-0', maxAgents: 1,
    populationShare: 1, concurrency: 4, everyTicks: 1, tickPacing: 'clock',
    traceEndpoints: endpoints,
  };
}

function effectiveTickConfig(input = {}) {
  if (!aiRuntime) return input;
  const cfg = { ...input, llmDecideEnabled: false, llmDecideMode: aiRuntime.mode,
    llmDecideMaxAgents: aiRuntime.maxAgents, llmDecidePopulationShare: aiRuntime.populationShare,
    llmDecideConcurrency: aiRuntime.concurrency, llmDecideEveryTicks: aiRuntime.everyTicks,
    llmDecideModel: aiRuntime.mode === 'off' ? '' : aiRuntime.model };
  // 真实模型模式下，tick 的节奏由**工作完成**决定而不是墙钟配额：
  // msPerTick=0 让节拍器不插人工睡眠，一个 tick 在所有智能体（含模型调用）
  // 全部结束后立即推进下一个。否则 37.5s 的默认配额与 30-90s 的真实调用
  // 长期冲突，观察者会看到「时钟在跑、世界没动」的假象。
  if (aiRuntime.mode !== 'off') cfg.msPerTick = 0;
  return cfg;
}

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

/** 当前相位 + 提交边界 + 节拍器快照（供 API 响应）。 */
function status() {
  const t = loop.tickStatus();
  const met = metronome.status();
  return {
    phase,
    tick: t.tick,
    committedTick: t.committedTick,
    inFlight: t.inFlight,
    stageFailure: t.stageFailure,
    agentCount: loop.snapshot().agents.length,
    // 挂机相关事实：与 observer.simStatus 同源（都取 metronome/stageProgress），
    // 避免两处各拼一套口径。
    background: met.backgroundDriver === true && met.active === true,
    stopping: met.stopping === true,
    pacing: {
      msPerTick: met.msPerTick,
      msPerTickSource: met.msPerTickSource,
      speed: met.speed,
      effectiveMsPerTick: met.effectiveMsPerTick,
      unpaced: met.unpaced,
    },
    metronome: {
      active: met.active,
      stopping: met.stopping,
      paused: met.paused,
      ticksRun: met.ticksRun,
      lastTickMs: met.lastTickMs,
      lastError: met.lastError,
    },
    autosave: met.autosave,
  };
}

/**
 * 启动主循环：补足智能体并置为 running。
 * 已在 running 时重复 start 幂等（不重置 tick、不重复 spawn）。
 * @param {{ agentCount?: number, background?: boolean, msPerTick?: number, speed?: number, autosaveEveryTicks?: number, autosaveOnStop?: boolean, tickConfig?: object }} [input]
 * @returns {{ phase: string, tick: number, committedTick: number, agentCount: number, spawned: number }}
 */
export function start(input = {}) {
  const spawned = ensureAgents(input?.agentCount);
  if (phase === 'paused') {
    cycle.resume();
    // 从暂停恢复：若后台节拍器在跑，一并恢复它的推进。
    metronome.resume();
  } else if (phase !== 'running') {
    // 首次启动（或 stopped 后重开）：进入 running 相位。
    // cycle.run({steps:0}) 只做相位迁移，不推进 clock（真实推进由 step() 负责）。
    cycle.configure({ step: () => {} });
    cycle.run({ steps: 0 });
  }
  phase = 'running';
  // t8：只有显式要后台才启动节拍器。默认不启动，tick 仍只因显式 step 前进。
  if (input?.background === true) {
    metronome.start({
      ...(input?.msPerTick === undefined ? {} : { msPerTick: input.msPerTick }),
      ...(input?.speed === undefined ? {} : { speed: input.speed }),
      ...(input?.autosaveEveryTicks === undefined ? {} : { autosaveEveryTicks: input.autosaveEveryTicks }),
      ...(input?.autosaveOnStop === undefined ? {} : { autosaveOnStop: input.autosaveOnStop }),
      tickConfig: effectiveTickConfig(input?.tickConfig ?? {}),
      // 节拍器跑完当前 tick 收尾后，把相位落到 'stopped'。
      onStopped: () => { phase = 'stopped'; },
    });
  }
  return { ...status(), spawned };
}

/** 暂停主循环（含后台节拍器；当前 tick 会先跑完）。 */
export function pause() {
  cycle.pause();
  // 节拍器只"停止推进下一个 tick"，不会打断进行中的 tick——与 stop 同一不变量的弱化版。
  metronome.pause();
  phase = 'paused';
  return status();
}

/** 当前相位（供测试与 observer 查询）。 */
export function currentPhase() {
  return phase;
}

/**
 * 停止挂机。**当前 tick 会跑完**再停（放弃生成器会让世界停在半推进状态）。
 * @param {{ wait?: boolean }} [input] wait=true 时等待驱动器真正退出后再返回；
 *   wait=false（默认）只登记停止意图，相位仍为 running 直到收尾回调落到 'stopped'。
 */
export async function stop(input = {}) {
  await metronome.stop({ wait: input?.wait === true });
  // 驱动器已经退出（wait=true）时，onStopped 回调已把相位置为 'stopped'；
  // 未退出时相位保持 'running'——世界确实还在跑完当前 tick，不能提前报停止。
  if (metronome.status().active === false) phase = 'stopped';
  return status();
}

/** 从暂停恢复推进（相位回到 running）。 */
export function resume() {
  if (phase !== 'paused') return status();
  cycle.resume();
  metronome.resume();
  phase = 'running';
  return status();
}

/** 查询节拍配置（现实时间/tick、倍速、自动保存策略）。 */
export function getPacing() {
  return { ...metronome.pacing(), metronome: metronome.status() };
}

/**
 * 调整节拍：倍速与「现实时间/tick 映射」。
 * 可在挂机中热改（下一个 tick 生效），因为节拍只影响时间摊分，不影响数值。
 * @param {{ speed?: number, preset?: string, msPerTick?: number, autosaveEveryTicks?: number, autosaveOnStop?: boolean }} [input]
 */
export function setPacing(input = {}) {
  const i = input ?? {};
  let speed = i.speed;
  if (i.preset !== undefined) {
    const preset = metronome.SPEED_PRESETS[i.preset];
    if (preset === undefined) {
      throw new HttpError(404, 'unknown speed preset: ' + i.preset
        + '（可用：' + Object.keys(metronome.SPEED_PRESETS).join(' / ') + '）');
    }
    speed = preset;
  }
  try {
    metronome.configure({
      ...(speed === undefined ? {} : { speed }),
      ...(i.msPerTick === undefined ? {} : { msPerTick: i.msPerTick }),
      ...(i.autosaveEveryTicks === undefined ? {} : { autosaveEveryTicks: i.autosaveEveryTicks }),
      ...(i.autosaveOnStop === undefined ? {} : { autosaveOnStop: i.autosaveOnStop }),
    });
  } catch (err) {
    // 配置错误是客户端错误，不该在 HTTP 层变成 500。
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
  return getPacing();
}

/**
 * 推进一个 tick（完整闭环，含 AI 思考，异步）。
 * @param {{ agentCount?: number, eventProbability?: number, decay?: object, needGrowth?: object }} [input]
 * @returns {Promise<object>}
 */
export async function step(input = {}) {
  // 真实语义：paused 时拒绝推进（此前无论相位都照常 tick，
  // 让 "pause" 成为纯装饰状态）。idle 时自动进入 running（与旧行为兼容）。
  if (phase === 'paused') {
    throw new HttpError(409, 'sim 已暂停，请先 start 再 step');
  }
  if (phase === 'idle') phase = 'running';
  ensureAgents(input?.agentCount);
  // loop.step 自带并发互斥：进行中再次 step 会抛 TICK_IN_FLIGHT。
  // 这里把它转成 409，避免 HTTP 层暴露成 500。
  let summary;
  try {
    summary = await loop.step(effectiveTickConfig(input ?? {}));
  } catch (err) {
    if (err && err.code === 'TICK_IN_FLIGHT') {
      throw new HttpError(409, err.message);
    }
    throw err;
  }
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
  // 必须一并强制停掉节拍器：否则一个后台 timer 会跨测试存活，
  // 在别的用例里偷偷推进 tick（这类污染极难定位）。
  metronome.__reset();
  aiRuntime = null;
  config.setDifficulty('standard');
}

/** 本模块 HTTP 路由表。 */
export const routes = [
  { method: 'GET', path: '/api/v1/sim/ai-status', handler: () => getAiRuntimeStatus() },
  { method: 'POST', path: '/api/v1/sim/start', handler: ({ body }) => start(body ?? {}) },
  { method: 'POST', path: '/api/v1/sim/pause', handler: () => pause() },
  { method: 'POST', path: '/api/v1/sim/resume', handler: () => resume() },
  { method: 'POST', path: '/api/v1/sim/stop', handler: ({ body }) => stop(body ?? {}) },
  { method: 'POST', path: '/api/v1/sim/step', handler: ({ body }) => step(body ?? {}) },
  { method: 'GET', path: '/api/v1/sim/pacing', handler: () => getPacing() },
  { method: 'POST', path: '/api/v1/sim/pacing', handler: ({ body }) => setPacing(body ?? {}) },
  { method: 'GET', path: '/api/v1/sim/difficulties', handler: () => listDifficulties() },
  { method: 'GET', path: '/api/v1/sim/difficulty', handler: () => getDifficulty() },
  { method: 'POST', path: '/api/v1/sim/difficulty', handler: ({ body }) => setDifficulty((body ?? {}).id ?? (body ?? {}).difficulty) },
];
