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
import * as social from '../../social/index.js';
import * as town from '../../town/index.js';
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

/** 生存骨架候选（永远可选；非生存候选由 agent.decision.candidates 按状态动态追加）。 */
const DEFAULT_ACTIONS = Object.freeze([
  { id: 'eat', action: 'eat', score: 0.3 },
  { id: 'drink', action: 'drink', score: 0.3 },
  { id: 'rest', action: 'rest', score: 0.2 },
  { id: 'forage', action: 'forage', score: 0.2 },
]);

/** 非生存行动的基础分（与 candidate planner 的 BASE_SCORE 一致，供逐 tick 刷新时复用）。 */
const SURVIVAL_ACTIONS = Object.freeze(['eat', 'drink', 'forage', 'rest']);

const DYNAMIC_BASE_SCORE = Object.freeze({
  craft: 0.9, build: 0.8, write: 0.7, work: 1.0, trade: 0.8, socialize: 0.7, court: 0.85, accept: 1.1,
  expedition: 0.75,
  // found：居民自己创办企业。基准分低于 work（1.0），因为创办是**机会性**行为——
  // 有资本且无事可做时才值得做，不应压过日常谋生。
  found: 0.6,
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
});

// ---- 世界采集池（t32）：每 tick 再生、全局共享，避免补给随人口线性增长 ----
let foragePool = null;
let currentSeed = 'default';

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
  // P2 修正：emergency 必须用**危机**阈值，而不是「该吃饭了」的 eatThreshold(0.4)。
  // 用 0.4 时，80 人局的需求长期落在 0.4~0.5，于是居民**几乎永远处于"紧急"**，
  // 日程的 4 行动词汇表整体接管决策（实测 t100+ 被日程覆盖 3456 次 vs 居民自选 629 次，
  // craft 因此从 50 人局的 351 次塌到 6 次）。轻微饥饿不该剥夺居民的决定权。
  const crisisLevel = clampUnit(cfg.crisisNeedLevel ?? 0.8, 0.4);
  const emergency = (need === 'food' || need === 'water') && level >= crisisLevel;
  const scheduled = agent.schedule.executor.tick(agentId, { tick, interrupted: emergency, trigger: emergency ? 'emergency' : 'interrupt' });
  if (!scheduled || !scheduled.action) return null;
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
    const stockOk = clampUnit(ctx.perCapitaStock === undefined ? 1 : ctx.perCapitaStock / 2.5, 0);
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
      const stockOk = clampUnit((ctx.perCapitaStock === undefined ? 1 : ctx.perCapitaStock) / 2.5, 0);
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
    const NON_SURVIVAL = ['craft', 'build', 'write', 'work', 'trade', 'socialize', 'court', 'accept', 'expedition', 'found'];
    if (NON_SURVIVAL.includes(candidate?.action)) score -= 5;
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

/** 把候选池重置为「生存骨架 + 当前状态可达的动态行动」（D0：行动空间地基）。 */
function refreshCandidates(agentId, tick, cfg) {
  // 行动空间关闭时保持既有行为（也不付候选重建成本）：存活骨架已在 spawnAgent 写定。
  if (cfg.actionSpaceEnabled === false) return null;
  const state = stage2.candidateStateFor(agentId, tick);
  let held = 0;
  const woodId = stage2.craftMaterialId();
  // 产出品余量（不含制作原料木头）：trade 的可售对象是劳动成果，不是生产资料。
  // 木头被 craft/build 持续消耗，用「木头>2」作判据会让 trade 永久不可达。
  let surplusItems = 0;
  try {
    const items = agent.inventory.backpack.list({ agentId }).items ?? {};
    for (const [id, n] of Object.entries(items)) {
      if (!Number.isFinite(n) || n <= 0) continue;
      if (id !== woodId) surplusItems += n;
    }
  } catch { surplusItems = 0; }
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
function decide(agentId, tick, percepts, cfg = {}) {
  refreshCandidates(agentId, tick, cfg);
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
  const origScore = new Map(anticipations.map((a) => [a.id, a.score]));
  const candidates = window.map((a) => ({ id: a.id, action: a.action, score: origScore.get(a.id) ?? 0 }));

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
        goodsPrice: (() => {
          try { return economy.market.price.query('goods').price; } catch { return 8; }
        })(),
        wage: cfg.wage,
      }) + agent.persona.personality.evaluate(agentId, candidate.action)
        + (simBy.get(candidate.id) ?? 0);
      // 习惯偏置：只抬正分（负分代表「此刻不该做」，不该被习惯翻案）。
      if (habitTotal > 0 && base > 0) {
        const ratio = (habitCounts.get(candidate.action) ?? 0) / habitTotal;
        if (ratio > 0) base *= 1 + 0.25 * ratio;
      }
      return base;
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
          // P2：采集时按概率带回木材。原实现里木头只在出生时一次性发 6 个、无任何再生途径，
          // 而 craft 耗 2 / build 耗 3 —— 制作与建造的窗口只在开局几次，之后**永久关闭**
          // （实测 t100 后 craft/build 均为 0，而抽样 12 人中 8 人木材已归零）。
          // 采集是唯一与外界的接触面，木材自此处产出才符合语义。
          const woodId = stage2.craftMaterialId();
          if (woodId !== null && rng.next() < (cfg.forageWoodChance ?? 0.25)) {
            try { agent.inventory.backpack.add({ agentId, itemId: woodId, quantity: 1 }); } catch { /* 背包满则不带回 */ }
          }
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
export async function step(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...configStore.currentDifficultyParams(), ...(config ?? {}) };
  const tick = clock.tick().tick;
  // 人口可能在上个 tick 因出生/死亡变化：先失效缓存再算采集池容量/再生。
  invalidateAlivePopulation();

  // 0) 世界采集池再生（每 tick 补充可采集总量）
  regenForagePool(cfg);

  // 1) survival：衰减 / 需求增长 / 突发事件
  const eventPercepts = runSurvival(tick, cfg);

  // 2) perception：事件转 percept 并分发给智能体
  const percepts = perception.collect(eventPercepts);
  const inbox = perception.route(percepts);

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
  for (const record of agentRecords) {
    const agentId = record.id;
    const decision = decide(agentId, tick, inbox[agentId] ?? [], cfg);
    if (decision === null) continue;
    // 有模型 E2E：模型从**居民当前可行候选集**内做选择（不新增行动、不绕过可行性）。
    if (llmDecide && llmCalls < (cfg.llmDecideMaxAgents ?? 1)) {
      llmCalls += 1;
      const picked = await decideByModel(record, decision, tick, cfg);
      if (picked !== null) {
        decision.action = picked.action;
        decision.reason = picked.reason;
        decision.llmDecide = picked.meta;
      }
    }
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
    // D0：非生存行动由居民自己发起（调用真实模块）；生存行动沿用 effectFor。
    const performed = DYNAMIC_BASE_SCORE[decision.action] !== undefined
      ? stage2.performAgentAction(tick, agentId, decision.action, cfg)
      : null;
    const op = dispatch.resolve([{
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
        const dyn = DYNAMIC_BASE_SCORE[record.action] !== undefined;
        observer.recorder.actionLog.record({
          tick,
          agentId: record.agentId,
          action: record.action,
          outcome: dyn ? { applied: performed !== null && performed.ok === true, reason: performed?.reason ?? null } : { applied: true },
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
  invalidateAlivePopulation();
  graph.__reset();
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
  // LAYA 紧迫度缓存只在 step() 内按 tick 清空；若上一局最后一 tick 的缓存留着，
  // 下一局第一 tick 的 prefetch 之前会先读到上一局的紧迫度（跨 run 泄漏）。
  layaUrgencyCache.clear();
  // 存活人口缓存：只复位了世代号而没复位值，
  // 使 reset 后首次 alivePopulation() 在世代号不匹配前可能返回上一局的人数。
  _alivePopGeneration = -1;
  _alivePopValue = 0;
  literateSet = null;
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

/** 当前观测快照（世界状态 + 资源 + 编年计数），供 api / 冒烟测试观测。 */
export function snapshot() {
  return {
    tick: clock.now().tick,
    agents: registry.lookup({ type: 'agent' }),
    world: worldState.snapshot(),
    resources: { food: survival.resources.food.query(), water: survival.resources.water.query(), energy: survival.resources.energy.query(), medical: survival.resources.medical.query() },
    chronicle: observer.chronicle.compiler.compile().counts,
    chronicleStore: observer.chronicle.store.getStats(),
    social: socialSummary(),
  };
}

export { DEFAULT_ACTIONS, DEFAULT_EVENTS, DEFAULT_TAGS };
