/**
 * truman-town.civilization.tech.research — 研究 / Research
 *
 * 由工程师、医生等职业角色推进研究进度并完成技术突破。start 校验技术可研究
 *（前置已解锁且未失传）并登记任务；progress 每推进 1 个 tick 消耗 energyCost
 * 能源、进度 +1（能源不足即停）；complete 在进度达标后调用 tree.unlock 完成
 * 突破。三阶段均写 observer 日志。
 *
 * 依赖说明：agent.role.career（职业角色）在 MVP 阶段声明式接受 researchers
 *（不强制校验角色）；survival.resources.energy 由内部 _energy 复用同一库存节点。
 */

import * as tree from './tree.js';
import * as energy from './_energy.js';
import * as eventLog from '../../observer/recorder/event-log.js';
import * as actionLog from '../../observer/recorder/action-log.js';
import * as society from '../../agent/role/society.js';

/** @type {Map<string, object>} */
const active = new Map();

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function snapshot(rec) {
  return {
    techId: rec.techId,
    progress: rec.progress,
    cost: rec.cost,
    energyCost: rec.energyCost,
    researchers: [...rec.researchers],
    startedTick: rec.startedTick,
    done: rec.progress >= rec.cost,
  };
}

function assertResearchers(researchers) {
  if (researchers === undefined || researchers === null) return [];
  if (!Array.isArray(researchers)) {
    throw new TypeError('research: researchers 必须为字符串数组');
  }
  return researchers.map((r) => {
    if (typeof r !== 'string' || r.trim() === '') {
      throw new TypeError('research: researchers 元素必须为非空字符串');
    }
    return r;
  });
}

/**
 * 开始一项技术研究。
 * @param {{ techId: string, researchers?: string[], tick?: number }} input
 * @returns {object} 研究任务快照
 */
export function start(input = {}) {
  const node = tree.query({ techId: input.techId }); // 校验 techId
  if (!node.available) {
    throw new Error('research.start: 技术 "' + input.techId + '" 不可研究（前置未满足 / 已解锁 / 已失传）');
  }
  if (active.has(input.techId)) {
    throw new Error('research.start: 技术 "' + input.techId + '" 已在研究中');
  }
  const rec = {
    techId: input.techId,
    progress: 0,
    cost: node.cost,
    energyCost: node.energyCost,
    researchers: assertResearchers(input.researchers),
    startedTick: Number.isInteger(input.tick) ? input.tick : 0,
  };
  active.set(input.techId, rec);
  eventLog.record({
    tick: Number.isInteger(input.tick) ? input.tick : 0,
    topic: 'civilization.tech.research.start',
    payload: { techId: input.techId, cost: node.cost, researchers: rec.researchers },
  });
  return snapshot(rec);
}

/**
 * 推进全部活跃研究 n 个 tick：每个 tick 消耗 energyCost 能源、进度 +1。
 * @param {{ n?: number, tick?: number }} [input]
 * @returns {object[]} 本批推进后的任务快照（含本批新增进度 advanced）
 */
export function progress(input = {}) {
  const n = input.n ?? 1;
  if (!Number.isInteger(n) || n < 0) {
    throw new TypeError('research.progress: n 必须为 >=0 的整数');
  }
  const tick = Number.isInteger(input.tick) ? input.tick : 0;
  // 教师(literacyRate)提升研究效率：每 tick 累积分数进度，攒满 1 点即额外 +1 进度。
  const literacyRate = clamp01(society.activeEffects().effects.literacyRate ?? 0) * 4;
  const out = [];
  for (const rec of [...active.values()]) {
    let advanced = 0;
    for (let i = 0; i < n && rec.progress < rec.cost; i += 1) {
      const used = energy.consume(rec.energyCost);
      if (used.consumed < rec.energyCost) break; // 能源不足，停止推进
      rec.progress += 1;
      advanced += 1;
      rec._literacy = (rec._literacy ?? 0) + literacyRate;
      if (rec._literacy >= 1) {
        const bonus = Math.floor(rec._literacy);
        rec.progress = Math.min(rec.cost, rec.progress + bonus);
        rec._literacy -= bonus;
      }
    }
    if (advanced > 0) {
      actionLog.record({
        tick,
        agentId: rec.researchers[0] ?? 'civilization',
        action: 'research:progress:' + rec.techId,
        outcome: { progress: rec.progress, cost: rec.cost, advanced },
      });
    }
    out.push({ ...snapshot(rec), advanced });
  }
  return out;
}

/**
 * 完成一项研究：进度达标后解锁技术并移除任务。
 * @param {{ techId: string, tick?: number }} input
 * @returns {object} 突破结果（含解锁后的节点快照）
 */
export function complete(input = {}) {
  const rec = active.get(input.techId);
  if (rec === undefined) {
    throw new Error('research.complete: 无进行中的研究 "' + input.techId + '"');
  }
  if (rec.progress < rec.cost) {
    throw new Error(
      'research.complete: 研究未完成 "' + input.techId + '" ' + rec.progress + '/' + rec.cost,
    );
  }
  active.delete(input.techId);
  const unlocked = tree.unlock({ techId: input.techId, holders: rec.researchers, tick: input.tick });
  eventLog.record({
    tick: Number.isInteger(input.tick) ? input.tick : 0,
    topic: 'civilization.tech.research.complete',
    payload: { techId: input.techId, researchers: rec.researchers },
  });
  return { techId: input.techId, researchers: [...rec.researchers], unlocked };
}

/** 查看全部活跃研究任务（辅助方法）。 */
export function pending() {
  return [...active.values()].map(snapshot);
}

/** 复位研究任务队列（测试用）。 */
export function __reset() {
  active.clear();
}
