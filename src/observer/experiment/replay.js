/**
 * truman-town.observer.experiment.replay — 回放 / Replay
 *
 * 按编年志重演任意时间段的因果链。run 以 seed 生成确定性的回放 run id 并
 * 返回按 (tick, seq) 排序的完整因果链；query 直接窗口读取（不分 seed）。
 * 两者均只读 observer 编年志，绝不修改世界状态或任何日志。
 */

import * as chronicle from '../chronicle/index.js';
import { hashHex } from './_hash.js';

function assertTick(name, value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new TypeError('replay: ' + name + ' 必须为非负整数');
  }
}

function assertRange(fromTick, toTick) {
  if (fromTick !== undefined) assertTick('fromTick', fromTick);
  if (toTick !== undefined) assertTick('toTick', toTick);
  if (fromTick !== undefined && toTick !== undefined && fromTick > toTick) {
    throw new TypeError('replay: fromTick 不能大于 toTick');
  }
}

/**
 * 按种子回放历史：seed 决定回放 run id，读取指定范围的因果链（只读）。
 * @param {{ seed?: number|string, fromTick?: number, toTick?: number, agentId?: string }} input
 * @returns {{ replayId: string, seed: string, fromTick: number|null, toTick: number|null, agentId: string|null, counts: object, entries: object[] }}
 */
export function run({ seed = 0, fromTick, toTick, agentId } = {}) {
  assertRange(fromTick, toTick);
  const replayId = 'replay:' + hashHex('seed:' + String(seed));
  const ch = chronicle.compiler.compile({ fromTick, toTick, agentId });
  return {
    replayId,
    seed: String(seed),
    fromTick: ch.startTick,
    toTick: ch.endTick,
    agentId: agentId ?? null,
    counts: ch.counts,
    entries: ch.entries,
  };
}

/**
 * 只读窗口查询：读取指定区间的因果链（不做种子回放）。
 * @param {{ fromTick?: number, toTick?: number, agentId?: string }} input
 * @returns {{ fromTick: number|null, toTick: number|null, agentId: string|null, counts: object, entries: object[] }}
 */
export function query({ fromTick, toTick, agentId } = {}) {
  assertRange(fromTick, toTick);
  const ch = chronicle.compiler.compile({ fromTick, toTick, agentId });
  return {
    fromTick: ch.startTick,
    toTick: ch.endTick,
    agentId: agentId ?? null,
    counts: ch.counts,
    entries: ch.entries,
  };
}
