/**
 * truman-town.runtime.orchestrator.loop — 主循环集成 / Main Loop Integration
 *
 * 把各子系统的"资源衰减 → 生存事件 → 感知 → 决策 → AI 思考 → 行动派发 →
 * 世界状态"串成一条最小闭环主循环，并在每个决策/行为/事件节点写入观察者日志。
 *
 * 单 tick 数据流：
 *   clock.tick()                          → 推进逻辑时间
 *   survival（decay + needs 增长 + 事件）  → 生存压力与突发事件（impact 写 event-log）
 *   perception.collect / route             → 事件转 percept 并分发给智能体
 *   agent.decision（context + selector）    → 每个智能体选择行动（decision-log）
 *   ai.thought.generate                    → 智能体对处境生成思考
 *   dispatch.resolve / actions             → 行动落到 world-state（action-log）
 *   worldState 同步资源 / 需求 / 行为快照
 */

import * as clock from '../clock.js';
import * as worldState from '../world-state.js';
import * as registry from '../registry.js';
import * as perception from './perception.js';
import * as dispatch from './dispatch.js';

import * as graph from '../../infra/store/graph.js';
import * as configStore from '../../infra/config.js';
import * as identity from '../../infra/identity.js';
import * as rng from '../../infra/rng.js';

import * as agent from '../../agent/index.js';
import * as ai from '../../ai/index.js';
import * as survival from '../../survival/index.js';
import * as observer from '../../observer/index.js';
import * as stage2 from './_stage2.js';
import * as stage3 from './_stage3.js';

/** 默认生存事件目录（供 selector 加权抽取）。 */
const DEFAULT_EVENTS = Object.freeze([
  { id: 'storm', type: 'storm', weight: 2, effects: { foodDelta: -5, waterDelta: -3, shelterDamage: 5 } },
  { id: 'supply_drop', type: 'supply', weight: 1, effects: { foodDelta: 10, waterDelta: 10 } },
  { id: 'drought', type: 'drought', weight: 2, effects: { waterDelta: -8 } },
  { id: 'blight', type: 'blight', weight: 1, effects: { foodDelta: -8 } },
]);

/** 默认候选行动（每个智能体的预想池初始候选）。 */
const DEFAULT_ACTIONS = Object.freeze([
  { id: 'eat', action: 'eat', score: 0.3 },
  { id: 'drink', action: 'drink', score: 0.3 },
  { id: 'rest', action: 'rest', score: 0.2 },
  { id: 'forage', action: 'forage', score: 0.2 },
]);

/** 默认特质标签（tagset 采样的底座）。 */
const DEFAULT_TAGS = Object.freeze({ resilient: 1.0, cautious: 0.8, sociable: 0.6, curious: 0.7, hardworking: 0.9 });

/** 批次2-C（t48）：职业与公共角色目录（跨种子分叉用确定性哈希，不消耗全局 rng）。 */
const CAREER_OCCUPATIONS = Object.freeze(['farmer', 'craftsman', 'merchant', 'medic', 'teacher', 'guard']);
const CAREER_WAGES = Object.freeze({ farmer: 3, craftsman: 4, merchant: 5, medic: 6, teacher: 4, guard: 4 });
const SOCIETY_ROLE_IDS = Object.freeze(['doctor', 'teacher', 'guard', 'priest']);

const DEFAULT_CONFIG = Object.freeze({
  ...configStore.defaults(),
  events: DEFAULT_EVENTS,
  phase2: false,
  phase3: false,
});

// ---- 世界采集池（t32）：每 tick 再生、全局共享，避免补给随人口线性增长 ----
let foragePool = null;
let currentSeed = 'default';

function alivePopulation() {
  const agents = registry.lookup({ type: 'agent' });
  return Array.isArray(agents) ? agents.length : 0;
}

function foragePoolCapacityOf(cfg) {
  const base = typeof cfg.foragePoolCapacity === 'number' && Number.isFinite(cfg.foragePoolCapacity)
    ? cfg.foragePoolCapacity
    : configStore.defaults().foragePoolCapacity;
  const perCapita = typeof cfg.foragePoolPerCapita === 'number' && Number.isFinite(cfg.foragePoolPerCapita)
    ? cfg.foragePoolPerCapita
    : configStore.defaults().foragePoolPerCapita;
  return Math.max(0, base + perCapita * alivePopulation());
}

function forageRegenOf(cfg) {
  const base = typeof cfg.forageRegen === 'number' && Number.isFinite(cfg.forageRegen)
    ? cfg.forageRegen
    : configStore.defaults().forageRegen;
  const perCapita = typeof cfg.forageRegenPerCapita === 'number' && Number.isFinite(cfg.forageRegenPerCapita)
    ? cfg.forageRegenPerCapita
    : configStore.defaults().forageRegenPerCapita;
  return Math.max(0, base + perCapita * alivePopulation());
}

/** 每 tick 开始前再生采集池（首次满池，此后 min(pool + regen, cap)）。 */
function regenForagePool(cfg) {
  const cap = foragePoolCapacityOf(cfg);
  foragePool = foragePool === null ? cap : Math.min(foragePool + forageRegenOf(cfg), cap);
  return foragePool;
}

/** 当前采集池剩余量（供测试 / 观测）。 */
export function foragePoolRemaining() {
  return foragePool === null ? 0 : foragePool;
}

function clampUnit(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

/** 读取衰减率：优先 cfg.decay.<key>，缺失时回退默认值（兼容只传部分 decay 的调用方）。 */
function decayRate(cfg, key) {
  const d = cfg && typeof cfg.decay === 'object' && cfg.decay !== null ? cfg.decay : null;
  if (d && typeof d[key] === 'number' && Number.isFinite(d[key])) return d[key];
  return configStore.defaults().decay[key];
}

/**
 * 登记一个智能体到注册表，并初始化其特质、预想池与初始需求。
 * @param {{
 *   id?: string, name?: string, persona?: string,
 *   tags?: Array<{key:string,weight:number}> | Record<string, number>,
 *   candidates?: Array<{ id: string, action: string, score?: number }>,
 *   food?: number, water?: number,
 * }} [input]
 * @returns {{ id: string, name: string, persona: string }}
 */
/**
 * 登记一个智能体（注册表 + 预想池 + 需求 + 世界状态）；标签由调用方负责。
 * spawnAgent 负责写标签，阶段二子代由 offspring 先写标签再走这里。
 */
function registerAgent({ id, name, persona, food, water, candidates, age }) {
  registry.register({ id, type: 'agent', data: { name, persona } });
  for (const candidate of candidates) {
    agent.anticipation.pool.store.add(id, {
      id: `${id}:${candidate.id}`,
      action: candidate.action,
      score: typeof candidate.score === 'number' ? candidate.score : 0,
    });
  }
  survival.needs.meter.update({ agentId: id, need: 'food', level: food });
  survival.needs.meter.update({ agentId: id, need: 'water', level: water });
  worldState.set(`agents.${id}`, { name, persona, alive: true, bornTick: clock.now().tick });
  // 批次2-A：登记生命周期（初始年龄，子代默认 0）与身份
  agent.lifecycle.birth(id, { tick: clock.now().tick, age: typeof age === 'number' ? age : 0 });
  agent.persona.identity.update(id, { name, persona });
  return { id, name, persona };
}

/** 确定性初始年龄（FNV-1a 哈希 → [min,max)），不消耗全局 rng，保证随机流稳定。 */
function deterministicAge(name) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i += 1) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
  const u = (h >>> 0) / 4294967296;
  return DEFAULT_CONFIG.initialAgeMin + u * (DEFAULT_CONFIG.initialAgeMax - DEFAULT_CONFIG.initialAgeMin);
}

/** 确定性哈希 → [0,1)，不消耗全局 rng（t48 跨种子分叉不扰动随机流）。 */
function hashUnit(key) {
  let h = 2166136261;
  const str = String(key);
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

/** 批次2-C（t48）：为居民种子日程 / 职业 / 公共角色（真实调用 4 模块）。 */
function seedAgentScheduleRoles(spawned, options) {
  for (let i = 0; i < spawned.length; i += 1) {
    const id = spawned[i].id;
    if (options.careerEnabled !== false) {
      const occ = CAREER_OCCUPATIONS[Math.floor(hashUnit(currentSeed + ':' + id + ':career') * CAREER_OCCUPATIONS.length)];
      agent.role.career.assign(id, { occupation: occ, wage: CAREER_WAGES[occ], tick: 0 });
    }
    if (options.societyEnabled !== false && i < Math.max(1, Math.ceil(spawned.length * 0.08))) {
      const role = SOCIETY_ROLE_IDS[Math.floor(hashUnit(currentSeed + ':' + id + ':society') * SOCIETY_ROLE_IDS.length)];
      agent.role.society.hold(id, { role, tick: 0 });
    }
    if (options.scheduleEnabled !== false) {
      const occupation = agent.role.career.current(id)?.occupation ?? null;
      const length = (Number.isInteger(options.scheduleLength) ? options.scheduleLength : 12) + Math.floor(hashUnit(currentSeed + ':' + id + ':schedlen') * 4);
      agent.schedule.planner.generate(id, { tick: 0, length, occupation });
    }
  }
}

/** 批次2-C（t48）：公共角色影响——医生按治疗名额实施治疗。 */
function applySocietyEffects(tick, cfg) {
  if (cfg.societyEnabled === false) return;
  const { effects } = agent.role.society.activeEffects();
  const capacity = effects.treatmentCapacity ?? 0;
  if (capacity <= 0) return;
  const patients = survival.health.treatment.triage({ tick });
  for (let i = 0; i < Math.min(capacity, patients.length); i += 1) {
    survival.health.treatment.apply({ agentId: patients[i].agentId, tick });
  }
}

/** 批次2-C（t48）：日程驱动的行动覆盖（紧急时触发重排）。 */
function scheduleOverride(decision, agentId, tick, cfg) {
  const need = decision?.context?.dominantNeed;
  const level = (decision?.context?.pressures ?? []).find((pp) => pp.need === need)?.level ?? 0;
  const emergency = (need === 'food' || need === 'water') && level >= clampUnit(cfg.eatThreshold, 0.4);
  const scheduled = agent.schedule.executor.tick(agentId, { tick, interrupted: emergency, trigger: emergency ? 'emergency' : 'interrupt' });
  if (!scheduled || !scheduled.action) return null;
  return {
    action: scheduled.action,
    reason: '日程块「' + (scheduled.block?.reason ?? scheduled.action) + '」',
    replanned: scheduled.replanned,
    trigger: emergency ? 'emergency' : 'interrupt',
    meta: { action: scheduled.action, block: scheduled.block?.reason ?? null, replanned: scheduled.replanned },
  };
}

/** 批次2-C（t48）：社会维度汇总（日程/职业/公共角色），供观测与跨种子对照。 */
function socialSummary() {
  return {
    schedule: agent.schedule.planner.summary(),
    careers: agent.role.career.summary(),
    society: agent.role.society.activeEffects(),
  };
}

export function spawnAgent(input = {}) {
  const id = typeof input?.id === 'string' && input.id.trim() !== '' ? input.id : identity.next('agent');
  const name = typeof input?.name === 'string' && input.name.trim() !== '' ? input.name : `居民${id}`;
  const persona = typeof input?.persona === 'string' ? input.persona : '一名普通避难所居民';
  const tags = input?.tags ?? DEFAULT_TAGS;
  const candidates = Array.isArray(input?.candidates) && input.candidates.length > 0 ? input.candidates : DEFAULT_ACTIONS;
  const food = clampUnit(input?.food, 0.2);
  const water = clampUnit(input?.water, 0.2);
  const age = typeof input?.age === 'number' && Number.isFinite(input.age)
    ? input.age
    : deterministicAge(name);

  agent.traits.tagset.store.upsert(id, tags);
  return registerAgent({ id, name, persona, food, water, candidates, age });
}

function dominantPressure(pressures) {
  const sorted = [...(pressures ?? [])].sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
  return sorted.length > 0 ? sorted[0] : { need: null, level: 0 };
}

function dominantNeed(pressures) {
  return dominantPressure(pressures).need;
}

/**
 * 决策评分：仅在需求超过 eatThreshold 时才进食/饮水；需求未达阈值时优先
 * 采集（资源越稀缺越该采集）/ 休息。避免"永远进食"导致资源过快枯竭（P0-2 暴露）。
 */
function scoreAction(candidate, ctx = {}) {
  let score = typeof candidate?.score === 'number' && Number.isFinite(candidate.score) ? candidate.score : 0;
  const need = ctx.dominantNeed;
  const level = typeof ctx.dominantLevel === 'number' ? ctx.dominantLevel : 0;
  const scarcity = typeof ctx.dominantScarcity === 'number' ? ctx.dominantScarcity : 0;
  const threshold = clampUnit(ctx.eatThreshold, 0.4);
  const hungry = need === 'food' && level >= threshold;
  const thirsty = need === 'water' && level >= threshold;
  if (candidate?.action === 'eat' && hungry) score += 2;
  if (candidate?.action === 'drink' && thirsty) score += 2;
  if (candidate?.action === 'forage' && !hungry && !thirsty) score += 1.2 + scarcity;
  if (candidate?.action === 'rest' && !hungry && !thirsty) score += 0.5;
  return score;
}

/** 组装单个智能体的决策：感知 + 压力 + 预想 + 记忆 → 行动选择。 */
function decide(agentId, tick, percepts, cfg = {}) {
  const pressure = survival.needs.pressure.scorer.score({ agentId });
  const anticipations = agent.anticipation.pool.selector.shortlist(agentId, { limit: 6 });
  if (anticipations.length === 0) return null;
  const memories = agent.memory.episodic.recaller.recall(agentId, { limit: 3 });

  const pressures = Object.entries(pressure.factors).map(([need, level]) => ({ id: need, need, level }));

  const context = agent.decision.context.assemble({
    agentId,
    ts: tick,
    pressures,
    anticipations: anticipations.map((a) => ({ id: a.id, action: a.action, score: a.score })),
    memories: memories.map((m) => ({ id: m.memoryId, content: m.content, salience: m.salience })),
  });
  const ranked = agent.decision.context.rank(context);

  // 批次2-A：性格画像 + 动机权重（对候选行动施加小幅性格修正，观测分叉来源）
  const profile = agent.persona.personality.profile(agentId);
  const needsNow = survival.needs.meter.query({ agentId }).needs;
  const motivations = agent.persona.motivation.rank(agentId, { needs: needsNow, profile });

  const top = dominantPressure(pressures);
  const need = top.need;
  const needLevel = top.level ?? 0;
  const needScarcity = pressure.scarcity?.[need] ?? 0;

  // 批次2-B（t47）：候选修剪（动机+性格裁剪前 K）→ 行动模拟（简化推演+探索噪声）
  const tags = agent.traits.tagset.store.get(agentId)?.tags ?? [];
  const pruned = agent.anticipation.pool.pruner.prune(agentId, anticipations, {
    k: cfg.pruneK,
    dominantNeed: need,
    level: needLevel,
    threshold: cfg.eatThreshold,
    tags,
  });
  const resources = { food: survival.resources.food.query(), water: survival.resources.water.query() };
  const predicted = agent.anticipation.simulator.predict(agentId, pruned, {
    needs: needsNow,
    resources,
    noise: cfg.simNoise,
    seed: currentSeed,
    tick,
  });
  const simBy = new Map();
  for (const p of predicted) simBy.set(p.candidate?.id, p.expectedUtility);

  // 语义记忆召回：按主导需求取相关过往摘要，注入决策上下文
  const semanticMemories = agent.memory.semantic.recall(agentId, {
    text: need === 'food' ? '食物 饥饿 进食' : need === 'water' ? '水源 缺水 饮水' : '采集 休息 资源',
    tags: [need ?? 'sustenance'],
  }, { limit: cfg.semanticLimit ?? 3 });

  const origScore = new Map(anticipations.map((a) => [a.id, a.score]));
  const candidates = pruned.map((a) => ({ id: a.id, action: a.action, score: origScore.get(a.id) ?? 0 }));
  const choice = agent.decision.selector.choose({
    candidates,
    context: { dominantNeed: need },
    scoreFn: (candidate) => scoreAction(candidate, {
      dominantNeed: need,
      dominantLevel: needLevel,
      dominantScarcity: needScarcity,
      eatThreshold: cfg.eatThreshold,
    }) + agent.persona.personality.evaluate(agentId, candidate.action)
      + (simBy.get(candidate.id) ?? 0),
  });
  if (choice === null) return null;

  // 决策解释：为什么选 A 不选 B（可叙事、可审计），供 observer 决策日志写入 reason
  const alternatives = predicted
    .filter((p) => p.action !== choice.action)
    .map((p) => ({ action: p.action, expectedUtility: p.expectedUtility, risk: p.risk }));
  const chosenPred = predicted.find((p) => p.action === choice.action);
  const explanation = agent.decision.explainer.explain({
    agentId,
    tick,
    chosen: { action: choice.action, score: choice.score, expectedUtility: chosenPred?.expectedUtility ?? choice.score },
    alternatives,
    context: { dominantNeed: need, level: needLevel, threshold: cfg.eatThreshold },
  });
  const trace = agent.decision.explainer.trace({
    agentId,
    tick,
    chosen: { action: choice.action },
    alternatives,
    context: { dominantNeed: need, level: needLevel, threshold: cfg.eatThreshold },
  });

  return {
    id: choice.id,
    action: choice.action,
    score: choice.score,
    confidence: choice.confidence,
    reason: explanation,
    explanation,
    trace,
    options: candidates,
    predicted: alternatives,
    context: {
      pressures,
      topDriver: ranked.length > 0 ? ranked[0].id : null,
      dominantNeed: need,
      personality: profile?.dominant ?? null,
      topMotivation: motivations.length > 0 ? motivations[0].action : null,
      semantic: semanticMemories.map((m) => ({ content: m.content, score: m.score })),
      simulation: chosenPred
        ? { expectedUtility: chosenPred.expectedUtility, risk: chosenPred.risk, exploration: chosenPred.exploration }
        : null,
    },
  };
}

/** 行动 → 世界变更函数（供 dispatch.actions 调用）。 */
function effectFor(agentId, action, cfg = {}) {
  switch (action) {
    case 'eat':
      return () => {
        const consumed = survival.resources.food.consume(1);
        if (consumed.consumed > 0) survival.needs.meter.update({ agentId, need: 'food', delta: -0.5 });
      };
    case 'drink':
      return () => {
        const consumed = survival.resources.water.consume(1);
        if (consumed.consumed > 0) survival.needs.meter.update({ agentId, need: 'water', delta: -0.5 });
      };
    case 'forage':
      return () => {
        const yieldAmount = typeof cfg.forageYield === 'number' && Number.isFinite(cfg.forageYield) ? cfg.forageYield : 2;
        const take = Math.min(yieldAmount, foragePool);
        foragePool = Math.max(0, foragePool - take);
        if (take > 0) {
          survival.resources.food.produce(take);
          survival.resources.water.produce(take);
        }
      };
    case 'rest':
      return () => {
        survival.needs.meter.update({ agentId, need: 'food', delta: -0.1 });
        survival.needs.meter.update({ agentId, need: 'water', delta: -0.1 });
      };
    default:
      return undefined;
  }
}

/** 智能体上下文（供 ai.thought.generate 组装提示词）。 */
function agentContextOf(record) {
  const data = (record && typeof record.data === 'object') ? record.data : {};
  const tagset = agent.traits.tagset.store.get(record.id);
  const memories = agent.memory.episodic.recaller.recall(record.id, { limit: 5 });
  return {
    agentId: record.id,
    name: data.name,
    persona: data.persona,
    tags: (tagset?.tags ?? []).map((t) => t.key),
    memory: memories.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))),
  };
}

/** 生存阶段：资源衰减 + 需求增长 + 突发事件（impact 已写 event-log）。 */
function runSurvival(tick, config) {
  survival.resources.food.decay(config.decay.food);
  survival.resources.water.decay(config.decay.water);
  survival.resources.energy.decay(decayRate(config, 'energy'));
  survival.resources.medical.decay(decayRate(config, 'medical'));

  for (const record of registry.lookup({ type: 'agent' })) {
    survival.needs.meter.update({ agentId: record.id, need: 'food', delta: config.needGrowth.food });
    survival.needs.meter.update({ agentId: record.id, need: 'water', delta: config.needGrowth.water });
  }

  const percepts = [];
  if (survival.events.generator.roller.roll(config.eventProbability)) {
    const event = survival.events.generator.selector.select(config.events);
    if (event !== null) {
      survival.events.impact.apply(event, { tick });
      percepts.push({ id: event.id, topic: `survival.${event.type}`, data: { type: event.type, effects: event.effects }, ts: tick });
    }
  }
  return percepts;
}

/** 同步世界状态快照（资源 / 需求 / 行为，供 observer / api 观测）。 */
function syncWorldState(tick, cfg) {
  worldState.set('tick', tick);
  worldState.set('resources.food', survival.resources.food.query());
  worldState.set('resources.water', survival.resources.water.query());
  worldState.set('resources.energy', survival.resources.energy.query());
  worldState.set('resources.medical', survival.resources.medical.query());
  worldState.set('resources.foragePool', { pool: foragePoolRemaining(), capacity: foragePoolCapacityOf(cfg), regen: forageRegenOf(cfg) });
  worldState.set('shelter', survival.shelter.status());
  const needs = {};
  for (const record of registry.lookup({ type: 'agent' })) {
    needs[record.id] = survival.needs.meter.query({ agentId: record.id }).needs;
  }
  worldState.set('needs', needs);
}

/** 饥饿/口渴 → 健康下降 → 死亡（P0-2：无死亡机制修复）。 */
const mortality = new Map();

/**
 * 需求达上限持续 N tick → 健康下降；健康归零则死亡：移出 registry、
 * 标记 world-state alive=false/deathTick，并写 observer event-log。
 */
function runMortality(tick, cfg) {
  const threshold = clampUnit(cfg.starvationThreshold, 0.9);
  const ticks = Number.isInteger(cfg.starvationTicks) && cfg.starvationTicks > 0 ? cfg.starvationTicks : 5;
  const decline = clampUnit(cfg.starvationHealthDecline, 0.2);
  const deaths = [];
  for (const record of registry.lookup({ type: 'agent' })) {
    const id = record.id;
    const needs = survival.needs.meter.query({ agentId: id }).needs;
    const starving = needs.food >= threshold || needs.water >= threshold;
    let st = mortality.get(id);
    if (st === undefined) { st = { starvingTicks: 0, health: 1 }; mortality.set(id, st); }
    if (starving) {
      st.starvingTicks += 1;
      if (st.starvingTicks >= ticks) st.health = Math.max(0, st.health - decline);
    } else {
      st.starvingTicks = 0;
      st.health = Math.min(1, st.health + 0.05);
    }
    if (st.health <= 0) {
      const cause = needs.food >= needs.water ? 'starvation' : 'dehydration';
      registry.unregister(id);
      worldState.set(`agents.${id}.alive`, false);
      worldState.set(`agents.${id}.deathTick`, tick);
      observer.recorder.eventLog.record({ tick, topic: 'agent.death', payload: { agentId: id, cause, needs }, agentId: id });
      mortality.delete(id);
      deaths.push({ agentId: id, cause });
    }
  }
  return deaths;
}

/**
 * 批次2-A：自然衰老（lifecycle.age）+ 老年死亡（lifecycle.death）。
 * 与 runMortality 的饥饿/口渴致死并存而非重复：本函数只处理 cause=old_age，
 * 且默认参数下 200 tick 内无人进入老年（初始年龄 20~50，每 tick 仅 +1/365 年）。
 */
function runLifecycle(tick, cfg) {
  const deaths = [];
  const ageRate = typeof cfg.ageRatePerTick === 'number' ? cfg.ageRatePerTick : 1 / 365;
  const adultStart = typeof cfg.lifecycleAdultStart === 'number' ? cfg.lifecycleAdultStart : 18;
  const elderStart = typeof cfg.lifecycleElderStart === 'number' ? cfg.lifecycleElderStart : 65;
  const elderMortality = typeof cfg.lifecycleElderMortalityRate === 'number' ? cfg.lifecycleElderMortalityRate : 0.01;
  for (const record of registry.lookup({ type: 'agent' })) {
    const result = agent.lifecycle.age(record.id, {
      tick,
      ageRatePerTick: ageRate,
      adultStart,
      elderStart,
      elderMortalityRate: elderMortality,
    });
    if (result.died) {
      registry.unregister(record.id);
      worldState.set('agents.' + record.id + '.alive', false);
      worldState.set('agents.' + record.id + '.deathTick', tick);
      observer.recorder.eventLog.record({ tick, topic: 'agent.death', payload: { agentId: record.id, cause: result.cause, age: result.age, stage: result.stage }, agentId: record.id });
      deaths.push({ agentId: record.id, cause: result.cause, age: result.age });
    }
  }
  return deaths;
}

/**
 * 批次2-A：特质漂移（evolution.drift）。每 traitDriftInterval tick 依据生存压力
 * 信号把相关特质权重缓慢推向目标（确定性单调漂移，不消耗 rng）。
 */
function runTraitDrift(tick, cfg) {
  const interval = Number.isInteger(cfg.traitDriftInterval) && cfg.traitDriftInterval > 0 ? cfg.traitDriftInterval : 10;
  if (tick % interval !== 0) return [];
  const rate = typeof cfg.traitDriftRate === 'number' ? cfg.traitDriftRate : 0.05;
  const drifted = [];
  for (const record of registry.lookup({ type: 'agent' })) {
    const needs = survival.needs.meter.query({ agentId: record.id }).needs;
    const pressure = Math.max(needs.food ?? 0, needs.water ?? 0);
    const signals = {
      resilient: 0.5 + pressure,
      cautious: 0.5 + pressure * 0.8,
      brave: 1 - pressure * 0.6,
      impulsive: 1 - pressure * 0.6,
      sociable: 1 - pressure * 0.4,
      hardworking: 0.5 + pressure * 0.3,
    };
    const res = agent.traits.evolution.drift({ agentId: record.id, signals, rate });
    if (res.drifted > 0) drifted.push({ agentId: record.id, drifted: res.drifted });
  }
  if (drifted.length > 0) {
    const first = drifted[0];
    observer.recorder.eventLog.record({ tick, topic: 'agent.trait.drift', payload: { agentId: first.agentId, drifted: first.drifted, driftedAgents: drifted.length } });
  }
  return drifted;
}

/**
 * 推进一个 tick（完整闭环）。
 * @param {object} [config] 与 DEFAULT_CONFIG 合并的运行参数
 * @returns {Promise<object>} 本 tick 摘要
 */
export async function step(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...configStore.currentDifficultyParams(), ...(config ?? {}) };
  const tick = clock.tick().tick;

  // 0) 世界采集池再生（每 tick 补充可采集总量）
  regenForagePool(cfg);

  // 1) survival：衰减 / 需求增长 / 突发事件
  const eventPercepts = runSurvival(tick, cfg);

  // 2) perception：事件转 percept 并分发给智能体
  const percepts = perception.collect(eventPercepts);
  const inbox = perception.route(percepts);

  // 3) 逐智能体：决策 → 观察者决策日志 → AI 思考
  const agentRecords = registry.lookup({ type: 'agent' });
  const decisions = [];
  for (const record of agentRecords) {
    const agentId = record.id;
    const decision = decide(agentId, tick, inbox[agentId] ?? [], cfg);
    if (decision === null) continue;
    // 批次2-C（t48）：日程驱动行动（非紧急时以日程为准，紧急触发重排）
    if (cfg.scheduleEnabled !== false) {
      const scheduled = scheduleOverride(decision, agentId, tick, cfg);
      if (scheduled) {
        decision.action = scheduled.action;
        decision.reason = scheduled.reason;
        decision.schedule = scheduled.meta;
        if (scheduled.replanned) {
          observer.recorder.eventLog.record({ tick, topic: 'agent.schedule.replan', payload: { agentId, trigger: scheduled.trigger } });
        }
      }
    }
    observer.recorder.decisionLog.record({
      tick,
      agentId,
      decision: decision.action,
      options: decision.options,
      context: decision.context,
      reason: decision.reason,
      decisionId: decision.id,
    });
    // 批次2-B（t47）：把本次决策沉淀为语义记忆（事件→摘要），供后续召回
    agent.memory.semantic.store(agentId, {
      content: '第 ' + tick + ' tick 选择「' + decision.action + '」' + (decision.context?.dominantNeed ? '（主导需求：' + decision.context.dominantNeed + '）' : ''),
      tags: [decision.action, decision.context?.dominantNeed ?? 'sustenance'],
      salience: 0.5,
    }, { maxEntries: cfg.semanticMaxEntries });
    const situation = `当前处境：${(inbox[agentId] ?? []).map((p) => p.topic).join('、') || '一切如常'}。你决定采取行动「${decision.action}」。`;
    const thought = await ai.thought.generate(agentContextOf(record), situation);
    decisions.push({ agentId, decision, thought });
  }

  // 4) dispatch：行动落到 world-state + 观察者行为日志 + 情景记忆
  for (const { agentId, decision, thought } of decisions) {
    const op = dispatch.resolve([{
      agentId,
      action: decision.action,
      params: { reason: decision.reason },
      reason: decision.reason,
      confidence: decision.confidence,
      effect: effectFor(agentId, decision.action, cfg),
    }])[0];
    dispatch.actions(op, {
      onApplied: (record) => {
        observer.recorder.actionLog.record({
          tick,
          agentId: record.agentId,
          action: record.action,
          outcome: { applied: true },
          actionId: record.id,
        });
      },
    });
    agent.memory.episodic.store.write(agentId, {
      content: thought.thought,
      emotion: null,
      salience: 0.5,
      tags: ['thought', String(decision.action)],
    });
  }

  // 4.5) 死亡：饥饿/口渴持续 → 健康下降 → 死亡（移出 registry + 写 observer）
  runMortality(tick, cfg);

  // 4.6) 批次2-C（t48）：公共角色影响（医生治疗等）
  applySocietyEffects(tick, cfg);

  // 4.6) 批次2-A：自然衰老（老年死亡）+ 特质漂移（与 needs 致死并存）
  runLifecycle(tick, cfg);
  runTraitDrift(tick, cfg);

  // 5) world-state 快照
  syncWorldState(tick, cfg);

  // 6) 第二阶段：家庭/经济/制作/居住/健康（被主循环驱动并写 observer）
  let phase2Summary = null;
  if (cfg.phase2) {
    phase2Summary = stage2.tick({
      tick,
      agents: agentRecords,
      config: cfg,
      spawnChild: (child) => registerAgent({
        id: child.id, name: child.name, persona: '避难所新生儿',
        food: 0.2, water: 0.2, candidates: DEFAULT_ACTIONS,
      }),
    });
  }

  // 7) 第三阶段：治理/文化/心理/科技/遗产（被主循环驱动并写 observer）
  let phase3Summary = null;
  if (cfg.phase3) {
    phase3Summary = await stage3.tick({ tick, agents: agentRecords, config: cfg });
  }

  // 8) 生存危机检测 + 生存目标更新（每 tick 末尾，snapshot 可读）
  const crisisState = survival.crisis.alert({ tick });
  const goalState = survival.goal.elapsed({ tick });
  worldState.set('survival.crisis', crisisState);
  worldState.set('survival.goal', goalState);

  return {
    tick,
    eventCount: eventPercepts.length,
    decisions: decisions.map((d) => ({
      agentId: d.agentId,
      action: d.decision.action,
      confidence: d.decision.confidence,
      thought: d.thought.thought,
    })),
    resources: { food: survival.resources.food.query(), water: survival.resources.water.query(), energy: survival.resources.energy.query(), medical: survival.resources.medical.query() },
    ...(phase2Summary === null ? {} : { phase2: phase2Summary }),
    ...(phase3Summary === null ? {} : { phase3: phase3Summary }),
  };
}

/** 复位全部共享状态（graph/rng/identity/clock/world-state/registry/needs/recorder）。 */
export function reset() {
  graph.__reset();
  rng.__reset();
  identity.__reset();
  clock.__reset();
  worldState.__reset();
  registry.__reset();
  survival.needs.meter.__reset();
  observer.recorder.__reset();
  dispatch.__reset();
  perception.__reset();
  stage2.__reset();
  stage3.__reset();
  mortality.clear();
  foragePool = null;
  currentSeed = 'default';
}

/**
 * 复位并运行 N 个 tick，返回整段运行的汇总报告。
 * @param {object} [options]
 * @param {number} [options.ticks=1] 运行 tick 数
 * @param {number|string} [options.seed] 随机种子
 * @param {Array<object>} [options.agents] 初始智能体（见 spawnAgent）
 * @param {number} [options.agentCount] 未提供 agents 时自动生成的数量（默认 3）
 * @param {boolean} [options.reset=true] 运行前是否复位
 * @param {object} [options.decay] {food, water} 资源自然损耗率
 * @param {object} [options.needGrowth] {food, water} 每 tick 需求增长
 * @param {number} [options.eventProbability] 每 tick 突发事件概率
 * @param {Array<object>} [options.events] 突发事件目录
 * @returns {Promise<object>}
 */
export async function run(options = {}) {
  if (options.reset !== false) reset();
  if (options.seed !== undefined) { currentSeed = String(options.seed); rng.seed(options.seed); }

  const spawned = [];
  const phase2 = options.phase2 === true;
  const phase3 = options.phase3 === true;
  const agents = Array.isArray(options.agents) ? options.agents : [];
  if (agents.length > 0) {
    for (let i = 0; i < agents.length; i += 1) {
      const a = agents[i];
      spawned.push(phase2 && a.tags === undefined ? spawnAgent({ ...a, tags: stage2.makeTags(i, options) }) : spawnAgent(a));
    }
  } else {
    const count = Number.isInteger(options.agentCount) && options.agentCount > 0 ? options.agentCount : 3;
    for (let i = 0; i < count; i += 1) {
      const name = `居民${i + 1}`;
      spawned.push(spawnAgent(phase2 ? { name, tags: stage2.makeTags(i, options) } : { name }));
    }
  }

  // 第二阶段：一次性初始化（避难所/住所/账户/价格/配方/初始感染）
  let phase2Seed = null;
  if (phase2) {
    phase2Seed = stage2.seed(spawned, options);
  }

  // 第三阶段：一次性初始化（派系/规范/仪式/模因/创伤/研究）
  let phase3Seed = null;
  if (phase3) {
    phase3Seed = stage3.seed(spawned, options);
  }

  // 生存目标：记录起始 tick（elapsed 与主循环 tick 一致）
  survival.goal.survive({ tick: 0 });

  // 批次2-C（t48）：为居民种子日程 / 职业 / 公共角色（真实调用 4 模块）
  seedAgentScheduleRoles(spawned, options);

  const ticks = Number.isInteger(options.ticks) && options.ticks > 0 ? options.ticks : 1;
  const steps = [];
  for (let i = 0; i < ticks; i += 1) {
    steps.push(await step(options));
  }

  return {
    seed: options.seed,
    agents: spawned,
    ticks,
    finalTick: clock.now().tick,
    steps,
    world: worldState.snapshot(),
    resources: { food: survival.resources.food.query(), water: survival.resources.water.query(), energy: survival.resources.energy.query(), medical: survival.resources.medical.query() },
    chronicle: observer.chronicle.compiler.compile().counts,
    social: socialSummary(),
    ...(phase2 ? { phase2: { seed: phase2Seed, summary: stage2.summary() } } : {}),
    ...(phase3 ? { phase3: { seed: phase3Seed, summary: stage3.summary() } } : {}),
  };
}

/** 当前观测快照（世界状态 + 资源 + 编年计数），供 api / 冒烟测试观测。 */
export function snapshot() {
  return {
    tick: clock.now().tick,
    agents: registry.lookup({ type: 'agent' }),
    world: worldState.snapshot(),
    resources: { food: survival.resources.food.query(), water: survival.resources.water.query(), energy: survival.resources.energy.query(), medical: survival.resources.medical.query() },
    chronicle: observer.chronicle.compiler.compile().counts,
    social: socialSummary(),
  };
}

export { DEFAULT_ACTIONS, DEFAULT_EVENTS, DEFAULT_TAGS };
