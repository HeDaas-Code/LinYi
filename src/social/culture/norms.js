/**
 * truman-town.social.culture.norms — 社会规范 / Norms
 *
 * 定义哪些行为被接受（accepted）或禁止（forbidden），并随违规事件与舆论漂移。
 * 规范通过「社会压力」影响行为：居民违反规范会累积社会压力（pressure），该压力
 * 供上层决策链读取并约束后续行为。规范与压力以 graph store 持久化，违规写入
 * observer 事件日志，保证每一次违规可追踪。
 */

import * as graph from '../../infra/store/graph.js';
import * as identity from '../../infra/identity.js';
import * as recorder from '../../observer/recorder/index.js';

const NORM_TYPE = 'social.culture.norm';
const VIOLATION_TYPE = 'social.culture.norm.violation';
const PRESSURE_TYPE = 'social.culture.norm.pressure';
const NORM_PREFIX = 'norm:';
const VIOLATION_PREFIX = 'norm.violation:';
const PRESSURE_PREFIX = 'norm.pressure:';

const VALENCES = new Set(['accepted', 'forbidden']);

function assertNormId(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('norms: id 必须为非空字符串');
  }
}

/**
 * 定义 / 更新一条社会规范。
 * @param {{ id: string, valence?: 'accepted'|'forbidden', strength?: number }} input
 * @returns {object} 规范快照
 */
export function update({ id, valence = 'accepted', strength = 0.5 } = {}) {
  assertNormId(id);
  if (!VALENCES.has(valence)) {
    throw new TypeError('norms.update: valence 必须为 accepted 或 forbidden');
  }
  if (typeof strength !== 'number' || Number.isNaN(strength) || strength < 0 || strength > 1) {
    throw new TypeError('norms.update: strength 必须为 [0,1] 区间数值');
  }
  const existing = graph.read(NORM_PREFIX + id);
  const norm = {
    id,
    valence,
    strength,
    violations: existing && existing.data ? existing.data.violations ?? 0 : 0,
  };
  graph.write({ id: NORM_PREFIX + id, type: NORM_TYPE, data: norm });
  return structuredClone(norm);
}

/**
 * 查询规范。
 * - query()     → 全部规范数组
 * - query(id)   → 单条规范或 null
 * @param {string} [id]
 * @returns {object | object[] | null}
 */
export function query(id) {
  if (id === undefined) {
    return graph.read({ type: NORM_TYPE }).map((n) => structuredClone(n.data));
  }
  assertNormId(id);
  const node = graph.read(NORM_PREFIX + id);
  return node && node.data ? structuredClone(node.data) : null;
}

/**
 * 记录一次规范违反：累积违规、对主体施加社会压力，并写入 observer 事件日志。
 * @param {{ agentId: string, normId: string, tick?: number, context?: unknown }} input
 * @returns {{ violation: object, norm: object, pressure: number, log: object }}
 */
export function violate({ agentId, normId, tick = 0, context } = {}) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('norms.violate: agentId 必须为非空字符串');
  }
  assertNormId(normId);
  if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0) {
    throw new TypeError('norms.violate: tick 必须为非负整数');
  }
  const node = graph.read(NORM_PREFIX + normId);
  if (node === null || node.data === undefined) {
    throw new Error('norms.violate: 规范 "' + normId + '" 不存在');
  }
  const norm = structuredClone(node.data);
  const delta = norm.strength;
  norm.violations = (norm.violations ?? 0) + 1;
  graph.write({ id: NORM_PREFIX + normId, type: NORM_TYPE, data: norm });

  const pressure = applyPressure(agentId, delta);
  const violation = {
    id: identity.next('violation'),
    agentId,
    normId,
    tick,
    delta,
    context: context === undefined ? null : structuredClone(context),
  };
  graph.write({ id: VIOLATION_PREFIX + violation.id, type: VIOLATION_TYPE, data: violation });

  const log = recorder.eventLog.record({
    tick,
    topic: 'culture.norm.violated',
    agentId,
    payload: { agentId, normId, valence: norm.valence, delta, pressure },
  });

  return { violation, norm, pressure, log };
}

function applyPressure(agentId, delta) {
  const node = graph.read(PRESSURE_PREFIX + agentId);
  const next = (node && node.data ? node.data.pressure : 0) + delta;
  graph.write({ id: PRESSURE_PREFIX + agentId, type: PRESSURE_TYPE, data: { agentId, pressure: next } });
  return next;
}

/** 查询某主体当前的社会压力。 */
export function pressure(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('norms.pressure: agentId 必须为非空字符串');
  }
  const node = graph.read(PRESSURE_PREFIX + agentId);
  return node && node.data ? node.data.pressure : 0;
}

/** 复位底层 graph store（测试用）。 */
export function __reset() {
  graph.__reset();
}
