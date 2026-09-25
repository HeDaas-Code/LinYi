/**
 * truman-town.agent.inventory.backpack — 背包 / Backpack
 *
 * 向背包添加、移除、列出物品，并管理容量（最大总件数）与负重（最大总重量）。
 * 每个居民的背包为进程内独立状态（Map），物品重量取自物品目录的
 * properties.weight。所有返回均为深拷贝。
 */

import * as item from './item.js';

// 20 → 48：容量 20 是从"4 行动骨架"时期留下的旧参数，与当前的采集/制作/著书玩法不匹配。
// 实测 50 人 200 tick 后抽样 10 人中 9 人背包已满（20/20），木材最多只能存 2 个——
// 而 build 需 3 个木材，于是「建造」在后期永久不可达（build 从 29 衰减到 1-4 次）；
// trade 的 hasSurplus（物品>2）判断也被满包扭曲；著书完成时还会因满包抛 RangeError
// 终止整个模拟。容量须与居民实际产出量相称。
const DEFAULT_CAPACITY = 48;

/** @type {Map<string, { items: Map<string, number>, capacity: number|null, maxWeight: number|null }>} */
const backpacks = new Map();

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('backpack: agentId 必须为非空字符串');
  }
}

function assertItemId(itemId) {
  if (typeof itemId !== 'string' || itemId.trim() === '') {
    throw new TypeError('backpack: itemId 必须为非空字符串');
  }
}

function assertQuantity(qty) {
  if (!Number.isInteger(qty) || qty < 1) {
    throw new TypeError('backpack: quantity 必须为正整数');
  }
}

function load(agentId) {
  let bp = backpacks.get(agentId);
  if (bp === undefined) {
    bp = { items: new Map(), capacity: DEFAULT_CAPACITY, maxWeight: null };
    backpacks.set(agentId, bp);
  }
  return bp;
}

function itemWeight(itemId) {
  const rec = item.query({ id: itemId });
  if (!rec) return 0;
  const w = rec.properties?.weight;
  return typeof w === 'number' && Number.isFinite(w) ? w : 0;
}

function totalCount(bp) {
  let n = 0;
  for (const q of bp.items.values()) n += q;
  return n;
}

function totalWeight(bp) {
  let w = 0;
  for (const [id, qty] of bp.items) w += itemWeight(id) * qty;
  return w;
}

function snapshot(agentId, bp) {
  const items = {};
  for (const [id, qty] of [...bp.items.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    items[id] = qty;
  }
  return { agentId, items, count: totalCount(bp), weight: totalWeight(bp), capacity: bp.capacity, maxWeight: bp.maxWeight };
}

/**
 * 添加物品到背包（受容量与负重约束，超限抛出 RangeError）。
 * @param {{ agentId: string, itemId: string, quantity?: number }} input
 * @returns {object} 更新后的背包快照
 */
export function add(input = {}) {
  const agentId = input.agentId; assertAgentId(agentId);
  const itemId = input.itemId; assertItemId(itemId);
  const quantity = input.quantity ?? 1; assertQuantity(quantity);
  if (item.query({ id: itemId }) === null) {
    throw new Error('backpack.add: 未定义的物品 "' + itemId + '"');
  }
  const bp = load(agentId);
  const newCount = totalCount(bp) + quantity;
  if (bp.capacity !== null && newCount > bp.capacity) {
    throw new RangeError('backpack.add: 超出容量（capacity=' + bp.capacity + '，当前 ' + totalCount(bp) + '，需再入 ' + quantity + '）');
  }
  const newWeight = totalWeight(bp) + itemWeight(itemId) * quantity;
  if (bp.maxWeight !== null && newWeight > bp.maxWeight) {
    throw new RangeError('backpack.add: 超出负重（maxWeight=' + bp.maxWeight + '）');
  }
  bp.items.set(itemId, (bp.items.get(itemId) ?? 0) + quantity);
  return snapshot(agentId, bp);
}

/**
 * 移除背包物品（数量不足抛出 Error）。
 * @param {{ agentId: string, itemId: string, quantity?: number }} input
 * @returns {object} 更新后的背包快照（含 removed / remaining）
 */
export function remove(input = {}) {
  const agentId = input.agentId; assertAgentId(agentId);
  const itemId = input.itemId; assertItemId(itemId);
  const quantity = input.quantity ?? 1; assertQuantity(quantity);
  const bp = load(agentId);
  const have = bp.items.get(itemId) ?? 0;
  if (have < quantity) {
    throw new Error('backpack.remove: "' + itemId + '" 不足（需 ' + quantity + '，有 ' + have + '）');
  }
  const remaining = have - quantity;
  if (remaining === 0) bp.items.delete(itemId); else bp.items.set(itemId, remaining);
  return { ...snapshot(agentId, bp), removed: quantity, itemId, remaining };
}

/**
 * 列出某居民的背包内容。
 * @param {{ agentId: string }} input
 * @returns {object} 背包快照
 */
export function list(input = {}) {
  const agentId = input.agentId; assertAgentId(agentId);
  return snapshot(agentId, load(agentId));
}

/**
 * 读取 / 设置背包容量与负重。
 * @param {{ agentId: string, capacity?: number, maxWeight?: number }} input
 * @returns {object} 背包快照
 */
export function capacity(input = {}) {
  const agentId = input.agentId; assertAgentId(agentId);
  const bp = load(agentId);
  if (input.capacity !== undefined) {
    if (!Number.isInteger(input.capacity) || input.capacity < 0) {
      throw new TypeError('backpack.capacity: capacity 必须为 >=0 的整数');
    }
    bp.capacity = input.capacity;
  }
  if (input.maxWeight !== undefined) {
    if (typeof input.maxWeight !== 'number' || !Number.isFinite(input.maxWeight) || input.maxWeight < 0) {
      throw new TypeError('backpack.capacity: maxWeight 必须为 >=0 的有限数值');
    }
    bp.maxWeight = input.maxWeight;
  }
  return snapshot(agentId, bp);
}

/** 清空全部背包（测试用）。 */
export function __reset() {
  backpacks.clear();
}
