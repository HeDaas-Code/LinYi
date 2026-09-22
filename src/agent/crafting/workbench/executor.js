/**
 * truman-town.agent.crafting.workbench.executor — 制作执行器 / Craft Executor
 *
 * 消耗 tick、背包材料与能源执行物品制作。craft 校验配方与材料、扣除材料并
 * 登记耗时任务；tick 推进任务队列，归零时把产物写入背包（output.store）并
 * 写观察日志（output.log）。依赖 runtime.clock 记录起止 tick。
 */

import * as recipe from '../recipe.js';
import * as validator from './validator.js';
import * as backpack from '../../inventory/backpack.js';
import * as output from './output.js';
import * as clock from '../../../runtime/clock.js';
import { createJobQueue } from '../_jobs.js';

const jobs = createJobQueue();

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('executor.craft: agentId 必须为非空字符串');
  }
}

/**
 * 发起一次物品制作（校验 + 扣材料 + 登记耗时任务）。
 * @param {{ agentId: string, recipeId: string }} input
 * @returns {object} 任务快照（含 remainingTicks）
 */
export function craft(input = {}) {
  const agentId = input?.agentId; assertAgentId(agentId);
  const recipeId = input?.recipeId;
  if (typeof recipeId !== 'string' || recipeId.trim() === '') {
    throw new TypeError('executor.craft: recipeId 必须为非空字符串');
  }
  const r = recipe.query({ id: recipeId });
  if (r === null) throw new Error('executor.craft: 配方不存在 "' + recipeId + '"');
  if (r.kind !== 'item') throw new Error('executor.craft: 配方 "' + recipeId + '" 不是物品配方（kind=' + r.kind + '）');

  const chk = validator.check({ agentId, recipeId });
  if (!chk.ok) throw new Error('executor.craft: ' + chk.reason);

  for (const [itemId, qty] of Object.entries(r.materials)) {
    backpack.remove({ agentId, itemId, quantity: qty });
  }

  const job = jobs.enqueue({
    agentId,
    recipeId,
    kind: 'item',
    ticks: r.ticks,
    startTick: clock.now().tick,
    payload: { output: r.output, energyCost: r.energyCost },
  });
  return { ...job, status: 'pending' };
}

/**
 * 推进制作任务队列 n 个 tick，归零的任务完成：产物入背包 + 写观察日志。
 * @param {{ n?: number }} [input]
 * @returns {Array<object>} 本批完成的任务（含 produced / log / completedAtTick）
 */
export function tick(input = {}) {
  const n = input?.n ?? 1;
  if (!Number.isInteger(n) || n < 0) throw new TypeError('executor.tick: n 必须为 >=0 的整数');
  return jobs.advance(n, (job) => {
    const out = job.payload.output ?? {};
    const produced = output.store({ agentId: job.agentId, itemId: out.itemId, quantity: out.quantity ?? 1 });
    const log = output.log({
      tick: clock.now().tick,
      agentId: job.agentId,
      action: 'craft:' + job.recipeId,
      outcome: { itemId: out.itemId, quantity: out.quantity ?? 1, completedAtTick: clock.now().tick },
    });
    return { produced, log, completedAtTick: clock.now().tick };
  });
}

/** 查看未完成的制作任务（辅助方法）。 */
export function pending() {
  return jobs.list();
}

/** 复位制作任务队列（测试用）。 */
export function __reset() {
  jobs.__reset();
}
