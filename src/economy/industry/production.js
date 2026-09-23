/**
 * truman-town.economy.industry.production — 生产 / Production
 *
 * 制定生产计划（plan）与执行产出（output）。投入为能源（survival.resources.energy）
 * 与原料（survival.resources.food），产出商品计入企业库存；投入不足时按比例降产
 * 并记录原因。产出估值用 market.price（symbol=goods）。
 *
 * RPC：economy.industry.production.plan / output
 */

import * as identity from '../../infra/identity.js';
import * as store from '../_store.js';
import * as market from '../market/index.js';
import * as survival from '../../survival/index.js';

function assertId(id, what) {
  if (typeof id !== 'string' || id.trim() === '') throw new TypeError('production: ' + what + ' 必须为非空字符串');
  return id;
}

function validNum(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

function validCount(v, fallback) {
  return Number.isInteger(v) && v >= 0 ? v : fallback;
}

function load(planId) {
  const node = store.readProduction(planId);
  return (node !== null && node.type === store.TYPES.production) ? node.data : null;
}

function save(planId, data) {
  return store.writeProduction(planId, data).data;
}

/**
 * 制定生产计划。
 * @param {{ businessId: string, output?: number, energyInput?: number, foodInput?: number, tick?: number }} input
 * @returns {object} 计划快照
 */
export function plan(input = {}) {
  const businessId = assertId(input?.businessId, 'businessId');
  const biz = store.readBusiness(businessId);
  if (biz === null || biz.data.status !== 'active') throw new Error('business_not_active: ' + businessId);
  const output = validCount(input?.output, 1);
  const energyInput = validNum(input?.energyInput, 1);
  const foodInput = validNum(input?.foodInput, 0);
  const planId = identity.next('prod');
  const p = {
    planId,
    businessId,
    output,
    energyInput,
    foodInput,
    status: 'planned',
    goodsProduced: 0,
    energyConsumed: 0,
    foodConsumed: 0,
    reasons: [],
    createdAt: Date.now(),
    completedAt: null,
  };
  save(planId, p);
  return p;
}

/**
 * 执行生产计划：消耗能源与原料，按投入充足度降产，产出商品计入企业库存。
 * @param {{ planId: string, tick?: number }} input
 * @returns {object} 产出结果
 */
export function output(input = {}) {
  const planId = assertId(input?.planId, 'planId');
  const p = load(planId);
  if (p === null) throw new Error('production_plan_not_found: ' + planId);
  if (p.status !== 'planned') throw new Error('production_plan_closed: ' + planId);

  const energy = survival.resources.energy.consume(p.energyInput);
  const food = survival.resources.food.consume(p.foodInput);

  let factor = 1;
  const reasons = [];
  if (p.energyInput > 0 && energy.consumed < p.energyInput) {
    factor = Math.min(factor, energy.consumed / p.energyInput);
    reasons.push('insufficient_energy');
  }
  if (p.foodInput > 0 && food.consumed < p.foodInput) {
    factor = Math.min(factor, food.consumed / p.foodInput);
    reasons.push('insufficient_food');
  }
  const goods = Math.floor(p.output * factor);

  const biz = store.readBusiness(p.businessId);
  if (biz !== null) {
    const data = biz.data;
    data.inventory = { goods: (data.inventory?.goods ?? 0) + goods };
    store.writeBusiness(p.businessId, data);
  }

  let value = null;
  try { value = market.price.quote({ symbol: 'goods' }); } catch { value = null; }

  save(planId, {
    ...p,
    status: 'done',
    goodsProduced: goods,
    energyConsumed: energy.consumed,
    foodConsumed: food.consumed,
    reasons,
    value,
    completedAt: Date.now(),
  });
  return {
    planId,
    businessId: p.businessId,
    output: goods,
    goods,
    energyConsumed: energy.consumed,
    foodConsumed: food.consumed,
    reasons,
    value,
  };
}

/** 列出全部生产计划（辅助方法）。 */
export function list() {
  return store.listProductions().map((n) => n.data);
}
