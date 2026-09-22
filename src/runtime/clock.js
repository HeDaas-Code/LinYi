/**
 * truman-town.runtime.clock — 世界时钟 / World Clock
 *
 * 维护沙盘逻辑时间，按 tick 推进并调度周期任务。tick 是唯一的逻辑时钟源：
 * 主循环每调用一次 tick() 时间前进 1，周期任务（schedule）在满足
 * (tick - offset) % interval === 0 时触发。同一时间线保证可复现与可观测。
 */

let currentTick = 0;
let startedAt = null;
let taskSeq = 0;

/** @type {Map<string, { interval: number, offset: number, fn: (now: object) => void }>} */
const tasks = new Map();

function snapshot() {
  return Object.freeze({ tick: currentTick, startedAt });
}

/**
 * 读取当前逻辑时间快照（不含触发信息）。
 * @returns {{ tick: number, startedAt: number | null }}
 */
export function now() {
  return snapshot();
}

/**
 * 推进 1 个 tick 并触发到期的周期任务。
 * 首次调用会写入 startedAt（墙钟时间戳，仅用于诊断）。
 * @returns {{ tick: number, startedAt: number | null, fired: string[] }}
 */
export function tick() {
  if (startedAt === null) startedAt = Date.now();
  currentTick += 1;
  const fired = [];
  for (const [id, task] of tasks) {
    if (currentTick >= task.offset && (currentTick - task.offset) % task.interval === 0) {
      fired.push(id);
      try {
        task.fn(snapshot());
      } catch (err) {
        console.error(`[clock] 周期任务 "${id}" 抛错：`, err);
      }
    }
  }
  return Object.freeze({ tick: currentTick, startedAt, fired: Object.freeze(fired) });
}

/**
 * 注册周期任务：每隔 interval 个 tick 触发一次。
 * @param {{ interval: number, offset?: number, fn: (now: object) => void, id?: string }} opts
 * @returns {{ id: string, interval: number, offset: number, cancel: () => void }}
 */
export function schedule(opts = {}) {
  const interval = opts.interval;
  const offset = opts.offset ?? 0;
  if (!Number.isInteger(interval) || interval < 1) {
    throw new TypeError('clock.schedule: interval 必须为 >=1 的整数');
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new TypeError('clock.schedule: offset 必须为 >=0 的整数');
  }
  if (typeof opts.fn !== 'function') {
    throw new TypeError('clock.schedule: fn 必须为函数');
  }
  const id = (typeof opts.id === 'string' && opts.id.trim() !== '') ? opts.id : `task_${++taskSeq}`;
  if (tasks.has(id)) {
    throw new Error(`clock.schedule: id "${id}" 已存在`);
  }
  tasks.set(id, { interval, offset, fn: opts.fn });
  return Object.freeze({ id, interval, offset, cancel: () => tasks.delete(id) });
}

/** 复位世界时钟（测试用）。 */
export function __reset() {
  currentTick = 0;
  startedAt = null;
  taskSeq = 0;
  tasks.clear();
}
