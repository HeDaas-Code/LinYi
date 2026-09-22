/**
 * truman-town.agent.crafting.construction — 建造 / Construction
 *
 * 消耗 tick、背包材料与能源建造或加固避难所建筑。build 校验配方与材料、
 * 扣除材料并登记耗时任务；tick 推进任务，归零时把建筑结构写入 graph store
 *（type=town.building.structure）并写观察日志。依赖 runtime.clock 记录起止 tick。
 */

import * as recipe from './recipe.js';
import * as validator from './workbench/validator.js';
import * as backpack from '../inventory/backpack.js';
import * as graph from '../../infra/store/graph.js';
import * as clock from '../../runtime/clock.js';
import * as recorder from '../../observer/recorder/index.js';
import { createJobQueue } from './_jobs.js';

const STRUCTURE_TYPE = 'town.building.structure';
const jobs = createJobQueue();

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('construction.build: agentId 必须为非空字符串');
  }
}

/**
 * 发起一次建筑建造（校验 + 扣材料 + 登记耗时任务）。
 * @param {{ agentId: string, recipeId: string }} input
 * @returns {object} 任务快照（含 remainingTicks）
 */
export function build(input = {}) {
  const agentId = input?.agentId; assertAgentId(agentId);
  const recipeId = input?.recipeId;
  if (typeof recipeId !== 'string' || recipeId.trim() === '') {
    throw new TypeError('construction.build: recipeId 必须为非空字符串');
  }
  const r = recipe.query({ id: recipeId });
  if (r === null) throw new Error('construction.build: 配方不存在 "' + recipeId + '"');
  if (r.kind !== 'building') throw new Error('construction.build: 配方 "' + recipeId + '" 不是建筑配方（kind=' + r.kind + '）');

  const chk = validator.check({ agentId, recipeId });
  if (!chk.ok) throw new Error('construction.build: ' + chk.reason);

  for (const [itemId, qty] of Object.entries(r.materials)) {
    backpack.remove({ agentId, itemId, quantity: qty });
  }

  const job = jobs.enqueue({
    agentId,
    recipeId,
    kind: 'building',
    ticks: r.ticks,
    startTick: clock.now().tick,
    payload: { output: r.output, energyCost: r.energyCost },
  });
  return { ...job, status: 'pending' };
}

/**
 * 推进建造任务队列 n 个 tick，归零的任务完成：结构写入图 + 写观察日志。
 * @param {{ n?: number }} [input]
 * @returns {Array<object>} 本批完成的任务（含 structure / log / completedAtTick）
 */
export function tick(input = {}) {
  const n = input?.n ?? 1;
  if (!Number.isInteger(n) || n < 0) throw new TypeError('construction.tick: n 必须为 >=0 的整数');
  return jobs.advance(n, (job) => {
    const out = job.payload.output ?? {};
    const buildingId = (typeof out.buildingId === 'string' && out.buildingId !== '') ? out.buildingId : 'building_' + job.id;
    const structure = graph.write({
      id: 'structure:' + buildingId,
      type: STRUCTURE_TYPE,
      data: { buildingId, name: out.name ?? buildingId, builtBy: job.agentId, builtAtTick: clock.now().tick, integrity: 100 },
    });
    const log = recorder.actionLog.record({
      tick: clock.now().tick,
      agentId: job.agentId,
      action: 'build:' + job.recipeId,
      outcome: { buildingId, completedAtTick: clock.now().tick },
    });
    return { structure, log, completedAtTick: clock.now().tick };
  });
}

/** 查看未完成的建造任务（辅助方法）。 */
export function pending() {
  return jobs.list();
}

/** 复位建造任务队列（测试用）。 */
export function __reset() {
  jobs.__reset();
}
