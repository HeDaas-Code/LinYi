/**
 * truman-town.agent.inventory.item — 物品定义 / Item
 *
 * 定义物品的类别、属性与用途。物品目录为全局注册表（进程内 Map），
 * define 未给 id 时用 infra.identity 生成有序 id；query 支持按 id / category
 * 检索。所有返回均为深拷贝，避免调用方改写内部目录。
 */

import * as identity from '../../infra/identity.js';

/** @type {Map<string, { id: string, category: string, name: string, properties: object }>} */
const items = new Map();

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

/**
 * 定义（幂等 upsert）一个物品类型。
 * @param {{ id?: string, category?: string, name?: string, properties?: object }} input
 * @returns {{ id: string, category: string, name: string, properties: object }}
 */
export function define(input = {}) {
  const id = (typeof input.id === 'string' && input.id.trim() !== '') ? input.id : identity.next('item');
  const category = (typeof input.category === 'string' && input.category.trim() !== '') ? input.category : 'misc';
  const record = {
    id,
    category,
    name: (typeof input.name === 'string' && input.name !== '') ? input.name : id,
    properties: (input.properties && typeof input.properties === 'object') ? clone(input.properties) : {},
  };
  items.set(id, record);
  return clone(record);
}

/**
 * 查询物品。
 * - query()               → 全部物品（按 id 排序）
 * - query({ id })         → 单个物品；缺失返回 null
 * - query({ category })   → 指定类别的物品数组
 * @param {{ id?: string, category?: string }} [input]
 * @returns {object | object[] | null}
 */
export function query(input = {}) {
  if (input?.id !== undefined) {
    const rec = items.get(input.id);
    return rec === undefined ? null : clone(rec);
  }
  const all = [...items.values()];
  const list = (input?.category !== undefined)
    ? all.filter((r) => r.category === input.category)
    : all;
  return list.map((r) => clone(r)).sort((a, b) => a.id.localeCompare(b.id));
}

/** 清空物品目录（测试用）。 */
export function __reset() {
  items.clear();
}

// ---- 持久化：物品目录必须进存档 ----

/**
 * 导出物品目录。
 *
 * 物品是居民制作的产物（define 幂等 upsert），背包里的 itemId 指向它们。
 * 不入档则恢复后背包里的物品 id 成为悬空引用（query 返回 null），
 * 制作校验与库存统计全部失真。
 */
export function __snapshot() {
  return { items: clone([...items.values()]) };
}

/**
 * 恢复物品目录（整体替换）。
 * @param {{items?: Array<object>}} [data]
 */
export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('item.__restore: 状态必须为对象');
  }
  items.clear();
  const list = Array.isArray(data.items) ? data.items : [];
  for (const rec of list) {
    if (typeof rec?.id !== 'string' || rec.id === '') continue;
    items.set(rec.id, clone(rec));
  }
  return { items: items.size };
}
