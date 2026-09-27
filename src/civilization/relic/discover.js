/**
 * truman-town.civilization.relic.discover — 遗物解读 / Relic Discovery
 *
 * 用户需求原文（t14）：「遗产必须转为**有来源、可误解、可丢失**的技能/研究前提或行动偏好」。
 * 本模块负责其中最关键的一步——**解读**，也就是"可误解"真正发生的地方。
 *
 * 为什么必须单独一层：捡到遗物 ≠ 学会知识。
 * - 一台净水机的残骸，识字的人能读出原理，不识字的人只能读出"这铁疙瘩能装水"；
 * - 完整度低的物证（烧掉半边的笔记）更容易被读歪；
 * - 读歪的后果是**真实的**：他会获得一个错的技能/一个错的研究方向/一条错的行动偏好，
 *   并且**他自己不知道错了**——这正是"可误解"与"随便给点加成"的区别。
 *
 * 解读结果（discovery）是一条**独立落盘的事实**，带完整来源链：
 *   discovery → relicId → sourceGraphId → sourceCivilizationId
 * 后续的 skill / tech / preference 都从 discovery 派生，因此任何一项继承来的能力
 * 都能反查到它出自哪一代文明的哪件物证（见 legacy/inherit/trace.js）。
 *
 * 确定性：解读的成败由 (relicId, agentId, integrity, literacy) 的哈希决定，
 * **不消耗全局 rng**——否则每加一次解读就会扰动整条主随机流，
 * 让"同种子可复现"这一根本约束失效。
 */

import * as graphStore from '../../infra/store/graph.js';
import * as identity from '../../infra/identity.js';
import * as eventLog from '../../observer/recorder/event-log.js';
import * as artifact from './artifact.js';

/** 解读在 graph store 中的节点类型。 */
export const TYPE = 'civilization.relic.discovery';

/** 素养下限：低于此值读不动任何物证（东西还在，只是他看不懂）。 */
const LITERACY_FLOOR = 0.25;

function assertId(id, label) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('discover: ' + label + ' 必须为非空字符串');
  }
}

function hash01(...parts) {
  let h = 2166136261 >>> 0;
  const s = parts.map((p) => String(p)).join('|');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 8) / 16777216;
}

/**
 * 读歪时把刻上去的内容**扭曲**成什么。
 *
 * 扭曲不是随机噪声，而是有语义的错法（这才叫"误解"而非"数据损坏"）：
 * - skill      → 读成一个相邻但错误的技能（把"金属加工"读成"石头加工"）；
 * - tech       → 读成一个**不是**它前置的技术方向；
 * - preference → 偏好方向被读反（把"多去采集"读成"少去采集"）。
 *
 * 三种错法都会在后续真实影响行为，因此"误解"是可观测的，而不是内部标记。
 */
const GARBLED_SKILL = Object.freeze({
  metalwork: 'stonework',
  stonework: 'metalwork',
  reading: 'scribbling',
  scribbling: 'reading',
});
const GARBLED_TECH = Object.freeze({
  water_purification: 'comms',
  greenhouse: 'power',
  power: 'greenhouse',
  medicine: 'water_purification',
  comms: 'medicine',
});

function garble(claim) {
  if (claim === null || typeof claim !== 'object') return null;
  if (claim.type === 'skill') {
    return { type: 'skill', key: GARBLED_SKILL[claim.key] ?? (claim.key + '_misread'), garbledFrom: claim.key };
  }
  if (claim.type === 'tech') {
    return { type: 'tech', key: GARBLED_TECH[claim.key] ?? claim.key, garbledFrom: claim.key };
  }
  if (claim.type === 'preference') {
    return { type: 'preference', key: claim.key, bias: -(Number(claim.bias) || 0), garbledFrom: claim.key };
  }
  return { ...claim, garbledFrom: claim.key ?? null };
}

/**
 * 解读一件遗物（**纯函数**：给定同样的 relic/agent/literacy 必得同样结果）。
 *
 * @param {{ relic: object, agentId: string, literacy?: number, tick?: number }} input
 * @returns {{ discovery: object }}
 */
export function interpret(input = {}) {
  const relic = input.relic;
  if (relic === null || typeof relic !== 'object') {
    throw new TypeError('discover.interpret: relic 必须为对象');
  }
  const agentId = input.agentId;
  assertId(agentId, 'agentId');
  const tick = Number.isInteger(input.tick) ? input.tick : 0;
  const literacy = Math.max(0, Math.min(1, typeof input.literacy === 'number' && Number.isFinite(input.literacy)
    ? input.literacy : 0));

  const integrity = Number.isFinite(relic.integrity) ? relic.integrity : 0.5;
  // 保真概率 = 素养 × 完整度：两者缺一都会读歪。
  const pFaithful = literacy * integrity;
  const roll = hash01('fidelity', relic.relicId, agentId, integrity.toFixed(4));
  const faithful = roll < pFaithful;
  const inscribed = relic.inscribed ?? null;
  const interpreted = faithful
    ? (inscribed === null ? null : { ...inscribed })
    : garble(inscribed);

  return {
    discovery: {
      discoveryId: identity.next('discovery'),
      agentId,
      relicId: relic.relicId,
      relicKind: relic.kind,
      // ---- 来源链（一路可追到文明与图谱）----
      sourceGraphId: relic.sourceGraphId ?? null,
      sourceCivilizationId: relic.sourceCivilizationId ?? null,
      sourceDeeds: relic.sourceDeeds ?? [],
      // ---- 解读结果 ----
      fidelity: faithful ? 'faithful' : 'garbled',
      inscribed: inscribed === null ? null : { ...inscribed },
      interpreted,
      literacy,
      relicIntegrity: integrity,
      pFaithful,
      tick,
    },
  };
}

/**
 * 让某人解读一件遗物，并**落盘**（解读是事实，必须可查、可入档）。
 *
 * @param {{ agentId: string, relicId?: string, tick?: number, literacy?: number }} input
 *   relicId 缺省时取一件**尚未被解读**且完整度最高的遗物。
 * @returns {{ ok: boolean, reason?: string, discovery?: object, relicId?: string }}
 */
export function discover(input = {}) {
  const agentId = input.agentId;
  assertId(agentId, 'agentId');
  const tick = Number.isInteger(input.tick) ? input.tick : 0;
  const literacy = Math.max(0, Math.min(1, typeof input.literacy === 'number' && Number.isFinite(input.literacy)
    ? input.literacy : 0));

  let relic = null;
  if (typeof input.relicId === 'string' && input.relicId !== '') {
    relic = artifact.query({ relicId: input.relicId });
    if (relic === null) return { ok: false, reason: 'no_such_relic' };
    if (typeof relic.discoveredBy === 'string' && relic.discoveredBy !== '') {
      return { ok: false, reason: 'already_discovered', relicId: relic.relicId };
    }
  } else {
    const open = artifact.query({ discovered: false });
    if (open.length === 0) return { ok: false, reason: 'no_undiscovered_relic' };
    // 取完整度最高的一件：人们先捡自己能看懂的东西。
    relic = open.slice().sort((a, b) => (b.integrity - a.integrity) || a.relicId.localeCompare(b.relicId))[0];
  }

  // 素养不足：读不动，且**不消耗**遗物（他看不懂，东西还在那儿）。
  if (literacy < LITERACY_FLOOR) {
    return { ok: false, reason: 'cannot_read', relicId: relic.relicId };
  }

  const { discovery } = interpret({ relic, agentId, literacy, tick });
  graphStore.write({ id: 'discovery:' + discovery.discoveryId, type: TYPE, data: discovery });
  artifact.markDiscovered({ relicId: relic.relicId, agentId, tick, fidelity: discovery.fidelity });
  eventLog.record({
    tick,
    topic: discovery.fidelity === 'faithful' ? 'civilization.relic.interpreted' : 'civilization.relic.misread',
    agentId,
    payload: {
      discoveryId: discovery.discoveryId,
      relicId: relic.relicId,
      relicKind: relic.kind,
      sourceCivilizationId: discovery.sourceCivilizationId,
      inscribed: discovery.inscribed,
      interpreted: discovery.interpreted,
    },
  });
  return { ok: true, discovery, relicId: relic.relicId };
}

/** 列出全部解读事实（可按 agentId / fidelity 过滤）。 */
export function list(options = {}) {
  let out = graphStore.read({ type: TYPE }).map((n) => n.data);
  if (typeof options.agentId === 'string') out = out.filter((d) => d.agentId === options.agentId);
  if (typeof options.fidelity === 'string') out = out.filter((d) => d.fidelity === options.fidelity);
  return out;
}

/** 某人的全部解读事实。 */
export function byAgent(agentId) {
  assertId(agentId, 'agentId');
  return list({ agentId });
}

/** 解读统计（供观测与验收）。 */
export function stats() {
  const all = list();
  return {
    total: all.length,
    faithful: all.filter((d) => d.fidelity === 'faithful').length,
    garbled: all.filter((d) => d.fidelity === 'garbled').length,
    agents: new Set(all.map((d) => d.agentId)).size,
  };
}

/** 复位（无自有内存状态：全部落在 graph store）。 */
export function __reset() { /* 无自有状态 */ }
