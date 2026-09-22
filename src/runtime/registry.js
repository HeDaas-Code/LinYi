/**
 * truman-town.runtime.registry — 实体注册表 / Entity Registry
 *
 * 登记智能体、建筑、企业等实体，提供查找与注销能力。MVP 阶段为进程内内存
 * 注册表；每个实体含唯一 id、可选 type 与 data 载荷。所有读取返回深拷贝，
 * 避免调用方意外改写内部状态。
 */

/** @type {Map<string, { id: string, type: string | null, data: object }>} */
const entities = new Map();

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function normalize(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError('registry.register: record 必须为对象');
  }
  if (typeof record.id !== 'string' || record.id.trim() === '') {
    throw new TypeError('registry.register: record.id 必须为非空字符串');
  }
  if (record.type !== undefined && typeof record.type !== 'string') {
    throw new TypeError('registry.register: record.type 必须为字符串');
  }
  if (record.data !== undefined && (record.data === null || typeof record.data !== 'object' || Array.isArray(record.data))) {
    throw new TypeError('registry.register: record.data 必须为普通对象');
  }
  return {
    id: record.id,
    type: record.type ?? null,
    data: clone(record.data ?? {}),
  };
}

/**
 * 登记（幂等 upsert）一个实体。
 * @param {{ id: string, type?: string, data?: object }} record
 * @returns {object} 已登记的实体快照
 */
export function register(record) {
  const entity = normalize(record);
  entities.set(entity.id, entity);
  return clone(entity);
}

/**
 * 查找实体。
 * - lookup()              → 全部实体数组
 * - lookup('id')          → 单个实体或 null
 * - lookup({ id })        → 单个实体或 null
 * - lookup({ type })      → 匹配 type 的实体数组
 * @param {string | { id?: string, type?: string } | undefined} [query]
 * @returns {object | object[] | null}
 */
export function lookup(query) {
  if (query === undefined || query === null) {
    return clone([...entities.values()]);
  }
  if (typeof query === 'string') {
    const entity = entities.get(query);
    return entity === undefined ? null : clone(entity);
  }
  if (typeof query.id === 'string') {
    const entity = entities.get(query.id);
    return entity === undefined ? null : clone(entity);
  }
  if (typeof query.type === 'string') {
    return clone([...entities.values()].filter((e) => e.type === query.type));
  }
  return clone([...entities.values()]);
}

/**
 * 注销实体。
 * @param {string} id
 * @returns {object | null} 被注销的实体快照；不存在返回 null
 */
export function unregister(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('registry.unregister: id 必须为非空字符串');
  }
  const existed = entities.has(id);
  const entity = entities.get(id);
  entities.delete(id);
  return existed ? clone(entity) : null;
}

/** 已登记实体数量（辅助方法）。 */
export function count() {
  return entities.size;
}

/** 清空注册表（测试用）。 */
export function __reset() {
  entities.clear();
}
