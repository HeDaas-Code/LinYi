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
  const businessCount = (Number.isInteger(config.businessCount) && config.businessCount >= 0) ? config.businessCount : 2;
  const businessCapital = (typeof config.businessCapital === 'number' && config.businessCapital >= 0) ? config.businessCapital : 200;
  const wage = (typeof config.wage === 'number' && config.wage >= 0) ? config.wage : 3;
  for (let i = 0; i < businessCount && agents.length > 0; i += 1) {
    const founder = agents[i % agents.length];
    const biz = economy.industry.business.found({
      founderId: founder.id,
      name: '企业' + (i + 1),
      industry: i % 2 === 0 ? 'food' : 'tools',
      capital: businessCapital,
    });
    businessIds.push(biz.businessId);
  }
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

  // 候选买方：有账户且余额够买 1 件商品的居民
  const buyerPool = agents
    .map((a) => accounts.get(a.id))
    .filter((acctId) => acctId && (economy.ledger.account.balance(acctId) ?? 0) >= goodsPrice);

  let demandRemaining = Math.max(0, Math.round(alive * goodsDemandPerCapita * rng.float(0.5, 1.5)));
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

export function candidateStateFor(agentId, tick = 0) {
  if (_candidateStateCache === null || _candidateStateCacheTick !== tick) {
    const employedIds = new Set();
    let anyActive = false;
    try {
      for (const id of businessIds) {
        for (const e of economy.industry.labour.staff(id)) employedIds.add(e.agentId);
        const biz = economy.industry.business.list().find((b) => b.businessId === id);
        if (biz !== undefined && biz.status === 'active') anyActive = true;
      }
    } catch { /* 无产业数据 */ }
    _candidateStateCache = { employedIds, anyActive };
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
  };
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
        observer.recorder.eventLog.record({ tick, topic: 'agent.action.write.started', payload: { bookId: rec?.bookId ?? null }, agentId });
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
      let held = 0;
      try { held = agent.inventory.backpack.list({ agentId }).items?.[woodId] ?? 0; } catch { held = 0; }
      const sellable = held - 2;
      if (sellable <= 0) return { ok: false, reason: 'no_surplus' };
      const price = (typeof config.rawPrice === 'number' && config.rawPrice > 0) ? config.rawPrice : 1;
      const revenue = sellable * price;
      try {
        const poolAcct = supplyAccountId;
        const bal = (typeof poolAcct === 'string' && poolAcct !== '')
          ? (economy.ledger.account.balance(poolAcct) ?? 0) : 0;
        if (bal < revenue) return { ok: false, reason: 'pool_insufficient' };
        economy.ledger.transaction.recorder.post({ from: poolAcct, to: acctId, amount: revenue, ref: 'trade', memo: '出售余粮' });
        agent.inventory.backpack.remove({ agentId, itemId: woodId, quantity: sellable });
        observer.recorder.eventLog.record({ tick, topic: 'agent.action.trade', payload: { itemId: woodId, quantity: sellable, revenue }, agentId });
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

  if (infected) return { context: 'sick', content: SICK_TEMPLATES[Math.floor(prFloat(0, 1) * SICK_TEMPLATES.length)], salience: 0.9 };
  if (needs.food >= 0.6) return { context: 'hungry', content: '好饿，谁能分我点食物？', salience: 0.9 };
  if (failedFounders.has(agentId)) return { context: 'bankrupt', content: '我的企业破产了，真是糟透了。', salience: 0.85 };
  if (balance < 100) return { context: 'poor', content: '手头有点紧，想找份工作。', salience: 0.6 };
  return { context: 'chat', content: CHAT_TEMPLATES[Math.floor(prFloat(0, 1) * CHAT_TEMPLATES.length)], salience: 0.3 };
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
    observer.recorder.eventLog.record({ tick, topic: 'social.platform.post', payload: { postId: post.postId, authorId, context: sit.context }, agentId: authorId });
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
    businesses: economy.industry.business.list().filter((b) => b.status === 'active').length,
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
