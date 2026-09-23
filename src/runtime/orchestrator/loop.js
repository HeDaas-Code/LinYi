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

const DEFAULT_CONFIG = Object.freeze({
  ...configStore.defaults(),
  events: DEFAULT_EVENTS,
  phase2: false,
  phase3: false,
});

function clampUnit(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
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
function registerAgent({ id, name, persona, food, water, candidates }) {
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
  return { id, name, persona };
}

export function spawnAgent(input = {}) {
  const id = typeof input?.id === 'string' && input.id.trim() !== '' ? input.id : identity.next('agent');
  const name = typeof input?.name === 'string' && input.name.trim() !== '' ? input.name : `居民${id}`;
  const persona = typeof input?.persona === 'string' ? input.persona : '一名普通避难所居民';
  const tags = input?.tags ?? DEFAULT_TAGS;
  const candidates = Array.isArray(input?.candidates) && input.candidates.length > 0 ? input.candidates : DEFAULT_ACTIONS;
  const food = clampUnit(input?.food, 0.2);
  const water = clampUnit(input?.water, 0.2);

  agent.traits.tagset.store.upsert(id, tags);
  return registerAgent({ id, name, persona, food, water, candidates });
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

  const candidates = anticipations.map((a) => ({ id: a.id, action: a.action, score: a.score }));
  const top = dominantPressure(pressures);
  const need = top.need;
  const needLevel = top.level ?? 0;
  const needScarcity = pressure.scarcity?.[need] ?? 0;
  const choice = agent.decision.selector.choose({
    candidates,
    context: { dominantNeed: need },
    scoreFn: (candidate) => scoreAction(candidate, {
      dominantNeed: need,
      dominantLevel: needLevel,
      dominantScarcity: needScarcity,
      eatThreshold: cfg.eatThreshold,
    }),
  });
  if (choice === null) return null;

  return {
    id: choice.id,
    action: choice.action,
    score: choice.score,
    confidence: choice.confidence,
    reason: choice.reason,
    options: candidates,
    context: { pressures, topDriver: ranked.length > 0 ? ranked[0].id : null, dominantNeed: need },
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
        survival.resources.food.produce(yieldAmount);
        survival.resources.water.produce(yieldAmount);
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
function syncWorldState(tick) {
  worldState.set('tick', tick);
  worldState.set('resources.food', survival.resources.food.query());
  worldState.set('resources.water', survival.resources.water.query());
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
 * 推进一个 tick（完整闭环）。
 * @param {object} [config] 与 DEFAULT_CONFIG 合并的运行参数
 * @returns {Promise<object>} 本 tick 摘要
 */
export async function step(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...(config ?? {}) };
  const tick = clock.tick().tick;

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
    observer.recorder.decisionLog.record({
      tick,
      agentId,
      decision: decision.action,
      options: decision.options,
      context: decision.context,
      reason: decision.reason,
      decisionId: decision.id,
    });
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

  // 5) world-state 快照
  syncWorldState(tick);

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

  return {
    tick,
    eventCount: eventPercepts.length,
    decisions: decisions.map((d) => ({
      agentId: d.agentId,
      action: d.decision.action,
      confidence: d.decision.confidence,
      thought: d.thought.thought,
    })),
    resources: { food: survival.resources.food.query(), water: survival.resources.water.query() },
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
  if (options.seed !== undefined) rng.seed(options.seed);

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
    resources: { food: survival.resources.food.query(), water: survival.resources.water.query() },
    chronicle: observer.chronicle.compiler.compile().counts,
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
    resources: { food: survival.resources.food.query(), water: survival.resources.water.query() },
    chronicle: observer.chronicle.compiler.compile().counts,
  };
}

export { DEFAULT_ACTIONS, DEFAULT_EVENTS, DEFAULT_TAGS };
