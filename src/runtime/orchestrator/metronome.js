/**
 * truman-town.runtime.orchestrator.metronome — 挂机节拍器 / Metronome (t8)
 *
 * 按**真实墙钟时间**驱动主循环：把「游戏内一天 = 24 tick」映射到可配置的现实时长，
 * 并提供倍速、暂停、停止（跑完当前 tick）与自动保存钩子。
 *
 * 为什么需要它（t8 前的事实）：
 *   全仓库没有任何 tick↔现实时间的映射，tick 只因**显式 step** 前进。
 *   一轮 200 tick 会在几秒内瞬间跑完，做放置类挂机必须改为按真实时间驱动。
 *   观测 API 当时会诚实报告 background=false / driver='manual-step'（t16），
 *   本模块就是那个一直缺席的**真实后台推进器**：接入后它会向 stageProgress
 *   登记，于是 /api/v1/sim/status 才第一次出现 driver='metronome'、background=true。
 *
 * 节奏（可配置，不是硬编码常量）：
 *   游戏内一天 = 24 tick 是**数值层约定**（由 needGrowth/ritualInterval/taxInterval
 *   等七个节律参数共同长成，改它要连同那七个一起改）。
 *   现实 15 分钟/天 → 1 tick ≈ 37.5 秒，即 DEFAULT_MS_PER_TICK = 37500。
 *   这个值只是**默认值**，优先级（低 → 高）：
 *       DEFAULT_MS_PER_TICK
 *     < 环境变量 LINYI_MS_PER_TICK（部署时可改，不必改代码）
 *     < configure({ msPerTick }) / start({ msPerTick })
 *   倍速 speed 在 msPerTick 之上再除：有效周期 = msPerTick / speed。
 *   msPerTick = 0 表示**不摊时间**（全速跑，等价于无限倍速）——这是挂机与
 *   批处理/测试共用的逃生口，也让「挂机」与「快进」成为同一个旋钮的两端。
 *
 * 时间怎么摊（按阶段权重）：
 *   一个 tick 在 50 人规模下约 1.4 秒，其中 phase2:industry 占一半、dispatch 占三分之二。
 *   若把 37.5 秒**平均**分给各阶段，观察者会看到「index 秒卡在同一个阶段」——
 *   既不像真实推进，也掩盖了真正的耗时分布。因此节拍器按**实测阶段耗时权重**分配：
 *     - 每个阶段 id 维护一个耗时 EWMA（work 时间，不含节拍器自己睡的时间）；
 *     - 用**上一个 tick 的单元序列**作为本 tick 的排程（自标定，无需预先标定表）；
 *     - 第 k 个单元的目标时刻 = budget × (前 k 个单元的权重和 / 总权重和)。
 *   首 tick 没有上一个 tick 可参考，故只在 tick 末尾补足整周期，不做 tick 内摊分。
 *
 * 关键不变量：
 *  1. **停止必须跑完当前 tick**：放弃生成器会让世界停在半推进状态（t7 的经验）。
 *     因此 stopRequested 只在**两个 tick 之间**被检查，中途永不打断。
 *  2. **不累积欠账**：如果实际计算已超过目标时刻，等待时间为负 → 直接跳过等待。
 *     否则一次卡顿会让后续所有 tick 都背上永远还不完的睡眠债。
 *  3. **与手动 step 互斥**：loop.tickSequence **不带** inFlight 守卫（只有 loop.step 有），
 *     所以节拍器在开跑前必须自己确认没有 tick 在飞，否则两个生成器会交错撕裂世界。
 *  4. **存档只在提交边界**：自动保存跳过 inFlight 的时刻。半提交态存下来恢复后自相矛盾
 *     （t2 的提交边界语义）。
 *  5. **代际隔离**：__reset/重新 start 会递增 generation；旧驱动器的收尾副作用
 *     （注销后台驱动、回调 onStopped）在代际不符时一律不执行，避免它回头覆盖新一局。
 *
 * 设计取舍：
 *   - 节拍器**不做数值判断**：它不知道「快慢是否合理」，只忠实执行时间映射。
 *   - **不自动启动**：必须显式 start({ background: true })。默认手动步进不变，
 *     这样既有测试与批处理用法完全不受影响，也避免"看起来在挂机其实没挂"。
 *   - 自动保存失败**不杀死世界**：记进 status().autosave.lastError 供观察，而不是抛出。
 *     但保存失败也**不静默**——它是可查询的事实。
 */

import * as loop from './loop.js';
import * as stageProgress from './stage-progress.js';

/**
 * 默认现实时长/tick（毫秒）：游戏内一天 24 tick × 15 分钟/天 ÷ 24 ≈ 37.5 秒。
 * 这是**默认值**而非不可变常量，见模块头注释的优先级说明。
 */
export const DEFAULT_MS_PER_TICK = 37500;

/** 默认倍速。 */
export const DEFAULT_SPEED = 1;

/** 默认自动保存间隔（tick）：20 tick ≈ 游戏内一天。 */
export const DEFAULT_AUTOSAVE_EVERY_TICKS = 20;

/** 暂停/等待互斥时的轮询间隔（毫秒）。 */
export const DEFAULT_POLL_MS = 25;

/** msPerTick 上限（24 小时）；防止配置错误造成事实上永不推进。 */
export const MAX_MS_PER_TICK = 24 * 60 * 60 * 1000;

/** 倍速上限。 */
export const MAX_SPEED = 100000;

/** 阶段耗时 EWMA 的平滑系数：新样本权重。 */
const WEIGHT_ALPHA = 0.3;

/** 单个阶段权重下限（毫秒）：避免某阶段偶发 0ms 后被永久判定为"不需要时间"。 */
const MIN_STAGE_MS = 0.01;

/** 常见倍速档位（产品面用；值是纯数字，任何正数都合法）。 */
export const SPEED_PRESETS = Object.freeze({
  realtime: 1,
  fast: 2,
  quick: 10,
  turbo: 100,
  max: 1000,
});

/** 单调时钟（毫秒）。 */
function nowMs() {
  return (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
}

/** 可中断的最小睡眠。ms <= 0 时立即返回（不累积欠账）。 */
function delay(ms) {
  if (!(ms > 0)) return Promise.resolve();
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * 显式让出**一次宏任务**。
 *
 * 为什么必须有它：tick 的内部实现全是"同步计算包在 async 里"，其 await 只消耗
 * 微任务。若驱动器每个 tick 都不让出宏任务（全速 msPerTick=0，或实际计算已超过
 * 预算时），驱动循环就变成**纯微任务死循环**——事件循环被饿死，
 * setTimeout / HTTP 请求 / SSE 推送 / 自动保存全部永远得不到执行。
 * （实测表现：挂机跑起来后整个进程连同测试框架一起挂死，而不是报错。）
 * 因此每 tick **至少**让出一次宏任务；摊分时已经睡过就不必再补，避免
 * 在逐单元 sleep 上叠加 N 次 setTimeout(0) 拖慢快进。
 */
function yieldMacrotask() {
  return new Promise((resolve) => { setTimeout(resolve, 0); });
}

/** 环境变量覆盖（部署时可调，不必改代码）。非法值忽略。 */
function envMsPerTick() {
  const raw = typeof process !== 'undefined' && process.env ? process.env.LINYI_MS_PER_TICK : undefined;
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= MAX_MS_PER_TICK ? n : null;
}

// ---- 节拍配置 ----

/** 节拍配置（msPerTick / speed 之外的自动保存策略也在其中）。 */
let cfg = {
  msPerTick: null,                                   // null = 用 env 或 DEFAULT
  speed: DEFAULT_SPEED,
  autosaveEveryTicks: DEFAULT_AUTOSAVE_EVERY_TICKS,
  autosaveOnStop: true,
  pollMs: DEFAULT_POLL_MS,
};

/** 解析后的 msPerTick（显式配置 > 环境变量 > 默认）。 */
export function configuredMsPerTick() {
  if (typeof cfg.msPerTick === 'number' && Number.isFinite(cfg.msPerTick)) return cfg.msPerTick;
  const env = envMsPerTick();
  return env === null ? DEFAULT_MS_PER_TICK : env;
}

/** 有效周期（毫秒/tick）= msPerTick / speed。0 表示全速不摊时间。 */
export function effectiveMsPerTick() {
  const base = configuredMsPerTick();
  const speed = speedValue();
  if (base <= 0) return 0;
  if (!(speed > 0)) return base;
  return base / speed;
}

function speedValue() {
  return Number.isFinite(cfg.speed) && cfg.speed > 0 ? cfg.speed : DEFAULT_SPEED;
}

/** 校验并归一化一个正整数配置项。 */
function positiveInt(value, fallback, min, max) {
  if (value === undefined || value === null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  if (i < min) return min;
  return i > max ? max : i;
}

/**
 * 配置节拍节奏。可只传要改的字段。
 * @param {{ msPerTick?: number, speed?: number, autosaveEveryTicks?: number, autosaveOnStop?: boolean, pollMs?: number }} [patch]
 */
export function configure(patch = {}) {
  const p = patch ?? {};
  if (p.msPerTick !== undefined) {
    if (p.msPerTick === null) {
      cfg.msPerTick = null;
    } else {
      const n = Number(p.msPerTick);
      if (!Number.isFinite(n) || n < 0) {
        throw new TypeError('metronome.configure: msPerTick 必须为 >= 0 的有限数（0 表示全速不摊时间）');
      }
      if (n > MAX_MS_PER_TICK) {
        throw new TypeError('metronome.configure: msPerTick 不得超过 ' + MAX_MS_PER_TICK + ' 毫秒（24 小时）');
      }
      cfg.msPerTick = n;
    }
  }
  if (p.speed !== undefined) {
    const n = Number(p.speed);
    if (!Number.isFinite(n) || n <= 0) {
      throw new TypeError('metronome.configure: speed 必须为正有限数');
    }
    cfg.speed = Math.min(n, MAX_SPEED);
  }
  if (p.autosaveEveryTicks !== undefined) {
    cfg.autosaveEveryTicks = positiveInt(p.autosaveEveryTicks, DEFAULT_AUTOSAVE_EVERY_TICKS, 0, 1e9);
  }
  if (p.autosaveOnStop !== undefined) cfg.autosaveOnStop = p.autosaveOnStop === true;
  if (p.pollMs !== undefined) cfg.pollMs = positiveInt(p.pollMs, DEFAULT_POLL_MS, 1, 60000);
  return pacing();
}

/** 当前节拍配置快照。 */
export function pacing() {
  return Object.freeze({
    msPerTick: configuredMsPerTick(),
    msPerTickSource: typeof cfg.msPerTick === 'number' && Number.isFinite(cfg.msPerTick)
      ? 'configured'
      : (envMsPerTick() === null ? 'default' : 'env'),
    speed: speedValue(),
    effectiveMsPerTick: effectiveMsPerTick(),
    unpaced: effectiveMsPerTick() <= 0,
    autosaveEveryTicks: cfg.autosaveEveryTicks,
    autosaveOnStop: cfg.autosaveOnStop,
    pollMs: cfg.pollMs,
    presets: SPEED_PRESETS,
  });
}

// ---- 运行状态 ----

let generation = 0;
let running = false;
let stopRequested = false;
let paused = false;
let drivePromise = null;
let onStoppedHook = null;
let tickConfig = {};
let ticksRun = 0;
let lastTickMs = null;
let lastError = null;
let startedAtWall = null;

/** 上一个 tick 的单元序列（本 tick 的排程依据）。恒为有界：只保留一个 tick。 */
let prevSequence = null;
/** 阶段耗时 EWMA（毫秒/单元），按阶段 id 有界。 */
const stageMs = new Map();

/** 阶段权重（未见过时用 1 作为无量纲单位）。 */
function weightOf(id) {
  const v = typeof id === 'string' ? stageMs.get(id) : undefined;
  return typeof v === 'number' && v > 0 ? v : 1;
}

/** 记录一次**计算**耗时（不含节拍器自己的睡眠）。 */
function recordWork(id, ms) {
  if (typeof id !== 'string' || id === '') return;
  if (!Number.isFinite(ms)) return;
  const sample = ms < MIN_STAGE_MS ? MIN_STAGE_MS : ms;
  const prev = stageMs.get(id);
  const next = prev === undefined ? sample : Math.max(prev * (1 - WEIGHT_ALPHA) + sample * WEIGHT_ALPHA, MIN_STAGE_MS);
  stageMs.set(id, next);
}

/** 前缀权重和（长度 n+1，prefix[0] = 0）。 */
function prefixWeights(plan) {
  const prefix = new Array(plan.length + 1);
  prefix[0] = 0;
  for (let i = 0; i < plan.length; i += 1) prefix[i + 1] = prefix[i] + weightOf(plan[i]);
  return prefix;
}

// ---- 自动保存 ----

let autosaveHook = null;
let autosaveState = { count: 0, lastAtTick: null, lastAtWall: null, lastReason: null, lastError: null };

/**
 * 设置自动保存钩子。钩子返回 Promise 或值；抛错会被记录而不中断挂机。
 * @param {null|((info: { reason: string, tick: number, committedTick: number }) => unknown)} hook
 */
export function setAutosaveHook(hook) {
  if (hook !== null && typeof hook !== 'function') {
    throw new TypeError('metronome.setAutosaveHook: hook 必须为函数或 null');
  }
  autosaveHook = hook;
  return hook !== null;
}

/** 自动保存状态（含最近一次失败原因，失败不静默）。 */
export function autosaveStatus() {
  return Object.freeze({ enabled: autosaveHook !== null, everyTicks: cfg.autosaveEveryTicks, onStop: cfg.autosaveOnStop, ...autosaveState });
}

/**
 * 执行一次自动保存。
 * - 只在**提交边界**执行：inFlight 时跳过（半提交态存档恢复后自相矛盾）。
 * - periodic 按 everyTicks 节流；stop 强制保存一次。
 * - 失败只记录、不抛出：保存失败不该杀死世界，但必须可查询。
 * @param {'periodic'|'stop'|'manual'} reason
 */
export async function autosave(reason = 'manual') {
  if (autosaveHook === null) return null;
  const t = loop.tickStatus();
  if (t.inFlight === true) return null;
  if (reason === 'periodic') {
    const every = cfg.autosaveEveryTicks;
    if (!(every > 0) || ticksRun === 0 || ticksRun % every !== 0) return null;
  }
  try {
    const result = await autosaveHook({ reason, tick: t.tick, committedTick: t.committedTick });
    autosaveState = {
      count: autosaveState.count + 1,
      lastAtTick: t.committedTick,
      lastAtWall: Date.now(),
      lastReason: reason,
      lastError: null,
    };
    return result === undefined ? true : result;
  } catch (err) {
    autosaveState = {
      ...autosaveState,
      lastReason: reason,
      lastError: err instanceof Error ? err.message : String(err),
    };
    return null;
  }
}

// ---- 驱动器 ----

/**
 * 跑一个被节拍摊开的 tick。
 * 消费 loop.tickSequence（而不是 loop.step），因为只有逐步消费才能把时间
 * 摊到阶段边界上；loop.tickSequence 同时负责把提交/失败写进阶段进度。
 */
async function runPacedTick() {
  const budget = effectiveMsPerTick();
  // 全速（budget = 0）时不需要排程：省掉每 tick 一次的权重前缀计算。
  const plan = budget > 0 ? prevSequence : null;
  const prefix = plan === null ? null : prefixWeights(plan);
  const total = prefix === null ? 0 : prefix[prefix.length - 1];
  const started = nowMs();
  const seq = [];
  let last = null;
  let resumeBase = started;
  let cursor = 0;
  /** 本 tick 是否已让出过宏任务（见 yieldMacrotask）。 */
  let yielded = false;

  for await (const unit of loop.tickSequence(tickConfig)) {
    const arrived = nowMs();
    const id = unit === null || unit === undefined ? null : unit.id;
    // 归因：单元是**跑完才 yield** 的，因此这段 work 属于刚跑完的这个阶段。
    recordWork(id, arrived - resumeBase);
    seq.push(id);
    cursor += 1;
    if (budget > 0 && prefix !== null && total > 0) {
      const cumulative = cursor < prefix.length ? prefix[cursor] : total;
      const wait = started + budget * (cumulative / total) - nowMs();
      // 负等待不睡眠——不累积欠账（不变量 2）；但仍需补一次宏任务让出。
      if (wait > 0) { await delay(wait); yielded = true; }
      else if (yielded === false) { await yieldMacrotask(); yielded = true; }
    }
    resumeBase = nowMs();
    last = unit;
  }

  // 整周期：tick 起点到下一个 tick 起点应等于 budget。
  const tail = budget > 0 ? started + budget - nowMs() : 0;
  if (tail > 0) await delay(tail);
  else if (yielded === false) await yieldMacrotask();
  prevSequence = seq;
  return last === null || last === undefined ? {} : last.value;
}

/** 等待到没有 tick 在飞（与手动 step 互斥，不变量 3）。 */
async function waitUntilIdle(myGeneration) {
  while (generation === myGeneration && stopRequested === false && paused === false && loop.tickStatus().inFlight === true) {
    await delay(cfg.pollMs);
  }
  return generation === myGeneration && stopRequested === false && paused === false;
}

/** 主驱动循环。 */
async function drive(myGeneration) {
  stageProgress.setBackgroundDriver(true);
  try {
    while (generation === myGeneration && stopRequested === false) {
      if (paused === true) {
        await delay(cfg.pollMs);
        continue;
      }
      if ((await waitUntilIdle(myGeneration)) === false) continue;
      const t0 = nowMs();
      await runPacedTick();
      lastTickMs = nowMs() - t0;
      ticksRun += 1;
      await autosave('periodic');
    }
  } catch (err) {
    // tick 失败：节拍器不停摆，但把失败记成可查询的事实（loop 侧另有 stageProgress.fail）。
    lastError = { at: Date.now(), tick: loop.tickStatus().tick, message: err instanceof Error ? err.message : String(err) };
    if (generation === myGeneration) {
      // 失败后退出驱动，避免在坏状态上无限重试刷屏。
      stopRequested = true;
    }
  } finally {
    if (generation === myGeneration) {
      running = false;
      paused = false;
      stopRequested = false;
      stageProgress.setBackgroundDriver(false);
      if (cfg.autosaveOnStop === true && ticksRun > 0) await autosave('stop');
      const snap = status();
      if (typeof onStoppedHook === 'function') {
        try { onStoppedHook(snap); } catch { /* 回调失败不影响收尾 */ }
      }
      // 只有本代际才清自己的 promise：__reset 后若已启动新一代驱动器，
      // 旧驱动器回头把它置 null 会让 waitForStop() 误判成"已停止"。
      drivePromise = null;
    }
  }
}

/**
 * 启动后台节拍器。
 * 幂等：已在运行时不重启驱动器（只更新 tick 配置与节拍参数）。
 * @param {{ msPerTick?: number, speed?: number, autosaveEveryTicks?: number, autosaveOnStop?: boolean, tickConfig?: object, onStopped?: Function }} [input]
 */
export function start(input = {}) {
  const i = input ?? {};
  if (i.msPerTick !== undefined || i.speed !== undefined || i.autosaveEveryTicks !== undefined || i.autosaveOnStop !== undefined) {
    configure({
      ...(i.msPerTick === undefined ? {} : { msPerTick: i.msPerTick }),
      ...(i.speed === undefined ? {} : { speed: i.speed }),
      ...(i.autosaveEveryTicks === undefined ? {} : { autosaveEveryTicks: i.autosaveEveryTicks }),
      ...(i.autosaveOnStop === undefined ? {} : { autosaveOnStop: i.autosaveOnStop }),
    });
  }
  if (i.tickConfig !== undefined) tickConfig = i.tickConfig === null ? {} : { ...i.tickConfig };
  if (i.onStopped !== undefined) onStoppedHook = typeof i.onStopped === 'function' ? i.onStopped : null;
  if (running === true) return status();

  generation += 1;
  const myGeneration = generation;
  running = true;
  stopRequested = false;
  paused = false;
  lastError = null;
  startedAtWall = Date.now();
  drivePromise = drive(myGeneration);
  return status();
}

/** 暂停推进（保持后台驱动器登记；当前 tick 会跑完）。 */
export function pause() {
  if (running === false) return status();
  paused = true;
  return status();
}

/** 从暂停恢复。 */
export function resume() {
  if (running === false) return status();
  paused = false;
  return status();
}

/**
 * 请求停止。**当前 tick 一定会跑完**（不变量 1），因此本函数只是登记意图。
 * @param {{ wait?: boolean }} [input] wait=true 时等待驱动器真正退出后再返回
 */
export async function stop(input = {}) {
  if (running === false) return status();
  stopRequested = true;
  if ((input ?? {}).wait === true && drivePromise !== null) await drivePromise;
  return status();
}

/** 是否已收到停止请求但尚未收尾。 */
export function isStopping() {
  return running === true && stopRequested === true;
}

/** 节拍器 + 提交边界的现状（观测 API 的唯一数据源）。 */
export function status() {
  const t = loop.tickStatus();
  const p = pacing();
  return Object.freeze({
    active: running,
    stopping: running === true && stopRequested === true,
    paused: running === true && paused === true,
    generation,
    backgroundDriver: stageProgress.hasBackgroundDriver(),
    msPerTick: p.msPerTick,
    msPerTickSource: p.msPerTickSource,
    speed: p.speed,
    effectiveMsPerTick: p.effectiveMsPerTick,
    unpaced: p.unpaced,
    ticksRun,
    lastTickMs,
    startedWallAt: startedAtWall,
    lastError: lastError === null ? null : { ...lastError },
    committedTick: t.committedTick,
    tick: t.tick,
    inFlight: t.inFlight,
    tickConfig: { ...tickConfig },
    autosave: autosaveStatus(),
    stageWeights: [...stageMs.entries()].map(([id, ms]) => ({ id, ms: Math.round(ms * 1000) / 1000 })),
  });
}

/** 等待驱动器退出（测试与优雅关停用）。 */
export async function waitForStop() {
  if (drivePromise !== null) await drivePromise;
  return status();
}

/**
 * 强制复位：立即注销后台驱动器并丢弃驱动器状态。
 * **不等待**当前 tick——这是测试与进程收尾用的，不是产品停止路径
 * （产品停止请用 stop()，它保证跑完当前 tick）。
 * 代际递增确保旧驱动器的收尾副作用不会回头覆盖新一局。
 */
export function __reset() {
  generation += 1;
  running = false;
  stopRequested = false;
  paused = false;
  drivePromise = null;
  onStoppedHook = null;
  tickConfig = {};
  ticksRun = 0;
  lastTickMs = null;
  lastError = null;
  startedAtWall = null;
  prevSequence = null;
  stageMs.clear();
  autosaveHook = null;
  autosaveState = { count: 0, lastAtTick: null, lastAtWall: null, lastReason: null, lastError: null };
  cfg = {
    msPerTick: null,
    speed: DEFAULT_SPEED,
    autosaveEveryTicks: DEFAULT_AUTOSAVE_EVERY_TICKS,
    autosaveOnStop: true,
    pollMs: DEFAULT_POLL_MS,
  };
  stageProgress.setBackgroundDriver(false);
  return status();
}
