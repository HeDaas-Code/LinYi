/**
 * truman-town.survival.needs.meter — 需求计量 / Needs Meter
 *
 * 更新并查询每个居民的生存需求水平（饥饿 / 口渴等）。need 水平归一化到
 * [0, 1]：0 表示满足，1 表示危急。query 同时挂接食物 / 水源的稀缺度
 *（dataflow 依赖 food/water），供压力评分器直接消费。
 */

import * as food from '../resources/food.js';
import * as water from '../resources/water.js';

const DEFAULT_NEEDS = Object.freeze({ food: 0, water: 0 });

/** @type {Map<string, { needs: Record<string, number>, updatedAt: number }>} */
const residents = new Map();

function clamp(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('meter: agentId 必须为非空字符串');
  }
}

function assertNeed(need) {
  if (typeof need !== 'string' || need.trim() === '') {
    throw new TypeError('meter: need 必须为非空字符串');
  }
}

function load(agentId) {
  let state = residents.get(agentId);
  if (state === undefined) {
    state = { needs: { ...DEFAULT_NEEDS }, updatedAt: 0 };
    residents.set(agentId, state);
  }
  return state;
}

function currentScarcity() {
  return { food: food.query().scarcity, water: water.query().scarcity };
}

function snapshot(agentId, state) {
  return {
    agentId,
    needs: { ...state.needs },
    scarcity: currentScarcity(),
    updatedAt: state.updatedAt,
  };
}

/**
 * 更新某居民某类需求水平。可传 level（绝对）或 delta（相对），
 * 均夹在 [0, 1]。
 * @param {{ agentId: string, need: string, level?: number, delta?: number }} input
 * @returns {{ agentId: string, need: string, level: number, prev: number }}
 */
export function update(input = {}) {
  const agentId = input?.agentId;
  const need = input?.need;
  assertAgentId(agentId);
  assertNeed(need);

  const state = load(agentId);
  const prev = state.needs[need] ?? 0;
  let next;
  if (input.delta !== undefined) {
    if (typeof input.delta !== 'number' || !Number.isFinite(input.delta)) {
      throw new TypeError('meter.update: delta 必须为有限数值');
    }
    next = clamp(prev + input.delta);
  } else if (input.level !== undefined) {
    if (typeof input.level !== 'number' || !Number.isFinite(input.level)) {
      throw new TypeError('meter.update: level 必须为有限数值');
    }
    next = clamp(input.level);
  } else {
    throw new TypeError('meter.update: 需要 level 或 delta');
  }

  state.needs[need] = next;
  state.updatedAt = Date.now();
  return { agentId, need, level: next, prev };
}

/**
 * 查询需求水平。
 * - query()           → 全体居民的需求快照数组（按 agentId 排序）
 * - query({agentId})  → 单个居民的需求快照；缺失返回默认零水平
 * @param {{ agentId?: string }} [input]
 * @returns {object | object[]}
 */
export function query(input = {}) {
  if (input?.agentId === undefined) {
    const out = [];
    for (const [agentId, state] of [...residents.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      out.push(snapshot(agentId, state));
    }
    return out;
  }
  assertAgentId(input.agentId);
  return snapshot(input.agentId, load(input.agentId));
}

/** 复位全部居民需求（测试用）。 */
export function __reset() {
  residents.clear();
}
