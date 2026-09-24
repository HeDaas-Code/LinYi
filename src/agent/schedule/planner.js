/**
 * truman-town.agent.schedule.planner — 日程规划 / Schedule Planner
 *
 * 按动机权重（persona.motivation）与生存目标（survival.goal）生成当日日程，
 * 突发事件后 replan 重排。日程是「时间块 → 行动」的有序列表，供 executor 按 tick 推进。
 * 职业（occupation）会为日程注入 work 时间块（职业影响日程）。
 *
 * RPC：agent.schedule.planner.generate / replan
 */

import * as graph from '../../infra/store/graph.js';
import * as motivation from '../persona/motivation.js';
import * as aiPrompt from '../../ai/prompt/agent.js';
import * as survivalGoal from '../../survival/goal.js';

const TYPE = 'agent.schedule';
const DEFAULT_LENGTH = 12;

function nodeId(agentId) { return 'schedule:' + agentId; }

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('planner: agentId 必须为非空字符串');
  }
  return agentId;
}

function load(agentId) {
  const n = graph.read(nodeId(agentId));
  return (n && n.type === TYPE && n.data) ? n.data : null;
}

/** 按动机权重把 length 个 tick 切成有序时间块（至少给每个正权重行动 1 tick）。 */
function buildBlocks(ranked, length, tick) {
  const positive = ranked.filter((m) => m.weight > 0);
  if (positive.length === 0) {
    return [{ action: 'rest', start: tick, end: tick + length, reason: '无明确动机，休息' }];
  }
  const total = positive.reduce((s, m) => s + m.weight, 0);
  const counts = positive.map(() => 1);
  let remaining = Math.max(0, length - positive.length);
  for (let i = 0; i < positive.length; i += 1) {
    counts[i] += Math.round((positive[i].weight / total) * remaining);
  }
  counts[0] += length - counts.reduce((a, b) => a + b, 0); // 尾差补偿
  const blocks = [];
  let cursor = tick;
  for (let i = 0; i < positive.length; i += 1) {
    const len = Math.max(0, counts[i]);
    if (len === 0) continue;
    blocks.push({
      action: positive[i].action,
      start: cursor,
      end: cursor + len,
      reason: positive[i].drivers.join('+') || 'motivation',
    });
    cursor += len;
  }
  return blocks;
}

/** 组装日程骨架（不含 AI 提示词），供 generate 与 replan 复用（replan 走廉价路径）。 */
function buildSchedule(agentId, input = {}) {
  const ranked = motivation.rank(agentId, { needs: input.needs ?? {}, profile: input.profile ?? {} });
  if (input.occupation) {
    ranked.push({ action: 'work', weight: 0.5, drivers: ['occupation:' + input.occupation] });
  }
  const goal = survivalGoal.elapsed({ tick: input.tick ?? 0 });
  return {
    agentId,
    startTick: input.tick ?? 0,
    length: input.length ?? DEFAULT_LENGTH,
    blocks: buildBlocks(ranked, input.length ?? DEFAULT_LENGTH, input.tick ?? 0),
    occupation: input.occupation ?? null,
    replans: 0,
    trigger: 'initial',
    reason: '',
    goal: goal.goal,
    createdAt: Date.now(),
  };
}

/**
 * 生成当日日程。
 * @param {string} agentId
 * @param {{ tick?: number, length?: number, needs?: object, profile?: object, occupation?: string }} [input]
 * @returns {object} 日程（agentId/startTick/length/blocks/replans/trigger）
 */
export function generate(agentId, input = {}) {
  assertAgentId(agentId);
  const tick = Number.isInteger(input?.tick) ? input.tick : 0;
  const length = Number.isInteger(input?.length) && input.length > 0 ? input.length : DEFAULT_LENGTH;
  const needs = (input.needs && typeof input.needs === 'object') ? input.needs : {};
  const profile = (input.profile && typeof input.profile === 'object') ? input.profile : {};
  const occupation = typeof input?.occupation === 'string' && input.occupation.trim() !== '' ? input.occupation : null;
  const schedule = buildSchedule(agentId, { tick, length, needs, profile, occupation });
  // ai.prompt.agent：为当日规划组装情境提示词（轻量真实调用，仅初始生成时）
  const prompt = aiPrompt.compose({ agentId, situation: '请根据生存目标与当前动机规划今天的日程。' });
  schedule.reason = prompt.system.slice(0, 80);
  graph.write({ id: nodeId(agentId), type: TYPE, data: schedule });
  return schedule;
}

/**
 * 突发事件（灾害/疾病/破产/跨日）后重排日程（廉价路径：不重新组装 AI 提示词）。
 * @param {string} agentId
 * @param {{ tick?: number, trigger?: string, needs?: object, profile?: object }} [input]
 * @returns {object} 重排后的日程（replans 递增、trigger 记录）
 */
export function replan(agentId, input = {}) {
  assertAgentId(agentId);
  const prev = load(agentId);
  const tick = Number.isInteger(input?.tick) ? input.tick : 0;
  const trigger = typeof input?.trigger === 'string' && input.trigger.trim() !== '' ? input.trigger : 'interrupt';
  const schedule = buildSchedule(agentId, {
    tick,
    length: Number.isInteger(input?.length) && input.length > 0 ? input.length : (prev?.length ?? DEFAULT_LENGTH),
    needs: (input.needs && typeof input.needs === 'object') ? input.needs : {},
    profile: (input.profile && typeof input.profile === 'object') ? input.profile : {},
    occupation: typeof input?.occupation === 'string' ? input.occupation : (prev?.occupation ?? null),
  });
  schedule.replans = (prev?.replans ?? 0) + 1;
  schedule.trigger = trigger;
  schedule.prevTrigger = (prev?.trigger) ?? 'initial';
  schedule.reason = (prev?.reason) ?? '';
  graph.write({ id: nodeId(agentId), type: TYPE, data: schedule });
  return schedule;
}

/** 读取当前日程（无则 null）。 */
export function current(agentId) {
  return load(agentId);
}

/** 全部日程汇总（count/averageLength/totalReplans），供观测与跨种子对照。 */
export function summary() {
  const all = graph.read({ type: TYPE });
  let count = 0;
  let totalLength = 0;
  let totalReplans = 0;
  for (const n of all) {
    const d = n.data;
    if (!d) continue;
    count += 1;
    totalLength += d.length ?? 0;
    totalReplans += d.replans ?? 0;
  }
  return { count, averageLength: count ? Number((totalLength / count).toFixed(2)) : 0, totalReplans };
}

/** 无独立状态（日程持久化在 graph store）。 */
export function __reset() {}
