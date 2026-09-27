/**
 * truman-town.civilization.legacy.inherit.applier — 遗产注入器 / Legacy Applier
 *
 * 把「上一代留下的物证」变成「下一代真实拥有的能力」。这是 t5 刻意留白的接缝：
 * t5 的交接保证了**旧状态被隔离、新世代真实诞生**，但明确不做"遗产→能力"的注入；
 * 本模块补上这一段，并让整条链可追溯：
 *
 *   legacy.graph → relic.artifact.forge → relic.discover（可能读歪）
 *     → discovery.interpreted → skill / tech 前提 / action 偏好
 *
 * 三种落点（对应需求原文的"技能/研究前提或行动偏好"）：
 * - skill      → 记进 skill 表（带来源），并按其 effect 生效（识字/研究折扣）。
 * - tech       → 记为**研究前提**（research head start）：把该技术标记为"下一代已知道存在"，
 *                研究成本按继承的技能打折。注意**不是**直接解锁——
 *                捡到蓝图不等于会造，必须自己研究出来。
 * - preference → 有界行动偏好（见 preference.js），直接进入决策打分。
 *
 * 读歪（garbled）时三者都会落到**错的**落点上，并且照样生效。
 */

import * as graphStore from '../../../infra/store/graph.js';
import * as skill from './skill.js';
import * as preference from './preference.js';
import * as artifact from '../../relic/artifact.js';
import * as discover from '../../relic/discover.js';
import * as eventLog from '../../../observer/recorder/event-log.js';

/** 研究前提在 graph store 中的节点类型。 */
export const HEADSTART_TYPE = 'civilization.headstart';

/**
 * 把一条解读事实落成能力。
 *
 * @param {{ discovery: object, tick?: number }} input
 * @returns {{ applied: string|null, detail: object|null }}
 */
export function apply(input = {}) {
  const d = input.discovery;
  if (d === null || typeof d !== 'object') {
    throw new TypeError('applier.apply: discovery 必须为对象');
  }
  const tick = Number.isInteger(input.tick) ? input.tick : (Number.isInteger(d.tick) ? d.tick : 0);
  const source = {
    discoveryId: d.discoveryId,
    relicId: d.relicId,
    relicKind: d.relicKind,
    sourceGraphId: d.sourceGraphId,
    sourceCivilizationId: d.sourceCivilizationId,
    fidelity: d.fidelity,
    inscribed: d.inscribed,
  };
  const claim = d.interpreted;
  if (claim === null || typeof claim !== 'object') {
    return { applied: null, detail: null };
  }
  if (claim.type === 'skill') {
    if (skill.SKILLS[claim.key] === undefined) {
      // 读歪可能落到目录外的技能名：**不静默丢弃**，记为一次无效继承。
      return { applied: 'skill_unknown', detail: { skillId: claim.key, source } };
    }
    const res = skill.grant({ agentId: d.agentId, skillId: claim.key, source, tick });
    return { applied: 'skill', detail: { skillId: claim.key, granted: res.granted, source } };
  }
  if (claim.type === 'preference') {
    const res = preference.add({
      agentId: d.agentId, action: claim.key, bias: Number(claim.bias) || 0, source, tick,
    });
    return { applied: 'preference', detail: { action: claim.key, bias: res.preference.bias, source } };
  }
  if (claim.type === 'tech') {
    // 研究前提：登记"下一代知道这项技术的存在"，并记录来源。
    // 真正的解锁仍要走 research/tree，本函数不越权。
    const res = registerHeadStart({ agentId: d.agentId, techId: claim.key, source, tick });
    return { applied: 'tech_headstart', detail: { techId: claim.key, ...res, source } };
  }
  return { applied: null, detail: null };
}

/**
 * 登记"研究前提"（head start）：下一代知道这项技术**存在**，因此研究方向明确。
 * 落 graph store（type=civilization.headstart），供 research 折扣与观测消费。
 */
export function registerHeadStart({ agentId, techId, source = null, tick = 0 } = {}) {
  const id = 'headstart:' + agentId + ':' + techId;
  const prev = graphStore.read(id);
  if (prev !== null && prev !== undefined) {
    return { registered: false, techId };
  }
  graphStore.write({
    id,
    type: HEADSTART_TYPE,
    data: { agentId, techId, source, tick },
  });
  eventLog.record({
    tick, topic: 'civilization.tech.headstart', agentId, payload: { techId, source },
  });
  return { registered: true, techId };
}

/** 某人在某技术上是否有研究前提（供 research 折扣使用）。 */
export function hasHeadStart(agentId, techId) {
  const rec = graphStore.read('headstart:' + agentId + ':' + techId);
  return rec !== null && rec !== undefined;
}

/** 某人的全部研究前提。 */
export function headStartsOf(agentId) {
  return graphStore.read({ type: HEADSTART_TYPE }).map((n) => n.data).filter((d) => d.agentId === agentId);
}

/** 全部研究前提。 */
export function headStarts() {
  return graphStore.read({ type: HEADSTART_TYPE }).map((n) => n.data);
}

/**
 * 继承的**研究折扣**：某人掌握的技术相关技能越多，研究越省力。
 * 折扣有下界（0.5），避免"继承越多、研究越免费"的失控。
 * @param {{ agentId: string }} input
 * @returns {number} 0.5..1 的乘数
 */
export function researchDiscount(agentId) {
  let discount = 1;
  for (const s of skill.of(agentId)) {
    const eff = skill.SKILLS[s.skillId]?.effect ?? {};
    if (typeof eff.researchDiscount === 'number') discount -= eff.researchDiscount;
  }
  return Math.max(0.5, discount);
}

/**
 * 从一份遗产出发，铸造遗物并把解读分派给新世代居民。
 *
 * 分配策略：**按完整度顺序，轮流分给居民**（确定性，不消耗全局 rng）。
 * 不做"人人有份"的均分——物证数量有限，先到先得才是真实情形。
 *
 * 交棒时**不会一次读完祖先的全部遗产**：默认只解读其中一半（至少 1 件）。
 * 这不是省事，而是这条链要成立的前提——如果交接那一刻就把所有物证读光，
 * 常态运行中的"考古"（loop 的 runLegacyDiscovery）就永远无物可捡，
 * "发现"会退化成开局发奖。剩下的一半留给后来的世代在长跑中陆续挖出来。
 * 需要一次读全（测试/工具场景）时显式传 maxDiscoveries: Infinity。
 *
 * @param {{ heritage: object, agents: Array<{id: string}>, tick?: number,
 *           literacyOf?: Function, maxDiscoveries?: number }} input
 * @returns {{ relics: number, discoveries: number, applied: Array<object>, garbled: number,
 *             skipped: Array<string>, undiscovered: number }}
 */
export function seedFromHeritage(input = {}) {
  const heritage = input.heritage ?? {};
  const agents = Array.isArray(input.agents) ? input.agents.filter((a) => a && typeof a.id === 'string') : [];
  const tick = Number.isInteger(input.tick) ? input.tick : 0;
  const literacyOf = typeof input.literacyOf === 'function' ? input.literacyOf : () => 0.5;

  const forged = artifact.forge({ legacy: heritage, civilizationId: heritage?.graph?.civilizationId, tick });
  const applied = [];
  let garbled = 0;
  if (agents.length === 0) {
    return { relics: forged.relics.length, discoveries: 0, applied, garbled, skipped: forged.skipped, undiscovered: forged.relics.length };
  }
  const cap = Number.isFinite(input.maxDiscoveries) && input.maxDiscoveries >= 0
    ? Math.floor(input.maxDiscoveries)
    : (input.maxDiscoveries === Infinity
      ? forged.relics.length
      : Math.max(1, Math.floor(forged.relics.length / 2)));
  for (let i = 0; i < forged.relics.length && i < cap; i += 1) {
    const relic = forged.relics[i];
    const agent = agents[i % agents.length];
    const res = discover.discover({
      agentId: agent.id, relicId: relic.relicId, tick, literacy: literacyOf(agent.id),
    });
    if (res.ok !== true) continue;
    if (res.discovery.fidelity === 'garbled') garbled += 1;
    applied.push({ agentId: agent.id, ...apply({ discovery: res.discovery, tick }) });
  }
  eventLog.record({
    tick,
    topic: 'civilization.legacy.applied',
    payload: {
      civilizationId: heritage?.graph?.civilizationId ?? null,
      relics: forged.relics.length,
      discoveries: applied.length,
      garbled,
    },
  });
  return {
    relics: forged.relics.length,
    discoveries: applied.length,
    applied,
    garbled,
    skipped: forged.skipped,
    undiscovered: forged.relics.length - applied.length,
  };
}
