/**
 * truman-town.agent.lifecycle — 生命周期 / Lifecycle
 *
 * 管理智能体的出生、衰老与自然死亡，驱动小镇代际更替。年龄以"年"计，
 * 每 tick 按 ageRatePerTick（默认 1/365，即 1 tick=1 天）推进；分阶段
 * 幼年(child < adultStart) / 成年(adult) / 老年(elder >= elderStart)。
 * 老年阶段每 tick 有 elderMortalityRate 概率自然死亡（cause=old_age）。
 *
 * 与 loop 的 needs 致死（starvation/dehydration）**并存而非重复**：本模块
 * 只负责自然衰老死亡，且默认参数下 200 tick 内无人进入老年（初始年龄 20~50，
 * 200 tick ≈ 0.55 年），因此默认档存活率保持 1.00。见报告边界说明。
 *
 * RPC：agent.lifecycle.birth / age / death
 */

import * as worldState from '../runtime/world-state.js';
import * as rng from '../infra/rng.js';

function assertAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    throw new TypeError('lifecycle: agentId 必须为非空字符串');
  }
}

function num(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function intOr(v, fallback) {
  return Number.isInteger(v) ? v : fallback;
}

export function stageOf(age, adultStart = 18, elderStart = 65) {
  if (age < adultStart) return 'child';
  if (age < elderStart) return 'adult';
  return 'elder';
}

function read(agentId) {
  return worldState.get('agents.' + agentId) ?? {};
}

/**
 * 登记出生：写入年龄/阶段/出生 tick/存活状态。
 * @param {string} agentId
 * @param {{ tick?: number, age?: number, adultStart?: number, elderStart?: number }} [input]
 * @returns {object} 生命周期快照
 */
export function birth(agentId, input = {}) {
  assertAgentId(agentId);
  const tick = intOr(input.tick, 0);
  const age = num(input.age, 0);
  const adultStart = num(input.adultStart, 18);
  const elderStart = num(input.elderStart, 65);
  worldState.set('agents.' + agentId + '.age', age);
  worldState.set('agents.' + agentId + '.stage', stageOf(age, adultStart, elderStart));
  worldState.set('agents.' + agentId + '.bornTick', tick);
  worldState.set('agents.' + agentId + '.alive', true);
  return snapshot(agentId);
}

/**
 * 推进年龄一个周期；进入老年后按 elderMortalityRate 判定自然死亡。
 * @param {string} agentId
 * @param {{ tick?: number, delta?: number, ageRatePerTick?: number, adultStart?: number, elderStart?: number, elderMortalityRate?: number }} [input]
 * @returns {object} 生命周期快照（含 died/cause）
 */
export function age(agentId, input = {}) {
  assertAgentId(agentId);
  const tick = intOr(input.tick, 0);
  const prev = read(agentId);
  const delta = num(input.delta, num(input.ageRatePerTick, 1 / 365));
  const adultStart = num(input.adultStart, 18);
  const elderStart = num(input.elderStart, 65);
  const elderMortalityRate = num(input.elderMortalityRate, 0.01);
  const prevAge = typeof prev.age === 'number' ? prev.age : 0;
  const nextAge = prevAge + delta;
  const stage = stageOf(nextAge, adultStart, elderStart);
  worldState.set('agents.' + agentId + '.age', nextAge);
  worldState.set('agents.' + agentId + '.stage', stage);

  let died = false;
  let cause = null;
  if (stage === 'elder' && rng.next() < elderMortalityRate) {
    death(agentId, { tick, cause: 'old_age' });
    died = true;
    cause = 'old_age';
  }
  return { ...snapshot(agentId), died, cause };
}

/**
 * 标记死亡（自然衰老或外部原因），写入存续状态与死因。
 * @param {string} agentId
 * @param {{ tick?: number, cause?: string }} [input]
 * @returns {object} 生命周期快照
 */
export function death(agentId, input = {}) {
  assertAgentId(agentId);
  const tick = intOr(input.tick, 0);
  const cause = typeof input.cause === 'string' && input.cause !== '' ? input.cause : 'old_age';
  worldState.set('agents.' + agentId + '.alive', false);
  worldState.set('agents.' + agentId + '.deathTick', tick);
  worldState.set('agents.' + agentId + '.deathCause', cause);
  return snapshot(agentId);
}

/** 生命周期快照。 */
export function snapshot(agentId) {
  assertAgentId(agentId);
  const ws = read(agentId);
  return {
    agentId,
    age: typeof ws.age === 'number' ? ws.age : null,
    stage: ws.stage ?? null,
    bornTick: ws.bornTick ?? null,
    alive: ws.alive !== false,
    deathTick: ws.deathTick ?? null,
    deathCause: ws.deathCause ?? null,
  };
}

/** 复位依赖（world-state 由 loop.reset 统一复位）。 */
export function __reset() {}
