/**
 * truman-town.agent.psyche.coping — 应对 / Coping
 *
 * 选择并执行祈祷、写作、社交、酗酒等应对行为以缓解创伤，并输出决策权重
 * 修正：应对方式与创伤水平会改变生存压力在决策中的支配权重与具体行动的
 * 偏好（接入 agent.decision.context 的 sourceWeights / actionBias）。
 */

import * as trauma from './trauma.js';
import * as tagsetStore from '../traits/tagset/store.js';
import * as episodic from '../memory/episodic/store.js';
import * as decisionContext from '../decision/context.js';

/** 应对方式目录：traumaRelief 疗愈量、pressureWeight 决策压力源权重、actionBias 行动偏好。 */
const STRATEGIES = Object.freeze({
  prayer: { id: 'prayer', name: '祈祷', traumaRelief: 0.15, pressureWeight: 1.2, actionBias: { rest: 0.4 } },
  writing: { id: 'writing', name: '写作', traumaRelief: 0.2, pressureWeight: 1.3, actionBias: {} },
  socialize: { id: 'socialize', name: '社交', traumaRelief: 0.1, pressureWeight: 1.4, actionBias: { forage: 0.2 } },
  drink: { id: 'drink', name: '酗酒', traumaRelief: 0.3, pressureWeight: 0.8, actionBias: { drink: 0.5 } },
});

/** @type {Map<string, string>} agentId → 最近执行的应对方式 id */
const activeCoping = new Map();

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('coping: agentId 必须为非空字符串');
  }
}

function traitKeys(agentId) {
  const tagset = tagsetStore.get(agentId);
  return new Set((tagset ? tagset.tags : []).map((t) => t.key));
}

function find(id) {
  return STRATEGIES[id] ?? null;
}

/**
 * 依据创伤水平与特质选择合适的应对方式。
 * @param {{ agentId: string }} input
 * @returns {{ agentId: string, strategy: object, traumaLevel: number, reason: string }}
 */
export function choose({ agentId } = {}) {
  assertAgentId(agentId);
  const level = trauma.query({ agentId }).level;
  const keys = traitKeys(agentId);

  let strategy;
  let reason;
  if (keys.has('sociable')) {
    strategy = STRATEGIES.socialize;
    reason = '特质倾向社交';
  } else if (keys.has('cautious')) {
    strategy = STRATEGIES.prayer;
    reason = '特质倾向谨慎祈祷';
  } else if (level >= 0.6) {
    strategy = STRATEGIES.drink;
    reason = '创伤过重，选择强缓解方式';
  } else {
    strategy = STRATEGIES.writing;
    reason = '默认写作宣泄';
  }
  return { agentId, strategy, traumaLevel: level, reason };
}

/**
 * 执行应对方式：疗愈创伤并写入情景记忆，记录为最近应对方式。
 * @param {{ agentId: string, strategyId?: string }} input
 */
export function execute({ agentId, strategyId } = {}) {
  assertAgentId(agentId);
  let strategy;
  if (strategyId !== undefined) {
    strategy = find(strategyId);
    if (strategy === null) {
      throw new Error('coping.execute: 未知应对方式 ' + strategyId);
    }
  } else {
    strategy = choose({ agentId }).strategy;
  }

  const before = trauma.query({ agentId }).level;
  const healed = trauma.heal({ agentId, amount: strategy.traumaRelief });
  activeCoping.set(agentId, strategy.id);
  const memory = episodic.write(agentId, {
    content: '应对行为：' + strategy.name,
    emotion: 'coping',
    salience: 0.4,
    tags: ['coping', strategy.id],
  });

  return {
    agentId,
    strategy,
    traumaBefore: before,
    traumaAfter: healed.level,
    relief: strategy.traumaRelief,
    memoryId: memory.memoryId,
  };
}

/**
 * 输出决策权重修正（接入 agent.decision.context 的 sourceWeights 与 actionBias）。
 * 压力源权重取最近应对方式，行动偏好随创伤水平增强。
 * @param {{ agentId: string }} input
 * @returns {{ agentId: string, level: number, strategyId: string|null, sourceWeights: object, actionBias: object }}
 */
export function decisionWeights({ agentId } = {}) {
  assertAgentId(agentId);
  const level = trauma.query({ agentId }).level;
  const strategyId = activeCoping.get(agentId) ?? null;
  const strategy = strategyId ? find(strategyId) : null;
  const pressureWeight = strategy ? strategy.pressureWeight : 1.5;
  const actionBias = {};
  if (strategy) {
    for (const [action, weight] of Object.entries(strategy.actionBias)) {
      actionBias[action] = weight * (0.5 + level);
    }
  }
  return {
    agentId,
    level,
    strategyId,
    sourceWeights: { pressure: pressureWeight },
    actionBias,
  };
}

/** 复位应对状态（测试用）。 */
export function __reset() {
  activeCoping.clear();
}

// ---- 持久化：进行中的应对策略必须进存档 ----

/**
 * 导出进行中的应对策略。
 *
 * 应对策略携带剩余 tick 与行动偏好，是**跨 tick 生效**的行为修正。
 * 不入档则恢复后全城策略清空，续跑的行为分布与连续运行分叉。
 */
export function __snapshot() {
  return { activeCoping: structuredClone([...activeCoping.entries()]) };
}

/**
 * 恢复应对策略（整体替换）。
 * @param {{activeCoping?: Array}} [data]
 */
export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('coping.__restore: 状态必须为对象');
  }
  activeCoping.clear();
  const list = Array.isArray(data.activeCoping) ? data.activeCoping : [];
  for (const pair of list) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    if (typeof pair[0] === 'string' && pair[0] !== '') activeCoping.set(pair[0], structuredClone(pair[1]));
  }
  return { activeCoping: activeCoping.size };
}
