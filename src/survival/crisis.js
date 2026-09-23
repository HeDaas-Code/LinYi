/**
 * truman-town.survival.crisis — 危机检测 / Crisis Detection
 *
 * 汇总饥饿、脱水、疫情、辐射、避难所损坏等信号，输出 { level, reasons, critical }，
 * 为文明崩溃判定提供输入。与 civilization.collapse.detector 分工：本模块只检测
 * 群体性生存危机，不判定文明崩溃。alert 在超过阈值的 tick 写入 observer 事件
 *（topic=survival.crisis）。本模块只读，不修改世界状态。
 */

import * as registry from '../runtime/registry.js';
import * as meter from './needs/meter.js';
import * as disease from './health/disease.js';
import * as shelter from './shelter.js';
import * as recorder from '../observer/recorder/index.js';

const DEFAULT = Object.freeze({
  starvationNeed: 0.9,
  hungerRate: 0.5,
  thirstRate: 0.5,
  infectionRate: 0.2,
  shelterDamageLevel: 0.3,
  critical: 0.8,
});

function ratio(n, total) {
  return total > 0 ? n / total : 0;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/** 检测：调用 survival.crisis.detect。 */
export function detect(input = {}) {
  const tick = typeof input?.tick === 'number' ? input.tick : 0;
  const cfg = { ...DEFAULT, ...(input?.thresholds ?? {}) };
  const agents = registry.lookup({ type: 'agent' });
  const total = agents.length;

  let starving = 0;
  let dehydrating = 0;
  let infected = 0;
  for (const a of agents) {
    const needs = meter.query({ agentId: a.id }).needs;
    if ((needs.food ?? 0) >= cfg.starvationNeed) starving += 1;
    if ((needs.water ?? 0) >= cfg.starvationNeed) dehydrating += 1;
    if (disease.status({ agentId: a.id }).infected) infected += 1;
  }
  const hungerRate = ratio(starving, total);
  const thirstRate = ratio(dehydrating, total);
  const infectionRate = ratio(infected, total);

  const sh = shelter.status();
  const shelterDamageLevel = sh.damaged ? clamp01((100 - sh.integrity) / 100) : 0;
  const radiationLevel = 0;

  const reasons = [];
  if (hungerRate >= cfg.hungerRate) reasons.push('starvation');
  if (thirstRate >= cfg.thirstRate) reasons.push('dehydration');
  if (infectionRate >= cfg.infectionRate) reasons.push('epidemic');
  if (shelterDamageLevel >= cfg.shelterDamageLevel) reasons.push('shelter_damage');

  const level = Math.max(hungerRate, thirstRate, infectionRate, shelterDamageLevel, radiationLevel);
  const critical = level >= cfg.critical;

  return {
    tick,
    level: clamp01(level),
    reasons,
    critical,
    signals: { hungerRate, thirstRate, infectionRate, shelterDamageLevel, radiationLevel },
  };
}

/** 警报：调用 survival.crisis.alert（critical 时写 observer 事件）。 */
export function alert(input = {}) {
  const det = detect(input);
  if (det.critical) {
    recorder.eventLog.record({
      tick: det.tick,
      topic: 'survival.crisis',
      payload: { level: det.level, reasons: det.reasons, signals: det.signals },
    });
  }
  return det;
}

