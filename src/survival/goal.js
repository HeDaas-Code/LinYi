/**
 * truman-town.survival.goal — 生存目标 / Survival Goal
 *
 * 把“继续活下去”作为最高目标，记录起始 tick 并统计已存活时长。elapsed 返回
 * 已存活 tick 数、是否仍在存活（结合 registry 存活智能体数），是“存活时长”
 * 的权威来源，tick 与 runtime 主循环一致。持久化在 graph store（type=survival.goal）。
 */

import * as graph from '../infra/store/graph.js';
import * as registry from '../runtime/registry.js';

const GOAL_ID = 'survival:goal';
const TYPE = 'survival.goal';
const DEFAULT_GOAL = '继续活下去';

/** 记录目标：调用 survival.goal.survive。 */
export function survive(input = {}) {
  const tick = typeof input?.tick === 'number' ? input.tick : 0;
  const goal = typeof input?.goal === 'string' && input.goal !== '' ? input.goal : DEFAULT_GOAL;
  const state = { goal, startTick: tick };
  graph.write({ id: GOAL_ID, type: TYPE, data: state });
  return { ...state };
}

/** 已存活时长：调用 survival.goal.elapsed。 */
export function elapsed(input = {}) {
  const tick = typeof input?.tick === 'number' ? input.tick : 0;
  const node = graph.read(GOAL_ID);
  const goal = (node && node.data && typeof node.data.goal === 'string') ? node.data.goal : DEFAULT_GOAL;
  const startTick = (node && node.data && typeof node.data.startTick === 'number') ? node.data.startTick : 0;
  const survivors = registry.lookup({ type: 'agent' }).length;
  return {
    goal,
    startTick,
    tick,
    elapsed: Math.max(0, tick - startTick),
    alive: survivors > 0,
    survivors,
  };
}

/** 复位生存目标到默认（测试用）。 */
export function __reset() {
  graph.write({ id: GOAL_ID, type: TYPE, data: { goal: DEFAULT_GOAL, startTick: 0 } });
}

