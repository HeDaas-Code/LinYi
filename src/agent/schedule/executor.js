/**
 * truman-town.agent.schedule.executor — 日程执行 / Schedule Executor
 *
 * 按世界 tick 推进日程并返回当前时间块行动；跨日自动重排；被真实中断（灾害）时交回 planner 重排；
 * 紧急需求（饥饿/口渴）直接进食/饮水，不触发全量重排（O(1)）。
 * 行动候选来自 anticipation.pool（预想池），craft/work 类行动参考 crafting.workbench 进行中的制造。
 *
 * RPC：agent.schedule.executor.start / tick
 */

import * as graph from '../../infra/store/graph.js';
import * as poolSelector from '../anticipation/pool/selector.js';
import * as workbench from '../crafting/workbench/executor.js';
import * as planner from './planner.js';
import * as survival from '../../survival/index.js';

const TYPE = 'agent.schedule.exec';

function nodeId(agentId) { return 'schedule:exec:' + agentId; }

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('executor: agentId 必须为非空字符串');
  }
  return agentId;
}

function loadExec(agentId) {
  const n = graph.read(nodeId(agentId));
  return (n && n.type === TYPE && n.data) ? n.data : null;
}

/** 依 tick 找到当前时间块（schedule.blocks 已按时间有序）。 */
function blockAt(schedule, tick) {
  const blocks = schedule?.blocks ?? [];
  return blocks.find((b) => tick >= b.start && tick < b.end) ?? null;
}

/** 紧急需求时直接进食/饮水（food/water 谁更危急）。 */
function emergencyAction(agentId) {
  const q = survival.needs.meter.query({ agentId });
  const food = q?.needs?.food ?? 0;
  const water = q?.needs?.water ?? 0;
  return food >= water ? 'eat' : 'drink';
}

/**
 * 开始执行日程（写入执行指针状态，并预取预想池候选 + 工作台进行中制造）。
 * @param {string} agentId
 * @param {{ tick?: number }} [input]
 * @returns {object} 执行状态
 */
export function start(agentId, input = {}) {
  assertAgentId(agentId);
  const tick = Number.isInteger(input?.tick) ? input.tick : 0;
  const schedule = planner.current(agentId);
  const candidates = poolSelector.shortlist(agentId, { limit: 6 }).map((a) => a.action);
  const crafting = workbench.pending();
  const state = { agentId, startedAt: tick, pointer: 0, interrupted: 0, candidates, craftingCount: Array.isArray(crafting) ? crafting.length : 0 };
  graph.write({ id: nodeId(agentId), type: TYPE, data: state });
  return { ...state, schedule };
}

/**
 * 推进一个 tick：返回当前时间块行动。被真实中断（非紧急）时交回 planner 重排；
 * 紧急需求直接进食/饮水（不重排）；跨日自动重排为新一天日程。
 * @param {string} agentId
 * @param {{ tick?: number, interrupted?: boolean, trigger?: string }} [input]
 * @returns {{ action: string, block: object|null, replanned: boolean, schedule: object }|null}
 */
export function tick(agentId, input = {}) {
  assertAgentId(agentId);
  const tick = Number.isInteger(input?.tick) ? input.tick : 0;
  const interrupted = input?.interrupted === true;
  const trigger = typeof input?.trigger === 'string' && input.trigger.trim() !== '' ? input.trigger : 'interrupt';

  if (interrupted) {
    if (trigger === 'emergency') {
      // 紧急需求：直接进食/饮水，不重排（O(1)，避免每 tick 全量重排）
      const schedule = planner.current(agentId);
      return { action: emergencyAction(agentId), block: null, replanned: false, schedule, emergency: true };
    }
    const schedule = planner.replan(agentId, { tick, trigger });
    const block = blockAt(schedule, tick);
    return { action: block?.action ?? 'rest', block, replanned: true, schedule };
  }

  let schedule = planner.current(agentId);
  if (!schedule) return null;
  // 跨日：自动重排为新一天日程（每 scheduleLength tick 一次）
  if (tick >= schedule.startTick + schedule.length) {
    schedule = planner.replan(agentId, { tick, trigger: 'day_boundary' });
    const block = blockAt(schedule, tick);
    return { action: block?.action ?? 'rest', block, replanned: true, trigger: 'day_boundary', schedule };
  }
  const block = blockAt(schedule, tick);
  return { action: block?.action ?? 'rest', block, replanned: false, schedule };
}

export function __reset() {}
