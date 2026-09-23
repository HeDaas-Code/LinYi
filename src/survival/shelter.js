/**
 * truman-town.survival.shelter — 避难所状态 / Shelter Status
 *
 * 维护 LinYi 号避难所的结构完整度、人口容量与损伤状态。持久化在 graph store
 *（type=survival.shelter，id=shelter:main，与 survival.events.impact 的 shelterDamage
 * 共用同一节点）。capacity 随完整度下降而下降；occupants 取全部住宅的入住人数；
 * damage 降低完整度并累积损伤；repair 以劳动力修复完整度、使容量回升（t43：
 * 让危机信号可随修复下降，而不是退化为常量 critical）。
 */

import * as graph from '../infra/store/graph.js';
import * as configStore from '../infra/config.js';

const SHELTER_ID = 'shelter:main';
const TYPE = 'survival.shelter';
const DEFAULT = Object.freeze({
  integrity: 100,
  baseCapacity: configStore.defaults().shelterBaseCapacity,
  damage: 0,
});

function load() {
  const node = graph.read(SHELTER_ID);
  if (node && node.data && typeof node.data.integrity === 'number') {
    return { ...DEFAULT, ...node.data };
  }
  return { ...DEFAULT };
}

function save(state) {
  return graph.write({ id: SHELTER_ID, type: TYPE, data: state }).data;
}

function computeCapacity(state) {
  const base = typeof state.baseCapacity === 'number' && state.baseCapacity > 0 ? state.baseCapacity : 0;
  const integrity = Math.max(0, Math.min(100, typeof state.integrity === 'number' ? state.integrity : 100));
  return Math.max(0, Math.floor(base * integrity / 100));
}

function occupants() {
  let count = 0;
  for (const n of graph.read({ type: 'town.residence' })) {
    if (n.data && Array.isArray(n.data.residents)) count += n.data.residents.length;
  }
  return count;
}

/** 查询：调用 survival.shelter.status（含 integrity/capacity/occupants/damaged）。 */
export function status() {
  const s = load();
  return {
    integrity: s.integrity,
    capacity: computeCapacity(s),
    occupants: occupants(),
    damaged: s.integrity < 100,
  };
}

/** 查询：调用 survival.shelter.capacity（当前可容纳人数）。 */
export function capacity() {
  return computeCapacity(load());
}

/** 损伤：调用 survival.shelter.damage（降低完整度、使容量下降，返回最新快照）。 */
export function damage(amount = 0) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
    throw new TypeError('shelter.damage: amount 必须为非负有限数值');
  }
  const s = load();
  s.integrity = Math.max(0, s.integrity - amount);
  s.damage = (typeof s.damage === 'number' ? s.damage : 0) + amount;
  save(s);
  return {
    integrity: s.integrity,
    capacity: computeCapacity(s),
    occupants: occupants(),
    damaged: s.integrity < 100,
    damage: s.damage,
  };
}

/** 修复：调用 survival.shelter.repair（以劳动力提升完整度、使容量回升，返回最新快照）。 */
export function repair(amount = 0) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
    throw new TypeError('shelter.repair: amount 必须为非负有限数值');
  }
  const s = load();
  const before = s.integrity;
  s.integrity = Math.min(100, before + amount);
  save(s);
  return {
    integrity: s.integrity,
    capacity: computeCapacity(s),
    occupants: occupants(),
    damaged: s.integrity < 100,
    damage: s.damage,
    repaired: s.integrity - before,
  };
}

/** 复位避难所状态到默认（测试用）。 */
export function __reset() {
  save({ ...DEFAULT });
}

