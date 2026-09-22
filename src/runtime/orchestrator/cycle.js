/**
 * truman-town.runtime.orchestrator.cycle — 循环控制 / Cycle Control
 *
 * 控制主循环的启动、暂停、恢复与步进节奏。MVP 采用同步步进模型：
 * run({ steps, step }) 前进 N 个 tick，每个 tick 先 clock.tick() 推进时间，
 * 再以当前 tick 上下文调用 step(ctx)；step 内部可调用 pause() 提前中断循环。
 */

import * as clock from '../clock.js';

let phase = 'idle'; // idle | running | paused
let stepFn = null;
let stepCount = 0;

function status() {
  return Object.freeze({ phase, step: stepCount, tick: clock.now().tick });
}

/**
 * 配置步进体（感知 → 决策 → 行动 → 记录），供 run 循环调用。
 * @param {{ step?: (ctx: object) => void }} [opts]
 * @returns {{ phase: string, step: number, tick: number }}
 */
export function configure(opts = {}) {
  if (opts.step !== undefined) stepFn = opts.step;
  return status();
}

/**
 * 同步推进 N 个 tick（默认 1）。每个 tick 先推进时钟再执行 step。
 * @param {{ steps?: number, step?: (ctx: object) => void }} [opts]
 * @returns {{ phase: string, step: number, tick: number }}
 */
export function run(opts = {}) {
  const steps = opts.steps ?? 1;
  if (!Number.isInteger(steps) || steps < 0) {
    throw new TypeError('cycle.run: steps 必须为 >=0 的整数');
  }
  if (opts.step !== undefined) stepFn = opts.step;
  if (typeof stepFn !== 'function') {
    throw new TypeError('cycle.run: 缺少 step 函数（先 configure({step}) 或 run({step})）');
  }
  phase = 'running';
  for (let i = 0; i < steps; i += 1) {
    if (phase !== 'running') break;
    clock.tick();
    stepCount += 1;
    stepFn(Object.freeze({ tick: clock.now().tick, step: stepCount, phase }));
  }
  return status();
}

/**
 * 暂停主循环（run 的当前步进会提前结束）。
 * @returns {{ phase: string, step: number, tick: number }}
 */
export function pause() {
  phase = 'paused';
  return status();
}

/**
 * 恢复主循环（使后续 run 继续推进）。
 * @returns {{ phase: string, step: number, tick: number }}
 */
export function resume() {
  if (phase === 'paused') phase = 'running';
  return status();
}

/** 复位循环控制状态（测试用）。 */
export function __reset() {
  phase = 'idle';
  stepFn = null;
  stepCount = 0;
}
