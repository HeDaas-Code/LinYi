/**
 * truman-town.town.building.space — 空间分配 / Space Allocation
 *
 * 在建筑内分配与释放房间/工位/铺面，并对占用做容量管理：分配时校验该建筑
 * 已分配数量不超过其容量。以 graph store 持久化。
 */

import * as graph from '../../infra/store/graph.js';

const TYPE = 'town.building.space';
const PREFIX = 'town:space:';
const BUILDING_PREFIX = 'town:building:';

function nodeId(id) {
  return PREFIX + id;
}

function assertId(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('space: id 必须为非空字符串');
  }
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function buildingCapacity(buildingId) {
  const b = graph.read(BUILDING_PREFIX + buildingId);
  return (b !== null && b.data && typeof b.data.capacity === 'number') ? b.data.capacity : 0;
}

function occupiedCount(buildingId) {
  return graph.read({ type: TYPE }).filter((n) => n.data && n.data.buildingId === buildingId && n.data.released !== true).length;
}

/**
 * 分配一个空间（房间/工位/床）给某占用者。
 * @param {{ id: string, buildingId: string, occupantId?: string|null, kind?: string, allocatedTick?: number }} input
 * @returns {object} 空间快照
 */
export function allocate(input = {}) {
  assertId(input.id);
  assertId(input.buildingId);
  const capacity = buildingCapacity(input.buildingId);
  const occupied = occupiedCount(input.buildingId);
  if (capacity > 0 && occupied >= capacity) {
    throw new Error('space: 建筑 "' + input.buildingId + '" 容量已满（' + capacity + '）');
  }
  const space = {
    id: input.id,
    buildingId: input.buildingId,
    occupantId: input.occupantId === undefined ? null : input.occupantId,
    kind: typeof input.kind === 'string' && input.kind !== '' ? input.kind : 'room',
    allocatedTick: typeof input.allocatedTick === 'number' && Number.isInteger(input.allocatedTick) ? input.allocatedTick : null,
    released: false,
  };
  graph.write({ id: nodeId(input.id), type: TYPE, data: space });
  return clone(space);
}

/**
 * 释放一个空间（软释放：标记 released，清空占用者）。
 * @param {{ id: string }} input
 * @returns {object} 被释放的空间快照
 */
export function release(input = {}) {
  assertId(input.id);
  const node = graph.read(nodeId(input.id));
  if (node === null || node.data === undefined || node.data.released === true) {
    throw new Error('space: 空间 "' + input.id + '" 不存在');
  }
  const removed = clone(node.data);
  removed.released = true;
  removed.occupantId = null;
  graph.write({ id: nodeId(input.id), type: TYPE, data: removed });
  return removed;
}

/**
 * 查询空间占用（默认排除已释放）。
 * - query()                → 全部空间
 * - query({buildingId})    → 按建筑过滤
 * @param {{ buildingId?: string } | undefined} [query]
 * @returns {object[]}
 */
export function query(query) {
  const active = () => graph.read({ type: TYPE }).filter((n) => n.data && n.data.released !== true).map((n) => clone(n.data));
  if (query === undefined || query === null) return active();
  if (typeof query.buildingId === 'string') {
    return graph.read({ type: TYPE }).filter((n) => n.data && n.data.released !== true && n.data.buildingId === query.buildingId).map((n) => clone(n.data));
  }
  return active();
}

/** 某建筑当前占用数（容量管理辅助）。 */
export function occupancy(buildingId) {
  return occupiedCount(buildingId);
}

/** 复位底层 graph store（测试用）。 */
export function __reset() {
  graph.__reset();
}
