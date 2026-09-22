/**
 * truman-town.civilization.tech.lock — 技术遗忘 / Tech Loss
 *
 * 当技术掌握者（holders）全部死亡且无人继承时，检测技术失传并锁定，使其不可用。
 * detect 判断 holders 与存活居民的并集是否为空；apply 调用 tree.lock 失传并写
 * observer event-log。
 *
 * 依赖说明：agent.lifecycle（生老病死）在 MVP 阶段由调用方传入 living 存活集合
 *（声明式），本模块只做持有者存活判定，不主动接入生命周期。
 */

import * as tree from './tree.js';
import * as eventLog from '../../observer/recorder/event-log.js';

function toLivingSet(living) {
  if (living === undefined || living === null) return new Set();
  if (!Array.isArray(living)) {
    throw new TypeError('lock.detect: living 必须为字符串数组');
  }
  return new Set(living.map((x) => String(x)));
}

/**
 * 检测技术是否失传：已解锁技术若持有者全部死亡且无继承者则 lost=true。
 * @param {{ techId?: string, living?: string[], tick?: number }} [input]
 *   techId 缺省时检测全部已解锁技术；living 为当前存活居民 id 列表
 * @returns {object[]} 检测结果（含 lost / survivingHolders）
 */
export function detect(input = {}) {
  const livingSet = toLivingSet(input.living);
  const tick = Number.isInteger(input.tick) ? input.tick : 0;
  const nodes = input.techId === undefined ? tree.query() : [tree.query({ techId: input.techId })];
  return nodes.map((node) => {
    const holders = node.holders ?? [];
    const survivingHolders = holders.filter((h) => livingSet.has(h));
    const lost = node.state === 'unlocked' && holders.length > 0 && survivingHolders.length === 0;
    return {
      techId: node.id,
      state: node.state,
      holders,
      survivingHolders,
      lost,
      tick,
    };
  });
}

/**
 * 锁定（失传）一项技术，使其不可用，并写 observer event-log。
 * @param {{ techId: string, tick?: number }} input
 * @returns {object} 失传结果（含失传前掌握者）
 */
export function apply(input = {}) {
  const before = tree.query({ techId: input.techId });
  const holders = [...(before.holders ?? [])];
  const locked = tree.lock({ techId: input.techId, tick: input.tick });
  eventLog.record({
    tick: Number.isInteger(input.tick) ? input.tick : 0,
    topic: 'civilization.tech.loss',
    payload: { techId: input.techId, holders },
  });
  return { techId: input.techId, holders, locked: true, state: locked.state };
}
