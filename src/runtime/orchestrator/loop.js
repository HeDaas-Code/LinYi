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
import * as hotLog from '../../infra/store/hot-log.js';
import * as configStore from '../../infra/config.js';
import * as identity from '../../infra/identity.js';
import * as rng from '../../infra/rng.js';

import * as agent from '../../agent/index.js';
import * as ai from '../../ai/index.js';
import * as survival from '../../survival/index.js';
import * as social from '../../social/index.js';
import * as genesis from '../../genesis/index.js';
import * as civilization from '../../civilization/index.js';
import * as town from '../../town/index.js';
import * as observer from '../../observer/index.js';
import * as stage2 from './_stage2.js';
import * as stage3 from './_stage3.js';
import * as stageProgress from './stage-progress.js';

/** 默认生存事件目录（供 selector 加权抽取）。 */
const DEFAULT_EVENTS = Object.freeze([
  { id: 'storm', type: 'storm', weight: 2, effects: { foodDelta: -5, waterDelta: -3, shelterDamage: 5 } },
  { id: 'supply_drop', type: 'supply', weight: 1, effects: { foodDelta: 10, waterDelta: 10 } },
  { id: 'drought', type: 'drought', weight: 2, effects: { waterDelta: -8 } },
  { id: 'blight', type: 'blight', weight: 1, effects: { foodDelta: -8 } },
]);

/** 生存骨架候选（永远可选；非生存候选由 agent.decision.candidates 按状态动态追加）。 */
const DEFAULT_ACTIONS = Object.freeze([
  { id: 'eat', action: 'eat', score: 0.3 },
  { id: 'drink', action: 'drink', score: 0.3 },
  { id: 'rest', action: 'rest', score: 0.2 },
  { id: 'forage', action: 'forage', score: 0.2 },
]);

/** 生存骨架行动（t11：**由行动契约推导**，不再硬编码）。
 * 此前同一份分类在本文件里存在两份（此处 + scoreAction 的 NON_SURVIVAL），
 * 与 candidates 的 RULES 构成第三份；任何一处新增行动都会静默漏配。 */
const SURVIVAL_ACTIONS = Object.freeze(agent.decision.contract.sustainActions());
/** 非生存行动（同样由契约推导）。 */
const NON_SURVIVAL_ACTIONS = Object.freeze(agent.decision.contract.nonSustainActions());

const DYNAMIC_BASE_SCORE = Object.freeze({
  craft: 0.9, build: 0.8, write: 0.7, work: 1.0, trade: 0.8, socialize: 0.7, court: 0.85, accept: 1.1,
  expedition: 0.75,
  // found：居民自己创办企业。基准分低于 work（1.0），因为创办是**机会性**行为——
  // 有资本且无事可做时才值得做，不应压过日常谋生。
  found: 0.6,
  // ---- t13：双向社会互动 ----
  // 注意：这张表是**派发闸门**（下表未列出的行动根本不会被 stage2 执行，
  // performed 恒为 null），它同时还是候选分的第二份拷贝。
  // 行动空间事实上被声明在**三处**（candidates.BASE_SCORE / action-contract / 这里），
  // 三者不同步就会出现"候选能被选中、执行器却什么都不做"的静默空转——
  // 实测承诺被选中 5 次、互动记录 0 条，正是漏了这张表。
  // 新增行动时三处都要改；此处保留副本是为了避免 dispatch 热路径再做一次查表。
  reject: 1.05, promise: 0.55, fulfill: 1.15, violate: 0.3,
});

/**
 * 语义紧迫度缓存（LAYA 结构化判断服务）。
 *
 * 只作**加权项**（压力分的 15%），不是决定者——决策权始终在居民手里。
 * LAYA 是确定性函数，故按状态键缓存；服务不可用时静默回退（返回 null），
 * 决策链完全不受影响。
 */
const layaUrgencyCache = new Map();

/** 读取某居民的语义紧迫度（0..1）；未预取或服务不可用时返回 null。 */
function layaUrgencyFor(agentId) {
  const v = layaUrgencyCache.get(agentId);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 供 LAYA 预取使用的居民记录（只需 id 与名字）。 */
function agentRecordsForLaya() {
  return registry.lookup({ type: 'agent' }).map((a) => ({ id: a.id, name: a.name ?? a.id }));
}

/** 把数值分桶：既让缓存命中率上升（LAYA 是确定性函数），也避免浮点抖动造成键爆炸。 */
function bucket(v, edges) {
  for (let i = 0; i < edges.length; i += 1) if (v < edges[i]) return i;
  return edges.length;
}

/**
 * 为全体居民预取语义紧迫度（LAYA 结构化判断）。
 *
 * 单次调用约 200ms（首次），故**逐 tick 对全体居民调用代价过高**；
 * 采用「按语义分桶的状态键」+ 进程内缓存：同一处境只调用一次，之后 0ms 命中。
 * 任一居民失败静默跳过（其 urgency 为 null，压力分的语义项记 0），
 * **决策链完全不受 LAYA 可用性影响**。
 */
async function prefetchLayaUrgency(records, cfg) {
  const foodStock = survival.resources.food.query().stockpile ?? 0;
  const waterStock = survival.resources.water.query().stockpile ?? 0;
  const alive = Math.max(1, alivePopulation());
  const perCapita = Math.min(foodStock, waterStock) / alive;
  const hungerText = ['完全不饿', '略微饥饿', '明显饥饿', '非常饥饿', '极度饥饿'];
  const thirstText = ['完全不渴', '略微口渴', '明显口渴', '非常口渴', '极度口渴'];
  const scarcityText = ['储备充裕', '储备偏少', '储备紧张', '储备见底', '储备耗尽'];
  // 实测（20 人 30 tick）：全量预取 calls=539、墙钟 78s（未开启时 0.45s）——慢 175 倍，
  // 并发时单次延迟由 200ms 涨到 ~2.8s。这对主循环不可接受。
  // 因此**只对处境已达进食阈值的人**调用：数量少（通常个位数）、价值高（正是需要判断的人），
  // 且消息按分桶生成，缓存命中率随之提高。
  const needThreshold = clampUnit(cfg.eatThreshold, 0.4);
  const candidates = records.filter((rec) => {
    try {
      const needs = survival.needs.meter.query({ agentId: rec.id }).needs;
      return needs.food >= needThreshold || needs.water >= needThreshold;
    } catch { return false; }
  });
  const budget = Number.isInteger(cfg.layaMaxAgents) && cfg.layaMaxAgents > 0 ? cfg.layaMaxAgents : 8;
  const selected = candidates.slice(0, budget);
  await Promise.all(selected.map(async (rec) => {
    try {
      const needs = survival.needs.meter.query({ agentId: rec.id }).needs;
      const msg = '居民处于地下避难所中：' + hungerText[bucket(needs.food, [0.2, 0.4, 0.7, 0.9])]
        + '，' + thirstText[bucket(needs.water, [0.2, 0.4, 0.7, 0.9])]
        + '；避难所' + scarcityText[bucket(perCapita, [0.5, 1.5, 3, 6])] + '。';
      const r = await ai.laya.survivalUrgency({ message: msg });
      layaUrgencyCache.set(rec.id, r.urgency);
    } catch { layaUrgencyCache.set(rec.id, null); }
  }));
}

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
  // 语义记忆是否落图存储（memoryPersist 的真实语义）。
  //
  // 默认 false：主循环每 tick 每居民写一条语义记忆（50 人 × 200 tick = 10000 条），
  // 而图里每多一个节点，所有 read({ type }) 全量查询都要为它付出代价
  // （实测 30000 节点时一次全量读 51ms）。语义记忆在本进程内即建即用
  // （按 agentId 分桶的 byAgent 索引），不需要经图存储中转。
  // true = 显式要求落图（跨模块按 type 查询可见，代价是图规模增长）。
  memoryPersist: false,
});

// ---- 世界采集池（t32）：每 tick 再生、全局共享，避免补给随人口线性增长 ----
let foragePool = null;
let currentSeed = 'default';

// ---- 干预钩子（t10：真实反事实分支重演）----
// 为什么必须有这个钩子：反事实要求「除一个行动外，两个世界完全一致」。
// 但决策序列是**状态依赖**的——被替换的行动会改变世界，后续决策看到的状态就变了。
// 不注入干预，就只能重放同一套规则选择，得到的结果里混着"世界真的变了"与
// "这不是我原本要问的问题"两种效应，无法归因到被替换的那一个行动。
//
// 语义：干预把指定 (agentId, tick) 的**最终行动**改写为 alternative，
// 且只改写决策的**结果**——候选集、上下文、争用预支、日志记录全部照常执行，
// 使被替换的那一 tick 与真实世界逐字段可比（除 decision 本身）。
// 干预是**逐次生效**的（consumed）：同 tick 被多次决策调用时只改写一次，
// 避免把"替换一个行动"意外放大成"替换一个居民的全部行动"。
let intervention = null;

/**
 * 设置反事实干预（仅供 observer.experiment.counterfactual 的分支会话使用）。
 *
 * ## tick 语义（实测校准，不是推测）
 * 干预的 `tick` 就是**决策日志里记的那个 tick**，内部循环 tick 与之相同，
 * 两者之间**没有偏移**。校准方法（seed 7, 4 人, 12 tick 存档, resume 5 tick）：
 *   spec.tick=13 → 改写记录 tick 13；spec.tick=12 → 改写记录 tick 12；依此类推。
 * 之所以要把这条写下来：t10 初版曾以为存在 ±1 偏移并据此折算，结果干预
 * **静默不生效**（改写落到相邻 tick 上）。现在改为不折算，并由回归测试锁死——
 * 这类"差一个 tick"的错误不会崩、不会报错，只会让反事实结论悄悄变成另一件事。
 *
 * 只改决策**结果**，不改候选集与上下文：候选集若也被改，
 * 「为什么当时没选它」就无从判定——而候选集恰恰是准入门的证据。
 * @param {object|null} spec
 */
export function setIntervention(spec = null) {
  if (spec === null || spec === undefined) { intervention = null; return; }
  if (typeof spec !== 'object' || typeof spec.agentId !== 'string' || spec.agentId === '') {
    throw new TypeError('loop.setIntervention: agentId 必须为非空字符串');
  }
  if (typeof spec.action !== 'string' || spec.action === '') {
    throw new TypeError('loop.setIntervention: action 必须为非空字符串');
  }
  // 调用方给的就是**记录 tick**，内部循环 tick 与之相同（实测校准，见上），故不折算。
  const fromTick = Number.isInteger(spec.fromTick) ? spec.fromTick : 0;
  const toTick = Number.isInteger(spec.toTick) ? spec.toTick : Number.MAX_SAFE_INTEGER;
  intervention = {
    agentId: spec.agentId,
    action: spec.action,
    recordedTick: fromTick,
    fromTick,
    toTick,
    maxUses: Number.isInteger(spec.maxUses) && spec.maxUses > 0 ? spec.maxUses : 1,
    reason: typeof spec.reason === 'string' ? spec.reason : null,
    used: 0,
  };
}

/** 当前是否有未用完的干预（观测/断言用）。 */
export function interventionStatus() {
  return intervention === null ? null : { ...intervention };
}

/**
 * 对一次已完成的决策套用干预。返回是否真正改写了。
 *
 * 只允许在**候选集内**改写：若备选行动当时不可行，
 * 强行注入会造出一个真实世界不可能出现的世界，反事实结论随即失去意义。
 * 这种拒绝必须显式记录（return false + 调用方留痕），不得静默当作"已替换"。
 */
function applyIntervention(decision, agentId, tick) {
  if (intervention === null) return false;
  const iv = intervention;
  if (iv.agentId !== agentId || tick < iv.fromTick || tick > iv.toTick) return false;
  if (iv.maxUses === 1 && iv.used >= 1) return false;
  if (iv.used >= iv.maxUses) return false;
  const allowed = (decision.options ?? []).map((o) => o.action);
  if (!allowed.includes(iv.action)) return false;
  if (decision.action === iv.action) return false;
  iv.used += 1;
  decision.action = iv.action;
  decision.reason = '反事实干预：' + (iv.reason ?? ('改为「' + iv.action + '」'));
  decision.counterfactual = { action: iv.action, reason: iv.reason, use: iv.used };
  decision.final = { action: iv.action, source: 'counterfactual', score: null, confidence: null };
  // 与模型/日程覆盖同一契约：最终动作被改写后，原动作的分数不得冒充它。
  decision.score = null;
  decision.confidence = null;
  return true;
}

// ---- tick 提交边界（t2）----
// 语义：tick 开始即 inFlight=true 并记录 inFlightTick；只有全部阶段（含 phase2/phase3）
// 跑完、末端快照写完之后才 committedTick=tick、inFlight=false。因此：
//   - step 进行中 snapshot() 的 lastCommittedTick 仍是上一个完整 tick；
//   - 观察者能区分“推进中”与“已提交”；
//   - 任一步骤抛错时 inFlight 归位并记录 stageError，不会留下永久 running 假象。
let inFlight = false;
let committedTick = 0;
let inFlightTick = 0;
let stageError = null;
let stageFailure = null;

/**
 * 存活人口。性能关键：registry.lookup 会 graph.read 深拷贝全部智能体，
 * 而本函数在每 tick 每居民的决策路径上都会被调用（≈10,400 次/200tick 局），
 * 同时采集池容量/再生也要用它——把 O(居民²) 降为 O(居民)。
 *
 * 缓存按**显式世代号**失效（而非 clock.now().tick）：regenForagePool 在 step 早期
 * 执行时 clock 可能尚未推进，用 tick 作键会读到上一 tick 的值，导致容量/再生算错
 * （表现为「采集池按人口缩放」用例 bigRegen 与 smallRegen 相同）。
 */
let _alivePopGeneration = -1;
let _alivePopValue = 0;

/** 使存活人口缓存失效（在人口发生变化的节点调用：step 入口、出生、死亡、复位）。 */
function invalidateAlivePopulation() {
  _alivePopGeneration -= 1;
}

function alivePopulation() {
  if (_alivePopGeneration !== 0) {
    const agents = registry.lookup({ type: 'agent' });
    _alivePopValue = Array.isArray(agents) ? agents.length : 0;
    _alivePopGeneration = 0;
  }
  return _alivePopValue;
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
// ---- 代际（t5）：真实创建入口与跨代交接 ----
//
// generationCount：当前世代编号。初代 = 1，文明重启交接后 +1。
// 每一次「造人」（初代登记 / 生育 / 重启建国）都必须经过 registerAgent，
// 世代号与父母由此写进 registry 与 world-state。
//
// 修复前的真实断裂：registerAgent 只写 { name, persona }，registry 里查不到
// 任何代际信息（generation/parents 恒为 undefined）。而 genesis.agentFactory.assemble
// 明明把 generation/parents 写进了 registry —— 也就是说「代际」只存在于那条
// **没有任何生产调用点**的路径上，真实运行查不到「这个人属于第几代、父母是谁」。
let generationCount = 1;
/** 本局已被封存的旧世代（重启时隔离出来的世代快照，供遗产与审计）。 */
let sealedGenerations = [];

/**
 * 登记一个智能体（注册表 + 预想池 + 需求 + 世界状态）；标签由调用方负责。
 * spawnAgent 负责写标签，阶段二子代由 offspring 先写标签再走这里。
 *
 * @param {{ id: string, name: string, persona: string, food?: number, water?: number,
 *           candidates?: Array<object>, age?: number,
 *           generation?: number, parents?: Array<string>|{paternal?:string,maternal?:string}|null }} input
 */
function registerAgent({ id, name, persona, food, water, candidates, age, generation, parents }) {
  const gen = Number.isInteger(generation) && generation > 0 ? generation : generationCount;
  const kin = parents ?? null;
  const bornTick = clock.now().tick;
  registry.register({ id, type: 'agent', data: { name, persona, generation: gen, parents: kin, bornTick, alive: true } });
  for (const candidate of candidates) {
    agent.anticipation.pool.store.add(id, {
      id: `${id}:${candidate.id}`,
      action: candidate.action,
      score: typeof candidate.score === 'number' ? candidate.score : 0,
    });
  }
  survival.needs.meter.update({ agentId: id, need: 'food', level: food });
  survival.needs.meter.update({ agentId: id, need: 'water', level: water });
  worldState.set(`agents.${id}`, {
    name, persona, alive: true, bornTick, generation: gen, parents: kin,
  });
  // 批次2-A：登记生命周期（初始年龄，子代默认 0）与身份
  agent.lifecycle.birth(id, { tick: bornTick, age: typeof age === 'number' ? age : 0 });
  agent.persona.identity.update(id, { name, persona, generation: gen });
  return { id, name, persona, generation: gen };
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

/**
 * 文明重启的**真实**代际交接（t5）。
 *
 * 修复前这条链路是断的：`civilization.restart.execute` 在 phase3 里被调用时
 * **没有 reset 回调**（config.restartReset 在生产里从未被设置），于是「重启沙盒」
 * 是一句空话——崩溃之后同一批居民继续活着、世代号不变、也没有下一代产生。
 * 实测（3 居民 6 tick + collapseForce）：重启后 registry 里仍是 agent_...001/002/003，
 * 且 data.generation / data.parents 恒为 undefined；genesis.agentFactory.assemble
 * 的 assembled 计数恒为 0（那条「唯一产生副作用的创建入口」在生产路径零调用）。
 *
 * 本函数把「归档 → 隔离 → 重建 → 交棒」变成有副作用的事实：
 *   1) **隔离旧世代**：旧世代移出活跃注册表（不再被生存/经济/社交系统消费），
 *      标记 alive=false + sealedTick，并写 observer 事件。旧世代不是被抹掉，
 *      而是被封存进 sealedGenerations 与文明遗产图谱，可审计。
 *   2) **用居民工厂创建下一代**：走 genesis.agentFactory.template（真正的造人入口，
 *      纯函数模板 + 组装），而不是复用旧人。新世代 traits 来自 'native'（避难所新生代）
 *      模板的 50 条标签 —— 与初代的 5 条固定标签分布不同，因此行为可分叉。
 *   3) **写入代际身份**：registry/world-state/身份面都带上 generation = 旧代 + 1，
 *      parents = null（开国一代无父母）。next-generation 行为差异因此可被查询，
 *      而不只是「换了一批 id」。
 *
 * 语义边界（刻意不做的事）：本函数不做「遗产→特质注入」，那是遗产闭环的职责；
 * 这里只保证旧状态被隔离、新世代真实诞生且可被识别为下一代。
 *
 * @param {number} tick 交接发生的 tick
 * @param {object} cfg 运行配置
 * @param {{ graph?: object, summary?: object }|null} [heritage] 已归档的遗产（供记录引用）
 *   4) **改派研究负责人**：研究任务把负责人记死在记录里，progress 每 tick 以
 *      researchers[0] 为行为主体写 action-log。不改派的话，被封存的居民会"隔着世代"
 *      继续推进研究（实测交接后 tick 2/3 的 action-log 仍以已封存的旧 id 出现）——
 *      那不是历史，是跨世代的状态泄漏。
 *
 * @returns {{ previousGeneration: number, generation: number, retired: Array<string>,
 *             founded: Array<object>, templateId: string, heritageGraphId: string|null,
 *             reassignedResearch: Array<{techId: string, from: Array<string>, to: Array<string>}> }}
 */
function runGenerationHandover(tick, cfg, heritage = null) {
  const before = registry.lookup({ type: 'agent' });
  const previousGeneration = generationCount;
  const nextGeneration = previousGeneration + 1;
  const population = Number.isInteger(cfg.restartPopulation) && cfg.restartPopulation > 0
    ? cfg.restartPopulation
    : Math.max(1, before.length);
  const templateId = typeof cfg.restartTemplateId === 'string' && cfg.restartTemplateId !== ''
    ? cfg.restartTemplateId
    : 'native';

  // 1) 隔离旧世代：移出活跃注册表 + 生命周期标记 + 事件留痕。
  const retired = [];
  for (const record of before) {
    const id = record.id;
    registry.unregister(id);
    agent.lifecycle.death(id, { tick, cause: 'civilization_restart' });
    worldState.set(`agents.${id}.sealedTick`, tick);
    worldState.set(`agents.${id}.sealedGeneration`, previousGeneration);
    mortality.delete(id);
    observer.recorder.eventLog.record({
      tick,
      topic: 'civilization.generation.sealed',
      payload: { agentId: id, generation: previousGeneration, reason: 'civilization_restart' },
      agentId: id,
    });
    retired.push(id);
  }
  sealedGenerations.push({ generation: previousGeneration, tick, members: retired });

  // 2) 用居民工厂创建下一代（真实创建入口）。
  generationCount = nextGeneration;
  const founded = [];
  for (let i = 0; i < population; i += 1) {
    const desc = genesis.agentFactory.template.instantiate({ templateId });
    const id = identity.next('agent');
    const created = spawnAgent({
      id,
      name: '第' + nextGeneration + '代居民' + (i + 1),
      persona: '文明重启后出生的第 ' + nextGeneration + ' 代居民',
      tags: desc.tags,
      generation: nextGeneration,
      parents: null,
      age: 0,
    });
    founded.push({ id: created.id, name: created.name, generation: nextGeneration, tagCount: desc.tags.length });
  }
  // 新世代同样要有日程/职业/公共角色——否则重启后文明只剩「活着」，
  // 识字供给、治疗名额、工作块全部归零，行为差异会被误读成"重启即退化"。
  seedAgentScheduleRoles(founded, cfg);
  invalidateAlivePopulation();

  // 研究任务里**记死的负责人**必须一起改派：否则被封存的居民会继续以行为主体身份
  // 推进研究（实测交接后 tick 2/3 的 action-log 仍以已封存的旧 id 出现）——
  // 那不是历史，而是跨世代的状态泄漏，会让"重启隔离"名不副实。
  const reassigned = [];
  try {
    const pool = founded.map((f) => f.id);
    for (const rec of civilization.tech.research.pending()) {
      const alive = rec.researchers.filter((id) => registry.lookup(id) !== null);
      if (alive.length === rec.researchers.length && alive.length > 0) continue;
      const next = alive.length > 0 ? alive : pool.slice(0, Math.min(2, pool.length));
      if (next.length === 0) continue;
      civilization.tech.research.reassign({ techId: rec.techId, researchers: next, tick });
      reassigned.push({ techId: rec.techId, from: rec.researchers, to: next });
    }
  } catch { /* 研究系统不可用时，交接本身不应失败 */ }

  // 3) 遗产注入（t14）：把上一代留下的**物证**变成下一代真实拥有的能力。
  //
  // 这一步是 t5 刻意留白的接缝：交接只保证"旧状态被隔离、新世代真实诞生"，
  // 不做"遗产→能力"的注入。没有这一步，重启后的新世代与"凭空造一批人"毫无区别——
  // 实测（未注入时）新世代技能/偏好/研究前提全为 0，遗产只是 graph 里的一堆死数据。
  //
  // 链路：legacy.graph → relic.artifact.forge → relic.discover（可能读歪）
  //        → skill / tech head start / action preference（每条都带来源）
  // 开关：config.legacyInheritance（默认 true）。显式 false 用于**同条件对照**，
  // 证明"下一代行为改变"确实来自遗产，而不是来自重启本身。
  const inheritance = { enabled: cfg.legacyInheritance !== false, relics: 0, discoveries: 0, garbled: 0, applied: [] };
  if (inheritance.enabled && heritage !== null && heritage !== undefined) {
    try {
      const seeded = civilization.legacy.inherit.applier.seedFromHeritage({
        heritage,
        agents: founded,
        tick,
        // 素养决定能不能读懂物证：识字者读对的概率高得多。
        literacyOf: (id) => (isLiterate(id, cfg) ? 0.85 : 0.2),
      });
      inheritance.relics = seeded.relics;
      inheritance.discoveries = seeded.discoveries;
      inheritance.garbled = seeded.garbled;
      inheritance.applied = seeded.applied.map((a) => ({ agentId: a.agentId, applied: a.applied }));
    } catch (err) {
      // 遗产注入失败**不能**让交接失败：文明重启本身是比继承更基础的动作。
      inheritance.error = err instanceof Error ? err.message : String(err);
    }
  }
  const inherited = civilization.legacy.inherit.trace.summary();

  const heritageGraphId = heritage?.graph?.graphId ?? null;
  worldState.set('civilization.generation', {
    generation: nextGeneration,
    previousGeneration,
    foundedAt: tick,
    population: founded.length,
    templateId,
    heritageGraphId,
    // 观测面：下一代到底继承到了什么（而不是"遗产已归档"这种空话）。
    inheritance: {
      enabled: inheritance.enabled,
      relics: inheritance.relics,
      discoveries: inheritance.discoveries,
      garbled: inheritance.garbled,
      skills: inherited.skills.total,
      preferences: inherited.preferences.total,
      headStarts: inherited.headStarts,
    },
  });
  observer.recorder.eventLog.record({
    tick,
    topic: 'civilization.generation.founded',
    payload: {
      generation: nextGeneration, previousGeneration, population: founded.length,
      templateId, heritageGraphId, retired: retired.length,
      inheritance: {
        enabled: inheritance.enabled,
        relics: inheritance.relics,
        discoveries: inheritance.discoveries,
        garbled: inheritance.garbled,
        skills: inherited.skills.total,
        preferences: inherited.preferences.total,
        headStarts: inherited.headStarts,
      },
    },
  });

  return {
    previousGeneration,
    generation: nextGeneration,
    retired,
    founded,
    templateId,
    heritageGraphId,
    reassignedResearch: reassigned,
    inheritance: {
      enabled: inheritance.enabled,
      relics: inheritance.relics,
      discoveries: inheritance.discoveries,
      garbled: inheritance.garbled,
      skills: inherited.skills,
      preferences: inherited.preferences,
      headStarts: inherited.headStarts,
    },
  };
}

/**
 * t14：本 tick 的遗产考古——有界地解读遗物，并结算技能失传。
 *
 * 为什么"有界"：解读如果每 tick 每人一次，遗物会在几 tick 内被一扫而空，
 * "发现"就不再是稀缺事件，考古也就退化成"开局发奖"。
 *
 * 为什么只让识字者做：读不懂物证的人拿到它也没用——这条限制让"继承"与
 * "识字/教育"这两个系统真正耦合起来，而不是各自独立地发奖励。
 *
 * @param {number} tick
 * @param {object} cfg
 * @returns {{ discoveries: number, garbled: number, lost: Array<object> }}
 */
function runLegacyDiscovery(tick, cfg) {
  const perTick = Number.isInteger(cfg.legacyDiscoveryPerTick) && cfg.legacyDiscoveryPerTick > 0
    ? cfg.legacyDiscoveryPerTick : 1;
  const inherit = civilization.legacy.inherit;
  const und = civilization.relic.artifact.query({ discovered: false });
  let discoveries = 0;
  let garbled = 0;
  if (und.length > 0) {
    // 按完整度降序：先捡看得懂的。确定性排序，不消耗全局 rng。
    const ordered = und.slice().sort((a, b) => (b.integrity - a.integrity) || a.relicId.localeCompare(b.relicId));
    const readers = registry.lookup({ type: 'agent' })
      .map((r) => r.id)
      .filter((id) => isLiterate(id, cfg));
    for (let i = 0; i < perTick && i < ordered.length && readers.length > 0; i += 1) {
      const relic = ordered[i];
      // 谁去读：按 tick 轮转，避免永远是同一个人包揽全部遗物。
      const reader = readers[(tick + i) % readers.length];
      const res = civilization.relic.discover.discover({
        agentId: reader, relicId: relic.relicId, tick, literacy: 0.85,
      });
      if (res.ok !== true) continue;
      discoveries += 1;
      if (res.discovery.fidelity === 'garbled') garbled += 1;
      inherit.applier.apply({ discovery: res.discovery, tick });
    }
  }
  // 技能失传（"可丢失"）：掌握者全部死亡后技能消失。每 20 tick 结算一次，
  // 避免每 tick 全量扫描技能表（长跑性能）。
  let lost = [];
  if (tick % 20 === 0) {
    const living = registry.lookup({ type: 'agent' }).map((r) => r.id);
    lost = inherit.skill.detectLoss({ living, tick }).lost;
    inherit.preference.detectLoss({ living, tick });
  }
  return { discoveries, garbled, lost };
}

/** 当前世代信息（供观测与验收：第几代、上一代何时被封存、封存了谁）。 */
export function generationStatus() {
  return Object.freeze({
    generation: generationCount,
    sealed: sealedGenerations.map((s) => ({ generation: s.generation, tick: s.tick, members: [...s.members] })),
  });
}

/**
 * t14：遗产与知识继承的**观测面**（供 observer/api 与验收使用）。
 *
 * - 不传 agentId：整条链的规模（遗物/解读/技能/偏好/研究前提）与来源校验结果。
 * - 传 agentId：该居民的来源链逐环展开，并附带**继承技能是否让他识字**——
 *   这是"遗产变成技能"最直接的可观测后果（读写技能优先于人口比例判定）。
 *
 * 之所以要有这个出口：链路的每一环都落在 graph store 里，验收方不该为了
 * 检查"下一代到底继承了什么"而自己去拼四个 store 的查询。
 *
 * @param {{ agentId?: string, config?: object }} [input]
 * @returns {object}
 */
export function legacyStatus(input = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...(input.config ?? {}) };
  const inherit = civilization.legacy.inherit;
  const summary = inherit.trace.summary();
  const base = {
    enabled: cfg.legacyInheritance !== false,
    discoveryPerTick: Number.isInteger(cfg.legacyDiscoveryPerTick) ? cfg.legacyDiscoveryPerTick : 1,
    relics: summary.relics,
    discoveries: summary.discoveries,
    skills: summary.skills,
    preferences: summary.preferences,
    headStarts: summary.headStarts,
    provenance: inherit.trace.verify({}),
  };
  if (typeof input.agentId === 'string' && input.agentId !== '') {
    return {
      ...base,
      agentId: input.agentId,
      trace: inherit.trace.of(input.agentId),
      literate: isLiterate(input.agentId, cfg),
      researchDiscount: inherit.applier.researchDiscount(input.agentId),
    };
  }
  return base;
}

/** 复位代际状态（跨 run 不留残）。 */
function resetGenerations() {
  generationCount = 1;
  sealedGenerations = [];
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

/**
 * 日程可行性判定所需的居民状态视图。
 * 复用执行器侧的 candidateStateFor（同一份状态来源），再补上日程关心的字段，
 * 使「日程建议可行」与「执行器接受」判定一致。
 */
function scheduleStateFor(agentId, tick) {
  try {
    const st = stage2.candidateStateFor(agentId, tick) ?? {};
    return {
      ...st,
      literate: true,
      hasWorkbenchMaterial: true,
      hasBuildingMaterial: true,
      hasSurplus: true,
    };
  } catch {
    // 状态不可得时**不阻断日程**：返回一个宽松视图，让执行器的真实拒绝兜底，
    // 而不是凭缺失的数据判定"不可行"。
    return { employed: true, businessActive: true, hasPeer: true, expeditionViable: true, literate: true };
  }
}

/** 批次2-C（t48）：日程驱动的行动覆盖（紧急时触发重排）。 */
function scheduleOverride(decision, agentId, tick, cfg) {
  const need = decision?.context?.dominantNeed;
  const level = (decision?.context?.pressures ?? []).find((pp) => pp.need === need)?.level ?? 0;
  // P2 修正：emergency 必须用**危机**阈值，而不是「该吃饭了」的 eatThreshold(0.4)。
  // 用 0.4 时，80 人局的需求长期落在 0.4~0.5，于是居民**几乎永远处于"紧急"**，
  // 日程的 4 行动词汇表整体接管决策（实测 t100+ 被日程覆盖 3456 次 vs 居民自选 629 次，
  // craft 因此从 50 人局的 351 次塌到 6 次）。轻微饥饿不该剥夺居民的决定权。
  const crisisLevel = clampUnit(cfg.crisisNeedLevel ?? 0.8, 0.4);
  const emergency = (need === 'food' || need === 'water') && level >= crisisLevel;
  const scheduled = agent.schedule.executor.tick(agentId, { tick, interrupted: emergency, trigger: emergency ? 'emergency' : 'interrupt' });
  if (!scheduled || !scheduled.action) return null;
  // t11：日程建议的行动必须**真的可行**——与执行器同一套前置条件。
  // 日程词汇表来自 motivation.rank（eat/drink/forage/rest + work），
  // 其中 work 要求「受雇且雇主企业活跃」；未被雇用的居民若被日程指派 work，
  // 执行器会以 not_employed 拒绝，居民当 tick 就白白空转。
  // 因此这里先过契约前置条件；不可行的建议**降级为理由**而不是命令。
  const admission = agent.decision.contract.preconditionOf(scheduled.action, scheduleStateFor(agentId, tick));
  if (admission.ok !== true) {
    const own0 = decision?.action;
    return {
      action: own0 ?? 'rest',
      reason: '日程建议「' + scheduled.action + '」不可行（' + admission.reason + '），改由居民自选',
      replanned: scheduled.replanned,
      trigger: 'schedule_infeasible',
      meta: {
        action: own0 ?? 'rest',
        block: scheduled.block?.reason ?? null,
        suggested: scheduled.action,
        replanned: scheduled.replanned,
        feasible: false,
        infeasibleReason: admission.reason,
      },
    };
  }
  // D0：日程**建议**行动，但不得剥夺居民自己可执行的「非生存选择」。
  // 仅当（a）处于紧急需求，或（b）居民选的是生存骨架行动时，日程才结果性覆盖；
  // 否则日程仅作为理由记录，行动仍取居民的决定（否则日程会退回成"代码替居民决定"）。
  const own = decision?.action;
  // P2 修正：非紧急时**任何**居民自选行动都优先于日程。
  // 旧实现只在「居民选了非生存行动」时让它赢，一旦居民选 eat/drink/forage/rest 就掉进
  // 下面的兜底分支被日程接管——等价于「你选了正常的生存行动，反而失去了决定权」。
  // 后果：居民从来没有真正执行过自己的休息/进食选择，行为维度被日程词汇表整体接管。
  // 日程的定位是**建议与理由**（记入 reason/meta），不是决定者。
  if (!emergency) {
    return {
      action: own ?? scheduled.action,
      reason: own !== undefined
        ? '居民自选「' + own + '」（日程建议：' + scheduled.action + '）'
        : '日程块「' + (scheduled.block?.reason ?? scheduled.action) + '」',
      replanned: scheduled.replanned,
      trigger: own !== undefined ? 'agent_choice' : 'schedule',
      meta: { action: own ?? scheduled.action, block: scheduled.block?.reason ?? null, suggested: scheduled.action, replanned: scheduled.replanned },
    };
  }
  // P1 修正：紧急时日程也不得夺走**采集**。drought/blight/storm 等环境事件会把居民
  // 推进 emergency，日程的 4 行动词汇表随即整体接管——此时在 scoreAction 里加多少权重
  // 都无效（分数算完就被丢弃），居民会在库存归零后一路空转 eat 至死
  // （实测 seed42/seed2 + phase2：forage 仅 73/69 次而 eat 1077/1149 次，全员死亡）。
  // forage 是唯一同时补食物与水源的行动，紧急覆盖必须保留它。
  // 但仅保留**与紧急需求匹配**的行动：food 紧急时 own=drink 本身是错误选择
  // （water_need 可能为 0），若也一并尊重，居民会饿着肚子一路喝水到死
  // （实测 seed1：food_need=1.000、食物库存 100、t88-t95 连续 8 tick 选 drink，
  //   期间 food 需求降幅为 0，至 t95-t101 集中饿死 10 人）。
  // P2 修正：forage 只在**采集池确有可采量**时才算满足紧急需求。
  // 原实现无条件放行 own==='forage'，于是采集池被抽干后（take=0、零产出），
  // 紧急中的居民仍被允许一路采集，需求升到 1.0 也无人进食/饮水——
  // 实测 seed42+50人+200tick 在 t18~25 死亡 11 人，死因 dehydration/starvation
  // 而当时水库存为 99（典型的「守着满仓水渴死」）。
  const forageHasYield = (foragePool ?? 0) > 0;
  const ownMatchesEmergency = (need === 'food' && own === 'eat')
    || (need === 'water' && own === 'drink')
    || (own === 'forage' && forageHasYield);
  if (emergency && scheduled.action !== 'forage' && ownMatchesEmergency) {
    return {
      action: own,
      reason: '紧急中居民自选「' + own + '」（日程建议：' + scheduled.action + '）',
      replanned: scheduled.replanned,
      trigger: 'agent_choice_emergency',
      meta: { action: own, block: scheduled.block?.reason ?? null, suggested: scheduled.action, replanned: scheduled.replanned },
    };
  }
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
  const families = social.family.registry.list();
  const members = families.reduce((n, f) => n + f.members.length, 0);
  return {
    schedule: agent.schedule.planner.summary(),
    goals: agent.decision.goals.summary(),
    careers: agent.role.career.summary(),
    society: agent.role.society.activeEffects(),
    family: { families: families.length, members, size: families.length > 0 ? Math.max(...families.map((f) => f.members.length)) : 0 },
    graph: { edges: social.graph.edges.list().length, communities: social.graph.community.detect({ threshold: 0.5 }).count },
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
  return registerAgent({
    id, name, persona, food, water, candidates, age,
    generation: input?.generation, parents: input?.parents,
  });
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
  // P2：采集奖励必须绑定**实际可采量**。原实现给 forage 固定 +1.2+scarcity（生存门内再 +3），
  // 完全不看采集池余量；而池每 tick 只再生 15.8、每次取 2 → 仅够 7.9 次采集，52 人却全被
  // 奖励去采。池被瞬间抽干后 take=0（收益为零），但奖励仍在 → 全员持续选择 forage 做
  // **零收益空转**，霸占决策带宽，craft/social/write 因此永久归零（实测 t100 后 forage 2686
  // 次而 craft/socialize 各 1 次，且库存充裕、零死亡——证明与资源压力无关）。
  // 现在按池余量缩放：池空时奖励为 0，"采不到就别去采"。
  const poolFactor = ctx.forageAvailable === undefined ? 1 : clampUnit(ctx.forageAvailable, 0);
  let score = typeof candidate?.score === 'number' && Number.isFinite(candidate.score) ? candidate.score : 0;
  const need = ctx.dominantNeed;
  const level = typeof ctx.dominantLevel === 'number' ? ctx.dominantLevel : 0;
  const scarcity = typeof ctx.dominantScarcity === 'number' ? ctx.dominantScarcity : 0;
  const threshold = clampUnit(ctx.eatThreshold, 0.4);
  const hungry = need === 'food' && level >= threshold;
  const thirsty = need === 'water' && level >= threshold;
  if (candidate?.action === 'eat' && hungry) score += 2;
  if (candidate?.action === 'drink' && thirsty) score += 2;
  // 采集与进食的分工：**有货先吃，无货才采**。
  // 演化过程（两次都错，记录以免重犯）：
  //  a) 原式 `!hungry && !thirsty` 才给采集加成 → 语义倒挂：越饿越不采，
  //     只剩基础分 0.2，居民改选 eat（+2）却无货可扣，形成空转死循环；
  //  b) 去掉条件并对饥饿额外 +1.5 → 过度矫正：口渴时也去采集而非喝水，
  //     实测 step 测试期望 drink 却得到 forage（236/237 失败）。
  // 正确语义：库存还有货时，eat/drink 应该赢（先解决当下）；
  // 库存见底时，forage 才该赢（否则 eat/drink 是空操作）。
  // 采集与交易的**分工**：能买就不必自己去采。
  // 实测教训：习惯偏置上线后 trade 从 2.1% 涨到 4.6%，forage 从 18.9% 掉到 15.2% ——
  // 居民开始把市场当饭吃。但市场卖的是**生产者的商品**，不是可采集的原料，
  // 而且穷人买不起。因此交易得分按支付能力封顶，让「买得起」成为前提。
  if (candidate?.action === 'trade') {
    const bal = typeof ctx.balance === 'number' ? ctx.balance : 0;
    const price = typeof ctx.goodsPrice === 'number' && ctx.goodsPrice > 0 ? ctx.goodsPrice : 8;
    score *= clampUnit(bal / (price * 4), 0);
  }
  if (candidate?.action === 'forage') {
    score += (1.2 + scarcity) * poolFactor;
    // 只有**库存见底**时才让采集压过进食——此时进食已是空操作。
    const stockEmpty = ctx.foodEmpty === true || ctx.waterEmpty === true;
    if (stockEmpty) score += 1.8 * poolFactor;
  }
  if (candidate?.action === 'rest' && !hungry && !thirsty) score += 0.5;
  // 上工的收益是**工资**，而工资买不到食物——食物只能靠采集获得。
  // 实测教训：招募机制上线后 work 从 19 次涨到 178 次，同一批人不再去采集，
  // forage 从 380 次崩到 47 次，t45 全镇 35 人饿死（基线 50 人全活）。
  // 因此把「上工」的吸引力绑定到**食水是否充裕**：自家库里有粮，才值得去挣工资。
  // 这不是禁止上工（居民仍可自选），而是让优先级的排序符合生存直觉。
  if (candidate?.action === 'work') {
    // 参照量取**设计储备水平**（initialReservePerCapita），不再写死 2.5。
    // 写死的后果：人口一涨，人均库存被容量天花板压低，这个闸门就把一座
    // 零死亡的正常小镇判成「余粮不足」，work 从 24.7% 掉到 0.8% 几近灭绝。
    const ref = typeof ctx.reserveRefPerCapita === 'number' && ctx.reserveRefPerCapita > 0
      ? ctx.reserveRefPerCapita : 2.5;
    const stockOk = clampUnit(ctx.perCapitaStock === undefined ? 1 : ctx.perCapitaStock / ref, 0);
    // 库存充裕 → 保留全额；库存告急 → 大幅降权，让 forage/eat 胜出。
    score = score * stockOk - (1 - stockOk) * 3;
  }
  // 探索：**风险调整后的期望值**，而不是单看收益。
  // 实测教训（P3 第一次接入）：初版给 loot*0.18（最多 +1.2）+ 稀缺加成 1.5，
  // 叠加基础分 0.75 后达 ~3.4，远超 craft 的 0.9 → 探索 442 次而 craft 由 478 掉到 300、
  // write 掉到 181、social 掉到 157，还引入 5 例死亡。这是"新行动挤占既有行为"的第 8 次苗头。
  //
  // 现在按期望净收益打分：离家越久、风险越高，代价越大；
  // 只有当"预期收获 - 风险代价"为正时才可能胜过日常劳动。
  // 设定上探索就该是**偶发**行为——居民不该天天往废墟跑。
  // 创办企业（D2）：必须有**真实的经济动机**，否则它永远赢不过 eat/drink。
  // 实测：只给基准分 0.6 时 found 一次都没被选中，businesses 恒为 0，
  // 整个产业闭环（goodsProduced / wages / businessRevenue）全为 0。
  // 动机 = 预期利润：本地商品售价越高、自己越缺钱、且没有在职工作，越值得盘铺子。
  // 这与 expedition 同一思路——按**期望净收益**打分，而不是给固定加成。
  if (candidate?.action === 'found') {
    if (ctx.canFound !== true || ctx.marketRoom === false) { score -= 10; }
    else {
      const goodsPrice = typeof ctx.goodsPrice === 'number' ? ctx.goodsPrice : 8;
      const wage = typeof ctx.wage === 'number' ? ctx.wage : 3;
      const startCapital = typeof ctx.foundCapital === 'number' ? ctx.foundCapital : 60;
      const balance = typeof ctx.balance === 'number' ? ctx.balance : 0;
      // 开铺子的直接收益：不必再给人打工，自己拿全部产出；
      // 用商品售价与工资的差额作为「做老板 vs 打工」的收益差。
      const ownerPremium = Math.max(0, goodsPrice - wage) * 0.25;
      // 机会成本：本金占其资产的比例越高越犹豫（不愿把全部积蓄押上）。
      const commitment = balance > 0 ? startCapital / balance : 1;
      const reluctance = clampUnit(commitment, 0) * 1.2;
      // 只有在**没有在职**时创办才划算（有工作就先干活）。
      const employedPenalty = ctx.employed === true ? 1.5 : 0;
      // **创办不能与生存竞争**：这是「新行动挤占既有行为」的第 9 次复发。
      // 实测 seed2：开局第一 tick 就有 48 次 found（50 人几乎全部创业），
      // 本金被集体抽走，t11 食物已见底、t41 归零，随后 forage 全程为 0，
      // 全镇饿死——而基线 forage 380 次、50 人全活。
      // 根因：ownerPremium(1.0) 远高于 forage 的基础分(0.2)，而此处不看库存。
      // 因此用与 work 相同的**生存优先闸**：只有自家食水充裕才谈创业。
      const ref = typeof ctx.reserveRefPerCapita === 'number' && ctx.reserveRefPerCapita > 0
        ? ctx.reserveRefPerCapita : 2.5;
      const stockOk = clampUnit((ctx.perCapitaStock === undefined ? 1 : ctx.perCapitaStock) / ref, 0);
      score += (ownerPremium - reluctance - employedPenalty) * stockOk;
      // 库存告急时明确压到生存行动之下（不是禁止，是排序）。
      if (stockOk < 0.5) score -= 2;
      // 市场空位越多越值得开：这是「机会」的直接度量。
      // 实测：仅靠 ownerPremium 时 found 在与 craft/build/work/trade/socialize/court
      // 争 6 个席位时因基础分最低（0.6）永远垫底，biz 恒为 0、涌现消失。
      // 让空位成为真实收益项：空位多说明需求未满足，开铺子真能赚到钱。
      const slots = typeof ctx.marketSlots === 'number' ? ctx.marketSlots : 1;
      const active = typeof ctx.activeBusinesses === 'number' ? ctx.activeBusinesses : 0;
      const roomRatio = clampUnit((slots - active) / Math.max(1, slots), 0);
      score += roomRatio * 1.2;
    }
  }
  if (candidate?.action === 'expedition') {
    const loot = typeof ctx.expeditionLoot === 'number' ? ctx.expeditionLoot : 0;
    const risk = clampUnit(ctx.expeditionRisk, 0);
    const hours = typeof ctx.expeditionHours === 'number' ? ctx.expeditionHours : 6;
    // 期望收获（按 1 项≈0.35 分计价）
    const expectedGain = loot * 0.35;
    // 风险代价：重伤/失联的实际代价远高于拾获收益
    const riskCost = risk * 2.2 + (hours / 6) * 0.15;
    // 本地补给越缺，外出的相对价值越高（废墟里有本地造不出的东西）
    const scarcityPull = scarcity * 0.8;
    const net = expectedGain - riskCost + scarcityPull;
    // 只有净收益为正才加分——负期望的探索必须显著劣于日常劳动，而不是靠基础分上榜。
    if (!hungry && !thirsty && net > 0) score += net;
    // 净收益为负时明确降权，避免它靠基础分 0.75 与性格加成蒙混入选。
    if (net <= 0) score -= 0.6 + Math.abs(net) * 0.5;
  }
  // P1 生存门（最终打分侧）：修剪器侧的门只能把候选**挤出窗口**；窗口一放宽，
  // 非生存行动仍会被性格/行动模拟的加成推上首位（实测 pruneK=6 整镇饿死）。
  // 因此门必须在**最终决定分数**上再施加一次，生存优先才成立。
  if (ctx.survivalGate === true) {
    if (NON_SURVIVAL_ACTIONS.includes(candidate?.action)) score -= 5;
    if (candidate?.action === 'rest') score -= 1;
    // 采集优先**仅限尚未挨饿时**：若已饿/渴，eat/drink 的 +2 必须压过采集。
    // 否则会出现「守着满仓粮饿死」——实测 seed7 全员在 food=92 时需求饱和并死亡。
    if (candidate?.action === 'forage' && !hungry && !thirsty) score += 3 * poolFactor;
    // 但库存真正见底时必须反转：此时 eat/drink 是**空操作**（consume 无货可扣，
    // 需求也不会下降），只有 forage 能补货。若仍让 eat 胜出，居民会从库存归零
    // 一路空转至死（实测 seed42+phase2：t13 起连续 19 tick 选 eat、forage 从未出现，
    // 至 t32 全员死亡）。判据必须用「对应库存是否为 0」这一直接事实。
    if (candidate?.action === 'forage' && (ctx.foodEmpty === true || ctx.waterEmpty === true)) score += 6 * poolFactor;
    // 空操作的进食/饮水必须明确降权，否则它们仍靠 +2 与基础分占优。
    if (candidate?.action === 'eat' && ctx.foodEmpty === true) score -= 8;
    if (candidate?.action === 'drink' && ctx.waterEmpty === true) score -= 8;
  }
  return score;
}

/**
 * 把候选池重置为「生存骨架 + 当前状态可达的动态行动」（D0：行动空间地基）。
 *
 * @param {object|null} [poolView] 本 tick 的共享池争用视图（见 decision.contention）。
 *   传入后，交易这类**受共享额度限制**的行动按「前面居民已卖掉的额度」判定可行性，
 *   而不是所有人都看到 tick 起始的满额供应池。
 */
/**
 * 目标引擎所需的**真实**居民状态：候选前置条件字段 + 原料/成品实计数 + 需求。
 *
 * 与 t11 的候选状态同源（candidateStateFor），只补上计划完成判据需要的两个计数：
 *   · wood    —— 制作原料数量（craft 消耗它，因此它是「采料」步骤的完成判据）
 *   · surplus —— 可售产出品数量（craft 产出它，因此它是「制作/出售」步骤的完成判据）
 * 计数直接读背包**实况**，不读缓存：完成判据必须反映"东西是否真的到手了"，
 * 否则计划会基于过期状态自以为完成。
 */
function goalStateOf(agentId, tick) {
  const base = stage2.candidateStateFor(agentId, tick) ?? {};
  let wood = 0;
  let surplus = 0;
  try {
    const woodId = stage2.craftMaterialId();
    const items = agent.inventory.backpack.list({ agentId }).items ?? {};
    for (const [id, n] of Object.entries(items)) {
      if (!Number.isFinite(n) || n <= 0) continue;
      if (id === woodId) wood += n; else surplus += n;
    }
  } catch { /* 背包不可用时按 0 处理：保守，不假装手里有料 */ }
  let needs = {};
  try { needs = survival.needs.meter.query({ agentId }).needs ?? {}; } catch { needs = {}; }
  // 这三个门是**派生量**，refreshCandidates 与执行器都用它们判定可行性。
  // 必须在这里按同一口径补齐：candidateStateFor 不返回它们，
  // 缺了就会让契约的前置条件在 undefined 上判假——实测表现为
  // craft 被误判「材料不足」而永远不可执行、trade 被误判「无可售余量」。
  return {
    ...base,
    wood,
    surplus,
    needs,
    hasWorkbenchMaterial: wood >= 2,
    hasBuildingMaterial: wood >= 3,
    hasSurplus: surplus > 2,
  };
}

/**
 * 可售余量：背包里**除制作原料（木头）外**的产出品数量。
 * 与执行器 trade 分支的口径一致——交易的对象是劳动成果，不是生产资料
 * （木头被 craft 耗 2 / build 耗 3 持续争夺，用它作可售量会让 trade 永久不可达）。
 */
function surplusItemsOf(agentId) {
  const woodId = stage2.craftMaterialId();
  let surplus = 0;
  try {
    const items = agent.inventory.backpack.list({ agentId }).items ?? {};
    for (const [id, n] of Object.entries(items)) {
      if (!Number.isFinite(n) || n <= 0) continue;
      if (id !== woodId) surplus += n;
    }
  } catch { surplus = 0; }
  return surplus;
}

/** 交易售价（可售余量 × 单价）。共享额度的计价口径与执行器一致。 */
function tradeValueOf(surplusItems, cfg) {
  const price = (typeof cfg.rawPrice === 'number' && cfg.rawPrice > 0) ? cfg.rawPrice : 1;
  return Math.max(0, surplusItems) * price;
}

/**
 * 供应池是否足以支付本次卖出。
 * 池况未知（无账本且执行器未给出余额）时返回 true——**显式未知不阻断**，
 * 由执行器的 pool_insufficient 兜底，而不是在候选侧假装"没钱"。
 */
function supplyPoolCoversSurplusOf(state, surplusItems, cfg, poolView) {
  const POOL = agent.decision.contract.POOLS.SUPPLY_MONEY;
  const fromLedger = (poolView !== null && poolView !== undefined) ? poolView[POOL] : undefined;
  const left = (typeof fromLedger === 'number' && Number.isFinite(fromLedger))
    ? fromLedger : state.supplyPoolBalance;
  if (typeof left !== 'number' || !Number.isFinite(left)) return true;
  return left >= tradeValueOf(surplusItems, cfg);
}

/**
 * 按契约的争用声明**预支**共享池额度。
 *
 * 只影响后续居民的预想，**不改真实执行**：真实取用仍由执行器对真实池操作。
 * 决策顺序与 dispatch 顺序一致，因此第 i 个居民预想时看到的就是
 * 「前 i-1 人取走之后」的真实剩余量——预想与执行因此可对账。
 */
function reserveContention(action, surplusItems, cfg) {
  const c = agent.decision.contract.contractOf(action);
  if (c.known !== true) return 0;
  const pool = c.contention?.pool;
  if (typeof pool !== 'string' || pool === '') return 0;
  const ledger = agent.decision.contention;
  const P = agent.decision.contract.POOLS;
  if (c.contention.mode === 'shared-draw') {
    if (pool === P.FORAGE) {
      const y = (typeof cfg.forageYield === 'number' && Number.isFinite(cfg.forageYield)) ? cfg.forageYield : 2;
      return ledger.reserve(pool, y);
    }
    if (pool === P.FOOD) return ledger.reserve(pool, 1);
    if (pool === P.WATER) return ledger.reserve(pool, 1);
  }
  if (c.contention.mode === 'quota') {
    if (pool === P.MARKET_ROOM) return ledger.reserve(pool, 1);
    if (pool === P.SUPPLY_MONEY) return ledger.reserve(pool, tradeValueOf(surplusItems, cfg));
  }
  return 0;
}

/**
 * 本 tick 里**注定落空**的行动集合：契约声明了共享争用，而该池已被前面的居民预支空。
 *
 * 计划必须知道这件事，否则它会用固定加分去推一个当下注定空转的步骤
 * （t12 实测：不传这条时采集空转率由 3.8% 反弹到 20.8%）。
 * 池况**未知**（视图里没有该池）时不列入：未知不等于空。
 */
function doomedActionsFor(poolView) {
  const doomed = new Set();
  if (poolView === null || poolView === undefined) return doomed;
  for (const action of agent.decision.contract.knownActions()) {
    const c = agent.decision.contract.contentionOf(action);
    if (c === null || c === undefined) continue;
    if (c.mode !== 'shared-draw') continue;
    const left = poolView[c.pool];
    if (typeof left === 'number' && left <= 0) doomed.add(action);
  }
  return doomed;
}

/** 本 tick 的共享池容量（tick 起始真实池况），供争用账本开启。 */
function contentionCapacities() {
  const P = agent.decision.contract.POOLS;
  const caps = {};
  caps[P.FORAGE] = (foragePool ?? 0);
  caps[P.FOOD] = survival.resources.food.query().stockpile ?? 0;
  caps[P.WATER] = survival.resources.water.query().stockpile ?? 0;
  // 供应池余额由 stage2 提供（账户与产业数据在那里）。
  try {
    const st = stage2.candidateStateFor(settledProbeAgentId(), 0);
    if (typeof st?.supplyPoolBalance === 'number') caps[P.SUPPLY_MONEY] = st.supplyPoolBalance;
  } catch { /* 无账本数据时不登记该池：视图里缺失即「未知」，而不是 0 */ }
  return caps;
}

/** 取一个已存在居民 id 作为读取全局状态的探针（无居民时返回空串）。 */
function settledProbeAgentId() {
  const recs = registry.lookup({ type: 'agent' });
  return recs.length > 0 ? recs[0].id : '';
}

function refreshCandidates(agentId, tick, cfg, poolView = null) {
  // 行动空间关闭时保持既有行为（也不付候选重建成本）：存活骨架已在 spawnAgent 写定。
  if (cfg.actionSpaceEnabled === false) return null;
  const state = stage2.candidateStateFor(agentId, tick);
  let held = 0;
  const woodId = stage2.craftMaterialId();
  // 产出品余量（不含制作原料木头）：trade 的可售对象是劳动成果，不是生产资料。
  // 木头被 craft/build 持续消耗，用「木头>2」作判据会让 trade 永久不可达。
  const surplusItems = surplusItemsOf(agentId);
  try { held = agent.inventory.backpack.list({ agentId }).items?.[woodId] ?? 0; } catch { held = 0; }
  const planned = agent.decision.candidates.plan({
    actionSpaceEnabled: cfg.actionSpaceEnabled !== false,
    hasWorkbenchMaterial: held >= 2,
    hasBuildingMaterial: held >= 3,
    literate: isLiterate(agentId, cfg),
    employed: state.employed,
    businessActive: state.businessActive,
    hasSurplus: surplusItems > 2,
    hasPeer: state.hasPeer,
    // P1：择偶资格与待答复表白改为真实状态（此前恒为 false，导致 court 永不出现）。
    eligibleMate: state.eligibleMate === true,
    hasPendingCourt: state.hasPendingCourt === true,
    expeditionViable: state.expeditionViable === true,
    expeditionRisk: state.expeditionRisk,
    expeditionLoot: state.expeditionLoot,
    // 创办企业的准入（D2）：只看够不够本，由 candidateStateFor 给出。
    // 漏传这两个字段会让 found 规则恒为 null，候选从未生成——
    // 实测表现为 found 一次都没被选中、businesses 恒为 0，而评分侧的探针从不触发。
    canFound: state.canFound === true,
    foundCapital: state.foundCapital,
    // 市场空位同样是**候选准入**：没有空位时不应该把 found 摆到居民面前。
    // 漏传 marketRoom 会让容量约束形同虚设——实测 42 家企业挤在只容得下 1 家的
    // 市场里，破产 655 次、成本 42946 而收入仅 8686。
    marketRoom: state.marketRoom !== false,
    // ---- t11：与执行器同源的前置条件状态（action-contract 的 requires） ----
    // 配对状态：court/accept 都要求「尚未配对」。
    paired: state.paired === true,
    // ---- t13：双向互动的准入状态 ----
    // 这三个字段必须显式透传：candidates.plan 用一个**字面量对象**做状态视图，
    // 未列出的字段在执行器看来就是 undefined，于是 accept/reject/fulfill/violate
    // 的 requires 恒不满足、候选永远不出现（实测 80 tick 内 40 条待决互动、0 次回应）。
    // 这与上面 found 的 canFound/marketRoom 是同一类漏传缺陷——同一个坑不能再踩第二次。
    hasPendingInteraction: state.hasPendingInteraction === true,
    hasOpenPromise: state.hasOpenPromise === true,
    canFulfillPromise: state.canFulfillPromise === true,
    // 进行中任务：执行器会以 already_crafting / already_building / already_writing 拒绝。
    pendingCraft: state.pendingCraft === true,
    pendingBuild: state.pendingBuild === true,
    pendingWrite: state.pendingWrite === true,
    hasAccount: state.hasAccount === true,
    hasItemCatalog: state.hasItemCatalog === true,
    // 供应池余额：交易是「把全部余量一次卖出」，因此判据是「余额 ≥ 本次售价」。
    // 优先用本 tick 的争用账本（已扣除前面居民卖掉的额度），
    // 否则回落到 tick 起始的真实余额；池况未知时**不阻断**（显式未知，不假装没钱）。
    supplyPoolCoversSurplus: supplyPoolCoversSurplusOf(state, surplusItems, cfg, poolView),
  }, { attributeRandom: cfg.actionSpaceAttribution === true });

  // 整批替换（单次 graph.write）：逐候选 add() 会触发逐次 graph.read 深拷贝，
  // 实测把主循环从 4.4s 拖到 10.4s（structuredClone 占 73%）。
  agent.anticipation.pool.store.replace(
    agentId,
    planned.map((c) => ({ id: agentId + ':' + c.action, action: c.action, score: c.score })),
  );
  return planned;
}

/** 居民 id 的确定性 [0,1) 哈希（用于把社会层面的**比例**落到个人）。 */
function agentHash01(agentId) {
  let h = 2166136261 >>> 0;
  const s = String(agentId);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 8) / 16777216;
}

/**
 * 识字判定：**社会供给 × 个人分化**。
 *
 * 教师角色提供 literacyRate —— 但它是社会层面的**能力系数**（当前值 0.05，
 * 在 civilization.tech.research 里以 `literacyRate * 4` 作为连续加成使用），
 * 并不是人口比例。若直接拿它当比例，50 人里只有 2~3 人识字，
 * 实测三种子 200 tick 内 write 全部为 0 —— 「写书」这一行动实际灭绝。
 *
 * 因此拆成两层：
 *   1) 供给层：社会是否存在识字供给（教师在职）—— 沿用 literacyRate > 0 判定；
 *   2) 个人层：供给存在时，按 literacyShare 决定识字**人数**，再按 id 哈希排序
 *      挑出具体是谁。
 * 修正前是**全局布尔**：literacyRate > 0 即全体识字，于是「写书」要么人人可做、
 * 要么无人可做，个体差异被完全抹平。
 *
 * 个人层为什么用**名次**而不是逐个哈希阈值：小规模局里阈值法会全军覆没。
 * 实测 3 人 60 tick 与 4 人 15 tick 的冒烟局中，3 人皆落在 0.4 阈值之上
 * （概率 (0.6)^3 ≈ 22%），识字者为零 → 写书行动直接消失，两个冒烟测试失败。
 * 名次法保证「有识字供给时至少 1 人识字」，同时保留个体差异。
 */
let literateSet = null;

/** 每 tick 计算识字者集合：供给存在时取 ceil(share × N) 人（至少 1 人）。 */
function computeLiterateSet(agentIds, cfg = {}) {
  const eff = agent.role.society.activeEffects();
  const rate = Number(eff?.effects?.literacyRate ?? 0);
  if (!Number.isFinite(rate) || rate <= 0) { literateSet = new Set(); return literateSet; }
  const share = Number.isFinite(cfg.literacyShare) && cfg.literacyShare >= 0
    ? Math.min(1, cfg.literacyShare)
    : 0.4;
  if (share <= 0) { literateSet = new Set(); return literateSet; }
  const ids = Array.from(agentIds);
  if (share >= 1) { literateSet = new Set(ids); return literateSet; }
  const count = Math.max(1, Math.ceil(share * ids.length));
  const ranked = ids.slice().sort((a, b) => {
    const ha = agentHash01(a);
    const hb = agentHash01(b);
    if (ha !== hb) return ha - hb;
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  });
  literateSet = new Set(ranked.slice(0, count));
  return literateSet;
}

function isLiterate(agentId, cfg = {}) {
  // t14：**继承来的读写技能**优先于人口比例判定。
  // 祖先留下的笔记让后代真的会读——这是"遗产变成技能"最直接的体现，
  // 也解释了为什么重启后的识字供给不会归零。
  try {
    if (civilization.legacy.inherit.skill.has(agentId, 'reading')) return true;
  } catch { /* 技能表不可用时回落到人口比例判定 */ }
  if (literateSet !== null) return literateSet.has(agentId);
  const eff = agent.role.society.activeEffects();
  const rate = Number(eff?.effects?.literacyRate ?? 0);
  if (!Number.isFinite(rate) || rate <= 0) return false;
  const share = Number.isFinite(cfg.literacyShare) && cfg.literacyShare >= 0
    ? Math.min(1, cfg.literacyShare)
    : 0.4;
  if (share <= 0) return false;
  if (share >= 1) return true;
  return agentHash01(agentId) < share;
}

/** 社会层面是否已有识字供给（供需要整体判断的调用方使用）。 */
function societyEffectsHasLiteracy() {
  const eff = agent.role.society.activeEffects();
  return (eff?.effects?.literacyRate ?? 0) > 0;
}

/** 组装单个智能体的决策：感知 + 压力 + 预想 + 记忆 → 行动选择。 */
function decide(agentId, tick, percepts, cfg = {}, poolView = null) {
  refreshCandidates(agentId, tick, cfg, poolView);
  const pressure = survival.needs.pressure.scorer.score({ agentId });
  // limit 6 → 10：生存骨架固定占 4 席（由 selector/pruner 保送），
  // 另留 6 席给动态行动。
  // 实测：limit=6 时动态行动只剩 2 席，found/craft/build/work/trade 争不过来；
  // 而 found 又是企业涌现的唯一入口，被切掉就 biz=0。
  // 这不是放松生存保护——骨架名额已由豁免保证，加大 limit 只是扩大选择面。
  // limit 10 的分账：3 个刚需骨架（eat/drink/forage）+ 1 个 rest
  // + 4 个发展席位（found/socialize/court/accept）由 selector/pruner 保送，
  // 其余（craft/build/write/work/trade/expedition）争剩下的 2 席。
  // 实测教训：席位不足时 build 会被 craft 挤掉（60 tick 小局里 built=0，
  // action-log 无建造记录）。生产类行动应共享预算，故提到 12：
  // 骨架 4 + 发展 4 + 生产/交换 4，让 craft/build/work/trade 都有机会。
  const anticipations = agent.anticipation.pool.selector.shortlist(agentId, { limit: 12 });
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
  // D0 生存门：以「人均库存天数」判据。仅靠 pressure.scarcity 不够——它在采集池见底后
  // 才饱和，那时已不可恢复（实测 seed2 因早期制作耗尽水库存而整镇渴死）。
  const aliveNow = Math.max(1, alivePopulation());
  const foodStock = survival.resources.food.query().stockpile ?? 0;
  const waterStock = survival.resources.water.query().stockpile ?? 0;
  const perCapitaStock = Math.min(foodStock, waterStock) / aliveNow;
  const survivalGate = perCapitaStock < (cfg.survivalGatePerCapita ?? 1.5);
  // 库存见底标志：**不依赖主导需求**——食水同时归零时主导需求可能已切走，
  // 用派生量推断会导致门静默失效（实测 forage 仍被压到 74 次而 eat 1081 次）。
  const foodEmpty = foodStock <= 0;
  const waterEmpty = waterStock <= 0;
  const pruned = agent.anticipation.pool.pruner.prune(agentId, anticipations, {
    k: cfg.pruneK,
    dominantNeed: need,
    level: needLevel,
    threshold: cfg.eatThreshold,
    tags,
    scarcity: pressure.scarcity ?? {},
    survivalGate,
    foodEmpty,
    waterEmpty,
  });
  // P2：**软压制取代物理删除**。
  // 旧实现（P1）在受威胁时把非生存行动从候选窗口里**删掉**——这不是"居民在压力下选择
  // 生存"，而是"系统不允许居民选择别的"。实测后果：survivalGatePerCapita=3.0 在 50 人局
  // 永远不可达（人均库存稳定在 1.4~1.8），门恒为真 → craft/build/write/trade/socialize
  // 在 t30 后全部归零。用户明确指出这"太过死板"。
  // 现在：候选窗口保持完整，压力以**连续量**进入最终打分（见 scoreAction 的 pressureScore），
  // 惩罚有上限且可被人格/动机/预演翻盘——"饿着也要写作"因此成为可能。
  // P2 实测结论（重要，勿再重复尝试）：**这个收缩是承重的，不能用"连续软压制"取代。**
  // 试图改成「压力分软压制 + 仅在危机线(0.8)收缩」后实测：seed1 死 19 人、seed42 全灭 52 人。
  // 直接读数：seed42 的水库 t1→t5 由 200 掉到 6（消耗 ~39/tick），而采集再生仅 ~20.8/tick——
  // 需求远超供给。收缩窗口是唯一能逼出足够采集（t11-30 forage 217 vs 软压制版 29）的机制。
  // 因此保留 0.4 触发线；"不够宽松"的真正解法是**提高供给侧**（人均储备与人均采集再生，
  // 见 config 的 initialReservePerCapita / forageRegenPerCapita），而不是拆掉生存保护。
  const threatened = needLevel >= (cfg.eatThreshold ?? 0.4) || survivalGate === true;
  const window = threatened
    ? (pruned.some((a) => a.action === 'forage') ? pruned.filter((a) => SURVIVAL_ACTIONS.includes(a.action)) : pruned)
    : pruned;
  // 压力分（0..1）＝个体需求为主 + 公共库存为辅 + 语义紧迫度为补充。
  // 个体需求占大头：居民**自己饿了**才该被压；仓库空但自己不饿，不该被剥夺决定权
  // （旧配比让 stock 分量主导：居民 44/52 需求 <0.2 却被扣 1.6 分，超过 craft 的基础分）。
  const stockPressure = Math.max(0, Math.min(1, 1 - perCapitaStock / (cfg.survivalGatePerCapita ?? 1.5)));
  const emptyPressure = (foodEmpty || waterEmpty) ? 1 : 0;
  const semanticPressure = clampUnit(layaUrgencyFor(agentId), 0);
  const pressureScore = clampUnit(
    0.6 * needLevel + 0.25 * stockPressure + 0.15 * Math.max(emptyPressure, semanticPressure), 0);
  const resources = { food: survival.resources.food.query(), water: survival.resources.water.query() };
  const predicted = agent.anticipation.simulator.predict(agentId, window, {
    needs: needsNow,
    resources,
    noise: cfg.simNoise,
    seed: currentSeed,
    tick,
    // t11：共享池争用视图。池已空时，依赖该池的行动被预想为「注定落空」，
    // 因此居民不再基于过期池况做注定失败的决策（实测曾 33% 的采集空转）。
    // 未登记的池在视图里缺失 → 预想视为「未知」而非 0。
    poolRemaining: poolView ?? undefined,
  });
  const simBy = new Map();
  for (const p of predicted) simBy.set(p.candidate?.id, p.expectedUtility);

  // 语义记忆召回：按主导需求取相关过往摘要，注入决策上下文
  const semanticMemories = agent.memory.semantic.recall(agentId, {
    text: need === 'food' ? '食物 饥饿 进食' : need === 'water' ? '水源 缺水 饮水' : '采集 休息 资源',
    tags: [need ?? 'sustenance'],
  }, { limit: cfg.semanticLimit ?? 3 });

  // **习惯偏置（D1）**：把召回的记忆真正接进打分，而不只是记进日志。
  // 每条语义记忆的 tags 是 [所采取的行动, 当时的主导需求]（见本文件语义记忆写入处），
  // 因此「为当前这个需求，我过去反复选了哪个行动」可以从标签直接统计出来。
  // 这就是习惯：经历过之后，同样的处境会略微偏向自己惯用的应对方式。
  // 偏置**有界且只抬正分**（见下方 scoreFn），因此不会颠倒量级差异
  // —— 0.3 的生存行动即使 +25% 也仍低于 0.9 的生产行动，
  // 这条约束是刻意的：记忆应塑造「怎么做」，不应否决「必须做」。
  const habitCounts = new Map();
  let habitTotal = 0;
  {
    const actionNames = new Set(agent.decision.candidates.actions());
    for (const m of semanticMemories) {
      for (const tag of (m.tags ?? [])) {
        if (!actionNames.has(tag)) continue;
        habitCounts.set(tag, (habitCounts.get(tag) ?? 0) + 1);
        habitTotal += 1;
      }
    }
  }

  // P2：采集可及性（0..1）＝池余量 / 池容量。池空时采集奖励归零，避免"采不到还去采"的空转。
  const poolCap = Math.max(1, foragePoolCapacityOf(cfg));
  const forageAvailable = Math.max(0, Math.min(1, (foragePool ?? 0) / poolCap));

  // 探索条件（供打分使用）。refreshCandidates 已按同一 tick 缓存过，这里零成本。
  const agentState = stage2.candidateStateFor(agentId, tick);
  // t12：短期目标与多步计划。目标按 agentId **跨 tick 持久保存**（含中断挂起），
  // 由实测后果推进（见 dispatch 的 observe），此处只取本 tick 的建议步骤。
  // 目标是**建议**：只给有界加分（goalWeight），从不覆盖居民的决定，生存门永远优先。
  const goalPlan = agent.decision.goals.plan(
    agentId, tick, goalStateOf(agentId, tick), cfg, agent.decision.contract, doomedActionsFor(poolView));
  for (const tr of goalPlan.transitions) {
    observer.recorder.eventLog.record({ tick, topic: 'agent.goal.' + tr.type, agentId, payload: tr });
  }
  const goalSuggestion = goalPlan.suggestion;
  const goalBonusFor = (action) => {
    if (goalSuggestion === null || action !== goalSuggestion.action) return 0;
    // 写作是识字居民的独立创造机会；目标链可以跨 tick 延续，不能用完整
    // goalWeight 长期压住 write，导致 phase2 在稳定小镇里没有著作产出。
    if (candidates.some((c) => c.action === 'write')) {
      return Math.min(goalSuggestion.weight, 0.1);
    }
    return goalSuggestion.weight;
  };
  // 商品售价：全系统最热的位置（50 人 × 200 tick × 每个候选行动），
  // 只在这里取一次，供打分函数与习惯偏置共用（原本每个候选行动查一次）。
  const goodsPriceNow = (() => {
    try { return economy.market.price.query('goods').price; } catch { return 8; }
  })();
  const origScore = new Map(anticipations.map((a) => [a.id, a.score]));
  const candidates = window.map((a) => ({ id: a.id, action: a.action, score: origScore.get(a.id) ?? 0 }));

  // D03：有界状态-行动-结果估计。读取该（需求状态 × 行动）的历史结果，
  // 以**有界偏置**参与打分——失败降低预期、成功提高预期、证据过期自动失效。
  // 权重刻意小于生存/人格项，因此它塑造偏好而不能颠倒量级差异。
  const outcomeLearningOn = cfg.outcomeLearningEnabled !== false;
  const outcomeWeight = outcomeLearningOn
    ? (typeof cfg.outcomeLearningWeight === 'number' && Number.isFinite(cfg.outcomeLearningWeight)
      ? cfg.outcomeLearningWeight : 0.3)
    : 0;
  const outcomeHalfLife = Number.isInteger(cfg.outcomeEvidenceHalfLife) && cfg.outcomeEvidenceHalfLife > 0
    ? cfg.outcomeEvidenceHalfLife : 200;
  const outcomeBiasFor = (action) => {
    if (outcomeWeight <= 0 || (cfg.phase3 !== true && SURVIVAL_ACTIONS.includes(action))) return 0;
    return agent.decision.outcomeModel.bias({
      agentId, action, need, tick, weight: outcomeWeight, halfLife: outcomeHalfLife,
    });
  };

  // t14：继承偏好的读取器。异常时返回 0（偏好缺失不该让决策崩溃）。
  const preferenceBiasFor = (action) => {
    if (cfg.legacyInheritance === false) return 0;
    try {
      return civilization.legacy.inherit.preference.biasFor({ agentId, action });
    } catch { return 0; }
  };

  const choice = agent.decision.selector.choose({
    candidates,
    context: { dominantNeed: need },
    scoreFn: (candidate) => {
      let base = scoreAction(candidate, {
        dominantNeed: need,
        dominantLevel: needLevel,
        dominantScarcity: needScarcity,
        eatThreshold: cfg.eatThreshold,
        survivalGate,
        foodEmpty,
        waterEmpty,
        perCapitaStock,
        reserveRefPerCapita: cfg.initialReservePerCapita,
        forageAvailable,
        expeditionRisk: agentState.expeditionRisk,
        expeditionLoot: agentState.expeditionLoot,
        expeditionHours: agentState.expeditionHours,
        // 创办企业的经济动机（D2）：是否够本、手头余额、商品售价与工资。
        // 这些都是**事实**，动机的权衡在 scoreAction 里做——不在候选生成侧替居民决定。
        canFound: agentState.canFound,
        foundCapital: agentState.foundCapital,
        marketRoom: agentState.marketRoom,
        marketSlots: agentState.marketSlots,
        activeBusinesses: agentState.activeBusinesses,
        balance: agentState.balance,
        employed: agentState.employed,
        goodsPrice: goodsPriceNow,
        wage: cfg.wage,
      }) + agent.persona.personality.evaluate(agentId, candidate.action)
        + (simBy.get(candidate.id) ?? 0);
      // 习惯偏置：只抬正分（负分代表「此刻不该做」，不该被习惯翻案）。
      // 习惯本身也要**买得起才成立**：手头没钱时，再习惯交易也只能放弃。
      // 温饱（eat/drink）不受此限制 —— 生存不能因为钱包空了就被否决。
      if (habitTotal > 0 && base > 0) {
        const ratio = (habitCounts.get(candidate.action) ?? 0) / habitTotal;
        if (ratio > 0) {
          let gain = 0.25 * ratio;
          if (candidate.action === 'trade') {
            gain *= clampUnit((typeof agentState.balance === 'number' ? agentState.balance : 0) / goodsPriceNow, 0);
          }
          base *= 1 + gain;
        }
      }
      // D03：结果学习的**有界**偏置（|bias| ≤ weight）。放在最后相加，
      // 因此它只能微调排序，无法把负分的生存行动顶成正分。
      // t12：计划倾向的**有界**加分。与结果学习同量级，远小于生存门的 5，
      // 因此"计划中的那一步"更容易被选中，但绝不可能把饥饿的居民留在工作台前。
      // t14：**继承来的行动偏好**同样是有界偏置（|bias| ≤ 0.4，上限在 preference 模块强制）。
      // 它必须与生存门差一个量级：祖先留下的"多去采集"能让后代更爱采集，
      // 但绝不能让一个饥饿的人不去吃饭。
      return base + outcomeBiasFor(candidate.action) + goalBonusFor(candidate.action)
        + preferenceBiasFor(candidate.action);
    },
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

  // D01：规则选择阶段的结果单独留档为 intent。之后若模型或日程覆盖 action，
  // intent 仍保留居民本意，且**最终动作不得沿用被覆盖动作的分数/置信度**。
  const intent = {
    action: choice.action,
    score: choice.score,
    confidence: choice.confidence,
    source: 'rule',
  };

  return {
    id: choice.id,
    action: choice.action,
    score: choice.score,
    confidence: choice.confidence,
    intent,
    // 最终动作来源：rule（居民自选）/ model（模型改选）/ schedule（日程覆盖，仅危机时）。
    // 覆盖发生时 score/confidence 置 null——被覆盖动作的分数不能冒充最终动作的分数。
    final: { action: choice.action, source: 'rule', score: choice.score, confidence: choice.confidence },
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
      // D03/D04：把结果估计与「契约未建模的行动」一起写进上下文，使预想的
      // 未知项可被审计（旧实现把未知当作零风险零收益，无法被发现）。
      outcomeEstimate: outcomeLearningOn
        ? {
          expected: agent.decision.outcomeModel.estimate({
            agentId, action: choice.action, need, tick, halfLife: outcomeHalfLife,
          }),
          bias: outcomeBiasFor(choice.action),
          weight: outcomeWeight,
        }
        : null,
      unknownActions: predicted.filter((p) => p.known !== true).map((p) => p.action),
      // t12：本 tick 的计划状态与建议步骤，使"居民为什么做这件事"可追溯到目标，
      // 而不只是追溯到一次打分。null = 无活跃目标（或目标被生存危机挂起）。
      goal: goalSuggestion === null
        ? (goalPlan.plan === null
          ? null
          : { goalId: goalPlan.plan.goalId, goal: goalPlan.plan.goal, status: goalPlan.plan.status, stepIndex: goalPlan.plan.stepIndex })
        : {
          goalId: goalSuggestion.goalId,
          goal: goalSuggestion.goal,
          stepIndex: goalSuggestion.stepIndex,
          stepCount: goalSuggestion.stepCount,
          stepAction: goalSuggestion.action,
          why: goalSuggestion.why,
          weight: goalSuggestion.weight,
          // 是否真的按计划执行，由 dispatch 后的 goal.aligned 判定；此处只记建议。
          aligned: choice.action === goalSuggestion.action,
        },
    },
  };
}

/** 行动 → 世界变更函数（供 dispatch.actions 调用）。 */
/** 把执行结果渲染成一行人类可读文本（供情景/语义记忆引用，不新增事实）。 */
function describeOutcome(outcome) {
  if (outcome === null || typeof outcome !== 'object') return '结果未知';
  const parts = [outcome.status];
  if (outcome.reason !== null && outcome.reason !== undefined) parts.push('原因=' + outcome.reason);
  if (outcome.needsDelta !== null && outcome.needsDelta !== undefined) {
    const d = outcome.needsDelta;
    parts.push('需求变化=food' + (d.food ?? 0) + '/water' + (d.water ?? 0));
  }
  if (outcome.gain !== null && outcome.gain !== undefined) parts.push('收益=' + JSON.stringify(outcome.gain));
  if (outcome.cost !== null && outcome.cost !== undefined) parts.push('成本=' + JSON.stringify(outcome.cost));
  parts.push('收益分=' + (outcome.gainScore ?? 0).toFixed(2) + '/成本分=' + (outcome.costScore ?? 0).toFixed(2));
  if (outcome.known !== true) parts.push('契约未知');
  return parts.join(' ');
}

function effectFor(agentId, action, cfg = {}) {
  // D04：生存骨架的数字不再在这里硬编码，统一取 decision.action-contract，
  // 与 anticipation.simulator 的预想共用同一份来源，使「无噪声预想」与
  // 「确定性执行」可以逐项对账（预想的 needsDelta === 执行的 needsDelta）。
  const c = agent.decision.contract.contractOf(action);
  // D01/D02：effect 必须**返回实测结果**（ok/reason/needsDelta/consumed/produced），
  // 而不是靠调用方假设「调用了就是成功了」。旧实现里 eat/drink 在库存为 0 时
  // 什么都没发生，却被记为 applied:true —— 这正是「空操作误记成功」。
  switch (action) {
    case 'eat':
      return () => {
        const consumed = survival.resources.food.consume(c.consumes.food);
        const ok = consumed.consumed > 0;
        if (ok) survival.needs.meter.update({ agentId, need: 'food', delta: c.needsDelta.food });
        return {
          ok,
          reason: ok ? null : 'no_food_stock',
          needsDelta: ok ? { ...c.needsDelta } : null,
          consumed: { food: consumed.consumed },
          produced: null,
        };
      };
    case 'drink':
      return () => {
        const consumed = survival.resources.water.consume(c.consumes.water);
        const ok = consumed.consumed > 0;
        if (ok) survival.needs.meter.update({ agentId, need: 'water', delta: c.needsDelta.water });
        return {
          ok,
          reason: ok ? null : 'no_water_stock',
          needsDelta: ok ? { ...c.needsDelta } : null,
          consumed: { water: consumed.consumed },
          produced: null,
        };
      };
    case 'forage':
      return () => {
        const yieldAmount = typeof cfg.forageYield === 'number' && Number.isFinite(cfg.forageYield) ? cfg.forageYield : 2;
        const take = Math.min(yieldAmount, foragePool);
        foragePool = Math.max(0, foragePool - take);
        let wood = 0;
        if (take > 0) {
          survival.resources.food.produce(take);
          survival.resources.water.produce(take);
          // P2：采集时按概率带回木材。原实现里木头只在出生时一次性发 6 个、无任何再生途径，
          // 而 craft 耗 2 / build 耗 3 —— 制作与建造的窗口只在开局几次，之后**永久关闭**
          // （实测 t100 后 craft/build 均为 0，而抽样 12 人中 8 人木材已归零）。
          // 采集是唯一与外界的接触面，木材自此处产出才符合语义。
          const woodId = stage2.craftMaterialId();
          if (woodId !== null && rng.next() < (cfg.forageWoodChance ?? 0.25)) {
            try { agent.inventory.backpack.add({ agentId, itemId: woodId, quantity: 1 }); wood = 1; } catch { /* 背包满则不带回 */ }
          }
        }
        // 采集池见底时 take=0：这是空操作，必须记 noop 而不是成功（实测该场景曾让
        // 居民在「守着满仓水渴死」时仍被记为有效采集）。
        return {
          ok: take > 0,
          reason: take > 0 ? null : 'forage_pool_empty',
          needsDelta: null,
          consumed: null,
          produced: take > 0 ? { food: take, water: take, ...(wood > 0 ? { wood } : {}) } : null,
        };
      };
    case 'rest':
      return () => {
        survival.needs.meter.update({ agentId, need: 'food', delta: c.needsDelta.food });
        survival.needs.meter.update({ agentId, need: 'water', delta: c.needsDelta.water });
        return {
          ok: true,
          reason: null,
          needsDelta: { ...c.needsDelta },
          consumed: null,
          produced: null,
        };
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

/**
 * 有模型 E2E：让真实大模型从居民当前候选集内选择行动。
 * fail-soft：模型输出不可解析或不在候选集内时返回 null，由确定性结果接管，
 * 并在事件流中记录回落原因，保证可审计、且模型不会破坏生存可行性。
 */
async function decideByModel(record, decision, tick, cfg) {
  const agentId = record.id;
  const ctx = agentContextOf(record);
  const needs = survival.needs.meter.query({ agentId }).needs;
  const candidates = (decision.options ?? []).map((o) => ({
    action: o.action,
    why: o.reason ?? o.because ?? null,
  }));
  if (candidates.length === 0) return null;
  try {
    const picked = await ai.decide.choose({
      name: ctx.name,
      persona: ctx.persona,
      tags: ctx.tags,
      needs,
      stock: {
        food: survival.resources.food.query().stockpile,
        water: survival.resources.water.query().stockpile,
      },
      candidates,
      tick,
    }, { model: cfg.llmDecideModel });
    if (picked.action === null) {
      observer.recorder.eventLog.record({
        tick, topic: 'ai.decide.fallback', agentId,
        payload: { reason: 'unparsed', raw: String(picked.raw ?? '').slice(0, 80), allowed: candidates.map((c) => c.action) },
      });
      return null;
    }
    observer.recorder.eventLog.record({
      tick, topic: 'ai.decide', agentId,
      payload: { action: picked.action, model: picked.meta.model, latencyMs: picked.meta.latencyMs, allowed: picked.meta.allowed },
    });
    return {
      action: picked.action,
      reason: '模型选择「' + picked.action + '」（候选 ' + picked.meta.allowed + ' 项，' + picked.meta.model + '）',
      meta: picked.meta,
    };
  } catch (err) {
    observer.recorder.eventLog.record({
      tick, topic: 'ai.decide.fallback', agentId,
      payload: { reason: 'error', message: String(err?.message ?? err).slice(0, 120) },
    });
    return null;
  }
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

/** 批次2-D：成员死亡 → 写入所属家族编年史（供文明遗产继承）。 */
function recordFamilyDeath(agentId, cause, tick) {
  try {
    const fams = social.family.registry.lookup({ memberId: agentId });
    for (const f of fams) {
      social.family.chronicle.append({ familyId: f.familyId, event: 'death', tick, actor: agentId, detail: { cause } });
    }
  } catch { /* 家族系统不可用则跳过 */ }
}

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
      recordFamilyDeath(id, cause, tick);
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
      recordFamilyDeath(record.id, result.cause, tick);
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
/**
 * 挂机节拍器用的**阶段序列**：把一个 tick 摊成若干可观测、可分别节流的单元。
 *
 * 为什么需要它：一次 `step()` 在 50 人规模下约 1.4 秒；若只按 tick 节流，
 * 观察者要么全程看不到中间态，要么被迫整段等待。拆成阶段后，每个阶段结束时
 * 都能向外界报告进度，也因此能对每个阶段单独限速。
 *
 * 顺序即 `step()` 的执行顺序，两者共用这一份定义，不可各自维护。
 *
 * @param {object} config 与 step 同参
 */
async function* tickSequenceInner(config = {}) {
  // t16：每个阶段单元被产出时同步记入阶段进度，供观测 API 展示「此刻跑到哪一步」。
  // 记录点放在 unit() 里，是因为 unit() 就是「阶段边界」的唯一定义处——
  // 若在别处再记一次，两处口径迟早会漂移。
  const unit = (id, detail, value) => {
    stageProgress.unit(id, detail ?? null);
    return { id, detail: detail ?? null, value: value === undefined ? null : value };
  };

  const cfg = { ...DEFAULT_CONFIG, ...configStore.currentDifficultyParams(), ...(config ?? {}) };
  // 提交边界：进入本 tick 即标记进行中。tick 号在 clock.tick() 之后才确定，
  // 故先占位、推进时钟后补齐 inFlightTick。
  inFlight = true;
  inFlightTick = clock.now().tick + 1;
  const tick = clock.tick().tick;
  inFlightTick = tick;
  stageFailure = null;
  // t16：上一次 tick 的失败不得"粘住"。state 表达的是**最近一次 tick 的结果**，
  // 若不在新 tick 开始时清掉 stageError，一次失败之后即使后续 tick 全部成功，
  // 观测 API 仍会永远报 failed——那与"用 running 标签伪装"是同一类失真。
  // 失败历史仍然保留在 stageProgress 的环形缓冲里，不会丢。
  stageError = null;
  // t16：阶段进度从本 tick 的第一个单元开始记录。
  stageProgress.begin(tick);
  // 人口可能在上个 tick 因出生/死亡变化：先失效缓存再算采集池容量/再生。
  invalidateAlivePopulation();

  // 0) 世界采集池再生（每 tick 补充可采集总量）
  regenForagePool(cfg);
  yield unit('regen', null);

  // 1) survival：衰减 / 需求增长 / 突发事件
  const eventPercepts = runSurvival(tick, cfg);
  yield unit('survival', { events: eventPercepts.length });

  // 2) perception：事件转 percept 并分发给智能体
  const percepts = perception.collect(eventPercepts);
  const inbox = perception.route(percepts);
  yield unit('perceive', { percepts: percepts.length });

  // 2.5) LAYA 语义紧迫度预取（可选通路，默认关闭）
  // 它不是决定者，只是压力分的语义分量（15%）；服务不可用时静默回退。
  if (cfg.layaSemanticEnabled === true) {
    layaUrgencyCache.clear();
    await prefetchLayaUrgency(agentRecordsForLaya(), cfg);
  } else if (layaUrgencyCache.size > 0) {
    layaUrgencyCache.clear();
  }

  // 3) 逐智能体：决策 → 观察者决策日志 → AI 思考
  const agentRecords = registry.lookup({ type: 'agent' });
  const decisions = [];
  // 有模型 E2E：采样式让真实大模型进入决策环。默认关闭；开启时按 tick 与人数限额
  // 调用（实测单次约 18s，全量 50×200 不可行），其余居民走确定性路径。
  const llmDecide = cfg.llmDecideEnabled === true && (tick % (cfg.llmDecideEveryTicks ?? 1) === 0);
  let llmCalls = 0;
  // 识字者集合按 tick 统一计算：识字人数取决于全城人口，不是单人属性，
  // 因此必须在这里（能看到全部居民的位置）算一次，而不是在 decide 里逐个判断。
  computeLiterateSet(agentRecords.map((r) => r.id), cfg);
  // t11：开启本 tick 的共享池争用账本。
  // 决策顺序与 dispatch 顺序一致，因此按决策顺序预支额度后，
  // 第 i 个居民预想时看到的就是「前 i-1 人取走之后」的真实剩余量——
  // 这消除了「N 人同时决定采集、后到者全部空转」的重复预支，
  // 也让「无噪声预想」与「确定性执行」可以逐项对账。
  agent.decision.contention.open(tick, contentionCapacities());
  // t12：死亡居民的计划不留残影（否则 summary 与观测会把死者的意图算作在办事项）。
  agent.decision.goals.prune(new Set(agentRecords.map((r) => r.id)));
  for (const record of agentRecords) {
    const agentId = record.id;
    const decision = decide(agentId, tick, inbox[agentId] ?? [], cfg, agent.decision.contention.view());
    if (decision === null) continue;
    // 有模型 E2E：模型从**居民当前可行候选集**内做选择（不新增行动、不绕过可行性）。
    if (llmDecide && llmCalls < (cfg.llmDecideMaxAgents ?? 1)) {
      llmCalls += 1;
      const picked = await decideByModel(record, decision, tick, cfg);
      if (picked !== null) {
        decision.action = picked.action;
        decision.reason = picked.reason;
        decision.llmDecide = picked.meta;
        // D01：模型只改选**候选集内**的行动；改选后最终动作的分数/置信度置 null，
        // 因为 choice.score 属于被覆盖的那个动作，不能冒充最终动作的分数。
        decision.model = {
          mode: 'llm',
          applied: true,
          action: picked.action,
          fallbackReason: null,
          meta: picked.meta,
        };
        decision.final = { action: picked.action, source: 'model', score: null, confidence: null };
        decision.score = null;
        decision.confidence = null;
      } else {
        // 模型回退必须透明：不可解析/不在候选集/调用失败都留档。
        decision.model = { mode: 'llm', applied: false, action: null, fallbackReason: 'model_unavailable_or_unparsable', meta: null };
      }
    } else {
      decision.model = {
        mode: 'rule', applied: false, action: null,
        fallbackReason: llmDecide ? 'sampling_limit' : 'llm_decide_disabled', meta: null,
      };
    }
    // 批次2-C（t48）：日程驱动行动（非紧急时以日程为准，紧急触发重排）
    if (cfg.scheduleEnabled !== false) {
      const scheduled = scheduleOverride(decision, agentId, tick, cfg);
      if (scheduled) {
        const adopted = scheduled.action !== (decision.intent?.action ?? decision.action);
        decision.action = scheduled.action;
        decision.reason = scheduled.reason;
        decision.schedule = {
          ...(scheduled.meta ?? {}),
          // 日程是**建议**：记下建议值与是否被采纳，避免把建议伪装成决定。
          adopted,
          trigger: scheduled.trigger,
          replanned: scheduled.replanned === true,
        };
        if (adopted) {
          decision.final = { action: scheduled.action, source: 'schedule', score: null, confidence: null };
          decision.score = null;
          decision.confidence = null;
        }
        if (scheduled.replanned) {
          observer.recorder.eventLog.record({ tick, topic: 'agent.schedule.replan', payload: { agentId, trigger: scheduled.trigger } });
        }
      }
    } else {
      decision.schedule = null;
    }
    // t10：反事实干预在模型/日程覆盖**之后**生效——它要替换的是"最终行动"，
    // 而不是"规则初步选择"；否则被模型或日程覆盖过的决策会覆盖掉干预，
    // 分支世界就与原世界无差别。
    applyIntervention(decision, agentId, tick);
    // t11：决策已定（含模型/日程覆盖）后，按**最终动作**预支共享额度。
    // 只影响后续居民的预想；真实取用仍由执行器对真实池操作。
    // 记账留在决策上下文里，使「谁在本 tick 预支了多少公共资源」可直接审计。
    const contention = agent.decision.contract.contentionOf(decision.action);
    const poolName = contention?.pool ?? null;
    const before = poolName === null ? undefined : agent.decision.contention.remaining(poolName);
    const reserved = reserveContention(decision.action, surplusItemsOf(agentId), cfg);
    const after = poolName === null ? undefined : agent.decision.contention.remaining(poolName);
    // 实测残留：少数居民在「池已被前面的居民预支空」时仍选了该行动。
    // 原因不是信息过期，而是**生存门有意压过争用惩罚**——食物/水见底时
    // forage 是唯一能补货的行动，此时「效率」必须让位于「活下去」。
    // 这种压过必须是**显式可审计**的，而不是静默的预测-执行不一致。
    const doomedButChosen = contention?.mode === 'shared-draw'
      && reserved === 0 && typeof before === 'number' && before <= 0;
    decision.context = {
      ...(decision.context ?? {}),
      contention: {
        pool: poolName,
        mode: contention?.mode ?? 'none',
        remainingBefore: typeof before === 'number' ? before : null,
        reserved,
        remainingAfter: typeof after === 'number' ? after : null,
        doomedButChosen,
      },
    };
    observer.recorder.decisionLog.record({
      tick,
      agentId,
      decision: decision.action,
      options: decision.options,
      context: decision.context,
      reason: decision.reason,
      decisionId: decision.id,
      // D01：规则选择 / 模型选择 / 日程建议 / 最终行动分成四个阶段记录。
      intent: decision.intent,
      model: decision.model,
      schedule: decision.schedule,
      final: decision.final,
      // t10：反事实干预标记（仅分支会话会出现）。必须显式转发——record() 是按
      // 字段白名单记录的，不在这里传就等于没记，而"分支到底有没有被改写"正是
      // 反事实结论可信与否的关键证据。
      counterfactual: decision.counterfactual,
    });
    // 批次2-B（t47）：把本次决策沉淀为语义记忆（事件→摘要），供后续召回。
    // `persist: false` 表示只留在内存索引里，**不写入图存储**：
    // 这是全系统写入量最大的位置（50 人 × 200 tick = 10000 条，长跑后数万条），
    // 而图里每多一个语义记忆节点，所有 `read({ type })` 的全量查询都要为它付出代价
    // ——实测 30000 节点时一次全量读要 51ms，整个测试套件因此多花数分钟。
    // 语义记忆在本进程内即建即用（按 agentId 分桶），不需要经图存储中转。
    // D02：决策时刻写入的是**意图**（phase:'intent'），不是后果。
    // tags 保持 [action, need] 不变——习惯偏置仍按同一契约统计；
    // 真正的成本收益在执行后由 dispatch 阶段以 phase:'outcome' 写入。
    agent.memory.semantic.store(agentId, {
      content: '第 ' + tick + ' tick 选择「' + decision.action + '」' + (decision.context?.dominantNeed ? '（主导需求：' + decision.context.dominantNeed + '）' : ''),
      tags: [decision.action, decision.context?.dominantNeed ?? 'sustenance'],
      salience: 0.5,
      phase: 'intent',
      ref: { decisionId: decision.id, tick, agentId },
    }, { maxEntries: cfg.semanticMaxEntries, persist: cfg.memoryPersist === true });
    const situation = `当前处境：${(inbox[agentId] ?? []).map((p) => p.topic).join('、') || '一切如常'}。你决定采取行动「${decision.action}」。`;
    const thought = await ai.thought.generate(agentContextOf(record), situation);
    decisions.push({ agentId, decision, thought });
    yield unit('decide', { agentId, action: decision.action, done: decisions.length, of: agentRecords.length });
  }

  // 4) dispatch：行动落到 world-state + 观察者行为日志 + 情景记忆
  let dispatched = 0;
  for (const { agentId, decision, thought } of decisions) {
    // D0：非生存行动由居民自己发起（调用真实模块）；生存行动沿用 effectFor。
    const dynamic = DYNAMIC_BASE_SCORE[decision.action] !== undefined;
    const performed = dynamic
      ? stage2.performAgentAction(tick, agentId, decision.action, cfg)
      : null;
    // D01：用 decision.id 作为世界操作 id，使 actionId === decisionId，
    // 「意图 → 执行 → 结果」可用同一个 ID 串起来（旧实现 actionId 是无关的 op_N）。
    const op = dispatch.resolve([{
      id: decision.id,
      agentId,
      action: decision.action,
      params: performed === null
        ? { reason: decision.reason }
        : { reason: decision.reason, ok: performed.ok, detail: performed.reason ?? null },
      reason: decision.reason,
      confidence: decision.confidence,
      effect: effectFor(agentId, decision.action, cfg),
    }])[0];
    dispatch.actions(op, {
      onApplied: (record) => {
        // D01/D02：执行结果由**实测**归一化（生存动作取 effect 返回值，
        // 动态动作取 performAgentAction 返回值），不再假设「调用了就是成功了」。
        const sustainResult = record.effectResult !== undefined ? record.effectResult : null;
        const outcome = agent.decision.executionOutcome.normalize({
          action: record.action,
          dynamic,
          performed: dynamic ? performed : sustainResult,
        });
        const outcomeWithRef = agent.decision.executionOutcome.withRef(outcome, {
          decisionId: decision.id,
          actionId: record.id,
          tick,
          agentId,
        });
        observer.recorder.actionLog.record({
          tick,
          agentId: record.agentId,
          action: record.action,
          outcome: outcomeWithRef,
          actionId: record.id,
          decisionId: decision.id,
        });
        // 失败/空操作单独写事件日志（带同一 decisionId），使失败结果可被检索与告警。
        if (outcome.status === 'failed' || outcome.status === 'noop') {
          observer.recorder.eventLog.record({
            tick,
            topic: 'agent.action.' + outcome.status,
            payload: {
              decisionId: decision.id,
              actionId: record.id,
              action: record.action,
              status: outcome.status,
              reason: outcome.reason,
              intentAction: decision.intent?.action ?? null,
            },
            agentId: record.agentId,
          });
        }
        // D02：把执行成本收益写回情景记忆（带执行引用，可反查日志）。
        if (cfg.outcomeMemoryEnabled !== false) {
          agent.memory.episodic.store.write(agentId, {
            content: '第 ' + tick + ' tick 执行「' + record.action + '」：' + describeOutcome(outcome),
            emotion: null,
            salience: outcome.status === 'applied' ? 0.5 : 0.7,
            tags: ['outcome', String(record.action)],
            ref: outcomeWithRef.ref,
            outcome: outcomeWithRef,
          });
        }
        // D02：把执行成本收益写回语义记忆（phase:'outcome'，带执行引用）。
        // 与决策时刻的 phase:'intent' 条目区分开：意图不等于后果。
        if (cfg.outcomeMemoryEnabled !== false) {
          agent.memory.semantic.store(agentId, {
            content: '第 ' + tick + ' tick 执行「' + record.action + '」：' + describeOutcome(outcome),
            tags: ['outcome', String(record.action), decision.context?.dominantNeed ?? 'sustenance'],
            salience: outcome.status === 'applied' ? 0.5 : 0.7,
            phase: 'outcome',
            ref: outcomeWithRef.ref,
            outcome: outcomeWithRef,
          }, { maxEntries: cfg.semanticMaxEntries, persist: cfg.memoryPersist === true });
        }
        // D03：把实际结果写进有界结果估计（失败降预期、成功升预期）。
        agent.decision.outcomeModel.observe({
          agentId,
          action: record.action,
          need: decision.context?.dominantNeed ?? 'none',
          tick,
          outcome,
        });
        // t12：把**实测结果与实测后的状态**反馈给多步计划。
        // 计划据此推进（完成判据在真实状态上成立）/ 等待（动作已生效但效果跨 tick）/
        // 回退（前置条件不满足则退回最早的未完成步骤）/ 放弃（连续失败或超预算）。
        // 关键：判据是"东西是否真的到手"，不是"我是否发出过命令"。
        if (cfg.goalPlanningEnabled !== false) {
          const goalAfter = agent.decision.goals.observe(
            agentId,
            tick,
            { status: outcome.status, reason: outcome.reason ?? null, action: record.action },
            goalStateOf(agentId, tick),
            cfg,
          );
          for (const tr of goalAfter.transitions) {
            observer.recorder.eventLog.record({ tick, topic: 'agent.goal.' + tr.type, agentId, payload: tr });
          }
        }
      },
    });
    agent.memory.episodic.store.write(agentId, {
      content: thought.thought,
      emotion: null,
      salience: 0.5,
      tags: ['thought', String(decision.action)],
    });
    dispatched += 1;
    yield unit('dispatch', { agentId, action: decision.action, done: dispatched, of: decisions.length });
  }

  // 4.5) 死亡：饥饿/口渴持续 → 健康下降 → 死亡（移出 registry + 写 observer）
  runMortality(tick, cfg);

  // 4.6) 批次2-C（t48）：公共角色影响（医生治疗等）
  applySocietyEffects(tick, cfg);

  // 4.6) 批次2-A：自然衰老（老年死亡）+ 特质漂移（与 needs 致死并存）
  runLifecycle(tick, cfg);
  runTraitDrift(tick, cfg);
  yield unit('lifecycle', null);

  // 5) world-state 快照
  syncWorldState(tick, cfg);
  yield unit('snapshot', null);

  // 6) 第二阶段：家庭/经济/制作/居住/健康（被主循环驱动并写 observer）
  // 阶段边界重新读取 registry：本 tick 早段可能已出生/死亡，若沿用旧的 agentRecords，
  // 新生的孩子要到下一 tick 才被经济/家庭系统看到（跨 tick 滞后），死者的幽灵仍被消费。
  let phase2Summary = null;
  if (cfg.phase2) {
    // t5：子代的世代号必须由**真实父母**推导，而不是默认值。
    // 语义：当前文明的开国一代 = 该文明创建时的世代号；子代 = 父母世代的最大值 + 1。
    // 修复前 registerAgent 完全不写 generation，子代的代际在 registry 里查不到，
    // 「三代未遗失」只能从 family.lineage 间接推断，文明重启后更无从判断谁是新的一代。
    const spawnChild = (child) => {
      const parents = Array.isArray(child.parents) ? child.parents : [];
      const parentGens = parents
        .map((p) => registry.lookup(p)?.data?.generation)
        .filter((g) => Number.isInteger(g) && g > 0);
      const generation = parentGens.length > 0 ? Math.max(...parentGens) + 1 : generationCount;
      return registerAgent({
        id: child.id, name: child.name, persona: '避难所新生儿',
        food: 0.2, water: 0.2, candidates: DEFAULT_ACTIONS,
        generation, parents: parents.length > 0 ? parents : null,
      });
    };
    // 第二阶段逐子系统 yield：市场/产业/健康等各自要跑几十毫秒到数秒，
    // 整段 yield 出去等于把观察者冻住。这里把十一子系统拆成十一步。
    const agentsForStage2 = registry.lookup({ type: 'agent' });
    phase2Summary = {};
    try {
      for (const unit2 of stage2.tickSequence({ tick, agents: agentsForStage2, config: cfg, spawnChild })) {
        phase2Summary[unit2.id] = unit2.value;
        yield unit('phase2:' + unit2.id, { label: unit2.label, index: unit2.index, total: unit2.total });
      }
    } catch (err) {
      stageFailure = { stage: 'phase2', tick, message: err instanceof Error ? err.message : String(err) };
      observer.recorder.eventLog.record({ tick, topic: 'tick.stage.failed', payload: stageFailure });
      throw err;
    }
  }

  // 7) 第三阶段：治理/文化/心理/科技/遗产（被主循环驱动并写 observer）
  // 同样在阶段边界重读 registry：phase2 里可能刚出生了一批新生儿。
  let phase3Summary = null;
  if (cfg.phase3) {
    const agentsForStage3 = registry.lookup({ type: 'agent' });
    phase3Summary = {};
    try {
      // t5：把「代际交接」注入第三阶段——文明崩溃确认后，遗产归档与重启之间
      // 必须先隔离旧世代并真实创建下一代（否则"重启"只是写一条记录）。
      const handover = (meta) => runGenerationHandover(tick, cfg, meta?.heritage ?? null);
      for await (const unit3 of stage3.tickSequence({ tick, agents: agentsForStage3, config: cfg, handover })) {
        phase3Summary[unit3.id] = unit3.value;
        yield unit('phase3:' + unit3.id, { label: unit3.label, index: unit3.index, total: unit3.total });
      }
    } catch (err) {
      stageFailure = { stage: 'phase3', tick, message: err instanceof Error ? err.message : String(err) };
      observer.recorder.eventLog.record({ tick, topic: 'tick.stage.failed', payload: stageFailure });
      throw err;
    }
  }

  // 7.5) 遗产考古（t14）：让遗物**在长跑中真的会被捡到**。
  //
  // 交接时的批量注入只在"文明重启"那一刻发生；若不补这一步，
  // 常态运行中"发现遗物"这条路永远不可达——遗物只是重启时的装饰。
  // 这里每 tick 允许**有界**数量的解读（默认 1），且只由识字者进行：
  // 解读是有代价的稀缺行为，不是每 tick 每人一次的全员动作。
  if (cfg.legacyInheritance !== false && cfg.legacyDiscoveryPerTick !== 0) {
    try {
      const dig = runLegacyDiscovery(tick, cfg);
      if (dig.discoveries > 0 || dig.lost.length > 0) {
        yield unit('legacy', { discoveries: dig.discoveries, garbled: dig.garbled, lost: dig.lost.length });
      }
    } catch (err) {
      // 考古失败不得让 tick 失败：它是文明叙事的一部分，不是主循环的必需环节。
      stageFailure = null;
      observer.recorder.eventLog.record({
        tick, topic: 'civilization.legacy.discovery.failed',
        payload: { message: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  // 8) 生存危机检测 + 生存目标更新（每 tick 末尾，snapshot 可读）
  const crisisState = survival.crisis.alert({ tick });
  const goalState = survival.goal.elapsed({ tick });
  worldState.set('survival.crisis', crisisState);
  worldState.set('survival.goal', goalState);

  // 9) 后置快照：phase2/phase3 会改动资源/人口/建造，必须在它们之后再同步一次
  //    world-state，否则 observer 看到的是阶段执行前的世界（跨阶段不一致）。
  syncWorldState(tick, cfg);
  worldState.set('tick', tick);
  worldState.set('committedTick', tick);
  worldState.set('tickInFlight', false);
  // 提交边界闭合：此刻起本 tick 的所有变更对观察者可见且自洽。
  committedTick = tick;
  inFlight = false;
  stageFailure = null;

  const summary = {
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
  yield unit('done', null, summary);
  return summary;
}

/**
 * 挂机节拍器 / 观测 API 用的**阶段序列**（tickSequenceInner 的提交边界包装）。
 *
 * 包装层只做一件事：把「本 tick 是否完整跑完」这一事实写进阶段进度。
 *   - 正常结束 → stageProgress.commit(tick)：观察者从此看到该 tick 已提交；
 *   - 中途抛错 → stageProgress.fail(tick, err)：失败同样成为可观测事实。
 * 没有这一层时，失败的 tick 会永远停留在「推进中」，观察者无法区分卡死与失败。
 *
 * @param {object} config 与 step 同参
 */
export async function* tickSequence(config = {}) {
  let result;
  try {
    result = yield* tickSequenceInner(config);
  } catch (err) {
    const cur = stageProgress.current();
    stageProgress.fail(cur === null ? -1 : cur.tick, err);
    throw err;
  }
  const cur = stageProgress.current();
  if (cur !== null) stageProgress.commit(cur.tick);
  return result;
}

/**
 * 推进一个 tick（与 `tickSequence` 共用同一份步骤定义）。
 * 批处理 / 测试走这条路径；挂机节拍器走 `tickSequence` 逐步推进。
 * @param {object} config
 * @returns {Promise<object>}
 */
export async function step(config = {}) {
  // 并发互斥：同一时刻只允许一个 tick 在跑。若已有 tick 进行中，直接拒绝，
  // 而不是让两个生成器交错推进同一份共享状态（时钟/registry/资源都会被撕裂）。
  if (inFlight) {
    const err = new Error('loop.step: 上一个 tick 仍在推进中（tick ' + inFlightTick + '），拒绝并发步进');
    err.code = 'TICK_IN_FLIGHT';
    throw err;
  }
  try {
    let last = null;
    for await (const unit of tickSequence(config)) last = unit;
    return last === null ? {} : last.value;
  } catch (err) {
    // 任一步骤抛错时归位 inFlight，并留下可供观测的失败状态，
    // 避免"失败后永远 running"这种假象。
    stageError = { tick: inFlightTick, message: err instanceof Error ? err.message : String(err) };
    inFlight = false;
    worldState.set('tickInFlight', false);
    worldState.set('lastTickError', stageError);
    throw err;
  }
}
/** 复位全部共享状态（graph/rng/identity/clock/world-state/registry/needs/recorder）。 */
// ---- 持久化：运行阶段与循环级状态必须进存档 ----

/**
 * 导出循环级运行状态。
 *
 * 覆盖：采集池余量（逐 tick 再生/抽取的全局共享资源）、当前种子、死亡计量表
 * （饥饿持续计数与健康，跨 tick 累积）、识字者集合（由全城人口决定，
 * 跨 tick 复用）、提交边界（tick/committedTick/inFlight 等运行阶段）、
 * 以及 LAYA 紧迫度缓存。
 *
 * **不导出**派生缓存 `_alivePop*` 与 `literateSet` 的世代号语义：它们按显式
 * 世代号失效，恢复时直接作废重建即可（下方 __restore 会重置世代号）。
 */
export function __snapshot() {
  return {
    foragePool,
    currentSeed,
    mortality: [...mortality.entries()].map(([agentId, st]) => ({ agentId, ...structuredClone(st) })),
    literateSet: literateSet === null ? null : [...literateSet],
    inFlight,
    committedTick,
    inFlightTick,
    stageError: stageError === null ? null : structuredClone(stageError),
    stageFailure: stageFailure === null ? null : structuredClone(stageFailure),
    // t5：代际必须进存档。不入档的话，恢复后的世界会以「第 1 代」重启一个
    // 已经繁衍/重启过若干代的运行：新出生的子代世代号会回退，封存记录丢失，
    // 「谁是新的一代」在恢复后立刻失真。
    generationCount,
    sealedGenerations: sealedGenerations.map((s) => ({
      generation: s.generation, tick: s.tick, members: [...s.members],
    })),
  };
}

/**
 * 恢复循环级运行状态。
 *
 * 恢复后**不**保留 `inFlight=true`：存档只可能在提交边界之后采集，
 * 续跑必须从一个自洽的世界开始（否则 step 会因并发守卫永久拒绝）。
 * 派生缓存（存活人口 / LAYA 紧迫度 / 识字者）一律作废重建。
 * @param {object} [data]
 */
export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('loop.__restore: 状态必须为对象');
  }
  const d = data;
  foragePool = (typeof d.foragePool === 'number' && Number.isFinite(d.foragePool)) ? d.foragePool : null;
  currentSeed = typeof d.currentSeed === 'string' ? d.currentSeed : 'default';
  mortality.clear();
  for (const rec of (Array.isArray(d.mortality) ? d.mortality : [])) {
    if (typeof rec?.agentId !== 'string' || rec.agentId === '') continue;
    const { agentId, ...rest } = rec;
    mortality.set(agentId, structuredClone(rest));
  }
  literateSet = d.literateSet === null || d.literateSet === undefined ? null : new Set(d.literateSet);
  // 运行阶段：恢复为「已提交、无进行中 tick」的自洽态。
  committedTick = Number.isInteger(d.committedTick) && d.committedTick >= 0 ? d.committedTick : 0;
  inFlightTick = Number.isInteger(d.inFlightTick) && d.inFlightTick >= 0 ? d.inFlightTick : 0;
  stageError = (d.stageError === null || d.stageError === undefined) ? null : structuredClone(d.stageError);
  stageFailure = (d.stageFailure === null || d.stageFailure === undefined) ? null : structuredClone(d.stageFailure);
  inFlight = false;
  // t5：代际状态随档恢复（见 __snapshot 的说明）。
  generationCount = Number.isInteger(d.generationCount) && d.generationCount > 0 ? d.generationCount : 1;
  sealedGenerations = (Array.isArray(d.sealedGenerations) ? d.sealedGenerations : [])
    .filter((s) => s !== null && typeof s === 'object' && Number.isInteger(s.generation))
    .map((s) => ({
      generation: s.generation,
      tick: Number.isInteger(s.tick) ? s.tick : 0,
      members: Array.isArray(s.members) ? [...s.members] : [],
    }));
  // 派生缓存作废：恢复后的世界与恢复前不同。
  invalidateAlivePopulation();
  layaUrgencyCache.clear();
  return {
    committedTick, foragePool, mortality: mortality.size,
    literate: literateSet === null ? 0 : literateSet.size,
    generation: generationCount,
  };
}

export function reset() {
  invalidateAlivePopulation();
  graph.__reset();
  // 热数据归档必须一起清空：graph.__reset 只清图节点，归档与序号水位是
  // hot-log 自己的模块级状态，不跟着图走。不清的话新一局会继承上一局的
  // 归档条目与 maxSeq 水位，lookup() 会把本局从未存在的 id 判成「已淘汰」。
  hotLog.__reset();
  rng.__reset();
  identity.__reset();
  clock.__reset();
  worldState.__reset();
  registry.__reset();
  survival.needs.meter.__reset();
  // 健康链必须复位：疾病/隔离是**跨 run 残留**的模块级状态。
  // 实测缺陷：reset() 原先漏掉它们，导致上一个 run 遗留的感染者与隔离名单
  // 带入下一个 run——集成测试 seed 2 的存活率因此从 1.000 掉到 0.94，
  // 而单独运行同一段代码恒为 1.000。测试与生产共用这个 reset，故必须补全。
  survival.health.disease.__reset();
  survival.health.epidemic.__reset();
  // treatment 无自有状态（仅转发给 disease），故无需复位。
  agent.traits.tagset.store.__reset();
  agent.lifecycle.__reset();
  agent.inventory.item.__reset();
  agent.inventory.backpack.__reset();
  // 日程 / 职业 / 社会角色同样跨 run 残留，且 loop.run 会读取它们
  // （society.activeEffects 决定识字、career 决定职业分布、schedule 决定重规划）。
  // 实测缺陷：漏掉这些后，集成测试 seed 2 的存活率在「与其它用例同进程」时为 0.94，
  // 单独运行时却为 1.000——断言结果取决于此前跑过哪些用例，这是不可接受的。
  agent.schedule.planner.__reset();
  agent.schedule.executor.__reset();
  agent.role.career.__reset();
  agent.role.society.__reset();
  // 其余携带仿真状态的模块级存储。全项目共 103 个模块导出 __reset，
  // 而 reset() 原先只覆盖十余个——凡漏掉一个，它的残留就会跨 run 泄漏，
  // 使同一份代码的结果取决于**此前跑过什么**（实测：先跑 3 人 12tick 局，
  // 再跑 50 人 200tick 的 seed 2，存活率由 1.000 掉到 0.940）。
  // 这里补齐所有会被 loop.run 读写的状态；纯派生的无状态模块无需列出。
  agent.anticipation.pool.store.__reset();
  agent.anticipation.pool.pruner.__reset();
  agent.anticipation.pool.selector.__reset();
  agent.anticipation.simulator.__reset();
  // D03：结果估计与行动契约一样是跨 run 状态，必须复位，否则新一局会继承
  // 上一局学到的偏置（实测同类漏复位会让结果依赖「此前跑过什么」）。
  agent.decision.outcomeModel.__reset();
  // t11：争用账本是逐 tick 的预测视图，跨 run 必须清空（否则新一局会继承上一局的预支额度）。
  agent.decision.contention.__reset();
  agent.decision.goals.__reset();
  agent.memory.episodic.store.__reset();
  agent.memory.semantic.__reset();
  agent.psyche.trauma.__reset();
  agent.psyche.coping.__reset();
  agent.psyche.break.__reset();
  agent.persona.identity.__reset();
  agent.persona.motivation.__reset();
  agent.persona.personality.__reset();
  agent.crafting.recipe.__reset();
  agent.crafting.construction.__reset();
  agent.crafting.writing.__reset();
  agent.traits.evolution.__reset();
  agent.traits.tagset.similarity.__reset();
  social.graph.edges.__reset();
  social.graph.community.__reset();
  social.platform.posts.__reset();
  social.reputation.__reset();
  social.relationship.friendship.__reset();
  social.relationship.romance.__reset();
  // t13：互动与承诺记录复位（图节点由 social.graph.edges 那次 __reset 清掉，
  // 但内存索引必须显式清空，否则跨 run 会残留上局的"欠债"）。
  social.interaction.__reset();
  social.relationship.family.__reset();
  social.family.registry.__reset();
  social.family.lineage.__reset();
  social.culture.norms.__reset();
  social.culture.ritual.__reset();
  social.culture.meme.__reset();
  survival.resources.medical.__reset();
  survival.shelter.__reset();
  survival.environment.weather.__reset();
  survival.environment.radiation.__reset();
  survival.events.generator.roller.__reset();
  town.building.structure.__reset();
  town.residence.__reset();
  observer.recorder.__reset();
  dispatch.__reset();
  perception.__reset();
  stage2.__reset();
  stage3.__reset();
  mortality.clear();
  foragePool = null;
  currentSeed = 'default';
  // t10：干预钩子是全局的，必须随运行复位。不清的后果不是"少一个功能"，
  // 而是**后续真实运行被静默改写**——一次反事实分析之后忘了撤掉干预，
  // 新一局就会带着一个凭空替换行动的世界跑下去，且不崩不报错。
  // （flow-index 的 store/reset-missing 检查正是抓到了这一点。）
  // 提交边界复位：新一局从 tick 0、无进行中 tick、无阶段失败开始。
  intervention = null;
  inFlight = false;
  committedTick = 0;
  inFlightTick = 0;
  stageError = null;
  stageFailure = null;
  // 阶段进度同样跨 run 残留：不清空的话，上一局最后一 tick 的"推进中"记录
  // 会让新一局的观测 API 一开始就报「正在跑 tick N」。
  stageProgress.__reset();
  // LAYA 紧迫度缓存只在 step() 内按 tick 清空；若上一局最后一 tick 的缓存留着，
  // 下一局第一 tick 的 prefetch 之前会先读到上一局的紧迫度（跨 run 泄漏）。
  layaUrgencyCache.clear();
  // 存活人口缓存：只复位了世代号而没复位值，
  // 使 reset 后首次 alivePopulation() 在世代号不匹配前可能返回上一局的人数。
  _alivePopGeneration = -1;
  _alivePopValue = 0;
  literateSet = null;
  // 代际状态跨 run 必须复位：否则新一局会从上一局的世代号继续往上加，
  // 「第几代」变成"此前跑过几局"的函数。
  resetGenerations();
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

  // 编年志分段持久化：把本次运行的全部 tick 落成可回取的段。
  // 这一步让「跑完之后还能按 tick 查证据」成为可能，而不只是留下一个计数。
  // 观察者不可用时（例如精简测试）静默跳过，不阻断主流程。
  try {
    const lastTick = clock.now().tick;
    const segmentSize = Number.isInteger(options.chronicleSegmentSize) && options.chronicleSegmentSize > 0
      ? options.chronicleSegmentSize : 50;
    for (let from = 0; from <= lastTick; from += segmentSize) {
      observer.chronicle.store.capture({ fromTick: from, toTick: Math.min(from + segmentSize - 1, lastTick) });
    }
    observer.timeline.__reset();
  } catch { /* 观察者为可选能力 */ }

  return {
    seed: options.seed,
    agents: spawned,
    ticks,
    finalTick: clock.now().tick,
    steps,
    world: worldState.snapshot(),
    resources: { food: survival.resources.food.query(), water: survival.resources.water.query(), energy: survival.resources.energy.query(), medical: survival.resources.medical.query() },
    chronicle: observer.chronicle.compiler.compile().counts,
    chronicleStore: observer.chronicle.store.getStats(),
    social: socialSummary(),
    ...(phase2 ? { phase2: { seed: phase2Seed, summary: stage2.summary() } } : {}),
    ...(phase3 ? { phase3: { seed: phase3Seed, summary: stage3.summary() } } : {}),
  };
}

/**
 * 在**已恢复**的运行上继续推进 N 个 tick（不 reset / 不 spawn / 不 seed）。
 *
 * 与 run() 的关键区别（这也是它存在的理由）：
 *   run() 面向「开一局」——它 reset 全部状态、按 agentCount 生成居民、再调用
 *   stage2.seed / stage3.seed 做一次性初始化。
 *   恢复存档后，世界已经自洽（居民、账户、配对、在研项目、阵营、法令都在档里），
 *   再 seed 一次等于对同一批实体**重复初始化**：实测 stage3.seed 会再次
 *   research.start 同一技术并抛「技术 greenhouse 已在研究中」，续跑直接崩。
 *
 * 因此续跑只有一条正确路径：不碰初始化，只按 tick 推进。
 * 配置必须与存档时一致（phase2/phase3 等），否则阶段构成会变。
 * @param {object} [options] 与 step 同参（ticks / phase2 / phase3 / seed 等）
 * @returns {Promise<object>} 与 run() 同形状的汇总
 */
export async function resume(options = {}) {
  const ticks = Number.isInteger(options.ticks) && options.ticks > 0 ? options.ticks : 1;
  const steps = [];
  for (let i = 0; i < ticks; i += 1) {
    steps.push(await step(options));
  }
  // 编年志分段：与 run() 同一策略，保证「跑完还能按 tick 查证据」。
  try {
    const lastTick = clock.now().tick;
    const segmentSize = Number.isInteger(options.chronicleSegmentSize) && options.chronicleSegmentSize > 0
      ? options.chronicleSegmentSize : 50;
    for (let from = 0; from <= lastTick; from += segmentSize) {
      observer.chronicle.store.capture({ fromTick: from, toTick: Math.min(from + segmentSize - 1, lastTick) });
    }
    observer.timeline.__reset();
  } catch { /* 观察者为可选能力 */ }

  return {
    seed: options.seed,
    resumed: true,
    ticks,
    finalTick: clock.now().tick,
    steps,
    world: worldState.snapshot(),
    resources: { food: survival.resources.food.query(), water: survival.resources.water.query(), energy: survival.resources.energy.query(), medical: survival.resources.medical.query() },
    chronicle: observer.chronicle.compiler.compile().counts,
    chronicleStore: observer.chronicle.store.getStats(),
    social: socialSummary(),
    ...(options.phase2 ? { phase2: { seed: null, summary: stage2.summary() } } : {}),
    ...(options.phase3 ? { phase3: { seed: null, summary: stage3.summary() } } : {}),
  };
}

/**
 * 当前观测快照（世界状态 + 资源 + 编年计数），供 api / 冒烟测试观测。
 *
 * tick 与 committedTick 的语义区别（t2 提交边界）：
 *   - tick：时钟当前值。step 进行中它就等于 inFlightTick，此时世界仍处于半提交态；
 *   - committedTick：最后一次**完整跑完全部阶段并写完末端快照**的 tick。
 * 观察者要判断"这个世界现在是否自洽"，应以 committedTick 为准。
 */
export function snapshot() {
  return {
    tick: clock.now().tick,
    committedTick,
    inFlight,
    stageFailure,
    stageError,
    generation: generationStatus(),
    agents: registry.lookup({ type: 'agent' }),
    world: worldState.snapshot(),
    resources: { food: survival.resources.food.query(), water: survival.resources.water.query(), energy: survival.resources.energy.query(), medical: survival.resources.medical.query() },
    chronicle: observer.chronicle.compiler.compile().counts,
    chronicleStore: observer.chronicle.store.getStats(),
    social: socialSummary(),
  };
}

/**
 * 存档恢复后重新对齐提交边界（t16）。
 *
 * 恢复出来的 tick 是**已提交边界**（存档只在完整 tick 之后采集），因此恢复后：
 *   - committedTick 必须跟上恢复后的时钟，否则观测 API 会拿旧进程的 tick 当"已提交"；
 *   - inFlight/失败状态必须清空——恢复后没有任何 tick 在跑；
 *   - 阶段进度的**观测历史**必须清空——旧进程的半截阶段记录不属于恢复后的运行；
 *   - 阶段进度的**后台驱动器事实必须保留**——见下。
 * 这是"恢复后状态自洽"的必要条件，不是可选清理。
 *
 * t25：为什么这里不再调 stageProgress.__reset()
 *   __reset() 会连 backgroundDriver 一起归零，而 markRestored 的职责是"对齐提交边界"，
 *   不是"停掉驱动器"。若在节拍器仍在运行时恢复，归零会让观测 API 谎报
 *   driver='manual-step'/background=false——正是 t16 禁止的"用标签伪装真相"。
 *   因此这里用"只清观测历史、保留驱动器事实"的 __restore：
 *     恢复的是"当前有没有后台推进器"这一**事实**，不是"历史上有没有跑过"。
 *   （loop.reset() 仍走 __reset 全量归零：新一局不该继承上一局的驱动器事实。）
 */
export function markRestored() {
  const tick = clock.now().tick;
  inFlight = false;
  inFlightTick = 0;
  committedTick = tick;
  stageError = null;
  stageFailure = null;
  // 保留驱动器事实，只清观测历史（见上方注释）。
  stageProgress.__restore(stageProgress.__snapshot());
  worldState.set('tick', tick);
  worldState.set('committedTick', tick);
  worldState.set('tickInFlight', false);
  return tickStatus();
}

/** 提交边界状态（供 api/control 与观察者查询，不暴露内部可变引用）。 */
export function tickStatus() {
  return Object.freeze({
    tick: clock.now().tick,
    committedTick,
    inFlight,
    inFlightTick,
    stageFailure,
    stageError,
  });
}

export { DEFAULT_ACTIONS, DEFAULT_EVENTS, DEFAULT_TAGS };
