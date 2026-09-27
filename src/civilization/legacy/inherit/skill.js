/**
 * truman-town.civilization.legacy.inherit.skill — 继承技能 / Inherited Skills
 *
 * 遗产链的**终点之一**：技能是"人会做某事"这一事实。
 *
 * 三条硬性质（用户需求原文）：
 * - **有来源**：每项技能都带 source（discoveryId / relicId / sourceGraphId / sourceCivilizationId），
 *   因此"他会金属加工"永远能回答"从哪件遗物读来的、出自哪一代文明"。
 * - **可误解**：source.fidelity 记录这项技能是**读对的**还是**读歪的**（garbled）。
 *   读歪的技能照样生效——居民不知道自己学错了，这是本设计的核心。
 * - **可丢失**：技能只活在具体的人身上；掌握者全部死亡且无人接续，技能即失传
 *  （与 civilization.tech.lock 同构：知识不会因为"曾经存在过"而自动延续）。
 *
 * 持久化：技能表落 graph store（type=civilization.skill），随存档往返。
 */

import * as graphStore from '../../../infra/store/graph.js';
import * as eventLog from '../../../observer/recorder/event-log.js';

/** 技能节点类型。 */
export const TYPE = 'civilization.skill';

/**
 * 技能目录：技能必须**有效应**，否则继承只是记账。
 * effect 的消费点：researchDiscount 见 research 折扣；literacy 见 loop 的识字判定；
 * craftBonus 见候选打分（由 applier 转成偏好或直接加成）。
 */
export const SKILLS = Object.freeze({
  metalwork: Object.freeze({ title: '金属加工', effect: Object.freeze({ researchDiscount: 0.25 }) }),
  stonework: Object.freeze({ title: '石头加工', effect: Object.freeze({ craftBonus: 0.2 }) }),
  reading: Object.freeze({ title: '读写', effect: Object.freeze({ literacy: 0.4 }) }),
  scribbling: Object.freeze({ title: '胡乱涂写', effect: Object.freeze({ literacy: 0.05 }) }),
});

function assertId(id, label) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('skill: ' + label + ' 必须为非空字符串');
  }
}

function nodeId(agentId) {
  return 'skills:' + agentId;
}

function load(agentId) {
  const n = graphStore.read(nodeId(agentId));
  if (n && n.type === TYPE && n.data && Array.isArray(n.data.skills)) return n.data;
  return { agentId, skills: [] };
}

function save(state) {
  graphStore.write({ id: nodeId(state.agentId), type: TYPE, data: state });
  return state;
}

/**
 * 授予一项技能（带完整来源）。
 *
 * 幂等：同一 (agentId, skillId) 只保留**第一次**的来源——技能一旦学会，
 * 后来的物证不会改写"他是从哪儿学的"这段历史。
 *
 * @param {{ agentId: string, skillId: string, source?: object, tick?: number }} input
 * @returns {{ granted: boolean, skill?: object }}
 */
export function grant(input = {}) {
  const agentId = input.agentId;
  assertId(agentId, 'agentId');
  const skillId = input.skillId;
  assertId(skillId, 'skillId');
  if (SKILLS[skillId] === undefined) {
    throw new RangeError('skill.grant: 未知技能「' + skillId + '」（可用：' + Object.keys(SKILLS).join(' / ') + '）');
  }
  const state = load(agentId);
  const existing = state.skills.find((s) => s.skillId === skillId);
  if (existing !== undefined) return { granted: false, skill: existing };
  const record = {
    skillId,
    title: SKILLS[skillId].title,
    source: input.source === undefined || input.source === null ? null : structuredClone(input.source),
    learnedAtTick: Number.isInteger(input.tick) ? input.tick : 0,
  };
  state.skills.push(record);
  save(state);
  eventLog.record({
    tick: record.learnedAtTick,
    topic: 'civilization.skill.learned',
    agentId,
    payload: { skillId, title: record.title, source: record.source },
  });
  return { granted: true, skill: record };
}

/** 某人是否掌握某技能。 */
export function has(agentId, skillId) {
  assertId(agentId, 'agentId');
  assertId(skillId, 'skillId');
  return load(agentId).skills.some((s) => s.skillId === skillId);
}

/** 某人的全部技能（含来源）。 */
export function of(agentId) {
  assertId(agentId, 'agentId');
  return structuredClone(load(agentId).skills);
}

/** 全部技能持有记录。 */
export function all() {
  return graphStore.read({ type: TYPE }).map((n) => n.data);
}

/** 某项技能的全部掌握者。 */
export function holders(skillId) {
  assertId(skillId, 'skillId');
  return all().filter((s) => s.skills.some((k) => k.skillId === skillId)).map((s) => s.agentId);
}

/**
 * 技能失传：掌握者全部死亡且无人继承 → 技能从世界上消失。
 *
 * 与 tech.lock 同构但**粒度不同**：技术是文明级状态，技能是个人级事实。
 * 一个人死了技能就少一份，最后一份消失即失传——这是"可丢失"的实现。
 *
 * @param {{ skillId?: string, living: string[], tick?: number }} input
 * @returns {{ lost: Array<{skillId: string, holders: string[]}> }}
 */
export function detectLoss(input = {}) {
  const living = new Set((Array.isArray(input.living) ? input.living : []).map(String));
  const tick = Number.isInteger(input.tick) ? input.tick : 0;
  const ids = input.skillId === undefined ? Object.keys(SKILLS) : [input.skillId];
  const lost = [];
  for (const skillId of ids) {
    const holdersAll = holders(skillId);
    if (holdersAll.length === 0) continue;
    const surviving = holdersAll.filter((h) => living.has(h));
    if (surviving.length > 0) continue;
    for (const h of holdersAll) {
      const state = load(h);
      state.skills = state.skills.filter((s) => s.skillId !== skillId);
      save(state);
    }
    lost.push({ skillId, holders: holdersAll });
    eventLog.record({ tick, topic: 'civilization.skill.lost', payload: { skillId, holders: holdersAll } });
  }
  return { lost };
}

/** 技能统计。 */
export function stats() {
  const records = all();
  const bySkill = {};
  for (const rec of records) {
    for (const s of rec.skills) bySkill[s.skillId] = (bySkill[s.skillId] ?? 0) + 1;
  }
  return {
    agents: records.filter((r) => r.skills.length > 0).length,
    total: records.reduce((n, r) => n + r.skills.length, 0),
    bySkill,
    garbled: records.reduce((n, r) => n + r.skills.filter((s) => s.source?.fidelity === 'garbled').length, 0),
  };
}

/** 复位（无自有内存状态）。 */
export function __reset() { /* 无自有状态 */ }
