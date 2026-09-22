/**
 * truman-town.agent.crafting.workbench.validator — 配方校验器 / Craft Validator
 *
 * 校验配方、材料与背包库存。materials 返回配方所需材料与耗时；
 * check 判断某居民背包材料是否足够、容量是否容纳产出。
 */

import * as recipe from '../recipe.js';
import * as backpack from '../../inventory/backpack.js';

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function getRecipe(recipeId) {
  if (typeof recipeId !== 'string' || recipeId.trim() === '') {
    throw new TypeError('validator: recipeId 必须为非空字符串');
  }
  const r = recipe.query({ id: recipeId });
  if (r === null) throw new Error('validator: 配方不存在 "' + recipeId + '"');
  return r;
}

/**
 * 返回配方所需材料与耗时。
 * @param {{ recipeId: string }} input
 * @returns {{ recipeId: string, kind: string, materials: object, ticks: number, energyCost: number }}
 */
export function materials(input = {}) {
  const r = getRecipe(input?.recipeId);
  return { recipeId: r.id, kind: r.kind, materials: clone(r.materials), ticks: r.ticks, energyCost: r.energyCost };
}

/**
 * 校验材料与背包库存。
 * @param {{ agentId: string, recipeId: string }} input
 * @returns {{ ok: boolean, recipeId: string, agentId: string, missing: object, reason?: string }}
 */
export function check(input = {}) {
  const agentId = input?.agentId;
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('validator.check: agentId 必须为非空字符串');
  }
  const r = getRecipe(input?.recipeId);
  const bp = backpack.list({ agentId });

  const missing = {};
  for (const [itemId, qty] of Object.entries(r.materials)) {
    const have = bp.items[itemId] ?? 0;
    if (have < qty) missing[itemId] = qty - have;
  }
  if (Object.keys(missing).length > 0) {
    return { ok: false, recipeId: r.id, agentId, missing, reason: '材料不足' };
  }

  const outputQty = (r.kind === 'item' || r.kind === 'book') ? (r.output?.quantity ?? 1) : 0;
  if (outputQty > 0 && bp.capacity !== null && (bp.count + outputQty) > bp.capacity) {
    return { ok: false, recipeId: r.id, agentId, missing: {}, reason: '背包容量不足' };
  }

  return { ok: true, recipeId: r.id, agentId, missing: {} };
}
