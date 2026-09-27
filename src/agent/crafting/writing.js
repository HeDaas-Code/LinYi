/**
 * truman-town.agent.crafting.writing — 著书 / Writing
 *
 * 消耗 tick 与背包材料撰写书籍，把记忆、知识与文化写进书籍并放入背包。
 * write_book 校验配方与材料、扣除材料并登记耗时任务；tick 推进任务，归零时
 * 定义书籍物品并放入背包、写观察日志。依赖 runtime.clock 记录起止 tick。
 */

import * as recipe from './recipe.js';
import * as validator from './workbench/validator.js';
import * as backpack from '../inventory/backpack.js';
import * as item from '../inventory/item.js';
import * as clock from '../../runtime/clock.js';
import * as recorder from '../../observer/recorder/index.js';
import { createJobQueue } from './_jobs.js';

const jobs = createJobQueue();

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('writing.write_book: agentId 必须为非空字符串');
  }
}

/**
 * 发起一次著书。
 * - 传 recipeId：按配方（kind=book）扣材料、取耗时；
 * - 不传 recipeId：默认 1 tick、不耗材料的自由写作。
 * @param {{ agentId: string, recipeId?: string, title?: string, content?: string }} input
 * @returns {object} 任务快照（含 remainingTicks）
 */
export function write_book(input = {}) {
  const agentId = input?.agentId; assertAgentId(agentId);
  const title = (typeof input.title === 'string' && input.title !== '') ? input.title : '未命名书籍';
  const content = input.content ?? '';
  const recipeId = input?.recipeId;

  if (recipeId !== undefined && recipeId !== null) {
    if (typeof recipeId !== 'string' || recipeId.trim() === '') {
      throw new TypeError('writing.write_book: recipeId 必须为非空字符串');
    }
    const r = recipe.query({ id: recipeId });
    if (r === null) throw new Error('writing.write_book: 配方不存在 "' + recipeId + '"');
    if (r.kind !== 'book') throw new Error('writing.write_book: 配方 "' + recipeId + '" 不是书籍配方（kind=' + r.kind + '）');
    const chk = validator.check({ agentId, recipeId });
    if (!chk.ok) throw new Error('writing.write_book: ' + chk.reason);
    for (const [itemId, qty] of Object.entries(r.materials)) {
      backpack.remove({ agentId, itemId, quantity: qty });
    }
    const job = jobs.enqueue({
      agentId,
      recipeId,
      kind: 'book',
      ticks: r.ticks,
      startTick: clock.now().tick,
      payload: { title, content, author: agentId },
    });
    return { ...job, status: 'pending' };
  }

  const job = jobs.enqueue({
    agentId,
    recipeId: null,
    kind: 'book',
    ticks: 1,
    startTick: clock.now().tick,
    payload: { title, content, author: agentId },
  });
  return { ...job, status: 'pending' };
}

/**
 * 推进著书任务队列 n 个 tick，归零的任务完成：定义书籍物品入背包 + 写观察日志。
 * @param {{ n?: number }} [input]
 * @returns {Array<object>} 本批完成的任务（含 book / bp / log / completedAtTick）
 */
export function tick(input = {}) {
  const n = input?.n ?? 1;
  if (!Number.isInteger(n) || n < 0) throw new TypeError('writing.tick: n 必须为 >=0 的整数');
  return jobs.advance(n, (job) => {
    const title = job.payload.title;
    const content = job.payload.content;
    const author = job.payload.author;
    const book = item.define({ category: 'book', name: title, properties: { title, content, author } });
    // 背包满时**优雅降级**：书籍仍然被写出来（物品已定义、日志照写），只是无法入包。
    // 原实现直接 let RangeError 冒泡，会终止整个模拟（实测 peaceful 档 50 人 200 tick 时
    // 背包容量 20 被填满后崩溃）。著作完成不应导致世界停摆。
    let bp = null;
    try {
      bp = backpack.add({ agentId: job.agentId, itemId: book.id, quantity: 1 });
    } catch (err) {
      bp = { agentId: job.agentId, itemId: book.id, quantity: 0, carried: false, reason: String(err?.message ?? err).slice(0, 120) };
    }
    const log = recorder.actionLog.record({
      tick: clock.now().tick,
      agentId: job.agentId,
      action: 'write_book',
      outcome: { bookId: book.id, title, completedAtTick: clock.now().tick },
    });
    return { book, bp, log, completedAtTick: clock.now().tick };
  });
}

/** 查看未完成的著书任务（辅助方法）。 */
export function pending() {
  return jobs.list();
}

/** 复位著书任务队列（测试用）。 */
export function __reset() {
  jobs.__reset();
}

// ---- 持久化：在途任务队列必须进存档（见 _jobs.js 的说明） ----

/** 导出在途任务队列。 */
export function __snapshot() {
  return jobs.__snapshot();
}

/** 恢复在途任务队列。 */
export function __restore(data = {}) {
  return jobs.__restore(data);
}
