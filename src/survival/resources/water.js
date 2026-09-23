/**
 * truman-town.survival.resources.water — 水源 / Water
 *
 * 追踪水源的生产、消耗与库存。库存为 LinYi 避难所全局资源池，持久化在
 * graph store（type=survival.resource，id=resource:water）。
 * produce 增产、consume 消耗（夹在 [0, stockpile]）、query 快照、
 * decay 自然损耗，共同构成"资源衰减"的硬约束输入。
 */

import { createResource } from './_resource.js';

const water = createResource({ kind: 'water', defaultStockpile: 100, defaultCapacity: 100 });

/** 增产：调用 survival.resources.water.produce。 */
export function produce(amount = 1) {
  return water.produce(amount);
}

/** 消耗：调用 survival.resources.water.consume。 */
export function consume(amount = 1) {
  return water.consume(amount);
}

/** 查询：调用 survival.resources.water.query。 */
export function query() {
  return water.query();
}

/** 自然损耗（辅助方法，不属于声明 RPC 契约）。 */
export function decay(rate = 0) {
  return water.decay(rate);
}

/** 复位水源库存到默认值（测试用）。 */
export function __reset() {
  water.__reset();
}
