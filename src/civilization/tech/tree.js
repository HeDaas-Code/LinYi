/**
 * truman-town.civilization.tech.tree — 技术树 / Tech Tree
 *
 * 查询、解锁与锁定技术节点（净水、温室、发电、医疗、通信）。每个节点有
 * 前置技术（prerequisites）与研究成本（cost/energyCost），持久化在 graph store
 *（type=civilization.tech，id=tech:<id>）。
 *
 * 状态机：pending（未解锁）→ unlocked（已突破）；lock 置 locked（失传，不可用）。
 * available 由前置是否全部解锁动态推导：pending 且前置全 unlocked 即可研究。
 * unlock / lock 均写 observer event-log，保证技术演进可追踪。
 */

import * as graph from '../../infra/store/graph.js';
import * as eventLog from '../../observer/recorder/event-log.js';

const TYPE = 'civilization.tech';
const NODE_PREFIX = 'tech:';

const TECH_CATALOG = [
  {
    id: 'water_purification',
    name: { zh: '净水', en: 'Water Purification' },
    description: { zh: '净化饮用水，降低水源压力', en: 'Purify drinking water' },
    prerequisites: [],
    cost: 3,
    energyCost: 1,
  },
  {
    id: 'greenhouse',
    name: { zh: '温室种植', en: 'Greenhouse Farming' },
    description: { zh: '室内种植食物，缓解饥荒', en: 'Grow food indoors' },
    prerequisites: ['water_purification'],
    cost: 5,
    energyCost: 2,
  },
  {
    id: 'power',
    name: { zh: '发电', en: 'Power Generation' },
    description: { zh: '为避难所供电', en: 'Generate power for the shelter' },
    prerequisites: ['water_purification'],
    cost: 6,
    energyCost: 3,
  },
  {
    id: 'medicine',
    name: { zh: '医疗', en: 'Medicine' },
    description: { zh: '治疗与防疫', en: 'Treatment and epidemic control' },
    prerequisites: ['greenhouse'],
    cost: 8,
    energyCost: 4,
  },
  {
    id: 'comms',
    name: { zh: '通信', en: 'Communications' },
    description: { zh: '与外界通信', en: 'Communications with the outside' },
    prerequisites: ['power'],
    cost: 10,
    energyCost: 5,
  },
];

const byId = new Map(TECH_CATALOG.map((t) => [t.id, t]));

function defaults(tech) {
  return { id: tech.id, state: 'pending', holders: [], unlockedAtTick: null, lockedAtTick: null };
}

function assertTechId(techId) {
  if (typeof techId !== 'string' || !byId.has(techId)) {
    throw new TypeError('tree: 未知技术 id "' + String(techId) + '"');
  }
}

function load(techId) {
  const node = graph.read(NODE_PREFIX + techId);
  const base = defaults(byId.get(techId));
  if (node && node.data && typeof node.data.state === 'string') {
    return { ...base, ...node.data, id: techId };
  }
  return base;
}

function save(state) {
  return graph.write({ id: NODE_PREFIX + state.id, type: TYPE, data: state }).data;
}

function isUnlocked(techId) {
  return load(techId).state === 'unlocked';
}

function computeAvailable(state) {
  if (state.state !== 'pending') return false;
  const tech = byId.get(state.id);
  return tech.prerequisites.every((id) => isUnlocked(id));
}

function snapshot(techId, tick) {
  const tech = byId.get(techId);
  const state = load(techId);
  return {
    id: techId,
    name: tech.name,
    description: tech.description,
    prerequisites: [...tech.prerequisites],
    cost: tech.cost,
    energyCost: tech.energyCost,
    state: state.state,
    available: computeAvailable(state),
    holders: [...state.holders],
    unlockedAtTick: state.unlockedAtTick,
    lockedAtTick: state.lockedAtTick,
    ...(tick === undefined ? {} : { tick }),
  };
}

/**
 * 查询技术节点。
 * - query()          → 全部技术节点数组
 * - query({techId})  → 单个技术节点快照
 * @param {{ techId?: string }} [input]
 * @returns {object | object[]}
 */
export function query(input = {}) {
  if (input.techId === undefined) {
    return TECH_CATALOG.map((t) => snapshot(t.id));
  }
  assertTechId(input.techId);
  return snapshot(input.techId);
}

/**
 * 解锁一个技术节点（要求其全部前置已解锁）。记录解锁者 holders 与 tick，
 * 并写 observer event-log。
 * @param {{ techId: string, holders?: string[], tick?: number }} input
 * @returns {object} 解锁后的节点快照
 */
export function unlock(input = {}) {
  assertTechId(input.techId);
  const tech = byId.get(input.techId);
  const state = load(input.techId);
  if (state.state === 'unlocked') {
    throw new Error('tree.unlock: 技术 "' + input.techId + '" 已解锁');
  }
  if (state.state === 'locked') {
    throw new Error('tree.unlock: 技术 "' + input.techId + '" 已失传，需重新研究');
  }
  const missing = tech.prerequisites.filter((id) => !isUnlocked(id));
  if (missing.length > 0) {
    throw new Error('tree.unlock: 前置技术未解锁：' + missing.join(', '));
  }
  const holders = Array.isArray(input.holders) ? input.holders.map(String) : [];
  const next = {
    ...state,
    state: 'unlocked',
    holders,
    unlockedAtTick: Number.isInteger(input.tick) ? input.tick : state.unlockedAtTick,
  };
  save(next);
  eventLog.record({
    tick: Number.isInteger(input.tick) ? input.tick : 0,
    topic: 'civilization.tech.unlock',
    payload: { techId: input.techId, holders },
  });
  return snapshot(input.techId);
}

/**
 * 锁定（失传）一个技术节点，使其不可用。清除掌握者并写 observer event-log。
 * @param {{ techId: string, tick?: number }} input
 * @returns {object} 锁定后的节点快照
 */
export function lock(input = {}) {
  assertTechId(input.techId);
  const state = load(input.techId);
  const next = {
    ...state,
    state: 'locked',
    holders: [],
    lockedAtTick: Number.isInteger(input.tick) ? input.tick : state.lockedAtTick,
  };
  save(next);
  eventLog.record({
    tick: Number.isInteger(input.tick) ? input.tick : 0,
    topic: 'civilization.tech.lock',
    payload: { techId: input.techId },
  });
  return snapshot(input.techId);
}

/** 复位全部技术节点到初始状态（测试用）。 */
export function __reset() {
  for (const t of TECH_CATALOG) save(defaults(t));
}

export { TECH_CATALOG };
