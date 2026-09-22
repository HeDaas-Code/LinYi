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

  quarantined.add(agentId);
  const log = recorder.eventLog.record({
    tick,
    topic: 'health.quarantine',
    payload: { agentId, quarantined: true },
    agentId,
  });

  return { agentId, quarantined: true, tick, log };
}

/** 查询某居民是否已隔离（辅助方法）。 */
export function isQuarantined(agentId) {
  return quarantined.has(agentId);
}

/** 复位隔离名单（测试用）。 */
export function __reset() {
  quarantined.clear();
}
