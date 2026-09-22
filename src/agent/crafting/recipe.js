/**
 * truman-town.agent.crafting.recipe — 配方 / Recipe
 *
 * 定义与学习物品、建筑、书籍的制作配方。配方记录材料（背包物品 id → 数量）、
 * 耗时（tick 数）、能耗与产出。define 幂等注册，query 按 id / kind 检索，
 * learn 记录某居民已学会的配方。模块级依赖 inventory.item（材料物品目录）
 * 与 civilization.tech.tree（学习门槛，MVP 阶段为声明式，不强制）。
 */

const KINDS = new Set(['item', 'building', 'book']);

/** @type {Map<string, object>} */
const recipes = new Map();
/** @type {Map<string, Set<string>>} */
const learned = new Map();
let seq = 0;

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('recipe.learn: agentId 必须为非空字符串');
  }
}

/**
 * 定义（幂等 upsert）一个配方。
 * @param {{ id?: string, name?: string, kind?: 'item'|'building'|'book',
 *           materials?: Record<string, number>, ticks?: number,
 *           energyCost?: number, output?: object }} input
 * @returns {object} 配方快照
 */
export function define(input = {}) {
  const id = (typeof input.id === 'string' && input.id.trim() !== '') ? input.id : 'recipe_' + (++seq);
  const kind = KINDS.has(input.kind) ? input.kind : 'item';
  const materials = (input.materials && typeof input.materials === 'object') ? input.materials : {};
  for (const [matId, qty] of Object.entries(materials)) {
    if (!Number.isInteger(qty) || qty < 1) {
      throw new TypeError('recipe.define: 材料 "' + matId + '" 数量必须为正整数');
    }
  }
  const ticks = (Number.isInteger(input.ticks) && input.ticks >= 1) ? input.ticks : 1;
  const energyCost = (typeof input.energyCost === 'number' && Number.isFinite(input.energyCost) && input.energyCost >= 0) ? input.energyCost : 0;
  const record = {
    id,
    name: (typeof input.name === 'string' && input.name !== '') ? input.name : id,
    kind,
    materials: clone(materials),
    ticks,
    energyCost,
    output: (input.output && typeof input.output === 'object') ? clone(input.output) : {},
  };
  recipes.set(id, record);
  return clone(record);
}

/**
 * 查询配方。
 * - query()           → 全部配方（按 id 排序）
 * - query({ id })     → 单个配方；缺失返回 null
 * - query({ kind })   → 指定 kind 的配方数组
 * @param {{ id?: string, kind?: string }} [input]
 * @returns {object | object[] | null}
 */
export function query(input = {}) {
  if (input?.id !== undefined) {
    const rec = recipes.get(input.id);
    return rec === undefined ? null : clone(rec);
  }
  const all = [...recipes.values()];
  const list = (input?.kind !== undefined) ? all.filter((r) => r.kind === input.kind) : all;
  return list.map((r) => clone(r)).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * 记录某居民学会某配方。
 * @param {{ agentId: string, recipeId: string }} input
 * @returns {{ agentId: string, recipeId: string, learned: string[] }}
 */
export function learn(input = {}) {
  const agentId = input?.agentId; assertAgentId(agentId);
  const recipeId = input?.recipeId;
  if (typeof recipeId !== 'string' || recipeId.trim() === '') {
    throw new TypeError('recipe.learn: recipeId 必须为非空字符串');
  }
  if (!recipes.has(recipeId)) {
    throw new Error('recipe.learn: 配方不存在 "' + recipeId + '"');
  }
  let set = learned.get(agentId);
  if (set === undefined) { set = new Set(); learned.set(agentId, set); }
  set.add(recipeId);
  return { agentId, recipeId, learned: [...set].sort() };
}

/** 查询某居民是否已学会某配方（辅助方法）。 */
export function isLearned(agentId, recipeId) {
  return (learned.get(agentId)?.has(recipeId)) === true;
}

/** 清空配方与学习记录（测试用）。 */
export function __reset() {
  recipes.clear();
  learned.clear();
  seq = 0;
}
