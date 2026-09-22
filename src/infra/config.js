/**
 * truman-town.infra.config — 配置管理 / Config
 *
 * 读写沙盘运行参数。以 graph store 作为持久化基座：每个配置项是一个
 * type=config 的图节点，key 支持点分路径（如 "survival.decay"）。
 * set / get 均返回深拷贝，避免外部直接改动内部快照。
 */

import * as graph from './store/graph.js';

const CONFIG_TYPE = 'config';
const CONFIG_PREFIX = 'config:';

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
