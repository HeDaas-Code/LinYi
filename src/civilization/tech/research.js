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

/**
 * 改派进行中研究的负责人（t5：文明重启的世代交接）。
 *
 * 为什么必须有这个入口：研究任务在 start 时把负责人 id **记死在记录里**，
 * progress 每 tick 用 rec.researchers[0] 作为行为主体写 action-log。
 * 文明重启把旧世代封存后，若不改派，被封存的居民会继续"隔着世代"推进研究——
 * 实测：交接后 tick 2/3 的 action-log 仍以已封存的 agent_...001 为行为主体。
 * 那既不是历史，也不是新世代的行为，是跨世代的状态泄漏。
 *
 * @param {{ techId: string, researchers: string[], tick?: number }} input
 * @returns {object} 改派后的任务快照
 */
export function reassign(input = {}) {
  const rec = active.get(input?.techId);
  if (rec === undefined) {
    throw new Error('research.reassign: 无进行中的研究 "' + String(input?.techId) + '"');
  }
  const researchers = assertResearchers(input?.researchers);
  if (researchers.length === 0) {
    throw new TypeError('research.reassign: researchers 不能为空数组');
  }
  const previous = [...rec.researchers];
  rec.researchers = researchers;
  eventLog.record({
    tick: Number.isInteger(input?.tick) ? input.tick : 0,
    topic: 'civilization.tech.research.reassign',
    payload: { techId: rec.techId, previous, researchers: [...researchers] },
  });
  return snapshot(rec);
}

/** 查看全部活跃研究任务（辅助方法）。 */
export function pending() {
  return [...active.values()].map(snapshot);
}

/** 复位研究任务队列（测试用）。 */
export function __reset() {
  active.clear();
}

// ---- 持久化：进行中的研究必须进存档 ----

/**
 * 导出活跃研究任务。
 *
 * 研究进度是**逐 tick 累积**的（progress += 1），不入档则恢复后所有在研
 * 项目凭空消失：科技永远不会突破，文明反馈链断裂。
 */
export function __snapshot() {
  return {
    active: [...active.entries()].map(([techId, rec]) => [techId, {
      ...structuredClone(rec),
      // researchers 内部是**数组**（见 start/assertResearchers 的赋值），
      // 显式展开成数组，避免存档里出现 Set 之类的非 JSON 形状。
      researchers: [...(rec.researchers ?? [])],
    }]),
  };
}

/**
 * 恢复活跃研究任务（整体替换）。
 * @param {{active?: Array}} [data]
 */
export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('research.__restore: 状态必须为对象');
  }
  active.clear();
  const list = Array.isArray(data.active) ? data.active : [];
  for (const pair of list) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const rec = pair[1];
    if (typeof pair[0] !== 'string' || pair[0] === '' || rec === null || typeof rec !== 'object') continue;
    // researchers 必须还原成**数组**，与 start()/assertResearchers 的存储形状一致。
    // 还原成 Set 会静默破坏 progress()：它用 rec.researchers[0] 取主导研究者，
    // 而 Set 没有下标，取值恒为 undefined → 研究者被降级成 'civilization'。
    const researchers = Array.isArray(rec.researchers)
      ? rec.researchers.slice()
      : (rec.researchers instanceof Set ? [...rec.researchers] : []);
    active.set(pair[0], { ...structuredClone(rec), researchers });
  }
  return { active: active.size };
}
