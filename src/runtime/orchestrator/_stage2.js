/**
 * truman-town.runtime.orchestrator 内部共享：第二阶段主循环集成 / Phase-2 Loop Integration
 * （不作为 Normify 模块暴露，同 _resource/_store/_jobs 一样是内部辅助）
 *
 * 把社交家族、经济市场、制作建造、城镇空间、健康疾病接入 loop 的每 tick 流程：
 * 生育事件（procreation）、市场交易（market）、制作行动（crafting）、
 * 居住分配（residence）、健康检查（health）均被主循环驱动，并在对应节点写
 * observer 日志（event-log / action-log，具体日志由各子系统内部或本模块补齐）。
 *
 * 对外：makeTags / seed / tick / __reset / summary。
 */

import * as social from '../../social/index.js';
import * as economy from '../../economy/index.js';
import * as agent from '../../agent/index.js';
import * as town from '../../town/index.js';
import * as survival from '../../survival/index.js';
import * as observer from '../../observer/index.js';
import * as rng from '../../infra/rng.js';
import * as graph from '../../infra/store/graph.js';
import * as configStore from '../../infra/config.js';


const RESIDENCE_ID = 'dorm_a';
const SYMBOL = 'food';

// 独立于全局 rng 的平台随机源：社交平台消费自有随机流，避免扰动既有经济/生存分叉。
// onAdvance 回调把闭包累加器同步到 platformGenState——存档要的是**流位置**，
// 不只是种子；没有这个回调，恢复后平台随机序列会从头重放。
function mulberry32(a, onAdvance) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    if (onAdvance !== undefined) onAdvance(a);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}
let platformGenState = 0x9e3779b9 >>> 0;
let platformGen = mulberry32(platformGenState, (a) => { platformGenState = a; });
function platformSeed(seedValue) {
  platformGenState = hashSeed('platform:' + String(seedValue ?? 0));
  platformGen = mulberry32(platformGenState, (a) => { platformGenState = a; });
}
function platformGenState_() { return platformGenState >>> 0; }
function platformGenRestore_(pos) {
  platformGenState = Number.isInteger(pos) ? (pos >>> 0) : 0x9e3779b9 >>> 0;
  platformGen = mulberry32(platformGenState, (a) => { platformGenState = a; });
}
function prFloat(min, max) {
  return min + platformGen() * (max - min);
}
function prShuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(platformGen() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 阶段二模块级状态（由 __reset 清空）。 */
let seeded = false;
/** @type {Map<string, string>} agentId → accountId */
let accounts = new Map();
/** 当前存活居民 id 列表（每 tick 由 tick() 刷新，供候选状态与互动对象选取使用）。 */
let settledAgentIds = [];
/**
 * P1：恋爱/配对状态的内存索引（O(1) 查询，避免逐 agent 扫图）。
 * pendingCourts: 被表白者 → 表白者列表；pairedIndex: agentId → 伴侣 id。
 * 这两个索引让「谁和谁配对」由居民的双向决策（court/accept）决定，而不是代码配对。
 */
const pendingCourts = new Map();
const pairedIndex = new Map();
/** @type {Set<string>} 已生育的配对键（排序 a:b，防重复生育） */
const reproducedPairs = new Set();
let childrenBorn = 0;
/** @type {Record<string, string>} itemIds / recipeIds */
let itemIds = {};
let tradeCount = 0;
let craftCount = 0;
let buildCount = 0;
let treatCount = 0;
let quarantineCount = 0;
/** 解除隔离次数：与 quarantineCount 配对，用于确认隔离是**闭环**而非只增不减。 */
let releasesCount = 0;
/** @type {string[]} 已创办企业 ID */
let businessIds = [];
let goodsProduced = 0;
let wagesPaid = 0;
let bankruptcies = 0;
let creditIssued = 0;
let interestAccrued = 0;
let taxCollected = 0;
let taxRedistributed = 0;
/** 企业能源/原料成本汇集账户（town:supply，货币守恒：企业→供应池→居民）。 */
let supplyAccountId = null;
let goodsSold = 0;
let businessRevenue = 0;
let businessCosts = 0;
let residentEnergyUsed = 0;
let industryEnergyUsed = 0;
let lossTicks = 0;
/** 批次2-D：社区发现缓存（每 N tick 重算，避免每 tick 全量重算拖慢长跑） */
let lastCommunityTick = -1;
let communitySnapshot = null;
/** 批次2-E：社交平台与声誉累计 */
let postCount = 0;
let replyCount = 0;
let reactCount = 0;
let reputationTriageSwaps = 0;
/** 声誉分诊治疗者的声誉得分合计（消融观测：开/关声誉分诊时被治疗者声誉构成不同）。 */
let reputationTriageTreatedScore = 0;
let lastFeedTick = -1;
let feedSignature = [];
/** 近期帖子 ID 环形缓存（回复/点赞踩的目标池，避免每 tick 全量 list 帖子） */
let recentPostIds = [];

function sortedPairKey(a, b) {
  return a < b ? a + ':' + b : b + ':' + a;
}

/** 特有特质候选池（makeTags 用 rng 无放回抽样，使不同种子的特质结构不同）。 */
const UNIQUE_POOL = [
  'resilient', 'cautious', 'sociable', 'curious', 'hardworking',
  'stubborn', 'generous', 'greedy', 'brave', 'timid',
  'wise', 'foolish', 'kind', 'cruel', 'diligent',
  'lazy', 'loyal', 'treacherous', 'patient', 'impulsive',
];

/**
 * 生成 50 个特质标签（45 个共有 + 5 个居民特有），供 loop 播种 / 子代遗传使用。
 * @param {number} agentIndex 居民序号（用于生成唯一后缀）
 * @returns {Array<{ key: string, weight: number }>}
 */
export function makeTags(agentIndex = 0, config = {}) {
  const tagCount = (Number.isInteger(config.tagCount) && config.tagCount > 0) ? config.tagCount : 50;
  const shared = (Number.isInteger(config.sharedTagCount) && config.sharedTagCount >= 0 && config.sharedTagCount <= tagCount) ? config.sharedTagCount : 45;
  const tags = [];
  for (let i = 0; i < shared; i += 1) tags.push({ key: 'base' + i, weight: 1.0 });
  const unique = Math.max(0, tagCount - shared);
  const pool = rng.shuffle(UNIQUE_POOL);
  for (let i = 0; i < unique; i += 1) tags.push({ key: pool[i % pool.length], weight: rng.float(0.5, 1.0) });
  return tags;
}

/**
 * 一次性初始化：生成初始避难所 + 分配住所 + 开户 + 挂市场价 + 定义配方材料 +
 * 播种初始感染。返回初始化摘要。
 * @param {Array<{ id: string }>} agents 初始居民
 * @param {object} [config]
 * @returns {object}
 */
export function seed(agents, config = {}) {
  // 与 loop.step 一致的配置合并（DEFAULTS + 难度档位 + 显式覆盖），
  // 避免 seed 用硬编码回退值而 step 用 DEFAULTS，造成两侧参数不一致。
  config = { ...configStore.defaults(), ...configStore.currentDifficultyParams(), ...(config ?? {}) };
  setFoundConfig(config);
  platformSeed(config.seed);
  seeded = true;
  accounts = new Map();
  reproducedPairs.clear();
  childrenBorn = 0;
  tradeCount = 0;
  craftCount = 0;
  buildCount = 0;
  treatCount = 0;
  quarantineCount = 0;
  releasesCount = 0;
  businessIds = [];
  goodsProduced = 0;
  wagesPaid = 0;
  bankruptcies = 0;
  creditIssued = 0;
  interestAccrued = 0;
  taxCollected = 0;
  taxRedistributed = 0;
  supplyAccountId = null;
  goodsSold = 0;
  businessRevenue = 0;
  businessCosts = 0;
  residentEnergyUsed = 0;
  industryEnergyUsed = 0;
  lossTicks = 0;
  lastCommunityTick = -1;
  communitySnapshot = null;
  postCount = 0;
  replyCount = 0;
  reactCount = 0;
  reputationTriageSwaps = 0;
  reputationTriageTreatedScore = 0;
  lastFeedTick = -1;
  feedSignature = [];
  recentPostIds = [];

  // 0) survival：初始储备**按人口计价**。
  // 原实现用资源的固定默认值（food/water 各 100），在 50 人时只够撑约 10 tick：
  // 50 人集中饮水每 tick 消耗十余单位，库存很快归零；而 effectFor 的守卫是
  // 「consume 成功才降需求」，库存为 0 时 consume 返回 0 → 需求不再下降 →
  // 需求涨到 1.0 触发饥饿/脱水死亡（实测 seed42+50人：t18~25 死亡 11 人，
  // 死因 dehydration 而当时水库存已回升到 99——死亡发生在开局的储备枯竭窗口）。
  // 避难所的储备本就应与它供养的居民数相称。
  const perCapitaReserve = (typeof config.initialReservePerCapita === 'number' && config.initialReservePerCapita >= 0)
    ? config.initialReservePerCapita : 4;
  const capacityPerCapita = (typeof config.reserveCapacityPerCapita === 'number' && config.reserveCapacityPerCapita >= 0)
    ? config.reserveCapacityPerCapita : 4;
  const n = Math.max(1, agents.length);
  // 容量必须同步放大，否则储量被 capacity=100 截断（produce 会 clamp 到容量）。
  const capacity = Math.max(100, Math.round(capacityPerCapita * n));
  const reserve = Math.max(100, Math.round(perCapitaReserve * n));
  survival.resources.food.__reset();
  survival.resources.water.__reset();
  survival.resources.food.configure({ capacity, stockpile: reserve });
  survival.resources.water.configure({ capacity, stockpile: reserve });

  // 1) town：初始避难所 + 居住分配
  const shelter = town.building.structure.spawnShelter();
  for (const a of agents) {
    town.residence.move_in({ agentId: a.id, residenceId: RESIDENCE_ID });
  }

  // 2) economy：开户 + 初始价格
  const balance = (typeof config.balance === 'number' && config.balance >= 0) ? config.balance : 500;
  for (const a of agents) {
    const acct = economy.ledger.account.open({ ownerId: a.id, balance });
    accounts.set(a.id, acct.accountId);
  }
  const priceValue = (typeof config.price === 'number' && config.price > 0) ? config.price : 4;
  economy.market.price.update({ symbol: SYMBOL, price: priceValue });

  // 3) crafting：物品 + 配方 + 材料 + 学习
  itemIds = {
    wood: agent.inventory.item.define({ category: 'material', name: '木头' }).id,
    metal: agent.inventory.item.define({ category: 'material', name: '金属' }).id,
    axe: agent.inventory.item.define({ category: 'tool', name: '石斧' }).id,
    // 探索掉落物必须**注册进目录**，否则 backpack.add 会抛「未定义的物品」。
    // 实测（P3）：探索 285 次全部「有拾获但装不下」——真因不是背包满，而是这 6 种
    // 物资从未 define，add 抛错被 catch 后误报为容量不足。
    // 教训：catch 里把两类不同错误合并成一个原因是错的，会把诊断引向错误方向。
    scrap: agent.inventory.item.define({ category: 'material', name: '废金属' }).id,
    cloth: agent.inventory.item.define({ category: 'material', name: '布料' }).id,
    circuit: agent.inventory.item.define({ category: 'component', name: '电路板' }).id,
    medicine: agent.inventory.item.define({ category: 'consumable', name: '药品' }).id,
    seed: agent.inventory.item.define({ category: 'material', name: '种子' }).id,
    fuel: agent.inventory.item.define({ category: 'consumable', name: '燃料' }).id,
  };
  agent.crafting.recipe.define({
    id: 'axe', name: '石斧', kind: 'item',
    materials: { [itemIds.wood]: 2 }, ticks: 2,
    output: { itemId: itemIds.axe, quantity: 1 },
  });
  agent.crafting.recipe.define({
    id: 'barn', name: '谷仓', kind: 'building',
    materials: { [itemIds.wood]: 3 }, ticks: 2,
    output: { buildingId: 'barn', name: '谷仓' },
  });
  for (const a of agents) {
    agent.inventory.backpack.add({ agentId: a.id, itemId: itemIds.wood, quantity: 6 });
    agent.crafting.recipe.learn({ agentId: a.id, recipeId: 'axe' });
  }

  // 4) health：播种 2 例初始感染（触发疫情检测/隔离/治疗全链路）
  if (agents.length >= 2) {
    survival.health.disease.infect({ agentId: agents[0].id, diseaseId: 'flu', severity: 0.5, tick: 0 });
    survival.health.disease.infect({ agentId: agents[1].id, diseaseId: 'flu', severity: 0.6, tick: 0 });
  }

  // 5) industry：能源库存 + 商品价 + 创办企业 + 雇佣（产业经济闭环）
  survival.resources.energy.__reset();
  const goodsPrice = (typeof config.goodsPrice === 'number' && config.goodsPrice > 0) ? config.goodsPrice : 8;
  economy.market.price.update({ symbol: 'goods', price: goodsPrice });
  const wage = (typeof config.wage === 'number' && config.wage >= 0) ? config.wage : 3;
  // **不再由代码代居民创办企业**（D2）。
  // 此前这里按 config.businessCount 固定创办 2 家（固定创始人 agents[i%n]、
  // 固定行业 food/tools），使 businesses 跨种子恒为 2、企业出生无法涌现。
  // 现在企业只能由居民在决策环里选择 found 行动而诞生（见 performAgentAction 的 found 分支），
  // 资本来自其自有账户、行业由其 id 哈希决定，因此跨种子会自然分化。
  // 雇佣同样不再预先安排：没有企业时 businessIds 为空，下面的循环自然空转；
  // 居民创办企业后由同一循环在后续 tick 收编（见 runIndustry 的雇佣补充）。
  for (let i = 0; i < businessIds.length && agents.length > 2; i += 1) {
    const emp = agents[(i + 2) % agents.length];
    economy.industry.labour.hire({ businessId: businessIds[i], agentId: emp.id, wage, role: 'worker' });
  }

  // 6) bank + tax：开设金库/税收池，向首家企业发放示范贷款（真实转账，不造钱）
  const bankCapital = (typeof config.bankCapital === 'number' && config.bankCapital >= 0) ? config.bankCapital : 500;
  const creditRate = (typeof config.creditRate === 'number' && config.creditRate >= 0) ? config.creditRate : 0.01;
  const loanPrincipal = (typeof config.loanPrincipal === 'number' && config.loanPrincipal >= 0) ? config.loanPrincipal : 100;
  economy.bank.credit.open({ capital: bankCapital });
  economy.tax.open({});
  const supplyAcct = economy.ledger.account.open({ ownerId: 'town:supply', balance: 0 });
  supplyAccountId = supplyAcct.accountId;
  if (businessIds.length > 0 && loanPrincipal > 0) {
    for (const bid of businessIds) {
      try {
        const loan = economy.bank.credit.apply({ borrowerId: bid, borrowerType: 'business', principal: loanPrincipal, rate: creditRate, term: 0, tick: 0 });
        creditIssued += loan.principal;
      } catch { /* 金库未开或账户不可用则跳过 */ }
    }
  }

  // 7) family：初始居民分组成创始家族（批次2-D 家族登记真实接入的播种入口）
  const familySeed = bootstrapFamilies(agents, config);

  return {
    shelter: shelter.length,
    residences: agents.length,
    accounts: agents.length,
    price: priceValue,
    goodsPrice,
    businesses: businessIds.length,
    families: familySeed.families,
    itemIds: { ...itemIds },
  };
}

/** 批次2-D：初始居民分组成创始家族（家族登记真实接入的播种入口，跨种子分叉来源之一）。 */
/** 本地确定性 PRNG（字符串哈希 + mulberry32），不消耗共享 rng，避免扰动经济/生存随机序列。 */
function hashStr(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry(seedNum) {
  let a = seedNum >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bootstrapFamilies(agents, config = {}) {
  if (agents.length < 2) return { families: 0 };
  // 用独立随机源做创始家族分组（跨种子分叉，但不消耗共享 rng）
  const rnd = mulberry(hashStr(String(config.seed ?? 0) + ':family'));
  const ids = agents.map((a) => a.id);
  const shuffled = ids.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const groupSize = 3 + Math.floor(rnd() * 4);
  let created = 0;
  for (let i = 0; i < shuffled.length; i += groupSize) {
    const group = shuffled.slice(i, i + groupSize);
    if (group.length === 0) continue;
    const founder = group[0];
    const fam = social.family.registry.create({
      name: '创始家族' + (created + 1),
      founder,
      members: group,
      generation: { 0: group },
      tick: 0,
    });
    social.family.chronicle.append({ familyId: fam.familyId, event: 'founding', tick: 0, actor: founder, detail: { members: group.length } });
    for (const m of group) {
      social.family.lineage.register({ agentId: m, familyId: fam.familyId, parents: [], generation: 0 });
      agent.persona.identity.update(m, { familyId: fam.familyId });
      if (m !== founder) {
        social.graph.edges.create({ a: founder, b: m, type: 'family', weight: 1, note: '创始家族' });
      }
    }
    created += 1;
  }
  return { families: created };
}

/** 取某居民的标签键集合（无标签集时为空数组）。 */
function tagKeysOf(agentId) {
  try {
    const ts = agent.traits.tagset.store.get(agentId);
    return (ts?.tags ?? []).map((t) => t.key);
  } catch { return []; }
}

/**
 * 三代未遗失 → 固化为家族特质（最多 5 个）。
 *
 * 修复前这条链路**完全没接进运行时**：detector 与 enforcer 只有单元测试，
 * 没有任何调用点，于是「三代未遗失即固化为家族特质」从未发生过（实测各家族
 * 特质数恒为 0）；offspring.request 虽然接受 familyTraits 参数，
 * runProcreation 却从不传 —— 即使固化过也不会遗传给后代。
 *
 * 代际标签取自 registry 的 generation 映射（create/addMember 维护），
 * 而不是 lineage 节点：入赘/外嫁的配偶不会出现在 lineage 的 familyId 分组里，
 * 用它当第 0 代会漏掉一半祖先。
 */
function fixedFamilyTraits(familyId, tick) {
  const fam = social.family.registry.lookup({ familyId });
  const existing = social.family.trait.enforcer.list(familyId).map((t) => t.key);
  if (!fam) return existing;
  const gens = fam.generation ?? {};
  const ordered = Object.keys(gens)
    .map(Number)
    .sort((a, b) => a - b)
    .map((g) => (gens[g] ?? []).flatMap((id) => tagKeysOf(id)));
  if (ordered.length < 3) return existing;
  let survived = [];
  try {
    survived = social.family.trait.detector.detect(ordered)
      .filter((r) => r.survived)
      .map((r) => r.tagKey);
  } catch { return existing; }
  if (survived.length === 0) return existing;
  const merged = [...new Set([...existing, ...survived])].slice(0, social.family.trait.enforcer.limit());
  if (merged.length === existing.length) return existing;
  social.family.trait.enforcer.set({ familyId, traits: merged });
  observer.recorder.eventLog.record({
    tick,
    topic: 'social.family.trait.fixed',
    payload: { familyId, traits: merged, generation: ordered.length },
  });
  return merged;
}

/** 生育：找最契合的一对 → 恋爱 → 子代 → 谱系 → 注册进主循环。 */
function runProcreation(tick, agents, spawnChild, config = {}) {
  // 上限可配：此前硬编码为 2，于是**每次运行最多出生 2 人**，
  // 家族永远停在「一对夫妻 + 两个孩子」，第二代（更不用说第三代）不可能出现，
  // 「三代未遗失固化为家族特质」这条设计因此不可达。
  const maxChildren = Number.isFinite(config.maxChildrenPerRun) && config.maxChildrenPerRun >= 0
    ? config.maxChildrenPerRun
    : 8;
  const result = { childId: null, parents: null, familyId: null };
  if (childrenBorn >= maxChildren || agents.length < 2) return result;

  // P1：婚配**只**来自居民的双向决策（court → accept，见 performAgentAction）。
  // 此前由 match.pair(code 匹配) + rng.shuffle 直接选出婚配对，并在这里替居民
  // 走完 propose→accept，因此夫妻与家族结构与居民选择无关。
  const seen = new Set();
  const couples = [];
  for (const [x, y] of pairedIndex) {
    const key = sortedPairKey(x, y);
    if (seen.has(key)) continue;
    seen.add(key);
    couples.push({ a: x, b: y });
  }
  if (couples.length === 0) return result;

  // 随机化顺序并跳过已生育过的配对（防同一对反复繁殖 + 让种子产生结构差异）
  let pair = null;
  for (const c of rng.shuffle(couples)) {
    if (!reproducedPairs.has(sortedPairKey(c.a, c.b))) { pair = c; break; }
  }
  if (pair === null) return result;
  reproducedPairs.add(sortedPairKey(pair.a, pair.b));

  childrenBorn += 1;
  // 批次2-D：家族登记（registry 成为 lineage 的上层组织）+ 编年史 + 关系边
  //
  // 修复：此前**每出生一个孩子就新建一个家族**，且代际硬编码为 {0:[夫妻]}、
  // 孩子固定记为第 1 代。于是每个家族永远只有两代、只生一个孩子，
  // 「三代未遗失」的判定条件在结构上就不可达（实测各家族代数恒为 {0:…,1:…}）。
  // 现在：任一方已属某家族时，子代**并入该家族**并记为父代代际 + 1。
  const lineA = social.family.lineage.trace({ agentId: pair.a });
  const lineB = social.family.lineage.trace({ agentId: pair.b });
  const parentFamily = lineA?.familyId ?? lineB?.familyId ?? null;
  const childGeneration = Math.max(lineA?.generation ?? 0, lineB?.generation ?? 0) + 1;

  let familyId;
  if (parentFamily !== null) {
    familyId = parentFamily;
    social.family.registry.addMember({ familyId, memberId: pair.a, generation: lineA?.generation ?? 0 });
    social.family.registry.addMember({ familyId, memberId: pair.b, generation: lineB?.generation ?? 0 });
  } else {
    const fam = social.family.registry.create({
      name: '家族' + childrenBorn,
      founder: pair.a,
      members: [pair.a, pair.b],
      generation: { 0: [pair.a, pair.b] },
      tick,
    });
    familyId = fam.familyId;
  }
  // 生育**之前**结算家族特质：此时家族已有的代际是完整的历史，
  // 新生的这一代要继承的是「上一代为止已固化的特质」。
  const familyTraits = fixedFamilyTraits(familyId, tick);
  const child = social.procreation.offspring.request({
    a: pair.a, b: pair.b, familyId, familyTraits, name: '新生儿' + familyId,
  });
  social.family.lineage.register({
    agentId: child.id, familyId, parents: [pair.a, pair.b], generation: childGeneration,
  });
  social.family.registry.addMember({ familyId, memberId: child.id, generation: childGeneration });
  social.family.chronicle.append({ familyId, event: 'founding', tick, actor: pair.a, detail: { spouse: pair.b } });
  social.family.chronicle.append({ familyId, event: 'birth', tick, actor: child.id, detail: { parents: [pair.a, pair.b] } });
  social.graph.edges.create({ a: pair.a, b: pair.b, type: 'romance', weight: 1, note: '婚配' });
  social.graph.edges.create({ a: pair.a, b: child.id, type: 'family', weight: 1, note: '亲子' });
  social.graph.edges.create({ a: pair.b, b: child.id, type: 'family', weight: 1, note: '亲子' });
  spawnChild(child);

  // 批次2-A：子代特质可遗传变异 + 身份（家庭归属）+ 择偶相似度观测
  const mutateRate = (typeof config.traitMutateRate === 'number' && config.traitMutateRate >= 0 && config.traitMutateRate <= 1) ? config.traitMutateRate : 0.02;
  try {
    agent.traits.evolution.mutate({ agentId: child.id, rate: mutateRate });
  } catch { /* 无标签集则跳过 */ }
  agent.persona.identity.update(child.id, { familyId, parents: [pair.a, pair.b] });
  agent.persona.identity.update(pair.a, { spouseId: pair.b });
  agent.persona.identity.update(pair.b, { spouseId: pair.a });
  const sim = agent.traits.tagset.similarity.compare({ a: pair.a, b: pair.b });

  observer.recorder.eventLog.record({
    tick,
    topic: 'social.procreation',
    payload: {
      a: pair.a, b: pair.b, childId: child.id, familyId,
      similarity: sim.similarity,
      generation: childGeneration,
      familyTraits: familyTraits.map((t) => (typeof t === 'string' ? t : t.key)),
    },
  });

  result.childId = child.id;
  result.parents = [pair.a, pair.b];
  result.familyId = familyId;
  return result;
}

/** 市场：挂买卖单 → 撮合 → 结算 → 写交易事件日志。 */
function runMarket(tick, agents, config = {}) {
  const result = { trades: 0 };
  if (agents.length < 2) return result;
  const ids = agents.map((a) => a.id);
  const seller = rng.choice(ids);
  const buyer = rng.choice(ids.filter((id) => id !== seller));
  const sellerAcct = accounts.get(seller);
  const buyerAcct = accounts.get(buyer);
  if (!sellerAcct || !buyerAcct) return result;
  const priceValue = (typeof config.price === 'number' && config.price > 0) ? config.price : 4;
  const quantity = rng.int(1, 3);

  try {
    economy.market.orderbook.orders.place({ side: 'sell', symbol: SYMBOL, price: priceValue, quantity, accountId: sellerAcct });
    economy.market.orderbook.orders.place({ side: 'buy', symbol: SYMBOL, price: priceValue, quantity, accountId: buyerAcct });
    const matched = economy.market.orderbook.matching.match({ symbol: SYMBOL });
    const receipts = economy.market.orderbook.matching.settle({ trades: matched });
    for (const r of receipts) {
      tradeCount += 1;
      observer.recorder.eventLog.record({
        tick,
        topic: 'economy.trade',
        payload: { symbol: SYMBOL, amount: r.receipt.amount, price: economy.market.price.quote({ symbol: SYMBOL }) },
      });
    }
    result.trades = receipts.length;
    if (receipts.length > 0) {
      social.graph.edges.create({ a: seller, b: buyer, type: 'trade', weight: 0.1, note: '交易' });
    }
  } catch {
    // 余额不足等，跳过本 tick 交易
  }
  return result;
}

/**
 * 产业经济每 tick：生产（消耗能源）→ 供需随机定价 → 卖给真实买方（居民付款转账）→
 * 支付成本（能源 + 原料采购 → 供应池；工资 → 员工，均经 ledger.transaction 真实转账）→
 * 破产检查。能源消耗与存活人口挂钩（居民取暖/照明/制作 + 工业生产），无固定回路印钞。
 */
function runIndustry(tick, agents, config = {}) {
  const result = { produced: 0, revenue: 0, costs: 0, wages: 0, sold: 0, bankruptcies: 0 };
  if (businessIds.length === 0) return result;

  const baseGoodsPrice = (typeof config.goodsPrice === 'number' && config.goodsPrice > 0) ? config.goodsPrice : 8;
  const productionOutput = (Number.isInteger(config.productionOutput) && config.productionOutput >= 0) ? config.productionOutput : 2;
  const energyInput = (typeof config.energyInput === 'number' && config.energyInput >= 0) ? config.energyInput : 2;
  const energyPrice = (typeof config.energyPrice === 'number' && config.energyPrice >= 0) ? config.energyPrice : 2;
  const rawInput = (typeof config.rawInput === 'number' && config.rawInput >= 0) ? config.rawInput : 2;
  const rawPrice = (typeof config.rawPrice === 'number' && config.rawPrice >= 0) ? config.rawPrice : 1;
  const energyRegen = (typeof config.energyRegen === 'number' && config.energyRegen >= 0) ? config.energyRegen : 20;
  const residentEnergyUse = (typeof config.residentEnergyUse === 'number' && config.residentEnergyUse >= 0) ? config.residentEnergyUse : 0.2;
  const goodsDemandPerCapita = (typeof config.goodsDemandPerCapita === 'number' && config.goodsDemandPerCapita >= 0) ? config.goodsDemandPerCapita : 0.3;
  const priceVolatility = (typeof config.priceVolatility === 'number' && config.priceVolatility >= 0) ? config.priceVolatility : 0.4;
  const bankruptcyThreshold = (typeof config.bankruptcyThreshold === 'number' && config.bankruptcyThreshold >= 0) ? config.bankruptcyThreshold : 10;

  // 1) 能源：居民取暖/照明/制作等行为真实消耗（与存活人数相关），发电站再补充供给
  const alive = agents.length;
  const residentDemand = alive * residentEnergyUse;
  survival.resources.energy.consume(residentDemand);
  residentEnergyUsed += residentDemand;
  survival.resources.energy.produce(energyRegen);

  // 2) 供需随机定价（价格波动 → 涌现性 + 企业余额非单调）
  const goodsPrice = baseGoodsPrice * (1 + (rng.float(0, 1) * 2 - 1) * priceVolatility);
  economy.market.price.update({ symbol: 'goods', price: goodsPrice });

  const activeIds = businessIds.filter((id) => {
    const biz = economy.industry.business.list().find((b) => b.businessId === id);
    return biz !== undefined && biz.status === 'active';
  });
  if (activeIds.length === 0) return result;

  // 招募：新创办的企业需要工人。
  // 此前雇佣只在 seed 阶段按固定数组跑一次，而那时企业数为 0（改为居民自办后），
  // 于是企业成了「无人工厂」——goodsProduced 很大而 wagesPaid 恒为 0。
  // 现在由企业主在每 tick 招募：优先雇没有自己企业、也未被雇的居民，
  // 且只在企业账户付得起一轮工资时才雇（避免注定欠薪的用工）。
  for (const businessId of activeIds) {
    try {
      const biz = economy.industry.business.list().find((b) => b.businessId === businessId);
      if (biz === undefined || (biz.employees ?? []).length > 0) continue;
      const wageOffered = (typeof config.wage === 'number' && config.wage >= 0) ? config.wage : 3;
      const bizBal = economy.ledger.account.balance(biz.accountId) ?? 0;
      // 付得起 4 轮工资才雇：避免注定欠薪的用工（欠薪会让工资永远发不出）。
      if (bizBal < wageOffered * 4) continue;
      const started = cacheStartedIds();
      const hiredNow = new Set();
      for (const id of activeIds) {
        for (const e of economy.industry.labour.staff(id)) hiredNow.add(e.agentId);
      }
      const candidate = agents.find((a) => a.id !== biz.founderId
        && !started.has(a.id) && !hiredNow.has(a.id));
      if (candidate === undefined) continue;
      economy.industry.labour.hire({ businessId, agentId: candidate.id, wage: wageOffered, role: 'worker' });
      observer.recorder.eventLog.record({
        tick, topic: 'economy.industry.labour.hire',
        payload: { businessId, agentId: candidate.id, wage: wageOffered },
      });
    } catch { /* 招募失败不阻塞本 tick */ }
  }

  // 候选买方：有账户且余额够买 1 件商品的居民
  const buyerPool = agents
    .map((a) => accounts.get(a.id))
    .filter((acctId) => acctId && (economy.ledger.account.balance(acctId) ?? 0) >= goodsPrice);

  // 需求内生：只有**闲钱**才用于消费。
  // 此前 demandRemaining = alive × goodsDemandPerCapita 是常数（50×0.12=6 件/tick），
  // 与居民实际财富无关，于是市场容量恒为 1 家：三种子的 businesses 恒等于 2，
  // 企业出生无法涌现（涌现性断言因此长期失败）。
  // 现在：居民按「财富超出保留额的部分」产生消费能力，再由消费能力折算需求——
  // 谁赚了钱、赚了多少，市场就多大。这让市场容量成为**内生变量**。
  // 不乘随机波动以外的外生因子，避免重新引入与财富无关的固定容量。
  const reservePerAgent = (typeof config.consumptionReserve === 'number' && config.consumptionReserve >= 0)
    ? config.consumptionReserve : 400;
  let disposable = 0;
  for (const a of agents) {
    const acctId = accounts.get(a.id);
    if (acctId === undefined) continue;
    let bal = 0;
    try { bal = economy.ledger.account.balance(acctId) ?? 0; } catch { bal = 0; }
    if (bal > reservePerAgent) disposable += bal - reservePerAgent;
  }
  // 闲钱 → 需求：每 goodsPrice×demandPerCapitaDollars 元闲钱支持 1 件需求。
  // 用商品价格归一，使涨价自然抑制需求（真实的价格弹性）。
  const spendPerGood = Math.max(1, goodsPrice);
  const demandFromWealth = (disposable / spendPerGood) * goodsDemandPerCapita;
  // 注意：**不调用 rng.float()**。此前这里乘了 rng.float(0.5,1.5)，
  // 而 rng 是全局流——每 tick 每局都多推进一步随机数，
  // 使采集产出、疾病、事件等**所有后续随机序列整体错位**，
  // 表现为存活率从 50/50 崩到 0/50 却找不到直接原因。
  // 教训：不要在高频路径上无理由消耗全局随机流；需求已有财富内生性，
  // 随机波动交给价格（priceVolatility）承担即可。
  const demandJitter = 1;
  let demandRemaining = Math.max(0, Math.round(demandFromWealth * demandJitter));
  let tickLoss = false;

  for (const businessId of activeIds) {
    // a) 生产（消耗能源，产出进入企业库存；产出量带随机波动 → 涌现性）
    const outputTarget = Math.max(1, Math.round(productionOutput * rng.float(0.6, 1.4)));
    let produced = 0;
    let energyConsumed = 0;
    try {
      const plan = economy.industry.production.plan({ businessId, output: outputTarget, energyInput, foodInput: 0 });
      const out = economy.industry.production.output({ planId: plan.planId });
      produced = out.goods;
      energyConsumed = out.energyConsumed;
      result.produced += produced;
      goodsProduced += produced;
      industryEnergyUsed += energyConsumed;
      if (produced > 0) {
        observer.recorder.eventLog.record({ tick, topic: 'economy.industry.production', payload: { businessId, goods: produced } });
      }
    } catch { /* 企业不可用则跳过 */ }

    // 重新读取企业（拿到生产后的最新库存）
    const current = economy.industry.business.list().find((b) => b.businessId === businessId);
    if (current === undefined) continue;
    const bizAccountId = current.accountId;

    // b) 交易：库存卖给真实买方（居民付款，真实转账；未售出留库）
    const inventory = current.inventory?.goods ?? 0;
    const demand = Math.min(demandRemaining, inventory);
    const buyers = rng.shuffle(buyerPool).slice(0, demand).map((acctId) => ({ accountId: acctId, quantity: 1 }));
    let sold = 0;
    let revenue = 0;
    if (buyers.length > 0) {
      try {
        const op = economy.industry.business.operate({ businessId, goodsPrice, buyers });
        sold = op.sold;
        revenue = op.revenue;
      } catch { /* 跳过 */ }
    }
    demandRemaining = Math.max(0, demandRemaining - sold);
    result.sold += sold;
    result.revenue += revenue;
    goodsSold += sold;
    businessRevenue += revenue;
    if (sold > 0) {
      tradeCount += 1;
      observer.recorder.eventLog.record({ tick, topic: 'economy.industry.sale', payload: { businessId, sold, revenue, price: goodsPrice } });
      // 声誉反馈（经济侧）：履约购买 / 交付商品 → 声誉上升（读 economy.ledger.transaction 数据流）
      const repPurchaseGain = (typeof config.reputationPurchaseGain === 'number' ? config.reputationPurchaseGain : 0.1);
      const repSaleGain = (typeof config.reputationSaleGain === 'number' ? config.reputationSaleGain : 0.5);
      const soldBuyerAccounts = buyers.slice(0, sold).map((b) => b.accountId);
      for (const acctId of soldBuyerAccounts) {
        const buyerAgentId = agentIdByAccount(acctId);
        if (buyerAgentId) {
          try { social.reputation.update({ agentId: buyerAgentId, delta: repPurchaseGain, reason: 'purchase', tick }); } catch { /* 忽略 */ }
        }
      }
      if (current.founderId) {
        try { social.reputation.update({ agentId: current.founderId, delta: repSaleGain * sold, reason: 'sale', tick }); } catch { /* 忽略 */ }
      }
    }

    // c) 成本：能源成本 + 原料采购成本（真实转账 → 供应池，不凭空造钱）
    let costs = 0;
    if (supplyAccountId !== null) {
      const energyCost = energyConsumed * energyPrice;
      const rawCost = rawInput * rawPrice;
      if (energyCost > 0) {
        try {
          economy.ledger.transaction.recorder.post({ from: bizAccountId, to: supplyAccountId, amount: energyCost, ref: 'energy_cost', memo: '能源成本' });
          costs += energyCost;
        } catch { /* 余额不足则欠付 */ }
      }
      if (rawCost > 0) {
        try {
          economy.ledger.transaction.recorder.post({ from: bizAccountId, to: supplyAccountId, amount: rawCost, ref: 'raw_cost', memo: '原料采购' });
          costs += rawCost;
        } catch { /* 余额不足则欠付 */ }
      }
    }
    result.costs += costs;
    businessCosts += costs;

    // d) 发薪（真实转账，余额不足欠薪，不产生负余额）
    try {
      const paid = economy.industry.labour.pay({ businessId });
      const amount = paid.paid.reduce((s, p) => s + p.amount, 0);
      result.wages += amount;
      wagesPaid += amount;
      if (amount > 0) {
        observer.recorder.eventLog.record({ tick, topic: 'economy.industry.labour.pay', payload: { businessId, amount } });
      }
    } catch { /* 跳过 */ }

    // 记录亏损 tick：本 tick 收入 < 成本 + 应发工资（"企业可亏损"证据）
    const wageDue = (current.employees ?? []).reduce((s, emp) => s + (emp.wage ?? 0), 0);
    if (revenue < costs + wageDue) tickLoss = true;
  }

  if (tickLoss) lossTicks += 1;

  // e) 破产检查 + 清算（清算将库存卖给市场对手方/核销，不凭空造钱）
  for (const businessId of activeIds) {
    const biz = economy.industry.business.list().find((b) => b.businessId === businessId);
    if (biz === undefined) continue;
    const balance = economy.ledger.account.balance(biz.accountId);
    if (biz.status === 'insolvent' || (balance !== undefined && balance <= bankruptcyThreshold)) {
      const filed = economy.bankruptcy.file({ subjectId: businessId, subjectType: 'business', threshold: bankruptcyThreshold });
      if (filed.filed) {
        economy.bankruptcy.liquidate({ caseId: filed.caseId, goodsPrice });
        bankruptcies += 1;
        result.bankruptcies += 1;
        observer.recorder.eventLog.record({ tick, topic: 'economy.bankruptcy', payload: { businessId, balance } });
        // 声誉反馈（经济侧）：违约/破产 → 创始人声誉下降
        if (biz.founderId) {
          const repPenalty = (typeof config.reputationDefaultPenalty === 'number' ? config.reputationDefaultPenalty : 5);
          try { social.reputation.update({ agentId: biz.founderId, delta: -repPenalty, reason: 'bankruptcy', tick }); } catch { /* 忽略 */ }
        }
      }
    }
  }

  return result;
}

/**
 * 财政经济每 tick：对全部在途贷款计息（债务增长，不触碰账户余额），
 * 并按周期征税（余额税率）与再分配（按人头），均经 ledger 真实转账。
 */
function runFiscal(tick, agents, config = {}) {
  const result = { creditIssued: 0, interestAccrued: 0, taxCollected: 0, taxRedistributed: 0 };
  const interestMode = config.interestMode === 'compound' ? 'compound' : 'simple';
  const creditRate = (typeof config.creditRate === 'number' && config.creditRate >= 0) ? config.creditRate : 0.01;
  const taxRate = (typeof config.taxRate === 'number' && config.taxRate >= 0 && config.taxRate <= 1) ? config.taxRate : 0.002;
  const taxInterval = (Number.isInteger(config.taxInterval) && config.taxInterval > 0) ? config.taxInterval : 20;

  // 1) 每 tick 计息（声誉反馈：高声誉借款人享受更低利率，声誉被读取并影响经济路径）
  const repCreditEnabled = config.reputationCreditEnabled !== false;
  let accruals;
  if (repCreditEnabled) {
    const bizByBorrower = new Map(economy.industry.business.list().map((b) => [b.businessId, b]));
    accruals = economy.bank.credit.list()
      .filter((loan) => loan.status === 'active')
      .map((loan) => {
        const biz = bizByBorrower.get(loan.borrowerId);
        const founderId = biz ? biz.founderId : null;
        const score = founderId ? social.reputation.query({ agentId: founderId }).score : 50;
        return economy.bank.interest.accrue({ loanId: loan.loanId, mode: interestMode, rate: creditRate * reputationCreditMultiplier(score, config), tick });
      });
  } else {
    accruals = economy.bank.interest.accrueAll({ mode: interestMode, rate: creditRate, tick });
  }
  result.interestAccrued = accruals.reduce((s, a) => s + a.interest, 0);
  interestAccrued += result.interestAccrued;

  // 2) 按周期征税与再分配
  if (tick > 0 && tick % taxInterval === 0) {
    try {
      const collected = economy.tax.collect({ rate: taxRate, base: 'balance', tick });
      result.taxCollected = collected.collected;
      taxCollected += collected.collected;
    } catch { /* 池未开则跳过 */ }
    try {
      const redistributed = economy.tax.redistribute({ mode: 'per_capita', tick });
      result.taxRedistributed = redistributed.redistributed;
      taxRedistributed += redistributed.redistributed;
    } catch { /* 池未开则跳过 */ }
  }

  // 3) 供应池再分配：企业支付的能源/原料成本按人头回馈居民（货币闭环，不凭空造钱）
  const supplyInterval = (Number.isInteger(config.supplyRedistributeInterval) && config.supplyRedistributeInterval > 0) ? config.supplyRedistributeInterval : 20;
  if (supplyAccountId !== null && tick > 0 && tick % supplyInterval === 0) {
    const residents = agents.map((a) => accounts.get(a.id)).filter(Boolean);
    const pool = economy.ledger.account.balance(supplyAccountId) ?? 0;
    if (pool > 0 && residents.length > 0) {
      const share = Math.floor(pool / residents.length);
      for (let i = 0; i < residents.length && share > 0; i += 1) {
        const amount = i === residents.length - 1 ? (economy.ledger.account.balance(supplyAccountId) ?? 0) : share;
        if (amount <= 0) continue;
        try {
          economy.ledger.transaction.recorder.post({ from: supplyAccountId, to: residents[i], amount, ref: 'supply_redistribute', memo: '供应池再分配' });
        } catch { /* 余额不足则跳过 */ }
      }
    }
  }
  return result;
}

/**
 * 批次2-A：特质相似度 → 社交纽带（最相似的一对若尚无友谊则建立友谊）。
 * 供择偶/结社复用：similarity.neighbors 检索最近邻，compare 计算余弦相似度。
 */
function runSimilarityBonding(tick, agents, config = {}) {
  const result = { bonds: 0, pair: null };
  if (agents.length < 2) return result;
  const ids = agents.map((a) => a.id);
  const target = agents[0].id;
  const neighbors = agent.traits.tagset.similarity.neighbors({ agentId: target, candidates: ids, k: 1 });
  if (neighbors.length === 0) return result;
  const best = neighbors[0];
  const threshold = (typeof config.similarityBondThreshold === 'number' && config.similarityBondThreshold > 0 && config.similarityBondThreshold <= 1) ? config.similarityBondThreshold : 0.6;
  if (best.similarity > threshold && social.relationship.friendship.strength({ a: target, b: best.agentId }) === 0) {
    social.relationship.friendship.update({ a: target, b: best.agentId, delta: 0.2, note: 'similarity' });
    social.graph.edges.create({ a: target, b: best.agentId, type: 'friendship', weight: 0.8, note: 'similarity' });
    result.bonds += 1;
    result.pair = { a: target, b: best.agentId, similarity: best.similarity };
    observer.recorder.eventLog.record({
      tick,
      topic: 'social.friendship.similarity',
      payload: { a: target, b: best.agentId, similarity: best.similarity },
    });
  }
  return result;
}

/** 制作所需材料（木头）的物品 id，供 loop 组装候选状态时判断「材料是否够」。 */
export function craftMaterialId() {
  return itemIds.wood ?? null;
}

/**
 * 候选刷新所需的状态查询句柄（供 loop 组装候选状态时复用，避免 loop 直接依赖账户/企业内部结构）。
 *
 * 性能关键：本函数每 tick 每居民各调一次。若直接查 labour.staff()/business.list()，
 * 每次都会 graph.read 深拷贝整份企业数据，实测令 structuredClone 占 CPU 71.7%、
 * 主循环由 4.4s 恶化到 8.9s。因此在 tick 边界用 _candidateStateCache 缓存一次全量快照，
 * 之后按 agentId O(1) 查询（每 tick 只读一次业务图，而非 O(居民数) 次）。
 */
let _candidateStateCache = null;
let _candidateStateCacheTick = -1;

let foundCapitalConfig = null;

/** 读取每 tick 缓存里的居民余额（O(1)，避免逐次 graph.read 深拷贝）。 */
function cacheBalance(agentId) {
  if (_candidateStateCache === null) return 0;
  const b = _candidateStateCache.balances;
  if (!(b instanceof Map)) return 0;
  const v = b.get(agentId);
  return typeof v === 'number' ? v : 0;
}

/** 读取每 tick 缓存里的活跃企业数（O(1)，缓存由 candidateStateFor 填充）。 */
function cacheActiveCount() {
  return _candidateStateCache === null ? 0 : (_candidateStateCache.activeCount ?? 0);
}

/** 读取每 tick 缓存里「已创办企业的居民 id 集合」（O(1)）。 */
function cacheStartedIds() {
  return _candidateStateCache === null ? new Set() : (_candidateStateCache.startedIds ?? new Set());
}

/** 创办企业所需本金（与 performAgentAction 的 found 分支保持一致）。 */
function foundCapitalOf() {
  const c = foundCapitalConfig === null ? {} : foundCapitalConfig;
  return (Number.isInteger(c.foundCapital) && c.foundCapital > 0) ? c.foundCapital : 60;
}

/** 市场容量测算所需的三个参数（与 runIndustry 的取默认值方式保持一致）。 */
function cfgVal(key, dflt) {
  const c = foundCapitalConfig === null ? {} : foundCapitalConfig;
  const v = c[key];
  return (typeof v === 'number' && v >= 0) ? v : dflt;
}
function goodsDemandPerCapitaOf() { return cfgVal('goodsDemandPerCapita', 0.3); }
function productionOutputOf() { return cfgVal('productionOutput', 2); }
/**
 * 估算本 tick 的需求池（与 runIndustry 的内生需求同源）。
 * 闲钱超过保留额的部分才消费——市场容量因此随居民财富变化，而非固定常数。
 * 这里取期望值（略去 runIndustry 的随机波动），只用于判断市场是否还有空位。
 */
function demandPerTickEstimate() {
  const price = cfgVal('goodsPrice', 7);
  const disposable = _candidateStateCache === null ? 0 : (_candidateStateCache.disposableTotal ?? 0);
  return (disposable / Math.max(1, price)) * goodsDemandPerCapitaOf();
}

/** 由 seed 注入难度参数，供 candidateStateFor 判断「够不够本」。 */
function setFoundConfig(cfg) {
  foundCapitalConfig = cfg === undefined ? null : cfg;
}

/**
 * 创办企业的条件（纯读）。
 * 刻意只暴露「够不够本」这一个事实，不替居民判断该不该办——
 * 该不该办由 scoreAction 按需求与人格权衡。
 * @param {string} agentId
 * @returns {{ canFound: boolean, foundCapital: number }}
 */
function foundConditionsFor(agentId) {
  const capital = foundCapitalOf();
  const balance = cacheBalance(agentId);
  // 市场容量约束：需求池每 tick 只有 alive × goodsDemandPerCapita 件，
  // 而每家企业每 tick 产出 productionOutput 件。企业数超过「需求池 ÷ 单产」时，
  // 后来者必然卖不出货，只能持续亏损直至破产。
  // 实测放开创办后：50 人 200 tick 下 bankrupt=281、businessCosts=16450 而收入仅 1425，
  // 即所有企业都被超额创办挤死。
  // 因此把「市场是否还有空位」作为准入事实暴露给居民——
  // 而不是代码替居民限制数量（居民仍可无视它去冒险，只是评分会很低）。
  // 企业统计取自每 tick 缓存（见 candidateStateFor），此处为 O(1)。
  const activeCount = cacheActiveCount();
  const isActive = cacheStartedIds().has(agentId);
  // 必须与 runIndustry 的需求公式**同源**，否则准入判断与真实需求脱节。
  const demandPerTick = demandPerTickEstimate();
  const capacityPerBusiness = productionOutputOf();
  // 槽位保留小数：`Math.floor` 会把 5.9 家砍成 5 家，使**所有种子都恰好卡在同一个
  // 整数上限**上，企业数因此恒等（实测 seed1/2/3 = 5/5/5），涌现性断言失败。
  const slots = capacityPerBusiness > 0 ? (demandPerTick / capacityPerBusiness) : 0;
  // **已实现的销量**也是市场容量的证据：卖得动说明还有空间，卖不动说明已饱和。
  // 为什么需要它：仅靠财富估算时，三个种子的估算值都落在同一整数区间，
  // 企业数仍被拉平（实测 phase3 开启时恒为 5/5/5）。
  // 而 goodsSold 是**居民真实购买行为**的累计结果——它已随种子分化
  // （trades 1194~1208），把它纳入容量判断，分化就能传导到企业创办决策上。
  // 用「每 tick 平均销量」而非累计值，避免随 tick 无限增长。
  const realizedPerTick = tick > 0 ? goodsSold / tick : 0;
  const hasMarketRoom = activeCount < Math.max(1, Math.max(slots, realizedPerTick / capacityPerBusiness + 0.5));
  // balance 一并返回：评分侧要用「本金占资产比例」衡量押注意愿。
  return {
    canFound: balance >= capital && !isActive,
    foundCapital: capital,
    balance,
    marketRoom: hasMarketRoom,
    activeBusinesses: activeCount,
    marketSlots: Math.max(1, slots),
  };
}

export function candidateStateFor(agentId, tick = 0) {
  // 每 tick 只遍历一次 businessIds：`startedIds`（由本居民创办的企业）也在这里采集。
  // 曾经把「该居民是否已创办企业」放在 foundConditionsFor 里**逐居民**再遍历一次，
  // 使复杂度从 O(企业) 变成 O(居民 × 企业)，50 人 200 tick 直接超时（>400s，原 ~200s）。
  if (_candidateStateCache === null || _candidateStateCacheTick !== tick) {
    const employedIds = new Set();
    const startedIds = new Set();
    let anyActive = false;
    let activeCount = 0;
    try {
      const all = economy.industry.business.list();
      const byId = new Map(all.map((b) => [b.businessId, b]));
      for (const id of businessIds) {
        for (const e of economy.industry.labour.staff(id)) employedIds.add(e.agentId);
        const biz = byId.get(id);
        if (biz !== undefined && biz.status === 'active') {
          anyActive = true;
          activeCount += 1;
          if (typeof biz.founderId === 'string') startedIds.add(biz.founderId);
        }
      }
    } catch { /* 无产业数据 */ }
    // 余额一次性读出并缓存。
    // `economy.ledger.account.balance` → `graph.read(id)` → structuredClone，
    // 逐居民逐 tick 调用会做上万次深拷贝（实测把 50×200×3 集成测试从 ~200s/种子
    // 推到 ~230s/种子，单测试达 700s）。这里每 tick 只读一次。
    const balances = new Map();
    let disposableTotal = 0;
    const reserve = cfgVal('consumptionReserve', 400);
    for (const [agentId, acctId] of accounts.entries()) {
      let bal = 0;
      try { bal = economy.ledger.account.balance(acctId) ?? 0; } catch { bal = 0; }
      balances.set(agentId, bal);
      if (bal > reserve) disposableTotal += bal - reserve;
    }
    // t11：供应池余额同样每 tick 只读一次（贸易的共享额度，见 action-contract 的 contention）。
    let supplyPoolBalance = 0;
    try {
      supplyPoolBalance = (typeof supplyAccountId === 'string' && supplyAccountId !== '')
        ? (economy.ledger.account.balance(supplyAccountId) ?? 0) : 0;
    } catch { supplyPoolBalance = 0; }
    _candidateStateCache = { employedIds, anyActive, activeCount, startedIds, balances, disposableTotal, supplyPoolBalance };
    _candidateStateCacheTick = tick;
  }
  const paired = pairedIndex.has(agentId);
  return {
    hasPeer: settledAgentIds.length > 1,
    employed: _candidateStateCache.employedIds.has(agentId),
    businessActive: _candidateStateCache.anyActive,
    paired,
    eligibleMate: !paired && settledAgentIds.some((id) => id !== agentId && !pairedIndex.has(id)),
    // t26（F1）：hasPendingCourt 是**兼容字段**，它的唯一生产消费者是 goals.js 的
    // 「让位于一次性机会窗口」规则——那条规则的语义是"有人正在等我答复，
    // 错过这个 tick 就永远错过"。t13 之前只有表白需要答复，所以它叫 court；
    // t13 之后待答复的还有 socialize/request，而**机会窗口的性质完全相同**。
    //
    // 修复前它只认表白，于是待决 socialize 的收件人不会让位：计划步骤
    // （0.9 + goalWeight 0.35 = 1.25）稳稳压过 accept/reject（1.05），
    // 实测 seed42/20tick/12 人：全城只发生 3 次回应，4 条 socialize 全部永久 pending。
    // 也就是说 F1 的"饿死"有**两层**原因：挑选层（courts 独占，已修）与
    // 让位层（机会窗口只认 court，这里修）。
    //
    // 严格语义保留在 hasPendingCourtStrict 里，需要"真的有一条待决表白"的消费者用它。
    hasPendingCourt: !paired && hasOneShotOpportunity(agentId, tick),
    hasPendingCourtStrict: !paired && pendingCourtsOf(agentId).length > 0,
    // t13：待回应互动的**真实**来源是互动记录（结构化事实），不再是 pendingCourts 这个
    // 只服务于表白的内存队列。accept/reject 都必须能看见它。
    ...interactionConditionsFor(agentId),
    // 探索条件：由 expedition.plan 评估（纯读）。居民据此判断"今天值不值得出去"。
    // 注意这是**建议**而非门：可行性为 false 只表示条件很差，最终选择权在居民。
    ...expeditionConditionsFor(agentId),
    // 创办企业条件（D2）：只看**该居民自己的账户余额**，不借不送——
    // 因此企业诞生取决于谁攒下了钱，这是涌现的来源而非固定指派。
    ...foundConditionsFor(agentId),
    // t11：候选准入所需的前置条件状态（与 action-contract 的 requires 同源）。
    // 执行器会在已有进行中任务时拒绝（already_crafting / already_building /
    // already_writing），而候选侧此前不知道这件事——实测 40 人 × 60 tick 中
    // write 被选中 131 次、115 次以 already_writing 失败（88% 空转）。
    pendingCraft: pendingFor(agent.crafting.workbench.executor, agentId),
    pendingBuild: pendingFor(agent.crafting.construction, agentId),
    pendingWrite: pendingFor(agent.crafting.writing, agentId),
    hasAccount: accounts.has(agentId),
    hasItemCatalog: itemIds.wood !== undefined && itemIds.wood !== null,
    supplyPoolBalance: _candidateStateCache.supplyPoolBalance,
  };
}

/**
 * 评估某居民的探索条件。
 * 把生存状态、特质、装备、天气与辐射都交给 expedition.plan，
 * 让「外出探索」成为一个有信息依据的候选，而不是随机出现。
 */
/**
 * t13：把**互动记录**里的真实状态暴露给决策层。
 *
 * 关键点：这里的每个布尔值都来自 interaction 的结构化记录，
 * 而不是"有没有人提过这事"的模糊判断。因此 accept/reject/fulfill/violate
 * 只有在**真实存在待决互动或未结承诺**时才会成为候选——不会凭空出现。
 *
 * @param {string} agentId
 * @returns {{ hasPendingInteraction: boolean, pendingInteractionCount: number,
 *             hasOpenPromise: boolean, canFulfillPromise: boolean }}
 */
/**
 * t26：回应等待上限（tick）。挑选（pickResponseTarget）与让位（hasOneShotOpportunity）
 * 必须用**同一个数**，否则会出现「让位了但挑不到它」或「挑得到但永远不让位」的半吊子状态。
 * cfg 缺省时回落到配置存储——candidateStateFor 是从 goals.js 那条只传 (agentId, tick)
 * 的调用链上被调用的，那里拿不到 cfg。
 */
function responseMaxWaitTicks(cfg) {
  let raw = cfg && Number.isInteger(cfg.responseMaxWaitTicks) && cfg.responseMaxWaitTicks > 0
    ? cfg.responseMaxWaitTicks
    : undefined;
  if (raw === undefined) {
    try { raw = configStore.get('responseMaxWaitTicks'); } catch { raw = undefined; }
  }
  return Number.isInteger(raw) && raw > 0 ? raw : 3;
}

/**
 * t26（F1）：是否存在**一次性机会窗口**——即「有人正在等我答复，错过这个 tick 就永远错过」。
 *
 * 这个判定的唯一生产消费者是 goals.js 的让位规则（它读的就是 hasPendingCourt 这个兼容字段）。
 * 判据分两类，刻意不对称：
 * - **表白**（court）：立刻让位。它是 t12 已经验证过的关键窗口（不让位则求偶永不闭环、生育链断裂），
 *   且表白本身稀少，让位的代价小。
 * - **其他互动**（socialize/request/...）：只有**等过上限**才让位。
 *   这是刻意的取舍：让位会掐掉本 tick 的计划加分，而 socialize 很常见，
 *   一有请求就让位会把计划链打断——实测 4 人 30 tick 的冒烟里 write_book 直接消失。
 *   等过上限才让位，既把等待**限住**，又让常见情形下的计划照常推进。
 *
 * @param {string} agentId
 * @param {number} tick
 * @returns {boolean}
 */
function hasOneShotOpportunity(agentId, tick) {
  const inbox = pendingInteractionsOf(agentId);
  if (inbox.length === 0) return false;
  if (inbox.some((r) => r.type === 'court')) return true;
  const maxWait = responseMaxWaitTicks();
  return inbox.some((r) => tick - (Number.isInteger(r.tick) ? r.tick : tick) >= maxWait);
}

/** 某人收到的**全部**待决互动（t26：机会窗口判定的真值来源）。 */
function pendingInteractionsOf(agentId) {
  try {
    return social.interaction.pendingFor(agentId);
  } catch {
    return [];
  }
}

/** 某人收到的待决**表白**（供 hasPendingCourtStrict 使用，真值来自互动记录）。 */
function pendingCourtsOf(agentId) {
  try {
    return social.interaction.pendingFor(agentId).filter((r) => r.type === 'court');
  } catch { return []; }
}

function interactionConditionsFor(agentId) {
  let pending = [];
  let open = [];
  try { pending = social.interaction.pendingFor(agentId); } catch { pending = []; }
  try { open = social.interaction.openPromises(agentId); } catch { open = []; }
  // 能否兑现：承诺的物品在背包里够不够（与 fulfillPromise 的交割条件同源）。
  let canFulfill = false;
  if (open.length > 0) {
    const p = open[0];
    const what = p?.terms?.what ?? 'food';
    const amount = Number.isInteger(p?.terms?.amount) && p.terms.amount > 0 ? p.terms.amount : 1;
    const id = shipmentItemId(what);
    if (id !== null) {
      try {
        const bag = agent.inventory.backpack.list({ agentId }).items ?? {};
        canFulfill = (bag[id] ?? 0) >= amount;
      } catch { canFulfill = false; }
    }
  }
  return {
    hasPendingInteraction: pending.length > 0,
    pendingInteractionCount: pending.length,
    hasOpenPromise: open.length > 0,
    canFulfillPromise: canFulfill,
  };
}

function expeditionConditionsFor(agentId) {
  try {
    const needs = survival.needs.meter.query({ agentId }).needs;
    const tags = [...(pairedIndex.get(agentId)?.tags ?? [])];
    let health = 1;
    try { health = survival.health.disease.status({ agentId }).health ?? 1; } catch { /* 无健康数据时按健康处理 */ }
    let gear = [];
    let freeSlots = 0;
    try {
      const bp = agent.inventory.backpack.list({ agentId });
      const items = bp.items ?? {};
      gear = Object.keys(items).filter((k) => k === 'scrap' || k === 'cloth' || k === 'circuit');
      const used = Object.values(items).reduce((a, n) => a + (Number.isFinite(n) && n > 0 ? n : 0), 0);
      const cap = typeof bp.capacity === 'number' && bp.capacity > 0 ? bp.capacity : 48;
      freeSlots = Math.max(0, cap - used);
    } catch { gear = []; freeSlots = 0; }
    const wm = survival.environment.weather.modifiers({});
    const p = survival.environment.expedition.plan({
      agentId, range: 'mid', tags, needs, health, gear, weatherMods: wm,
    });
    // 背包没有任何空位时探索是**纯亏损**：必然受伤却装不下任何拾获。
    // 实测（50 人 120 tick）居民全员满包，285 次探索全部「有拾获但装不下」，
    // 探索退化为只扣健康不给收益的坏选择。故把剩余容量作为可行性条件之一。
    const hasRoom = freeSlots > 0;
    // 被隔离者不得外出：这是让"隔离"真正产生行为后果的消费点。
    // 此前隔离状态只被写入、从不被读取，机制等于装饰。
    const confined = survival.health.epidemic.isQuarantined(agentId);
    return {
      expeditionViable: p.viable && hasRoom && !confined,
      expeditionRisk: p.risk,
      expeditionLoot: hasRoom ? p.expectedLootCount : 0,
      expeditionHours: p.hours,
      expeditionRange: p.range,
    };
  } catch {
    // 环境模块不可用时，探索候选不出现（而不是以错误的理由出现）。
    return { expeditionViable: false, expeditionRisk: 1, expeditionLoot: 0, expeditionRange: null };
  }
}

/**
 * 执行居民 **自己选择** 的行动效果（D0：行动空间地基）。
 * 每个动作都调用真实模块；不可行时返回 { ok:false, reason } 且不改世界（不造假产出）。
 * @returns {{ ok: boolean, reason?: string, detail?: object }}
 */
export function performAgentAction(tick, agentId, action, config = {}) {
  if (typeof agentId !== 'string' || agentId.trim() === '') return { ok: false, reason: 'bad_agent' };
  const itemIdsLocal = itemIds;
  switch (action) {
    case 'craft': {
      if (pendingFor(agent.crafting.workbench.executor, agentId)) return { ok: false, reason: 'already_crafting' };
      try {
        const job = agent.crafting.workbench.executor.craft({ agentId, recipeId: 'axe', tick });
        observer.recorder.eventLog.record({ tick, topic: 'agent.action.craft.started', payload: { recipeId: 'axe' }, agentId });
        return { ok: true, detail: job };
      } catch (err) { return { ok: false, reason: 'craft_failed:' + err.message.slice(0, 40) }; }
    }
    case 'build': {
      if (pendingFor(agent.crafting.construction, agentId)) return { ok: false, reason: 'already_building' };
      try {
        const job = agent.crafting.construction.build({ agentId, recipeId: 'barn', tick });
        observer.recorder.eventLog.record({ tick, topic: 'agent.action.build.started', payload: { recipeId: 'barn' }, agentId });
        return { ok: true, detail: job };
      } catch (err) { return { ok: false, reason: 'build_failed:' + err.message.slice(0, 40) }; }
    }
    case 'write': {
      if (pendingFor(agent.crafting.writing, agentId)) return { ok: false, reason: 'already_writing' };
      try {
        const rec = agent.crafting.writing.write_book({
          agentId,
          title: '避难所纪事',
          content: '第 ' + tick + ' 天，由 ' + agentId + ' 记录。',
          tick,
        });
        // 契约修正：bookId 在**完稿时**才由 item.define 生成，发起时并不存在，
        // 原写法 `rec?.bookId ?? null` 因此恒为 null（write_book 返回的是 job，字段名是 jobId）。
        // 发起事件应记录 pending job 的真实身份与内容，完稿事件再补 bookId。
        observer.recorder.eventLog.record({
          tick, topic: 'agent.action.write.started',
          payload: { jobId: rec?.jobId ?? null, title: '避难所纪事', content: '第 ' + tick + ' 天，由 ' + agentId + ' 记录。' },
          agentId,
        });
        return { ok: true, detail: rec };
      } catch (err) { return { ok: false, reason: 'write_failed:' + err.message.slice(0, 40) }; }
    }
    case 'work': {
      // 性能修正：原写法把 business.list()（全量物化全部企业节点）放进 find 的谓词内，
      // 构成 O(企业数²) 次全量读取 —— 实测 dispatch 因此占整个 tick 的 66.3%。
      // 每 tick 只物化一次即可；语义不变：仍取第一个「活跃且雇用了本人」的企业。
      const allBiz = economy.industry.business.list();
      const biz = businessIds.find((id) => {
        const b = allBiz.find((x) => x.businessId === id);
        return b !== undefined && b.status === 'active'
          && economy.industry.labour.staff(id).some((e) => e.agentId === agentId);
      });
      if (biz === undefined) return { ok: false, reason: 'not_employed' };
      const shiftOutput = (Number.isInteger(config.productionOutput) && config.productionOutput > 0) ? config.productionOutput : 4;
      const labourShare = Math.max(1, Math.round(shiftOutput * 0.5));
      try {
        economy.industry.production.plan({ businessId: biz, output: labourShare });
        observer.recorder.eventLog.record({ tick, topic: 'agent.action.work', payload: { businessId: biz, output: labourShare }, agentId });
        return { ok: true, detail: { businessId: biz, planned: labourShare } };
      } catch (err) { return { ok: false, reason: 'work_failed:' + err.message.slice(0, 40) }; }
    }
    case 'trade': {
      const acctId = accounts.get(agentId);
      if (!acctId) return { ok: false, reason: 'no_account' };
      const woodId = itemIdsLocal.wood;
      if (!woodId) return { ok: false, reason: 'no_item_catalog' };
      // P2 修正：可交易品不能是**制作原料**。木头同时被 craft(耗 2) 与 build(耗 3) 争夺，
      // 居民几乎不可能稳定持有 >2 个，因此 trade 恒被 no_surplus 拒绝（实测后期仅 4-6 次）。
      // 改为统计背包里除木头外的**实际产出品**（斧头/书籍等）作为可售余量——
      // 交易的对象是劳动成果，而非生产资料。
      let held = 0;
      let surplus = 0;
      try {
        const items = agent.inventory.backpack.list({ agentId }).items ?? {};
        for (const [id, n] of Object.entries(items)) {
          if (!Number.isFinite(n) || n <= 0) continue;
          held += n;
          if (id !== woodId) surplus += n;
        }
      } catch { held = 0; surplus = 0; }
      const sellable = surplus;
      if (sellable <= 0) return { ok: false, reason: 'no_surplus' };
      const price = (typeof config.rawPrice === 'number' && config.rawPrice > 0) ? config.rawPrice : 1;
      const revenue = sellable * price;
      try {
        const poolAcct = supplyAccountId;
        const bal = (typeof poolAcct === 'string' && poolAcct !== '')
          ? (economy.ledger.account.balance(poolAcct) ?? 0) : 0;
        if (bal < revenue) return { ok: false, reason: 'pool_insufficient' };
        economy.ledger.transaction.recorder.post({ from: poolAcct, to: acctId, amount: revenue, ref: 'trade', memo: '出售余粮' });
        // 按产出品逐项扣减（跳过木头），避免误扣生产资料。
        let remaining = sellable;
        const toRemove = [];
        try {
          const items = agent.inventory.backpack.list({ agentId }).items ?? {};
          for (const [id, n] of Object.entries(items)) {
            if (remaining <= 0) break;
            if (id === woodId || !Number.isFinite(n) || n <= 0) continue;
            const take = Math.min(remaining, n);
            toRemove.push([id, take]);
            remaining -= take;
          }
        } catch { /* 读取失败则不扣减 */ }
        for (const [id, qty] of toRemove) agent.inventory.backpack.remove({ agentId, itemId: id, quantity: qty });
        const soldItemId = toRemove.length > 0 ? toRemove[0][0] : woodId;
        observer.recorder.eventLog.record({ tick, topic: 'agent.action.trade', payload: { itemId: soldItemId, quantity: sellable, revenue }, agentId });
        return { ok: true, detail: { quantity: sellable, revenue } };
      } catch (err) { return { ok: false, reason: 'trade_failed:' + err.message.slice(0, 40) }; }
    }
    case 'socialize': {
      // t13：社交是**双向请求**，不再是"我对你 +0.05 友谊"的单方面写入。
      // 发起只产生一条 pending 互动记录；接收方在它自己的 tick 里 accept/reject。
      // 只有被接受才写友谊、才建边、才影响声誉——这是"自然人不会替别人答应"的硬约束。
      const peer = pickPeer(agentId);
      if (peer === null) return { ok: false, reason: 'no_peer' };
      const proposed = social.interaction.propose({
        type: 'socialize', from: agentId, to: peer, tick,
        terms: { kind: 'companionship' },
        // 自然语言是可选渲染：给了也只是存证，判定完全走结构化 claims。
        naturalLanguage: typeof config.utterance === 'string' ? config.utterance : null,
      });
      if (proposed.ok !== true) return { ok: false, reason: proposed.reason ?? 'socialize_rejected' };
      observer.recorder.eventLog.record({ tick, topic: 'agent.action.socialize',
        payload: { peer, interactionId: proposed.interactionId }, agentId });
      return { ok: true, detail: { peer, interactionId: proposed.interactionId, awaiting: 'response' } };
    }
    case 'court': {
      if (pairedIndex.has(agentId)) return { ok: false, reason: 'already_paired' };
      const peer = pickMate(agentId);
      if (peer === null) return { ok: false, reason: 'no_eligible_mate' };
      const proposed = social.interaction.propose({
        type: 'court', from: agentId, to: peer, tick,
        terms: { kind: 'romance' },
        // 表白必须建立在**真实依据**上：只声明可直接核实的事实（同住避难所、双方均未婚）。
        // 事实门会逐条核实；核不实的声明不写关系、不写声誉，只记进 rejectedClaims。
        claims: [
          // 关于**对方**的声明必须带 subject：缺省 subject 是声明者本人，
          // 拿自己的职业去核对"对方是商人"会把真话判成假话（初版即此缺陷，实测 27 条声明全被拒）。
          { key: 'role.career', subject: peer,
            value: (() => { try { return agent.role.career.current(peer)?.occupation ?? null; } catch { return null; } })() },
        ].filter((c) => typeof c.value === 'string' && c.value !== ''),
      });
      if (proposed.ok !== true) return { ok: false, reason: proposed.reason ?? 'court_rejected' };
      observer.recorder.eventLog.record({ tick, topic: 'agent.action.court',
        payload: { peer, interactionId: proposed.interactionId }, agentId });
      return { ok: true, detail: { peer, interactionId: proposed.interactionId, awaiting: 'response' } };
    }
    case 'promise': {
      // t13：承诺 —— 结构化记录"我欠你什么、多少、什么时候算到期"。
      // 这是履约/违约与信任变化的**唯一前置事实**：没有它，违约无从谈起。
      const peer = pickPeer(agentId);
      if (peer === null) return { ok: false, reason: 'no_peer' };
      const terms = promiseTermsFor(agentId, config);
      const what = terms.what;
      const amount = terms.amount;
      const dueTick = tick + (Number.isInteger(config.promiseDueTicks) && config.promiseDueTicks > 0 ? config.promiseDueTicks : 10);
      const horizon = Number.isInteger(config.endTick) ? config.endTick : null;
      if (horizon !== null && dueTick > horizon) return { ok: false, reason: 'promise_due_after_horizon' };
      const proposed = social.interaction.propose({
        type: 'promise', from: agentId, to: peer, tick,
        terms: { what, amount, dueTick },
      });
      if (proposed.ok !== true) return { ok: false, reason: proposed.reason ?? 'promise_rejected' };
      // 承诺方**自己**也要能看到"我欠了什么"——否则履约无从主动发生。
      return { ok: true, detail: { peer, interactionId: proposed.interactionId, what, amount, dueTick } };
    }
    case 'fulfill':
    case 'violate': {
      // t13：结算一条**真实存在且仍开放**的承诺。承诺的 id 必须来自交互记录，
      // 不能凭空生成——这是"违约/履约必须指向真实承诺"的硬约束。
      const own = social.interaction.openPromises(agentId);
      const due = own
        .filter((p) => p.type === 'promise' && p.status === 'open')
        .sort((a, b) => a.interactionId.localeCompare(b.interactionId));
      if (due.length === 0) return { ok: false, reason: 'no_open_promise' };
      const target = typeof config.promiseId === 'string'
        ? (due.find((p) => p.interactionId === config.promiseId) ?? null)
        : due[0];
      if (target === null) return { ok: false, reason: 'not_your_open_promise' };
      let settled;
      if (action === 'fulfill') {
        // 履约要有**实质**：真的把东西交出去（背包里没有就做不到）。
        settled = fulfillPromise(agentId, target, tick);
      } else {
        settled = social.interaction.propose({
          type: 'violate', from: agentId, to: target.to, tick, promiseId: target.interactionId,
        });
      }
      if (settled.ok !== true) return { ok: false, reason: settled.reason ?? (action + '_failed') };
      observer.recorder.eventLog.record({ tick, topic: 'agent.action.' + action,
        payload: { promiseId: target.interactionId, peer: target.to }, agentId });
      return { ok: true, detail: { promiseId: target.interactionId, peer: target.to } };
    }
    case 'accept':
    case 'reject': {
      // t13：**接收方自己的决策**——接受或拒绝都写进同一个状态机。
      // 修复前只有 accept 而没有 reject：被表白者除了答应没有别的选项，
      // 这不是双向互动，是"代码替人做主"。
      if (action === 'accept' && pairedIndex.has(agentId)) return { ok: false, reason: 'already_paired' };
      const inbox = social.interaction.pendingFor(agentId);
      if (inbox.length === 0) return { ok: false, reason: 'no_pending_interaction' };
      const target = pickResponseTarget(inbox, tick, config);
      const wantAccept = action === 'accept';
      const accept = decideResponse(agentId, target, tick, wantAccept, config);
      const responded = social.interaction.respond({
        interactionId: target.interactionId, respondent: agentId, accept, tick,
      });
      if (responded.ok !== true) return { ok: false, reason: responded.reason ?? 'respond_failed' };
      if (accept && target.type === 'court') {
        pairedIndex.set(agentId, target.from);
        pairedIndex.set(target.from, agentId);
        pendingCourts.delete(agentId);
      }
      observer.recorder.eventLog.record({ tick,
        topic: accept ? 'agent.action.accept' : 'agent.action.reject',
        payload: { from: target.from, type: target.type, interactionId: target.interactionId }, agentId });
      return { ok: true, detail: { from: target.from, type: target.type, accepted: accept, interactionId: target.interactionId } };
    }
    case 'found': {
      // 居民**自己**创办企业（D2）。此前企业全部由 seed 阶段按 config.businessCount
      // 固定路径创办（固定创始人 agents[i%n]、固定行业 food/tools），
      // 导致 businesses 跨种子恒为 2，「企业出生」无法涌现。
      // 现在：由居民决策触发，资本来自其自有账户（真实转账），行业按其技能倾向选择。
      const acct = accounts.get(agentId);
      if (acct === undefined) return { ok: false, reason: 'no_account' };
      const capital = (Number.isInteger(config.foundCapital) && config.foundCapital > 0) ? config.foundCapital : 60;
      const balance = economy.ledger.account.balance(acct) ?? 0;
      if (balance < capital) return { ok: false, reason: 'no_capital' };
      // 行业由**可复现的居民特征**决定（agentId 的哈希），而不是固定的 i%2：
      // 同一份种子下结论确定，不同种子下自然分化——这是「跨种子差异」的来源。
      const industries = [ 'food', 'tools', 'textile', 'medicine' ];
      const pick = hashSeed('industry:' + agentId) % industries.length;
      // 供应账户由 seed 建立（supplyAccountId），不在 accounts 映射里（那只有居民）。
      // 资本**真实转账**给新企业账户（不造钱）：`capitalFrom` 让 business.found 以 0 开立，
      // 再由账本把本金从居民账户划过去，货币总量不变。
      // 教训：最初把本金转给供应池、同时让 business.found 用 open(balance: capital)
      // 开等额账户，等于双倍记账，D1 货币守恒断言因此失败。
      let biz;
      try {
        biz = economy.industry.business.found({
          founderId: agentId,
          name: (agentId + ' 的' + industries[pick] + '铺'),
          industry: industries[pick],
          capital,
          capitalFrom: acct,
          tick,
        });
      } catch (err) { return { ok: false, reason: 'pay_failed:' + err.message.slice(0, 30) }; }
      businessIds.push(biz.businessId);
      // 新企业可申领创业贷款（D2 连带修复）。
      // 此前放贷只在 seed 阶段按 businessIds 跑一次，而企业改为居民自办后
      // seed 时 businessIds 恒为空 → 贷款从未发生 → creditIssued/interestAccrued 恒为 0，
      // 声誉→信贷的整条经济路径静默失效（测试 313/347 失败）。
      // 现在每有新企业成立，就由同一信贷规则为其放款。
      try {
        const loanPrincipal = (typeof config.loanPrincipal === 'number' && config.loanPrincipal >= 0)
          ? config.loanPrincipal : 100;
        const creditRate = (typeof config.creditRate === 'number' && config.creditRate >= 0)
          ? config.creditRate : 0.01;
        if (loanPrincipal > 0) {
          const loan = economy.bank.credit.apply({
            borrowerId: biz.businessId, borrowerType: 'business',
            principal: loanPrincipal, rate: creditRate, term: 0, tick,
          });
          creditIssued += loan.principal;
        }
      } catch { /* 金库未开或额度不足则跳过 */ }
      observer.recorder.eventLog.record({
        tick, topic: 'agent.action.found',
        payload: { businessId: biz.businessId, industry: industries[pick], capital }, agentId,
      });
      return { ok: true, detail: { businessId: biz.businessId, industry: industries[pick], capital } };
    }
    case 'expedition': {
      // 探索：**一次计算**，不是开放世界。综合天气/辐射/特质/装备/状态与随机数，
      // 结果只落为「日志 + 背包变化 + 身体状态变化」。
      // 条件评估用居民自己的真实状态（而非传入的乐观估计），避免"决策时以为安全、
      // 执行时其实已经饿晕"的不一致。
      const cond = expeditionConditionsFor(agentId);
      if (cond.expeditionViable !== true) {
        return { ok: false, reason: 'expedition_not_viable' };
      }
      try {
        const needs = survival.needs.meter.query({ agentId }).needs;
        let health = 1;
        try { health = survival.health.disease.status({ agentId }).health ?? 1; } catch { /* 默认健康 */ }
        let gear = [];
        try {
          const bp = agent.inventory.backpack.list({ agentId });
          gear = Object.keys(bp.items ?? {}).filter((k) => k === 'scrap' || k === 'cloth' || k === 'circuit');
        } catch { gear = []; }
        const tags = [...(pairedIndex.get(agentId)?.tags ?? [])];
        const wm = survival.environment.weather.modifiers({});
        const plan = survival.environment.expedition.plan({
          agentId, range: 'mid', tags, needs, health, gear, weatherMods: wm,
        });
        const result = survival.environment.expedition.execute({ plan, itemIds: itemIdsLocal });
        const settled = survival.environment.expedition.settle({
          agentId, plan, result,
          backpack: agent.inventory.backpack,
          // 辐射/外伤走既有的疾病通道（health 由疾病严重度驱动），
          // 使用固定的辐射病病种 id，使「探索受伤」在健康模块里可见、可治疗、可恢复。
          health: {
            injure: (x) => {
              try {
                survival.health.disease.infect({ agentId: x.agentId, diseaseId: 'radiation_sickness', severity: x.amount, tick });
              } catch { /* 健康模块不可用则只记日志 */ }
            },
          },
          needs: survival.needs.meter,
          chronicle: (x) => observer.recorder.eventLog.record({
            tick, topic: 'agent.action.expedition', payload: { text: x.text, outcome: x.payload.outcome, range: x.payload.range, loot: x.payload.loot.length }, agentId,
          }),
        });
        observer.recorder.actionLog.record({ tick, agentId, action: 'expedition', detail: { outcome: settled.outcome, loot: settled.changes.loot.length } });
        return { ok: true, detail: settled };
      } catch (err) { return { ok: false, reason: 'expedition_failed:' + err.message.slice(0, 60) }; }
    }
    default:
      return { ok: false, reason: 'unknown_action' };
  }
}

/** 选取一个**未婚**求偶对象（同样用哈希位，不消耗全局 rng；无未婚同伴则返回 null）。 */
function pickMate(agentId) {
  const ids = settledAgentIds.filter((id) => id !== agentId && !pairedIndex.has(id));
  if (ids.length === 0) return null;
  let h = 2166136261;
  for (let i = 0; i < agentId.length; i += 1) { h ^= agentId.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ids[(h >>> 0) % ids.length];
}

/** 选取一个互动对象（确定性：按 id 排序后取 agentId 的哈希位，不消耗全局 rng）。 */
function pickPeer(agentId) {
  const ids = settledAgentIds.filter((id) => id !== agentId);
  if (ids.length === 0) return null;
  let h = 2166136261;
  for (let i = 0; i < agentId.length; i += 1) { h ^= agentId.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ids[(h >>> 0) % ids.length];
}

function pendingFor(queue, agentId) {
  return queue.pending().some((j) => j.agentId === agentId);
}

/**
 * t13：接收方的回应决策——**接受或拒绝是接收方自己的判断**，不是发起方说了算。
 *
 * 判定依据全部来自**世界事实**（facts 目录），不引入随机数：
 * - 已配对 → 拒绝（不能重婚）。
 * - 双方关系强度（友谊/信任）足够 → 接受。
 * - 对方声誉过低（失信/劣迹）→ 拒绝；声誉是"我凭什么信你"的可查依据。
 * - 结构化请求（request/promise）若带 claim，必须**全部证实**才接受；
 *   未证实的声明一律拒绝——这就是"自然语言必须过世界事实校验"的落点。
 *
 * @param {string} agentId 接收方
 * @param {object} interaction 待决互动
 * @param {number} tick
 * @param {boolean} wantAccept 该居民**自己选择**的动作（accept/reject）
 * @returns {boolean} 最终是否接受
 */
/**
 * t26（F1）：从待回应互动里挑一条来回应——**公平且有界等待**。
 *
 * 修复前这里写的是：
 *   const courts = inbox.filter(r => r.type === 'court');
 *   const pool = courts.length > 0 ? courts : inbox;
 *   const target = pool[pool.length - 1];
 * 两个缺陷叠在一起，让 socialize 在生产中**永久饿死**：
 * 1) **独占**：只要队列里有一条表白（court），inbox 里的 socialize 就完全不参与挑选。
 *    实测 seed42 / 20 tick / 12 人：4 条 socialize 全部永久 pending（最久的等了 8 tick），
 *    0 条被接受、friendship 边 0 条——「社交」这个动作等于空转。
 * 2) **LIFO**：取 pool[length-1] 是取最新的一条，后到的插队让先到的永远排不上。
 *
 * 新规则分两级，保证「紧要的事优先，但没有谁能无限期占着队」：
 * - 第一级：等待已达 maxWaitTicks（默认 3）的互动里，取**等得最久**的一条。
 *   等待因此是**有界**的：任何一条互动最多被压后 maxWaitTicks 个 tick。
 * - 第二级：还没到等待上限时，表白（court）优先于其他请求，同类里取**最早**的一条。
 *
 * 注意：这里只决定"回应哪一条"，不决定"答应还是拒绝"——后者仍是接收方自己的
 * 判断（decideResponse）。公平调度与自主决定是两件事，不要混在一起。
 *
 * @param {Array<object>} inbox 该居民收到的待决互动
 * @param {number} tick
 * @param {object} cfg
 * @returns {object} 被选中的互动记录
 */
function pickResponseTarget(inbox, tick, cfg = {}) {
  const maxWait = responseMaxWaitTicks(cfg);
  const waited = (r) => Math.max(0, tick - (Number.isInteger(r.tick) ? r.tick : tick));
  // 等得最久的排前面；同等待时长用 id 定序，保证同种子可复现。
  const byLongestWait = (a, b) => (waited(b) - waited(a)) || String(a.interactionId).localeCompare(String(b.interactionId));

  const overdue = inbox.filter((r) => waited(r) >= maxWait).sort(byLongestWait);
  if (overdue.length > 0) return overdue[0];

  const courts = inbox.filter((r) => r.type === 'court').sort(byLongestWait);
  if (courts.length > 0) return courts[0];

  return inbox.slice().sort(byLongestWait)[0];
}

function decideResponse(agentId, interaction, tick, wantAccept, cfg = {}) {
  // 居民自己选的是 reject：尊重其选择，但**拒绝也要留下可查的理由**。
  if (!wantAccept) return false;
  if (pairedIndex.has(agentId)) return false;
  // 结构化声明必须全部证实：有未证实声明就直接否决（这是事实校验门的执行点）。
  if (Array.isArray(interaction.rejectedClaims) && interaction.rejectedClaims.length > 0) return false;
  const from = interaction.from;
  let trustAB = 0.5;
  try { trustAB = social.interaction.trust({ holder: agentId, other: from }).trust; } catch { trustAB = 0.5; }
  let friend = 0;
  try { friend = social.relationship.friendship.strength({ a: agentId, b: from }); } catch { friend = 0; }
  let rep = 50;
  try { rep = social.reputation.query({ agentId: from })?.score ?? 50; } catch { rep = 50; }
  // 门槛写成常量而非魔法数字：低于此声誉/信任的人得不到答应。
  const minTrust = typeof cfg.responseMinTrust === 'number' ? cfg.responseMinTrust : 0.35;
  if (rep < reputationFloor(cfg)) return false;
  return trustAB >= minTrust || friend >= 0.2;
}

/**
 * t26（F1 的第三层）：声誉门槛必须**随人群水平自适应**，不能是一个绝对常数。
 *
 * 为什么：reputation 自己的 distrusted 边界是 30，于是这里原本写死 30。
 * 但声誉是一个会被**别的系统**推动的量——经济侧的破产（每案 -5）实测把
 * seed42/20tick/12 人压到全员 21 上下（12 人里 11 人在 21~22，只有 1 人 100）。
 * 此时绝对门槛 30 会让**所有人**的社交请求一律被拒：
 * 实测那条唯一被回应的 socialize 正是死在 rep=21.15 < 30 上。
 * 那不是「社会冷漠」，而是社交门槛被一个与社交无关的系统钉死——
 * 与 F1 的 courts 独占是同一类缺陷：**管道存在，但永远走不通**。
 *
 * 规则（两级取更宽者）：
 * - 绝对门槛 responseMinReputation（默认 30）：在健康社会里照常生效，
 *   回答「这个人是不是真的劣迹斑斑」。
 * - 相对门槛 人群均值 × responseReputationRatio（默认 0.6）：回答
 *   「这个人在同代人里是不是垫底」。全城低迷时它自动放宽，
 *   因此「谁值得回应」重新由**相对位置**决定，而不是由时间/经济周期决定。
 * 取 min() 意味着相对门槛只会放宽、永远不会比绝对门槛更严——
 * 这是刻意的：这条规则要解决的是「全员被误杀」，不是「让社会更挑剔」。
 *
 * @param {object} cfg
 * @returns {number} 本 tick 生效的声誉下限
 */
function reputationFloor(cfg = {}) {
  const absolute = typeof cfg.responseMinReputation === 'number' ? cfg.responseMinReputation : 30;
  const ratio = typeof cfg.responseReputationRatio === 'number' ? cfg.responseReputationRatio : 0.6;
  if (!(ratio > 0)) return absolute;
  try {
    const scores = social.reputation.list().map((r) => r.score).filter((s) => Number.isFinite(s));
    if (scores.length === 0) return absolute;
    const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
    return Math.min(absolute, mean * ratio);
  } catch {
    // 声誉不可用时**回落到绝对门槛**（保守：宁可严一点，也不凭空放行）。
    return absolute;
  }
}

/**
 * t13：履约要**有实质**——真的把承诺的东西交出去。
 *
 * 修复前不存在履约概念，所以"承诺"不可能产生任何真实后果。
 * 这里先做背包里的实物交割（有则扣、无则做不到），再走 interaction 的结算，
 * 由 applyConsequence 写关系、声誉与关系边。
 *
 * @param {string} agentId 承诺方
 * @param {object} promise 开放承诺记录
 * @param {number} tick
 * @returns {object} 结算结果
 */
function fulfillPromise(agentId, promise, tick) {
  const terms = promise.terms ?? {};
  const what = typeof terms.what === 'string' && terms.what !== '' ? terms.what : 'food';
  const amount = Number.isInteger(terms.amount) && terms.amount > 0 ? terms.amount : 1;
  const itemId = shipmentItemId(what);
  let delivered = false;
  if (itemId !== null) {
    try {
      const bag = agent.inventory.backpack.list({ agentId }).items ?? {};
      if ((bag[itemId] ?? 0) >= amount) {
        agent.inventory.backpack.remove({ agentId, itemId, quantity: amount });
        agent.inventory.backpack.add({ agentId: promise.to, itemId, quantity: amount });
        delivered = true;
      }
    } catch { delivered = false; }
  }
  if (!delivered) {
    // 交不出东西就不是履约——宁可让它保持开放（到期后自然违约），
    // 也不写一条"假的履约"进社会事实。这是 t13 最核心的诚实性约束。
    return { ok: false, reason: 'cannot_deliver' };
  }
  return social.interaction.propose({
    type: 'fulfill', from: agentId, to: promise.to, tick, promiseId: promise.interactionId,
    terms: { what, amount, delivered: true },
  });
}

/**
 * t13：承诺什么，由**居民手里真的有什么**决定——不许诺自己拿不出的东西。
 *
 * 取背包里数量最多的**产出品**（不含制作原料），承诺 1 件。
 * 这是"承诺可兑现"的前提：默认许一个自己没有的物名，会让 fulfill 永远不可行、
 * violate 变成唯一出路（实测固定 'food' 时履约 0 次、违约成为必然而非选择）。
 *
 * @param {string} agentId
 * @returns {{ what: string, amount: number }}
 */
function promiseTermsFor(agentId, cfg = {}) {
  if (typeof cfg.promiseWhat === 'string' && cfg.promiseWhat !== '') {
    return { what: cfg.promiseWhat, amount: Number.isInteger(cfg.promiseAmount) && cfg.promiseAmount > 0 ? cfg.promiseAmount : 1 };
  }
  let best = null;
  try {
    const woodId = itemIds.wood ?? null;
    const bag = agent.inventory.backpack.list({ agentId }).items ?? {};
    const catalog = new Map(agent.inventory.item.query().map((i) => [i.id, i]));
    for (const [id, n] of Object.entries(bag)) {
      if (!Number.isFinite(n) || n <= 0) continue;
      // 制作原料不作为承诺物：它随时会被 craft/build 吃掉，注定违约。
      if (id === woodId) continue;
      const rec = catalog.get(id);
      if (rec === undefined) continue;
      if (best === null || n > best.n) best = { id, n, name: rec.name };
    }
  } catch { best = null; }
  if (best === null) return { what: 'wood', amount: 1 };
  return { what: best.name, amount: 1 };
}

/** 承诺物品名 → 目录里的真实物品 id（对不上就返回 null，不猜测）。 */
function shipmentItemId(name) {
  try {
    const hit = itemCatalog().find((i) => i.name === name || i.id === name);
    return hit === undefined ? null : hit.id;
  } catch { return null; }
}

/** 物品目录读取（可能与 item 模块解耦，便于测试注入）。 */
function itemCatalog() {
  return agent.inventory.item.query();
}

/** 制作队列推进：只推进已由居民 **自己发起** 的任务（发起见 performAgentAction）。 */
function runCrafting(tick, agents) {
  const result = { crafted: 0, built: 0, wrote: 0 };
  if (agents.length === 0) return result;

  const craftDone = agent.crafting.workbench.executor.tick();
  const buildDone = agent.crafting.construction.tick();
  const writeDone = agent.crafting.writing.tick();
  craftCount += craftDone.length;
  buildCount += buildDone.length;
  // 完稿事件：bookId 此刻才真实存在（见 writing.tick 内 item.define）。
  // 此前只有发起事件且 bookId 恒为 null，观察者无法把「谁写了什么书」串起来。
  for (const w of writeDone) {
    try {
      observer.recorder.eventLog.record({
        tick, topic: 'agent.action.write.completed',
        payload: {
          bookId: w?.book?.id ?? null,
          title: w?.book?.properties?.title ?? null,
          content: w?.book?.properties?.content ?? null,
          author: w?.book?.properties?.author ?? null,
          completedAtTick: w?.completedAtTick ?? tick,
        },
        agentId: w?.book?.properties?.author ?? null,
      });
    } catch { /* 事件写入失败不阻塞推进 */ }
  }
  result.crafted = craftDone.length;
  result.built = buildDone.length;
  result.wrote = writeDone.length;
  return result;
}

/** 避难所修复：完整度不足时以劳动力修复，使容量回升（t43：危机信号可随修复下降）。 */
function runShelterRepair(config = {}) {
  const rate = typeof config.shelterRepairRate === 'number' && Number.isFinite(config.shelterRepairRate)
    ? config.shelterRepairRate
    : configStore.defaults().shelterRepairRate;
  return survival.shelter.repair(rate);
}

/** 居住分配：入住 → 容量拒绝（超员逐出）→ 暴露惩罚（无处可住者额外需求增长）。 */
function runResidence(tick, agents, config = {}) {
  const assigned = [];
  const skipped = [];
  const evicted = [];
  const exposed = [];
  const exposureGrowth = typeof config.exposureNeedGrowth === 'number' && Number.isFinite(config.exposureNeedGrowth)
    ? config.exposureNeedGrowth
    : configStore.defaults().exposureNeedGrowth;

  // 1) 入住：无住所且容量未满者入住。
  for (const a of agents) {
    if (town.residence.residenceOf(a.id) === null) {
      const sh = survival.shelter.status();
      if (sh.capacity <= 0 || sh.occupants >= sh.capacity) {
        skipped.push(a.id);
        continue;
      }
      town.residence.move_in({ agentId: a.id, residenceId: RESIDENCE_ID });
      assigned.push(a.id);
      observer.recorder.eventLog.record({
        tick,
        topic: 'town.residence',
        payload: { agentId: a.id, residenceId: RESIDENCE_ID },
        agentId: a.id,
      });
    }
  }

  // 2) 容量拒绝：完整度下降使容量 < 居住人数时，超出者不得继续居住（从末尾逐出）。
  const dorm = town.residence.query(RESIDENCE_ID);
  const cap = survival.shelter.capacity();
  if (dorm && Array.isArray(dorm.residents)) {
    while (dorm.residents.length > cap) {
      const last = dorm.residents[dorm.residents.length - 1];
      town.residence.move_out({ agentId: last, residenceId: RESIDENCE_ID });
      evicted.push(last);
      dorm.residents.pop();
      observer.recorder.eventLog.record({
        tick,
        topic: 'town.residence.evict',
        payload: { agentId: last, residenceId: RESIDENCE_ID, reason: 'over_capacity' },
        agentId: last,
      });
    }
  }

  // 3) 暴露：无处可住者暴露于环境 → 额外需求增长（生存压力上升，可观测后果）。
  for (const a of agents) {
    if (town.residence.residenceOf(a.id) === null) {
      exposed.push(a.id);
      survival.needs.meter.update({ agentId: a.id, need: 'food', delta: exposureGrowth });
      survival.needs.meter.update({ agentId: a.id, need: 'water', delta: exposureGrowth });
    }
  }

  return { assigned, skipped, evicted, exposed };
}

/** 健康检查：症状推进 → 疾病传播（与人口规模相关）→ 医疗物资增产（与人口相关）→ 疫情检测 → 隔离 → 分诊治疗。 */
function runHealth(tick, agents, config) {
  const result = { infected: 0, epidemic: false, treated: 0, quarantined: 0 };
  if (agents.length === 0) return result;
  const ids = agents.map((a) => a.id);

  // 1) 症状推进
  for (const a of agents) {
    if (survival.health.disease.status({ agentId: a.id }).infected) {
      survival.health.disease.symptom({ agentId: a.id, delta: 0.05, tick });
    }
  }

  // 2) 疾病传播：感染者在易感者中随机传播（与人口规模挂钩，持续消耗医疗物资）
  const infectionRate = (typeof config.infectionRate === 'number' && config.infectionRate >= 0) ? config.infectionRate : 0.01;
  if (infectionRate > 0) {
    const infectedIds = ids.filter((id) => survival.health.disease.status({ agentId: id }).infected);
    for (const infId of infectedIds) {
      for (const otherId of ids) {
        if (otherId === infId) continue;
        if (survival.health.disease.status({ agentId: otherId }).infected) continue;
        if (rng.float(0, 1) < infectionRate) {
          survival.health.disease.infect({ agentId: otherId, diseaseId: 'flu', severity: 0.3, tick });
        }
      }
    }
  }

  // 3) 医疗物资增产：居民制作医疗物资（与存活人口相关）
  const medicalRegenPerCapita = (typeof config.medicalRegenPerCapita === 'number' && config.medicalRegenPerCapita >= 0) ? config.medicalRegenPerCapita : 0.5;
  survival.resources.medical.produce(ids.length * medicalRegenPerCapita);

  const threshold = (typeof config.epidemicThreshold === 'number' && config.epidemicThreshold >= 0 && config.epidemicThreshold <= 1)
    ? config.epidemicThreshold : 0.5;
  const det = survival.health.epidemic.detect({ residents: ids, threshold, tick });
  result.infected = det.infectedCount;
  result.epidemic = det.epidemic;

  if (det.epidemic) {
    for (const inf of det.infected) {
      survival.health.epidemic.quarantine({ agentId: inf, tick });
      quarantineCount += 1;
      result.quarantined += 1;
    }
  }

  // 4) 分诊治疗：治疗名额与存活人口规模相关（持续消耗 medical）
  const triage = survival.health.treatment.triage({ agents: ids, tick });
  const treatPerCapita = (typeof config.treatPerCapita === 'number' && config.treatPerCapita >= 0) ? config.treatPerCapita : 0.04;
  const capacity = Math.min(triage.length, Math.max(1, Math.ceil(ids.length * treatPerCapita)));
  // 声誉反馈：高声誉者优先获得治疗名额（声誉被读取并影响生存行为）
  const repTriageEnabled = config.reputationTriageEnabled !== false;
  const repTriageBoost = (typeof config.reputationTriageBoost === 'number' && config.reputationTriageBoost >= 0) ? config.reputationTriageBoost : 0.3;
  const ordered = repTriageEnabled
    ? rankTriageByReputation(triage, (id) => social.reputation.query({ agentId: id }).score, repTriageBoost)
    : triage;
  if (repTriageEnabled) {
    reputationTriageSwaps += countTriageSwaps(triage, ordered);
  }
  for (let i = 0; i < capacity && i < ordered.length; i += 1) {
    const patient = ordered[i];
    const healed = survival.health.treatment.apply({ agentId: patient.agentId, tick });
    treatCount += 1;
    reputationTriageTreatedScore += social.reputation.query({ agentId: patient.agentId }).score;
    result.treated += 1;
    observer.recorder.actionLog.record({
      tick,
      agentId: patient.agentId,
      action: 'treatment',
      outcome: { severity: healed.severity, consumed: healed.consumed, health: healed.health },
    });

    // 康复即解除隔离：让隔离状态真正闭环。
    // 此前隔离名单只增不减、且无人读取，等于一个既无效果又不收敛的装饰机制。
    if (!survival.health.disease.status({ agentId: patient.agentId }).infected) {
      const released = survival.health.epidemic.release({ agentId: patient.agentId, tick });
      if (released.changed) releasesCount += 1;
    }
  }

  return result;
}

/** 由 ledger 账户反查居民（声誉反馈：买方身份）。 */
function agentIdByAccount(accountId) {
  for (const [agentId, acctId] of accounts) {
    if (acctId === accountId) return agentId;
  }
  return null;
}

/**
 * 声誉加权分诊排序：在病情严重度基础上，叠加声誉加成。
 * 高声誉者优先获得治疗名额（声誉被读取并影响生存行为的反馈点）。
 * @param {Array<{agentId:string, severity:number}>} patients
 * @param {(agentId:string)=>number} scoreOf
 * @param {number} boost
 * @returns {Array} 按 effective = severity + boost*(score-50)/50 降序
 */
export function rankTriageByReputation(patients, scoreOf, boost = 0.3) {
  return [...patients].sort((a, b) => {
    const ea = (a.severity ?? 0) + boost * ((scoreOf(a.agentId) - 50) / 50);
    const eb = (b.severity ?? 0) + boost * ((scoreOf(b.agentId) - 50) / 50);
    return (eb - ea) || String(a.agentId).localeCompare(String(b.agentId));
  });
}

/** 统计声誉排序相对纯严重度排序改变了多少个病例的位置（有/无反馈对照证据）。 */
function countTriageSwaps(original, ordered) {
  const pos = new Map();
  ordered.forEach((p, i) => pos.set(p.agentId, i));
  let swaps = 0;
  original.forEach((p, i) => { if (pos.get(p.agentId) !== i) swaps += 1; });
  return swaps;
}

/** 声誉 → 信贷利率乘数：高声誉更低利率（100→0.5×），低声誉更高（0→1.5×）。 */
function reputationCreditMultiplier(score, config) {
  const boost = (typeof config.reputationCreditBoost === 'number' ? config.reputationCreditBoost : 0.5);
  return 1 - boost * ((score - 50) / 50);
}

const SICK_TEMPLATES = ['我感觉不舒服，需要医疗帮助。', '我好像发烧了，有人有药吗？', '咳嗽好几天了，希望早点好起来。'];
const CHAT_TEMPLATES = ['避难所今天还算安稳。', '今天的天气不错。', '大家要互相帮助啊。', '晚上一起吃点东西吧。'];

// **人格口吻**（缺陷 D：此前正文只从 3~4 条固定模板里随机取，
// 同一处境下所有人的发言逐字相同，编年志读起来千篇一律）。
// 现在正文由「处境数值 + 人格口吻」合成 —— 这正是探索契约所说的
// 「由各方因素综合计算出的结果」：谁在说、处境多严重，都进正文。
const PERSONA_VOICE = Object.freeze({
  adventurous: '总想试试没做过的事。',
  sociable: '还是人多了热闹。',
  industrious: '手上有活干才踏实。',
  cautious: '凡事还是稳一点好。',
  generous: '大家互相帮衬着过吧。',
});

/** 取该居民的人格口吻（无画像时返回空串）。 */
function voiceOf(agentId) {
  try {
    const prof = agent.persona.personality.profile(agentId);
    return PERSONA_VOICE[prof?.dominant] ?? '';
  } catch { return ''; }
}

/** 依真实处境拼装发帖内容（饥饿/患病/破产/贫困/闲聊），不调用真实大模型。
 *  failedFounders 由调用方每 tick 计算一次传入，避免逐帖重查全量企业列表。 */
function situationOf(agentId, failedFounders) {
  let needs = { food: 0, water: 0 };
  try { needs = survival.needs.meter.query({ agentId }).needs; } catch { /* 无需求记录 */ }
  let infected = false;
  try { infected = survival.health.disease.status({ agentId }).infected; } catch { /* 无健康记录 */ }
  const acctId = accounts.get(agentId);
  let balance = 0;
  if (acctId) { try { balance = economy.ledger.account.balance(acctId) ?? 0; } catch { /* 无账户 */ } }

  // 正文 = 处境数值 + 人格口吻。数值让「有多严重」可读，口吻让「是谁在说」可辨。
  const voice = voiceOf(agentId);
  const pct = (v) => Math.round(Math.max(0, Math.min(1, v)) * 100) + '%';
  if (infected) {
    const frame = SICK_TEMPLATES[Math.floor(prFloat(0, 1) * SICK_TEMPLATES.length)];
    return { context: 'sick', content: frame + voice, salience: 0.9 };
  }
  if (needs.food >= 0.6) {
    return { context: 'hungry', content: '好饿（食物需求 ' + pct(needs.food) + '），谁能分我点食物？' + voice, salience: 0.9 };
  }
  if (failedFounders.has(agentId)) {
    return { context: 'bankrupt', content: '我的企业破产了（余款 ' + Math.round(balance) + '），真是糟透了。' + voice, salience: 0.85 };
  }
  if (balance < 100) {
    return { context: 'poor', content: '手头有点紧（余款 ' + Math.round(balance) + '），想找份工作。' + voice, salience: 0.6 };
  }
  const chat = CHAT_TEMPLATES[Math.floor(prFloat(0, 1) * CHAT_TEMPLATES.length)];
  return { context: 'chat', content: chat + voice, salience: 0.3 };
}

const REPLY_TEMPLATES = {
  sick: ['注意休息，我帮你看看。', '医疗物资还够，别担心。'],
  hungry: ['我分你一点食物。', '再坚持一下，采集队快回来了。'],
  bankrupt: ['别灰心，重新再来。', '有需要就开口。'],
  poor: ['我可以介绍你一份工。', '去企业问问看吧。'],
  chat: ['说得对。', '同感。'],
};

/** 批次2-E：社交平台与声誉（发帖/回复/点赞踩/信息流/声誉反馈）。 */
function runPlatform(tick, agents, config = {}) {
  const result = { posts: 0, replies: 0, reactions: 0, feedGenerated: false, feedSignature: [] };
  if (agents.length === 0) return result;

  const postRate = (typeof config.postRate === 'number' && config.postRate >= 0) ? config.postRate : 0.08;
  const replyRate = (typeof config.replyRate === 'number' && config.replyRate >= 0) ? config.replyRate : 0.12;
  const reactRate = (typeof config.reactRate === 'number' && config.reactRate >= 0) ? config.reactRate : 0.25;
  const repReplyGain = (typeof config.reputationReplyGain === 'number' ? config.reputationReplyGain : 0.5);
  const repUpvoteGain = (typeof config.reputationUpvoteGain === 'number' ? config.reputationUpvoteGain : 0.05);
  const repDownvotePenalty = (typeof config.reputationDownvotePenalty === 'number' ? config.reputationDownvotePenalty : 0.3);
  const feedSize = (Number.isInteger(config.feedSize) && config.feedSize > 0) ? config.feedSize : 8;
  const feedInterval = (Number.isInteger(config.feedInterval) && config.feedInterval > 0) ? config.feedInterval : 10;

  const allIds = agents.map((a) => a.id);

  // 1) 发帖：由真实处境驱动（饥饿/患病/破产/贫困/闲聊），数量带随机扰动 → 跨种子涌现
  // 破产创始人集合每 tick 计算一次，避免逐帖重查全量企业列表（图读取热点）。
  const failedFounders = new Set(
    economy.industry.business.list().filter((b) => b.status !== 'active').map((b) => b.founderId),
  );
  const posterCount = Math.max(1, Math.round(agents.length * postRate * prFloat(0.5, 1.5)));
  const posters = prShuffle(allIds).slice(0, posterCount);
  for (const authorId of posters) {
    const sit = situationOf(authorId, failedFounders);
    const post = social.platform.posts.publish({ authorId, content: sit.content, context: sit.context, tick, salience: sit.salience });
    recentPostIds.push(post.postId);
    if (recentPostIds.length > 40) recentPostIds.shift();
    postCount += 1;
    result.posts += 1;
    // 契约修正：payload 原先不含 content，观察者只能看到「谁在什么处境下发帖」，
    // 看不到**说了什么** —— 编年志里社交内容整体不可见。补上 content 与 salience。
    observer.recorder.eventLog.record({
      tick, topic: 'social.platform.post',
      payload: { postId: post.postId, authorId, context: sit.context, content: sit.content, salience: sit.salience },
      agentId: authorId,
    });
  }

  // 2) 回复：近期帖子被居民回复（首次被回复使作者声誉上升，避免刷回复灌声誉）
  const replyTargets = recentPostIds.slice(-4);
  for (const postId of replyTargets) {
    const post = social.platform.posts.get(postId);
    if (!post) continue;
    const hadReplies = post.replyCount > 0;
    const nReplies = Math.max(0, Math.round(allIds.length * replyRate * prFloat(0.5, 1.5)));
    const repliers = prShuffle(allIds.filter((id) => id !== post.authorId)).slice(0, nReplies);
    let added = 0;
    for (const replierId of repliers) {
      const tpls = REPLY_TEMPLATES[post.context] ?? REPLY_TEMPLATES.chat;
      const content = tpls[Math.floor(prFloat(0, 1) * tpls.length)];
      social.platform.posts.reply({ postId, authorId: replierId, content, tick });
      replyCount += 1;
      result.replies += 1;
      added += 1;
    }
    if (!hadReplies && added > 0) {
      try { social.reputation.update({ agentId: post.authorId, delta: repReplyGain, reason: 'first_reply', tick }); } catch { /* 忽略 */ }
    }
  }

  // 3) 回应（点赞/踩）：居民表态（点赞微升、踩使作者声誉下降）
  if (recentPostIds.length > 0 && reactRate > 0) {
    const nReactors = Math.max(1, Math.round(agents.length * reactRate * prFloat(0.5, 1.5)));
    const reactors = prShuffle(allIds).slice(0, nReactors);
    for (const reactorId of reactors) {
      const postId = recentPostIds[Math.floor(prFloat(0, 1) * recentPostIds.length)];
      const kind = prFloat(0, 1) < 0.7 ? 'up' : 'down';
      // 复用 react 返回的帖子（含 authorId），省去一次 posts.get 的图读取。
      const post = social.platform.posts.react({ postId, agentId: reactorId, kind, tick });
      reactCount += 1;
      result.reactions += 1;
      if (post) {
        const delta = kind === 'up' ? repUpvoteGain : -repDownvotePenalty;
        try { social.reputation.update({ agentId: post.authorId, delta, reason: kind === 'up' ? 'upvoted' : 'downvoted', tick }); } catch { /* 忽略 */ }
      }
    }
  }

  // 4) 信息流：按社区/关系/声誉排序（谁看到什么），按 feedInterval 节流
  if (lastFeedTick < 0 || tick - lastFeedTick >= feedInterval) {
    const viewer = allIds[0];
    const feed = social.platform.feeds.generate({ agentId: viewer, limit: feedSize, communitySnapshot, tick });
    lastFeedTick = tick;
    feedSignature = feed.map((p) => p.authorId);
    result.feedGenerated = true;
    result.feedSignature = feedSignature;
  }

  return result;
}

let reserveScalePop = -1;

/**
 * 人口变化时按人均容量重算避难所储备上限。
 *
 * 修复：储备容量此前**只在播种期按初始人口算一次**（capacity = 4 × 50 = 200），
 * 之后小镇生育长大也不再重算。于是人口涨到 74 时人均容量从 4 掉到 2.7，
 * 库存长期顶在天花板上（实测人均库存被压在 1.9~2.0 而不是 4），
 * 而 scoreAction 对 work/found 的「自家有粮才谈发展」闸门以固定人均 2.5 为参照 ——
 * 小镇明明零死亡却被人为判定为「余粮不足」，work 从 24.7% 掉到 0.8%、几近灭绝。
 *
 * 这里只上调**容量**，不动库存：天花板抬高后能积到多少，仍由小镇自己的采集
 * 与生产决定。直接补库存等于凭空发粮，会掩盖真实的稀缺。
 */
function rescaleReserves(population, config = {}) {
  const n = Math.max(1, population);
  if (n === reserveScalePop) return;
  reserveScalePop = n;
  const capacityPerCapita = (typeof config.reserveCapacityPerCapita === 'number' && config.reserveCapacityPerCapita >= 0)
    ? config.reserveCapacityPerCapita : 4;
  const capacity = Math.max(100, Math.round(capacityPerCapita * n));
  try {
    survival.resources.food.configure({ capacity });
    survival.resources.water.configure({ capacity });
  } catch { /* 资源未初始化则跳过 */ }
}

/**
 * 推进一个 tick 的第二阶段流程。
 * @param {{ tick: number, agents: Array<{ id: string }>, config?: object, spawnChild: (child: object) => object }} input
 * @returns {object}
 */
const TICK_STEPS = Object.freeze([
  { id: 'procreation', label: '生育与家族', run: (c) => runProcreation(c.tick, c.agents, c.spawnChild, c.config) },
  // P1：行动空间开启时，社交边**只**由居民的 socialize 行动产生。
  // 这条硬编码的相似度建边（内部固定用 agents[0]）会让社交结构对行动空间完全不敏感。
  { id: 'similarityBonding', label: '相似度建边', run: (c) => (c.config.actionSpaceEnabled === false ? runSimilarityBonding(c.tick, c.agents, c.config) : { bonds: 0, pair: null, gated: true }) },
  { id: 'market', label: '市场撮合', run: (c) => runMarket(c.tick, c.agents, c.config) },
  { id: 'industry', label: '产业与企业', run: (c) => runIndustry(c.tick, c.agents, c.config) },
  { id: 'fiscal', label: '税收与信贷', run: (c) => runFiscal(c.tick, c.agents, c.config) },
  { id: 'crafting', label: '制作与建造', run: (c) => runCrafting(c.tick, c.agents) },
  { id: 'shelter', label: '居所修缮', run: (c) => runShelterRepair(c.config) },
  { id: 'residence', label: '居住分配', run: (c) => runResidence(c.tick, c.agents, c.config) },
  { id: 'health', label: '健康与疫情', run: (c) => runHealth(c.tick, c.agents, c.config) },
  { id: 'platform', label: '社交平台', run: (c) => runPlatform(c.tick, c.agents, c.config) },
  { id: 'community', label: '社区发现', run: (c) => runCommunity(c.tick, c.agents, c.config) },
  // t13：到期承诺的结算必须**每 tick 发生一次**。它把「承诺」从一次性记录变成
  // 有期限的社会契约——过期未交付即违约，并产生关系与声誉后果。
  { id: 'obligations', label: '承诺结算', run: (c) => runObligationSettlement(c.tick) },
]);

/**
 * 第二阶段的可分步序列：每完成一个子系统就 yield 一次进度。
 * 挂机节拍器靠它把「一个 tick」摊成若干可观测的小步；批处理 `tick()` 靠它保持单一事实来源。
 * 步骤顺序 = 返回对象的键顺序，两者不可各自维护。
 * @param {{ tick: number, agents: Array<{ id: string }>, config?: object, spawnChild: (child: object) => object }} input
 */
export function* tickSequence(input = {}) {
  const ctx = { tick: input.tick, agents: input.agents, config: input.config ?? {}, spawnChild: input.spawnChild };
  settledAgentIds = ctx.agents.map((a) => a.id);
  _candidateStateCache = null;
  rescaleReserves(ctx.agents.length, ctx.config);
  for (let i = 0; i < TICK_STEPS.length; i += 1) {
    const stepDef = TICK_STEPS[i];
    const value = stepDef.run(ctx);
    yield { id: stepDef.id, label: stepDef.label, index: i, total: TICK_STEPS.length, value };
  }
}

/**
 * 推进一个 tick 的第二阶段流程（批处理：一次跑完全部子系统）。
 * @param {{ tick: number, agents: Array<{ id: string }>, config?: object, spawnChild: (child: object) => object }} input
 * @returns {object}
 */
export function tick(input) {
  const out = {};
  for (const unit of tickSequence(input)) out[unit.id] = unit.value;
  return out;
}

/**
 * t13：结算到期未交付的承诺（违约）。
 *
 * 放在阶段二末尾而不是决策阶段：结算的对象是**已经发生的事实**
 *（期限已过且没交货），不应受本 tick 的决策影响，也不该占用居民的行动机会。
 * 返回计数以便主循环把它计入 summary 与观测。
 */
function runObligationSettlement(tick) {
  const out = social.interaction.settleOverdue({ tick });
  // t26（F1）：待决互动的**有限等待**。t13 只给了接收方否决权，没给「不回应」后果，
  // 于是请求可以永久挂着（实测 4 条 socialize 到跑完都没人答复）。
  // 沉默即拒绝：超时未答复落成 rejected（不建关系/不涨声誉），等待因此**有界**。
  const stale = social.interaction.settleStaleResponses({ tick, maxWait: responseSilenceTicks() });
  // 不另设计数器：违约的**权威计数**在 interaction.stats().violated 里。
  // 再存一份就又是一处需要入档、会与事实漂移的影子状态。
  return { overdue: out.overdue.length, items: out.overdue, timedOut: stale.count };
}

/**
 * t26：回应沉默的上限（tick）。超过这个等待还没有答复，就按「没答应」结案。
 * 取与 promiseDueTicks 同量级（默认 10）：
 * 别人的请求和你欠的承诺一样，都该在十个 tick 内有个说法。
 * 必须**大于** responseMaxWaitTicks（3，优先级老化点），
 * 否则「等超时就更优先」这条规则永远来不及生效。
 */
function responseSilenceTicks(cfg) {
  let raw = cfg && Number.isInteger(cfg.responseSilenceTicks) && cfg.responseSilenceTicks > 0
    ? cfg.responseSilenceTicks
    : undefined;
  if (raw === undefined) {
    try { raw = configStore.get('responseSilenceTicks'); } catch { raw = undefined; }
  }
  return Number.isInteger(raw) && raw > 0 ? raw : 10;
}

/** 批次2-D：社区发现（每 N tick 重算，避免每 tick 全量重算拖慢长跑）。 */
function runCommunity(tick, agents, config = {}) {
  const interval = (Number.isInteger(config.communityDetectInterval) && config.communityDetectInterval > 0) ? config.communityDetectInterval : 10;
  if (communitySnapshot !== null && lastCommunityTick >= 0 && tick - lastCommunityTick < interval) {
    return { ...communitySnapshot, throttled: true };
  }
  lastCommunityTick = tick;
  communitySnapshot = social.graph.community.detect({ threshold: 0.5 });
  return communitySnapshot;
}

/** 声誉分布快照（跨种子涌现证据：均值/极值/受信/失信人数）。 */
function reputationDistribution() {
  const recs = social.reputation.list();
  if (recs.length === 0) return { count: 0, mean: 50, min: 50, max: 50, trusted: 0, distrusted: 0 };
  const scores = recs.map((r) => r.score);
  return {
    count: recs.length,
    mean: scores.reduce((s, x) => s + x, 0) / scores.length,
    min: Math.min(...scores),
    max: Math.max(...scores),
    trusted: recs.filter((r) => r.level === 'trusted').length,
    distrusted: recs.filter((r) => r.level === 'distrusted').length,
  };
}

/** 阶段二累计摘要（供 loop.run 报告与观测）。 */
export function summary() {
  return {
    seeded,
    childrenBorn,
    trades: tradeCount,
    crafted: craftCount,
    built: buildCount,
    treated: treatCount,
    quarantined: quarantineCount,
    released: releasesCount,
    // businesses = **当前存活**的企业数（市场容量会把它锁在上限附近）；
    // businessesFounded = **累计创办**数，反映居民真实的创业决策量。
    // 两者互补：只报存活数会把「创办了多少次」这一涌现信号完全掩盖——
    // 实测三个种子的存活数恒为 5/5/5（容量上限），
    // 而累计创办数才体现居民行为的差异。
    businesses: economy.industry.business.list().filter((b) => b.status === 'active').length,
    businessesFounded: businessIds.length,
    goodsProduced,
    goodsSold,
    businessRevenue,
    businessCosts,
    wagesPaid,
    bankruptcies,
    creditIssued,
    interestAccrued,
    taxCollected,
    taxRedistributed,
    residentEnergyUsed,
    industryEnergyUsed,
    lossTicks,
    supplyBalance: supplyAccountId !== null ? (economy.ledger.account.balance(supplyAccountId) ?? 0) : 0,
    postCount,
    replyCount,
    reactCount,
    reputationTriageSwaps,
    reputationTriageTreatedScore,
    feedSignature,
    reputation: reputationDistribution(),
  };
}

/** 复位阶段二全部内存态（图存储由 loop.reset 的 graph.__reset 负责）。 */
export function __reset() {
  seeded = false;
  foundCapitalConfig = null;
  accounts = new Map();
  reproducedPairs.clear();
  childrenBorn = 0;
  itemIds = {};
  settledAgentIds = [];
  _candidateStateCache = null;
  _candidateStateCacheTick = -1;
  reserveScalePop = -1;
  pendingCourts.clear();
  pairedIndex.clear();
  tradeCount = 0;
  craftCount = 0;
  buildCount = 0;
  treatCount = 0;
  quarantineCount = 0;
  releasesCount = 0;
  businessIds = [];
  goodsProduced = 0;
  wagesPaid = 0;
  bankruptcies = 0;
  creditIssued = 0;
  interestAccrued = 0;
  taxCollected = 0;
  taxRedistributed = 0;
  supplyAccountId = null;
  goodsSold = 0;
  businessRevenue = 0;
  businessCosts = 0;
  residentEnergyUsed = 0;
  industryEnergyUsed = 0;
  lossTicks = 0;
  lastCommunityTick = -1;
  communitySnapshot = null;
  postCount = 0;
  replyCount = 0;
  reactCount = 0;
  reputationTriageSwaps = 0;
  reputationTriageTreatedScore = 0;
  lastFeedTick = -1;
  feedSignature = [];
  recentPostIds = [];
  // platformGen 是平台侧随机源。不复位会让 __reset 后的随机序列延续上一局，
  // 使同一份代码的结果取决于此前跑过什么（与 e63b932 修的同类泄漏）。
  // 复位到模块加载时的默认种子；seed() 会按需重新播种。
  // 这里**直接赋值**而不是调用 platformGenRestore_：复位点的可见性本身是契约的
  // 一部分——静态索引（bin/flow-index.mjs）只认复位函数体内的写入，藏在辅助函数
  // 后面的复位会被报成 store/reset-missing，让真正的残留缺陷淹没在噪声里。
  platformGenState = 0x9e3779b9 >>> 0;
  platformGen = mulberry32(platformGenState, (a) => { platformGenState = a; });

  economy.__reset();
  agent.inventory.item.__reset();
  agent.inventory.backpack.__reset();
  agent.crafting.recipe.__reset();
  agent.crafting.workbench.executor.__reset();
  agent.crafting.construction.__reset();
  agent.crafting.writing.__reset();
  survival.health.disease.__reset();
  survival.health.epidemic.__reset();
}

// ---- 持久化：阶段二模块级状态必须进存档 ----
// 这些变量决定「谁能工作 / 谁和谁配对 / 已生几胎 / 企业盈亏 / 社区快照相位 /
// 平台随机流」——全部是逐 tick 累积的仿真状态，只存在于内存。
// 不入档则恢复后阶段二从「未播种」重来：账户重建、配对清空、生育上限复位、
// 企业统计归零，续跑与连续运行必然分叉。

export function __snapshot() {
  return {
    seeded,
    platformGen: platformGenState_(),
    accounts: [...accounts.entries()],
    settledAgentIds: [...settledAgentIds],
    pendingCourts: [...pendingCourts.entries()].map(([k, v]) => [k, [...v]]),
    pairedIndex: [...pairedIndex.entries()],
    reproducedPairs: [...reproducedPairs],
    childrenBorn,
    itemIds: { ...itemIds },
    tradeCount, craftCount, buildCount, treatCount, quarantineCount, releasesCount,
    businessIds: [...businessIds],
    goodsProduced, wagesPaid, bankruptcies, creditIssued, interestAccrued,
    taxCollected, taxRedistributed,
    supplyAccountId,
    goodsSold, businessRevenue, businessCosts,
    residentEnergyUsed, industryEnergyUsed, lossTicks,
    lastCommunityTick,
    communitySnapshot: communitySnapshot === null ? null : structuredClone(communitySnapshot),
    postCount, replyCount, reactCount,
    reputationTriageSwaps, reputationTriageTreatedScore,
    lastFeedTick,
    feedSignature: [...feedSignature],
    recentPostIds: [...recentPostIds],
    foundCapitalConfig: foundCapitalConfig === null ? null : structuredClone(foundCapitalConfig),
    reserveScalePop,
  };
}

/**
 * 恢复阶段二状态（整体替换）。
 *
 * 派生缓存（_candidateStateCache / _candidateStateCacheTick）**故意不还原**：
 * 它按 tick 判定有效期，恢复后 tick 已推进，首次读取会自然重建。
 * platformGen 的流位置必须还原，否则平台侧随机序列（发帖/回复/点赞）
 * 会与连续运行错位。
 * @param {object} [data]
 */
export function __restore(data = {}) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('stage2.__restore: 状态必须为对象');
  }
  const d = data;
  seeded = d.seeded === true;
  platformGenRestore_(d.platformGen);
  accounts = new Map(Array.isArray(d.accounts) ? d.accounts : []);
  settledAgentIds = Array.isArray(d.settledAgentIds) ? [...d.settledAgentIds] : [];
  pendingCourts.clear();
  for (const pair of (Array.isArray(d.pendingCourts) ? d.pendingCourts : [])) {
    if (Array.isArray(pair) && pair.length >= 2) pendingCourts.set(pair[0], new Set(pair[1] ?? []));
  }
  pairedIndex.clear();
  for (const pair of (Array.isArray(d.pairedIndex) ? d.pairedIndex : [])) {
    if (Array.isArray(pair) && pair.length >= 2) pairedIndex.set(pair[0], pair[1]);
  }
  reproducedPairs.clear();
  for (const k of (Array.isArray(d.reproducedPairs) ? d.reproducedPairs : [])) reproducedPairs.add(k);
  childrenBorn = intOr(d.childrenBorn, 0);
  itemIds = (d.itemIds && typeof d.itemIds === 'object') ? { ...d.itemIds } : {};
  tradeCount = intOr(d.tradeCount, 0);
  craftCount = intOr(d.craftCount, 0);
  buildCount = intOr(d.buildCount, 0);
  treatCount = intOr(d.treatCount, 0);
  quarantineCount = intOr(d.quarantineCount, 0);
  releasesCount = intOr(d.releasesCount, 0);
  businessIds = Array.isArray(d.businessIds) ? [...d.businessIds] : [];
  goodsProduced = intOr(d.goodsProduced, 0);
  wagesPaid = numOr(d.wagesPaid, 0);
  bankruptcies = intOr(d.bankruptcies, 0);
  creditIssued = numOr(d.creditIssued, 0);
  interestAccrued = numOr(d.interestAccrued, 0);
  taxCollected = numOr(d.taxCollected, 0);
  taxRedistributed = numOr(d.taxRedistributed, 0);
  supplyAccountId = typeof d.supplyAccountId === 'string' ? d.supplyAccountId : null;
  goodsSold = numOr(d.goodsSold, 0);
  businessRevenue = numOr(d.businessRevenue, 0);
  businessCosts = numOr(d.businessCosts, 0);
  residentEnergyUsed = numOr(d.residentEnergyUsed, 0);
  industryEnergyUsed = numOr(d.industryEnergyUsed, 0);
  lossTicks = intOr(d.lossTicks, 0);
  lastCommunityTick = intOr(d.lastCommunityTick, -1);
  communitySnapshot = (d.communitySnapshot === null || d.communitySnapshot === undefined) ? null : structuredClone(d.communitySnapshot);
  postCount = intOr(d.postCount, 0);
  replyCount = intOr(d.replyCount, 0);
  reactCount = intOr(d.reactCount, 0);
  reputationTriageSwaps = intOr(d.reputationTriageSwaps, 0);
  reputationTriageTreatedScore = numOr(d.reputationTriageTreatedScore, 0);
  lastFeedTick = intOr(d.lastFeedTick, -1);
  feedSignature = Array.isArray(d.feedSignature) ? [...d.feedSignature] : [];
  recentPostIds = Array.isArray(d.recentPostIds) ? [...d.recentPostIds] : [];
  foundCapitalConfig = (d.foundCapitalConfig === null || d.foundCapitalConfig === undefined) ? null : structuredClone(d.foundCapitalConfig);
  reserveScalePop = intOr(d.reserveScalePop, -1);
  // 派生缓存主动作废：tick 已推进，旧候选快照不再可信。
  _candidateStateCache = null;
  _candidateStateCacheTick = -1;
  return { seeded, childrenBorn, accounts: accounts.size };
}

function intOr(v, dflt) {
  return Number.isInteger(v) ? v : dflt;
}

function numOr(v, dflt) {
  return (typeof v === 'number' && Number.isFinite(v)) ? v : dflt;
}
