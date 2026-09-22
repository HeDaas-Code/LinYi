/**
 * truman-town.agent.crafting.workbench.output — 产出登记器 / Craft Output
 *
 * 把制作产物写入背包（store）并记录观察日志（log）。
 */

import * as backpack from '../../inventory/backpack.js';
import * as recorder from '../../../observer/recorder/index.js';

/**
 * 把产出物品写入背包。
 * @param {{ agentId: string, itemId: string, quantity?: number }} input
 * @returns {object} 背包快照
 */
export function store(input = {}) {
  return backpack.add({ agentId: input?.agentId, itemId: input?.itemId, quantity: input?.quantity ?? 1 });
}

/**
 * 记录一条制作观察日志（action-log）。
 * @param {{ tick?: number, agentId: string, action?: string, outcome?: unknown }} input
 * @returns {object} 日志节点快照
 */
export function log(input = {}) {
  const rec = {
    tick: input?.tick ?? 0,
    agentId: input?.agentId,
    action: input?.action ?? 'craft',
  };
  if (input?.outcome !== undefined) rec.outcome = input.outcome;
  return recorder.actionLog.record(rec);
}
