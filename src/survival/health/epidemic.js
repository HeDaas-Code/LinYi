/**
 * truman-town.survival.health.epidemic — 疫情 / Epidemic
 *
 * 检测疫情并触发隔离。detect 统计感染率、按阈值判定疫情（判定为疫情时写
 * observer 事件日志）；quarantine 隔离某居民并写 observer 事件日志。依赖
 * health.disease（感染状态）、town.residence（居民名册，MVP 由 residents
 * 入参提供）与 observer.recorder。
 */

import * as disease from './disease.js';
import * as recorder from '../../observer/recorder/index.js';

/** @type {Set<string>} 已隔离居民 */
const quarantined = new Set();

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('epidemic: agentId 必须为非空字符串');
  }
}

/**
 * 检测疫情：统计感染率并判定是否达到疫情阈值。
 * @param {{ residents?: string[], threshold?: number, tick?: number }} input
 * @returns {object} 检测结果（epidemic / infectionRate / infected / log）
 */
export function detect(input = {}) {
  const residents = Array.isArray(input?.residents)
    ? input.residents
    : disease.list().map((s) => s.agentId);
  const threshold = clamp01(typeof input?.threshold === 'number' ? input.threshold : 0.2);
  const tick = Number.isInteger(input?.tick) ? input.tick : 0;

  const infected = residents.filter((a) => disease.status({ agentId: a }).infected);
  const total = residents.length;
  const infectionRate = total > 0 ? infected.length / total : 0;
  const epidemic = infectionRate >= threshold;

  let log = null;
  if (epidemic) {
    log = recorder.eventLog.record({
      tick,
      topic: 'health.epidemic',
      payload: { infectionRate, infectedCount: infected.length, total, threshold },
    });
  }

  return {
    epidemic,
    infectionRate,
    infectedCount: infected.length,
    total,
    infected,
    susceptible: total - infected.length,
    threshold,
    tick,
    log,
  };
}

/**
 * 隔离某居民并记录观察日志。
 * @param {{ agentId: string, tick?: number }} input
 * @returns {object} 隔离结果（含 log）
 */
export function quarantine(input = {}) {
  const agentId = input?.agentId; assertAgentId(agentId);
  const tick = Number.isInteger(input?.tick) ? input.tick : 0;

  // 幂等：已在隔离名单中的居民不重复隔离、不重复写事件。
  // 实测教训：主循环每 tick 都会对"当时所有感染者"调用本方法，
  // 感染者未康复就被反复隔离，单次 200tick 跑批产生 **9552** 条 health.quarantine
  // （占全部事件的 66%），把真正有信息量的事件全部淹没，
  // 并连带刷出 8856 次 reputationTriageSwaps。
  if (quarantined.has(agentId)) {
    return { agentId, quarantined: true, tick, log: null, alreadyQuarantined: true };
  }

  quarantined.add(agentId);
  const log = recorder.eventLog.record({
    tick,
    topic: 'health.quarantine',
    payload: { agentId, quarantined: true },
    agentId,
  });

  return { agentId, quarantined: true, tick, log, alreadyQuarantined: false };
}

/** 查询某居民是否已隔离（辅助方法）。 */
export function isQuarantined(agentId) {
  return quarantined.has(agentId);
}

/** 当前隔离名单（只读副本）。 */
export function listQuarantined() {
  return [...quarantined].sort();
}

/**
 * 解除某居民的隔离。
 *
 * 为什么必须有这个入口：隔离名单原先只有 add 没有 delete，居民一旦被隔离就**永久**
 * 被隔离，即使已经康复——而主循环又没有把该状态接到任何行为上，
 * 于是"防疫"既无效果也不收敛，只往事件日志里灌垃圾（实测单次跑批 9552 条）。
 * 康复即解除隔离，才让这个机制成为一个真正的闭环。
 *
 * @param {{ agentId: string, tick?: number }} input
 */
export function release(input = {}) {
  const agentId = input?.agentId; assertAgentId(agentId);
  const tick = Number.isInteger(input?.tick) ? input.tick : 0;
  if (!quarantined.has(agentId)) {
    return { agentId, quarantined: false, tick, log: null, changed: false };
  }
  quarantined.delete(agentId);
  const log = recorder.eventLog.record({
    tick,
    topic: 'health.quarantine.release',
    payload: { agentId, quarantined: false },
    agentId,
  });
  return { agentId, quarantined: false, tick, log, changed: true };
}

/** 复位隔离名单（测试用）。 */
export function __reset() {
  quarantined.clear();
}

// ---- 持久化：隔离名单必须进存档 ----

/**
 * 导出隔离名单。
 *
 * 隔离是**跨 tick 生效**的约束（被隔离者不能参与某些互动），不入档则恢复后
 * 疫情管控凭空解除，续跑的传染曲线与连续运行不一致。
 */
export function __snapshot() {
  return { quarantined: [...quarantined] };
}

/**
 * 恢复隔离名单（整体替换）。
 * @param {{quarantined?: string[]}} [data]
 */
export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('epidemic.__restore: 状态必须为对象');
  }
  quarantined.clear();
  const list = Array.isArray(data.quarantined) ? data.quarantined : [];
  for (const id of list) if (typeof id === 'string' && id !== '') quarantined.add(id);
  return { quarantined: quarantined.size };
}
