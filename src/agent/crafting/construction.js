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
// 建筑结构的图类型与 id 前缀**不在这里声明**：
// town/building/structure.js 是唯一契约来源。此前本文件自行声明了同名 TYPE 却用
// 不同的 id 前缀（structure:）与 data 形状，写出的节点在 structure 模块里查不到。
import * as structureStore from '../../town/building/structure.js';
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
    // 走 structure 模块的契约：同一 id 前缀、同一 data 形状（含 demolished），
    // 这样本模块建成的房子才能被 structure.list/query 查到。
    const structure = structureStore.construct({
      id: buildingId,
      kind: 'crafted',
      name: out.name ?? buildingId,
      builtBy: job.agentId,
      builtTick: clock.now().tick,
    });
    const log = recorder.actionLog.record({
      tick: clock.now().tick,
      agentId: job.agentId,
      action: 'build:' + job.recipeId,
      outcome: { buildingId, completedAtTick: clock.now().tick },
    });
    // 返回图节点（含规范 id 与 data），与合并前的返回形状保持一致：
    // 调用方读 done[0].structure.id / .data，而不是直接拿 construct 的快照。
    // 此前本模块自行 graph.write 并返回写入结果，故带 structure: 前缀；
    // 现在 id 由 structure 契约决定（town:building:），返回值改为读回该节点。
    const node = graph.read(structureStore.nodeId(buildingId));
    return { structure: node, log, completedAtTick: clock.now().tick };
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

// ---- 持久化：在途任务队列必须进存档（见 _jobs.js 的说明） ----

/** 导出在途任务队列。 */
export function __snapshot() {
  return jobs.__snapshot();
}

/** 恢复在途任务队列。 */
export function __restore(data = {}) {
  return jobs.__restore(data);
}
