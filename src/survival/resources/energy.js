/**
 * truman-town.survival.resources.energy — 能源 / Energy
 *
 * 追踪能源的生产、消耗与库存。能源比食物更稀缺（默认 100/500，稀缺度 0.8 高于
 * 食物 0），为技术研究供电（civilization.tech.research 经内部 _energy 复用同一
 * 库存节点）。持久化在 graph store（type=survival.resource，id=resource:energy）。
 */

import { createResource } from './_resource.js';

const energy = createResource({ kind: 'energy', defaultStockpile: 100, defaultCapacity: 500 });

/** 增产：调用 survival.resources.energy.produce。 */
export function produce(amount = 1) {
  return energy.produce(amount);
}

/** 消耗：调用 survival.resources.energy.consume。 */
export function consume(amount = 1) {
  return energy.consume(amount);
}

/** 查询：调用 survival.resources.energy.query。 */
export function query() {
  return energy.query();
}

/** 自然损耗（辅助方法，不属于声明 RPC 契约）。 */
export function decay(rate = 0) {
  return energy.decay(rate);
}

/** 复位能源库存到默认值（测试用）。 */
export function __reset() {
  energy.__reset();
}

