/**
 * truman-town.civilization.legacy.inherit.preference — 继承的行动偏好 / Inherited Preferences
 *
 * 遗产链的**另一个终点**：祖先留下的习惯会改变后代"更愿意做什么"。
 *
 * 关键设计：偏好必须是**有界**的。
 * 它是打分上的一个小偏置（|bias| ≤ maxBias，默认 0.4），与结果学习（t4）同量级，
 * 远小于生存门的量级（5）。因此偏好能塑造倾向，**不能**让一个饥饿的人
 * 放弃吃饭去采集——那会把"继承"变成"失控"。
 *
 * 三条性质：
 * - 有来源：每条偏好带 sources（discoveryId/relicId/文明），可反查。
 * - 可误解：读歪的偏好**方向相反**（bias 取负），并且真的会改变行为——
 *   祖先留下的"多去采集"被读成"少去采集"，这是可观测的继承事故。
 * - 可丢失：偏好只存在于具体的人身上，随人消亡。
 */

import * as graphStore from '../../../infra/store/graph.js';
import * as eventLog from '../../../observer/recorder/event-log.js';

/** 偏好节点类型。 */
export const TYPE = 'civilization.preference';

/** 偏置上限：**硬约束**，任何来源都不能突破。 */
export const MAX_BIAS = 0.4;

function assertId(id, label) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('preference: ' + label + ' 必须为非空字符串');
  }
}

function clampBias(v) {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return Math.max(-MAX_BIAS, Math.min(MAX_BIAS, n));
}

function nodeId(agentId) {
  return 'prefs:' + agentId;
}

function load(agentId) {
  const n = graphStore.read(nodeId(agentId));
  if (n && n.type === TYPE && n.data && Array.isArray(n.data.preferences)) return n.data;
  return { agentId, preferences: [] };
}

function save(state) {
  graphStore.write({ id: nodeId(state.agentId), type: TYPE, data: state });
  return state;
}

/**
 * 给某人加上一条行动偏好。
 *
 * 同一 (agentId, action) 的偏好**累加后夹在上限内**：多个来源可以叠加影响，
 * 但永远出不了 ±MAX_BIAS 的带（"有界"在这里强制，不在消费侧，避免漏掉一处）。
 *
 * @param {{ agentId: string, action: string, bias: number, source?: object, tick?: number }} input
 * @returns {{ preference: object }}
 */
export function add(input = {}) {
  const agentId = input.agentId;
  assertId(agentId, 'agentId');
  const action = input.action;
  assertId(action, 'action');
  const raw = typeof input.bias === 'number' && Number.isFinite(input.bias) ? input.bias : 0;
  const state = load(agentId);
  const existing = state.preferences.find((p) => p.action === action);
  if (existing === undefined) {
    state.preferences.push({
      action,
      bias: clampBias(raw),
      rawBias: raw,
      sources: input.source === undefined || input.source === null ? [] : [structuredClone(input.source)],
      updatedAtTick: Number.isInteger(input.tick) ? input.tick : 0,
    });
  } else {
    existing.rawBias = (Number(existing.rawBias) || 0) + raw;
    existing.bias = clampBias(existing.rawBias);
    existing.updatedAtTick = Number.isInteger(input.tick) ? input.tick : 0;
    if (input.source !== undefined && input.source !== null) existing.sources.push(structuredClone(input.source));
  }
  save(state);
  const rec = state.preferences.find((p) => p.action === action);
  eventLog.record({
    tick: rec.updatedAtTick,
    topic: 'civilization.preference.inherited',
    agentId,
    payload: { action, bias: rec.bias, rawBias: rec.rawBias, sources: rec.sources },
  });
  return { preference: structuredClone(rec) };
}

/**
 * 读取某人在某行动上的偏好偏置（打分侧唯一入口）。
 * @param {{ agentId: string, action: string }} input
 * @returns {number} 夹在 [-MAX_BIAS, MAX_BIAS] 内；无偏好时为 0
 */
export function biasFor(input = {}) {
  const agentId = input.agentId;
  assertId(agentId, 'agentId');
  const action = input.action;
  assertId(action, 'action');
  const hit = load(agentId).preferences.find((p) => p.action === action);
  return hit === undefined ? 0 : clampBias(hit.bias);
}

/** 某人的全部偏好。 */
export function of(agentId) {
  assertId(agentId, 'agentId');
  return structuredClone(load(agentId).preferences);
}

/** 全部偏好记录。 */
export function all() {
  return graphStore.read({ type: TYPE }).map((n) => n.data);
}

/**
 * 偏好随人消亡：掌握者全部死亡后，偏好一并消失（"可丢失"）。
 * @param {{ living: string[], tick?: number }} input
 */
export function detectLoss(input = {}) {
  const living = new Set((Array.isArray(input.living) ? input.living : []).map(String));
  const dropped = [];
  for (const rec of all()) {
    if (living.has(rec.agentId)) continue;
    if (rec.preferences.length === 0) continue;
    dropped.push({ agentId: rec.agentId, actions: rec.preferences.map((p) => p.action) });
    save({ agentId: rec.agentId, preferences: [] });
  }
  return { dropped };
}

/** 偏好统计。 */
export function stats() {
  const records = all();
  const byAction = {};
  let total = 0;
  let negative = 0;
  for (const rec of records) {
    for (const p of rec.preferences) {
      total += 1;
      byAction[p.action] = (byAction[p.action] ?? 0) + 1;
      if (p.bias < 0) negative += 1;
    }
  }
  return { agents: records.filter((r) => r.preferences.length > 0).length, total, byAction, negative };
}

/** 复位（无自有内存状态）。 */
export function __reset() { /* 无自有状态 */ }
