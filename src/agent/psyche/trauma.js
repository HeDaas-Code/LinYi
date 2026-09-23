/**
 * truman-town.agent.psyche.trauma — 创伤 / Trauma
 *
 * 记录亲人死亡、饥荒、冲突与生存压力累积造成的心理创伤，并支持疗愈。
 * 创伤状态以 graph store 持久化（type=psyche.trauma），每次新增/疗愈都写入
 * 一条情景记忆（dataflow 依赖 memory.episodic），并可通过生存压力评分器
 *（survival.needs.pressure.scorer）累积创伤（call 依赖）。
 */

import * as graph from '../../infra/store/graph.js';
import * as identity from '../../infra/identity.js';
import * as episodic from '../memory/episodic/store.js';
import * as pressureScorer from '../../survival/needs/pressure/scorer.js';

const TYPE = 'psyche.trauma';
const PREFIX = 'psyche:trauma:';

/**
 * 创伤事件历史（agentId → 事件数组）。独立于 graph 节点存放，避免 graph.read/write
 * 每次深拷贝整段事件历史导致的 O(t²) 增长；graph 节点只保存 { agentId, level }。
 */
const eventsByAgent = new Map();

/** graph 复位代数：graph 被上层直接 __reset 时使本索引失效。 */
let lastGeneration = -1;

function ensureFresh() {
  const gen = graph.__generation();
  if (gen !== lastGeneration) {
    eventsByAgent.clear();
    lastGeneration = gen;
  }
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('trauma: agentId 必须为非空字符串');
  }
}

function load(agentId) {
  ensureFresh();
  const node = graph.read(PREFIX + agentId);
  const events = eventsByAgent.get(agentId) ?? [];
  if (node && node.data) return { ...node.data, events };
  return { agentId, level: 0, events };
}

function save(state) {
  ensureFresh();
  const { events, ...rest } = state;
  eventsByAgent.set(state.agentId, events);
  graph.write({ id: PREFIX + state.agentId, type: TYPE, data: rest });
}

/**
 * 新增一条创伤并累积创伤水平（夹在 [0,1]）。
 * @param {{ agentId: string, kind: string, severity?: number, source?: string|null, ts?: number }} input
 * @returns {{ agentId: string, level: number, event: object }}
 */
export function add({ agentId, kind, severity = 0.1, source = null, ts } = {}) {
  assertAgentId(agentId);
  if (typeof kind !== 'string' || kind.trim() === '') {
    throw new TypeError('trauma.add: kind 必须为非空字符串');
  }
  if (typeof severity !== 'number' || !Number.isFinite(severity)) {
    throw new TypeError('trauma.add: severity 必须为有限数值');
  }
  const sev = clamp01(severity);
  const state = load(agentId);
  const event = {
    id: identity.next('trm'),
    kind,
    severity: sev,
    source: source ?? null,
    ts: typeof ts === 'number' ? ts : Date.now(),
  };
  state.events.push(event);
  state.level = clamp01(state.level + sev);
  save(state);

  episodic.write(agentId, {
    content: '创伤事件：' + kind,
    emotion: 'trauma',
    salience: sev,
    tags: ['trauma', kind].concat(source ? [source] : []),
  });

  return { agentId, level: state.level, event: structuredClone(event) };
}

/**
 * 查询某智能体的创伤状态（无记录返回 0 水平）。
 * @param {{ agentId: string }} input
 */
export function query({ agentId } = {}) {
  assertAgentId(agentId);
  // load 已返回 graph.read 的深拷贝（或全新空状态），无需二次 structuredClone。
  return load(agentId);
}

/**
 * 疗愈创伤：降低创伤水平（夹在 [0,1]），并写入疗愈记忆。
 * @param {{ agentId: string, amount?: number }} input
 */
export function heal({ agentId, amount = 0.1 } = {}) {
  assertAgentId(agentId);
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
    throw new TypeError('trauma.heal: amount 必须为非负有限数值');
  }
  const state = load(agentId);
  const before = state.level;
  state.level = clamp01(state.level - amount);
  save(state);
  episodic.write(agentId, {
    content: '创伤疗愈',
    emotion: 'relief',
    salience: 0.3,
    tags: ['trauma', 'heal'],
  });
  return { agentId, level: state.level, before };
}

/**
 * 由生存压力累积创伤：severity = 压力评分归一值 × rate。
 * @param {{ agentId: string, rate?: number }} input
 */
export function accumulate({ agentId, rate = 0.2 } = {}) {
  assertAgentId(agentId);
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) {
    throw new TypeError('trauma.accumulate: rate 必须为非负有限数值');
  }
  const pressure = pressureScorer.score({ agentId });
  const severity = clamp01(pressure.normalized * rate);
  if (severity <= 0) {
    return { agentId, level: query({ agentId }).level, pressure: pressure.normalized, added: 0 };
  }
  const result = add({ agentId, kind: 'survival_pressure', severity, source: 'pressure' });
  return { agentId, level: result.level, pressure: pressure.normalized, added: severity, event: result.event };
}

/** 复位底层 graph store 与事件索引（测试用）。 */
export function __reset() {
  eventsByAgent.clear();
  graph.__reset();
  lastGeneration = graph.__generation();
}
