/**
 * truman-town.survival.events.generator.roller — 概率掷点器 / Event Roller
 *
 * 用 infra.rng 掷出是否发生突发事件。roll(probability) 返回布尔判定；
 * seed(value) 固定随机源，保证突发事件序列可回放；next() 暴露底层均匀
 * 随机数（辅助方法），供 selector 做加权抽取。
 */

import * as rng from '../../../infra/rng.js';

/**
 * 固定随机源（委托 infra.rng.seed），返回传入的 seed 便于链式 / 记录。
 * @param {number | string} value
 * @returns {number | string}
 */
export function seed(value) {
  rng.seed(value);
  return value;
}

/**
 * 掷出是否发生突发事件。
 * @param {number} [probability=0.5] 发生概率，自动夹在 [0, 1]
 * @returns {boolean} true 表示本 tick 发生突发事件
 */
export function roll(probability = 0.5) {
  if (typeof probability !== 'number' || !Number.isFinite(probability)) {
    throw new TypeError('roller.roll: probability 必须为有限数值');
  }
  const p = Math.max(0, Math.min(1, probability));
  return rng.next() < p;
}

/** 暴露底层均匀随机数 [0, 1)（辅助方法，用于加权抽取）。 */
export function next() {
  return rng.next();
}

/** 复位随机源（测试用）。 */
export function __reset() {
  rng.__reset();
}
