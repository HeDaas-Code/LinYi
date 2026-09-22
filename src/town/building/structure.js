/**
 * truman-town.town.building.structure — 建筑结构 / Building Structure
 *
 * 建造与拆除避难所建筑，记录体量（容量）与功能；提供 spawnShelter() 一键生成
 * 初始避难所（核心区 + 宿舍 + 食堂 + 水站），是"初始避难所生成"的入口。
 * 以 graph store 持久化。
 */

import * as graph from '../../infra/store/graph.js';

const TYPE = 'town.building.structure';
const PREFIX = 'town:building:';

function nodeId(id) {
  return PREFIX + id;
}

function assertId(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('structure: id 必须为非空字符串');
  }
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

/**
 * 建造一栋建筑。
 * @param {{ id: string, kind?: string, zoneId?: string|null, capacity?: number, function?: string, builtTick?: number }} input
 * @returns {object} 建筑快照
 */
export function construct(input = {}) {
  assertId(input.id);
  const kind = typeof input.kind === 'string' && input.kind !== '' ? input.kind : 'shelter';
  const building = {
    id: input.id,
    kind,
    zoneId: input.zoneId === undefined ? null : input.zoneId,
    capacity: typeof input.capacity === 'number' && Number.isInteger(input.capacity) && input.capacity >= 0 ? input.capacity : 0,
    function: typeof input.function === 'string' && input.function !== '' ? input.function : kind,
    builtTick: typeof input.builtTick === 'number' && Number.isInteger(input.builtTick) ? input.builtTick : null,
    demolished: false,
  };
  graph.write({ id: nodeId(input.id), type: TYPE, data: building });
  return clone(building);
}

/**
 * 拆除一栋建筑（软删除：标记 demolished，查询时过滤）。
 * @param {{ id: string }} input
 * @returns {object} 被拆除的建筑快照
 */
export function demolish(input = {}) {
  assertId(input.id);
  const node = graph.read(nodeId(input.id));
  if (node === null || node.data === undefined || node.data.demolished === true) {
    throw new Error('structure: 建筑 "' + input.id + '" 不存在');
  }
  const removed = clone(node.data);
  removed.demolished = true;
  graph.write({ id: nodeId(input.id), type: TYPE, data: removed });
  return removed;
}

/** 默认初始避难所建筑清单。 */
const DEFAULT_SHELTER_BUILDINGS = Object.freeze([
  { id: 'shelter_core', kind: 'shelter', capacity: 40, function: '避难所核心区' },
  { id: 'dorm_a', kind: 'residential', capacity: 12, function: '宿舍 A' },
  { id: 'dorm_b', kind: 'residential', capacity: 12, function: '宿舍 B' },
  { id: 'canteen', kind: 'canteen', capacity: 30, function: '食堂' },
  { id: 'water_station', kind: 'water', capacity: 20, function: '水站' },
]);

/**
 * 一键生成初始避难所（默认建筑 + 容量），返回建造清单。
 * @param {{ buildings?: Array<{ id: string, kind?: string, capacity?: number, function?: string, zoneId?: string }> }} [overrides]
 * @returns {object[]} 已生成的建筑快照列表
 */
export function spawnShelter(overrides = {}) {
  const list = Array.isArray(overrides.buildings) && overrides.buildings.length > 0
    ? overrides.buildings
    : DEFAULT_SHELTER_BUILDINGS;
  const out = [];
  for (const b of list) {
    out.push(construct(b));
  }
  return out;
}

/**
 * 查询建筑（默认排除已拆除）。
 * - query()        → 全部建筑
 * - query('id')    → 单个建筑或 null
 * - query({kind})  → 按类型过滤
 * @param {string | { kind?: string } | undefined} [query]
 * @returns {object | object[] | null}
 */
export function query(query) {
  const active = () => graph.read({ type: TYPE }).filter((n) => n.data && n.data.demolished !== true).map((n) => clone(n.data));
  if (query === undefined || query === null) return active();
  if (typeof query === 'string') {
    const n = graph.read(nodeId(query));
    return (n === null || n.data === undefined || n.data.demolished === true) ? null : clone(n.data);
  }
  if (typeof query.kind === 'string') {
    return graph.read({ type: TYPE }).filter((n) => n.data && n.data.demolished !== true && n.data.kind === query.kind).map((n) => clone(n.data));
  }
  return active();
}

/** 复位底层 graph store（测试用）。 */
export function __reset() {
  graph.__reset();
}
