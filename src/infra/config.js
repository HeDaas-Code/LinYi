/**
 * truman-town.infra.config — 配置管理 / Config
 *
 * 统一读写沙盘运行参数：以 graph store 作为持久化基座（type=config，
 * key 支持点分路径），并提供参数默认值快照（defaults）与校验（validate /
 * resolve），供 loop / _stage2 / _stage3 / bench 复用，保证外提参数一处定义、
 * 全局一致。
 */

import * as graph from './store/graph.js';

const CONFIG_TYPE = 'config';
const CONFIG_PREFIX = 'config:';

// ---- 默认值快照（外提参数唯一事实来源，冻结） ----

/** 沙盘参数默认值。 */
export const DEFAULTS = Object.freeze({
  decay: Object.freeze({ food: 0.01, water: 0.01 }),
  needGrowth: Object.freeze({ food: 0.08, water: 0.08 }),
  eventProbability: 0.3,
  epidemicThreshold: 0.5,
  procreationMatchThreshold: 0.3,
  tagCount: 50,
  sharedTagCount: 45,
  ritualInterval: 2,
  traumaRate: 0.2,
  breakThreshold: 0.7,
  starvationThreshold: 0.9,
  starvationTicks: 5,
  starvationHealthDecline: 0.2,
  eatThreshold: 0.4,
  forageYield: 2,
  foragePoolCapacity: 30,
  forageRegen: 8,
  foragePoolPerCapita: 1.0,
  forageRegenPerCapita: 0.15,
});

/** 返回默认值深拷贝快照。 */
export function defaults() {
  return structuredClone(DEFAULTS);
}

// ---- 校验 ----

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function isUnit(v) {
  return isNum(v) && v >= 0 && v <= 1;
}

function isNonNeg(v) {
  return isNum(v) && v >= 0;
}

function isPosInt(v) {
  return Number.isInteger(v) && v > 0;
}

function isNonNegInt(v) {
  return Number.isInteger(v) && v >= 0;
}

function rateObject(v, hi) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const foodOk = v.food === undefined || (isNum(v.food) && v.food >= 0 && v.food <= hi);
  const waterOk = v.water === undefined || (isNum(v.water) && v.water >= 0 && v.water <= hi);
  return foodOk && waterOk && (v.food !== undefined || v.water !== undefined);
}

/** 校验规则：返回 true（通过）或错误消息字符串。 */
const RULES = {
  decay: (v) => (rateObject(v, 1) ? true : 'decay.food/water 必须是 [0,1] 区间数值'),
  needGrowth: (v) => (rateObject(v, Infinity) ? true : 'needGrowth.food/water 必须是非负有限数值'),
  eventProbability: (v) => (isUnit(v) ? true : '必须是 [0,1] 区间数值'),
  epidemicThreshold: (v) => (isUnit(v) ? true : '必须是 [0,1] 区间数值'),
  procreationMatchThreshold: (v) => (isUnit(v) ? true : '必须是 [0,1] 区间数值'),
  tagCount: (v) => (isPosInt(v) ? true : '必须是正整数'),
  sharedTagCount: (v) => (isNonNegInt(v) ? true : '必须是非负整数'),
  ritualInterval: (v) => (isPosInt(v) ? true : '必须是正整数'),
  traumaRate: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  breakThreshold: (v) => (isUnit(v) ? true : '必须是 [0,1] 区间数值'),
  starvationThreshold: (v) => (isUnit(v) ? true : '必须是 [0,1] 区间数值'),
  starvationTicks: (v) => (isPosInt(v) ? true : '必须是正整数'),
  starvationHealthDecline: (v) => (isUnit(v) ? true : '必须是 [0,1] 区间数值'),
  eatThreshold: (v) => (isUnit(v) ? true : '必须是 [0,1] 区间数值'),
  forageYield: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  foragePoolCapacity: (v) => ((isNum(v) && v > 0) ? true : '必须是正有限数值'),
  forageRegen: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  foragePoolPerCapita: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
  forageRegenPerCapita: (v) => (isNonNeg(v) ? true : '必须是非负有限数值'),
};

/**
 * 校验一组参数覆盖（只校验已知键，忽略未知键；不落盘）。
 * @param {Record<string, unknown>} [values]
 * @returns {{ ok: boolean, errors: Array<{ key: string, message: string }> }}
 */
export function validate(values = {}) {
  if (values === null || typeof values !== 'object' || Array.isArray(values)) {
    return { ok: false, errors: [{ key: '<root>', message: 'values 必须为普通对象' }] };
  }
  const errors = [];
  for (const [key, rule] of Object.entries(RULES)) {
    if (values[key] === undefined) continue;
    const res = rule(values[key]);
    if (res !== true) errors.push({ key, message: res });
  }
  if (
    values.sharedTagCount !== undefined && values.tagCount !== undefined
    && Number.isInteger(values.sharedTagCount) && Number.isInteger(values.tagCount)
    && values.sharedTagCount > values.tagCount
  ) {
    errors.push({ key: 'sharedTagCount', message: 'sharedTagCount 不得大于 tagCount' });
  }
  return { ok: errors.length === 0, errors };
}

function deepMerge(base, override) {
  const out = { ...base };
  for (const [k, v] of Object.entries(override ?? {})) {
    if (v === undefined) continue;
    if (
      v !== null && typeof v === 'object' && !Array.isArray(v)
      && out[k] !== null && typeof out[k] === 'object' && !Array.isArray(out[k])
    ) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * 把一组覆盖深度合并到默认值之上并校验。
 * @param {Record<string, unknown>} [values]
 * @returns {{ config: object, ok: boolean, errors: Array<{ key: string, message: string }> }}
 */
export function resolve(values = {}) {
  const merged = deepMerge(defaults(), values ?? {});
  const v = validate(merged);
  return { config: merged, ok: v.ok, errors: v.errors };
}

// ---- 统一读写（graph store 持久化） ----

function nodeId(key) {
  return CONFIG_PREFIX + key;
}

function assertKey(key) {
  if (typeof key !== 'string' || key.trim() === '') {
    throw new TypeError('config: key 必须为非空字符串');
  }
}

/**
 * 写入单个配置项。
 * @param {string} key
 * @param {unknown} value 任意可结构化克隆的值
 * @returns {unknown} 已写入的值快照
 */
export function set(key, value) {
  assertKey(key);
  if (value === undefined) {
    throw new TypeError('config.set: value 不能为 undefined（如需删除请显式写入 null）');
  }
  graph.write({
    id: nodeId(key),
    type: CONFIG_TYPE,
    data: { key, value },
  });
  return structuredClone(value);
}

/**
 * 批量合并配置（对象形式）。
 * @param {Record<string, unknown>} values
 * @returns {Record<string, unknown>} 已写入的完整配置快照
 */
export function setMany(values) {
  if (values === null || typeof values !== 'object' || Array.isArray(values)) {
    throw new TypeError('config.setMany: values 必须为普通对象');
  }
  for (const [key, value] of Object.entries(values)) {
    set(key, value);
  }
  return get();
}

/**
 * 读取配置。
 * - get()        → 全部配置（对象）
 * - get(key)     → 单个配置值；缺失返回 undefined
 * @param {string} [key]
 * @returns {unknown}
 */
export function get(key) {
  if (key === undefined) {
    const all = graph.read({ type: CONFIG_TYPE });
    const out = {};
    for (const node of all) {
      if (node.data && typeof node.data.key === 'string') {
        out[node.data.key] = structuredClone(node.data.value);
      }
    }
    return out;
  }
  assertKey(key);
  const node = graph.read({ id: nodeId(key) });
  return node && node.data ? structuredClone(node.data.value) : undefined;
}

/** 复位底层 graph store（测试 / 复位用，会清空图内全部节点）。 */
export function __reset() {
  graph.__reset();
}
