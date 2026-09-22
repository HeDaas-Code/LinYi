/**
 * truman-town.town.residence — 住宅 / Residence
 *
 * 处理居民入住、搬出与租金，把智能体分配到住宅。以 graph store 持久化，
 * 连接家庭与住房。
 */

import * as graph from '../infra/store/graph.js';

const TYPE = 'town.residence';
const PREFIX = 'town:residence:';

function nodeId(id) {
  return PREFIX + id;
}

function assertId(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('residence: id 必须为非空字符串');
  }
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function load(residenceId, create = false) {
  const node = graph.read(nodeId(residenceId));
  if (node !== null && node.data !== undefined) return clone(node.data);
  if (!create) return null;
  return { id: residenceId, residents: [], rent: {} };
}

function save(data) {
  graph.write({ id: nodeId(data.id), type: TYPE, data });
  return clone(data);
}

/**
 * 居民入住某住宅。
 * @param {{ agentId: string, residenceId: string }} input
 * @returns {object} 住宅快照
 */
export function move_in(input = {}) {
  assertId(input.agentId);
  assertId(input.residenceId);
  const residence = load(input.residenceId, true);
  if (!residence.residents.includes(input.agentId)) {
    residence.residents.push(input.agentId);
  }
  return save(residence);
}

/**
 * 居民搬出某住宅（未指定住所则从全部住宅移除）。
 * @param {{ agentId: string, residenceId?: string }} input
 * @returns {object | string[] | null} 住宅快照 / 受影响住宅 id 列表 / null
 */
export function move_out(input = {}) {
  assertId(input.agentId);
  if (input.residenceId !== undefined) {
    assertId(input.residenceId);
    const residence = load(input.residenceId);
    if (residence === null) return null;
    residence.residents = residence.residents.filter((r) => r !== input.agentId);
    return save(residence);
  }
  const affected = [];
  for (const n of graph.read({ type: TYPE })) {
    const r = clone(n.data);
    if (Array.isArray(r.residents) && r.residents.includes(input.agentId)) {
      r.residents = r.residents.filter((x) => x !== input.agentId);
      save(r);
      affected.push(r.id);
    }
  }
  return affected;
}

/**
 * 记录某居民在住宅的租金（累加）。
 * @param {{ agentId: string, residenceId: string, amount: number }} input
 * @returns {object} 住宅快照
 */
export function rent(input = {}) {
  assertId(input.agentId);
  assertId(input.residenceId);
  if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount < 0) {
    throw new TypeError('residence.rent: amount 必须为非负数');
  }
  const residence = load(input.residenceId, true);
  residence.rent[input.agentId] = (residence.rent[input.agentId] ?? 0) + input.amount;
  return save(residence);
}

/**
 * 查询住宅。
 * - query()      → 全部住宅
 * - query('id')  → 单个住宅或 null
 * @param {string | undefined} [query]
 * @returns {object | object[] | null}
 */
export function query(query) {
  if (query === undefined || query === null) return graph.read({ type: TYPE }).map((n) => clone(n.data));
  if (typeof query === 'string') {
    const n = graph.read(nodeId(query));
    return n === null ? null : clone(n.data);
  }
  return graph.read({ type: TYPE }).map((n) => clone(n.data));
}

/** 某居民当前的住宅 id（无则 null）。 */
export function residenceOf(agentId) {
  assertId(agentId);
  for (const n of graph.read({ type: TYPE })) {
    if (n.data && Array.isArray(n.data.residents) && n.data.residents.includes(agentId)) return n.data.id;
  }
  return null;
}

/** 复位底层 graph store（测试用）。 */
export function __reset() {
  graph.__reset();
}
