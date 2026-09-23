/**
 * truman-town.survival.resources.food — 食物 / Food
 *
 * 追踪食物的生产、消耗与库存。库存为 LinYi 避难所全局资源池，持久化在
 * graph store（type=survival.resource，id=resource:food）。
 * produce 增产、consume 消耗（夹在 [0, stockpile]）、query 快照、
 * decay 自然损耗，共同构成"资源衰减"的硬约束输入。
 */

import { createResource } from './_resource.js';

const food = createResource({ kind: 'food', defaultStockpile: 100, defaultCapacity: 100 });

/** 增产：调用 survival.resources.food.produce。 */
export function produce(amount = 1) {
  return food.produce(amount);
}

/** 消耗：调用 survival.resources.food.consume。 */
export function consume(amount = 1) {
  return food.consume(amount);
}

/** 查询：调用 survival.resources.food.query。 */
export function query() {
  return food.query();
}

/** 自然损耗（辅助方法，不属于声明 RPC 契约）。 */
export function decay(rate = 0) {
  return food.decay(rate);
}

/** 复位食物库存到默认值（测试用）。 */
export function __reset() {
  food.__reset();
}
