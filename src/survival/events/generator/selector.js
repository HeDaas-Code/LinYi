/**
 * truman-town.survival.events.generator.selector — 事件选择器 / Event Selector
 *
 * 按权重选择具体突发事件。weigh 归一化事件并叠加按类型的权重倍率，
 * select 用 roller 的均匀随机数做加权抽取（依赖 generator.roller）。
 */

import * as roller from './roller.js';

function normalize(events) {
  if (!Array.isArray(events)) {
    throw new TypeError('selector: events 必须为数组');
  }
  return events.map((event, i) => {
    if (event === null || typeof event !== 'object' || Array.isArray(event)) {
      throw new TypeError('selector: 每个 event 必须为对象');
    }
    const weight = typeof event.weight === 'number' && Number.isFinite(event.weight) && event.weight >= 0
      ? event.weight
      : 1;
    return {
      id: (typeof event.id === 'string' && event.id !== '') ? event.id : `event_${i + 1}`,
      type: (typeof event.type === 'string' && event.type !== '') ? event.type : 'generic',
      weight,
      effects: event.effects !== undefined ? structuredClone(event.effects) : {},
      ...(event.chain !== undefined ? { chain: structuredClone(event.chain) } : {}),
      ...(event.payload !== undefined ? { payload: structuredClone(event.payload) } : {}),
    };
  });
}

/**
 * 归一化事件并计算权重。
 * @param {Array<object>} events 候选事件（含 id/type/weight/effects/chain）
 * @param {{ weights?: Record<string, number> }} [context] weights 按事件类型缩放权重
 * @returns {Array<object>} 归一化后的事件（weight 已乘倍率）
 */
export function weigh(events, context = {}) {
  const normalized = normalize(events);
  const multipliers = context?.weights ?? {};
  return normalized.map((event) => {
    const multiplier = typeof multipliers[event.type] === 'number' && Number.isFinite(multipliers[event.type])
      ? Math.max(0, multipliers[event.type])
      : 1;
    return { ...event, weight: event.weight * multiplier };
  });
}

/**
 * 按权重抽取一个突发事件。
 * @param {Array<object>} events
 * @param {{ weights?: Record<string, number> }} [opts] 与 weigh 相同
 * @returns {object | null} 选中的事件；候选为空返回 null
 */
export function select(events, opts = {}) {
  const weighted = weigh(events, opts.context ?? opts);
  if (weighted.length === 0) return null;

  const total = weighted.reduce((sum, e) => sum + e.weight, 0);
  if (total <= 0) {
    // 全部权重为 0 时退化为等概率抽取
    return weighted[Math.floor(roller.next() * weighted.length)];
  }
  let cursor = roller.next() * total;
  for (const event of weighted) {
    cursor -= event.weight;
    if (cursor < 0) return event;
  }
  return weighted[weighted.length - 1];
}
