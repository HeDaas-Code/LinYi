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
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
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
let platformGen = mulberry32(0x9e3779b9 >>> 0);
function platformSeed(seedValue) {
  platformGen = mulberry32(hashSeed('platform:' + String(seedValue ?? 0)));
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

/** 生育：找最契合的一对 → 恋爱 → 子代 → 谱系 → 注册进主循环。 */
function runProcreation(tick, agents, spawnChild, config = {}) {
  const maxChildren = 2;
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
  const fam = social.family.registry.create({
    name: '家族' + childrenBorn,
    founder: pair.a,
    members: [pair.a, pair.b],
    generation: { 0: [pair.a, pair.b] },
    tick,
  });
  const familyId = fam.familyId;
  const child = social.procreation.offspring.request({
    a: pair.a, b: pair.b, familyId, name: '新生儿' + familyId,
  });
  social.family.lineage.register({
    agentId: child.id, familyId, parents: [pair.a, pair.b], generation: 1,
  });
  social.family.registry.addMember({ familyId, memberId: child.id, generation: 1 });
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
    payload: { a: pair.a, b: pair.b, childId: child.id, familyId, similarity: sim.similarity },
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
    _candidateStateCache = { employedIds, anyActive, activeCount, startedIds, balances, disposableTotal };
    _candidateStateCacheTick = tick;
  }
  const paired = pairedIndex.has(agentId);
  return {
    hasPeer: settledAgentIds.length > 1,
    employed: _candidateStateCache.employedIds.has(agentId),
    businessActive: _candidateStateCache.anyActive,
    paired,
    eligibleMate: !paired && settledAgentIds.some((id) => id !== agentId && !pairedIndex.has(id)),
    hasPendingCourt: !paired && (pendingCourts.get(agentId) ?? []).length > 0,
    // 探索条件：由 expedition.plan 评估（纯读）。居民据此判断"今天值不值得出去"。
    // 注意这是**建议**而非门：可行性为 false 只表示条件很差，最终选择权在居民。
    ...expeditionConditionsFor(agentId),
    // 创办企业条件（D2）：只看**该居民自己的账户余额**，不借不送——
    // 因此企业诞生取决于谁攒下了钱，这是涌现的来源而非固定指派。
    ...foundConditionsFor(agentId),
  };
}

/**
 * 评估某居民的探索条件。
 * 把生存状态、特质、装备、天气与辐射都交给 expedition.plan，
 * 让「外出探索」成为一个有信息依据的候选，而不是随机出现。
 */
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
      const biz = businessIds.find((id) => {
        const b = economy.industry.business.list().find((x) => x.businessId === id);
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
      const peer = pickPeer(agentId);
      if (peer === null) return { ok: false, reason: 'no_peer' };
      social.relationship.friendship.update({ a: agentId, b: peer, delta: 0.05, note: 'tick ' + tick });
      // P1：社交边由居民**自己的社交行动**产生。此前边只由代码的相似度建边产生，
      // 导致行动空间 4→9 时社交结构逐字节不变（见 reports/laya-evaluation.md 同源审计）。
      social.graph.edges.create({ a: agentId, b: peer, type: 'friendship', weight: 0.2, note: 'socialize' });
      observer.recorder.eventLog.record({ tick, topic: 'agent.action.socialize', payload: { peer }, agentId });
      return { ok: true, detail: { peer } };
    }
    case 'court': {
      if (pairedIndex.has(agentId)) return { ok: false, reason: 'already_paired' };
      const peer = pickMate(agentId);
      if (peer === null) return { ok: false, reason: 'no_eligible_mate' };
      try {
        social.relationship.romance.propose({ from: agentId, to: peer });
        const list = pendingCourts.get(peer) ?? [];
        if (!list.includes(agentId)) list.push(agentId);
        pendingCourts.set(peer, list);
        observer.recorder.eventLog.record({ tick, topic: 'agent.action.court', payload: { peer }, agentId });
        return { ok: true, detail: { peer } };
      } catch (err) { return { ok: false, reason: 'court_failed:' + err.message.slice(0, 40) }; }
    }
    case 'accept': {
      // P1：接受表白是**被追求方自己的决策**，而非代码自动完成配对。
      if (pairedIndex.has(agentId)) return { ok: false, reason: 'already_paired' };
      const list = pendingCourts.get(agentId) ?? [];
      if (list.length === 0) return { ok: false, reason: 'no_pending_court' };
      const from = list[list.length - 1];
      try {
        social.relationship.romance.accept({ from, to: agentId });
        pairedIndex.set(agentId, from);
        pairedIndex.set(from, agentId);
        pendingCourts.delete(agentId);
        observer.recorder.eventLog.record({ tick, topic: 'agent.action.accept', payload: { from }, agentId });
        return { ok: true, detail: { from } };
      } catch (err) { return { ok: false, reason: 'accept_failed:' + err.message.slice(0, 40) }; }
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

/**
 * 推进一个 tick 的第二阶段流程。
 * @param {{ tick: number, agents: Array<{ id: string }>, config?: object, spawnChild: (child: object) => object }} input
 * @returns {object}
 */
export function tick({ tick, agents, config = {}, spawnChild }) {
  settledAgentIds = agents.map((a) => a.id);
  _candidateStateCache = null;
  return {
    procreation: runProcreation(tick, agents, spawnChild, config),
    // P1：行动空间开启时，社交边**只**由居民的 socialize 行动产生。
    // 这条硬编码的相似度建边（内部固定用 agents[0]）会让社交结构对行动空间完全不敏感。
    similarityBonding: config.actionSpaceEnabled === false ? runSimilarityBonding(tick, agents, config) : { bonds: 0, pair: null, gated: true },
    market: runMarket(tick, agents, config),
    industry: runIndustry(tick, agents, config),
    fiscal: runFiscal(tick, agents, config),
    crafting: runCrafting(tick, agents),
    shelter: runShelterRepair(config),
    residence: runResidence(tick, agents, config),
    health: runHealth(tick, agents, config),
    platform: runPlatform(tick, agents, config),
    community: runCommunity(tick, agents, config),
  };
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
  platformGen = mulberry32(0x9e3779b9 >>> 0);

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
