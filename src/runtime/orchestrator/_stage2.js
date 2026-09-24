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
import * as configStore from '../../infra/config.js';


const RESIDENCE_ID = 'dorm_a';
const SYMBOL = 'food';

/** 阶段二模块级状态（由 __reset 清空）。 */
let seeded = false;
/** @type {Map<string, string>} agentId → accountId */
let accounts = new Map();
/** @type {Set<string>} 已生育的配对键（排序 a:b，防重复生育） */
const reproducedPairs = new Set();
let childrenBorn = 0;
let wroteBook = false;
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
  seeded = true;
  accounts = new Map();
  reproducedPairs.clear();
  childrenBorn = 0;
  wroteBook = false;
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

  return {
    shelter: shelter.length,
    residences: agents.length,
    accounts: agents.length,
    price: priceValue,
    goodsPrice,
    businesses: businessIds.length,
    itemIds: { ...itemIds },
  };
}

/** 生育：找最契合的一对 → 恋爱 → 子代 → 谱系 → 注册进主循环。 */
function runProcreation(tick, agents, spawnChild, config = {}) {
  const maxChildren = 2;
  const result = { childId: null, parents: null, familyId: null };
  if (childrenBorn >= maxChildren || agents.length < 2) return result;

  const ids = agents.map((a) => a.id);
  const matchThreshold = (typeof config.procreationMatchThreshold === 'number' && config.procreationMatchThreshold >= 0 && config.procreationMatchThreshold <= 1)
    ? config.procreationMatchThreshold : 0.3;
  const pairs = social.procreation.match.pair({ agentIds: ids, k: Math.max(4, ids.length), threshold: matchThreshold });
  if (pairs.length === 0) return result;

  // 随机化配对顺序，再跳过已生育过的配对（防同一对反复繁殖 + 让种子产生结构差异）
  let pair = null;
  for (const p of rng.shuffle(pairs)) {
    if (!reproducedPairs.has(sortedPairKey(p.a, p.b))) { pair = p; break; }
  }
  if (pair === null) return result;
  reproducedPairs.add(sortedPairKey(pair.a, pair.b));

  try {
    if (social.relationship.romance.state({ a: pair.a, b: pair.b }) === 'none') {
      social.relationship.romance.propose({ from: pair.a, to: pair.b });
    }
    if (social.relationship.romance.state({ a: pair.a, b: pair.b }) === 'proposed') {
      social.relationship.romance.accept({ from: pair.a, to: pair.b });
    }
  } catch {
    // 已配对 / 已分手等，跳过恋爱状态迁移，不影响后续
  }

  childrenBorn += 1;
  const familyId = 'fam_' + childrenBorn;
  const child = social.procreation.offspring.request({
    a: pair.a, b: pair.b, familyId, name: '新生儿' + familyId,
  });
  social.family.lineage.register({
    agentId: child.id, familyId, parents: [pair.a, pair.b], generation: 1,
  });
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

  // 1) 每 tick 计息
  const accruals = economy.bank.interest.accrueAll({ mode: interestMode, rate: creditRate, tick });
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

function pendingFor(queue, agentId) {
  return queue.pending().some((j) => j.agentId === agentId);
}

/** 制作：发起物品制作 / 建筑建造 / 自由写书，并推进三路任务队列。 */
function runCrafting(tick, agents) {
  const result = { crafted: 0, built: 0, wrote: 0 };
  if (agents.length === 0) return result;

  const crafter = agents[0].id;
  const builder = agents.length > 1 ? agents[1].id : null;
  const writer = agents.length > 2 ? agents[2].id : null;

  if (!pendingFor(agent.crafting.workbench.executor, crafter)) {
    try { agent.crafting.workbench.executor.craft({ agentId: crafter, recipeId: 'axe' }); } catch { /* 材料不足 */ }
  }
  if (builder && !pendingFor(agent.crafting.construction, builder)) {
    try { agent.crafting.construction.build({ agentId: builder, recipeId: 'barn' }); } catch { /* 材料不足 */ }
  }
  if (writer && !wroteBook) {
    agent.crafting.writing.write_book({ agentId: writer, title: '避难所纪事', content: '第 ' + tick + ' 天的记录' });
    wroteBook = true;
  }

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
  for (let i = 0; i < capacity && i < triage.length; i += 1) {
    const patient = triage[i];
    const healed = survival.health.treatment.apply({ agentId: patient.agentId, tick });
    treatCount += 1;
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

/**
 * 推进一个 tick 的第二阶段流程。
 * @param {{ tick: number, agents: Array<{ id: string }>, config?: object, spawnChild: (child: object) => object }} input
 * @returns {object}
 */
export function tick({ tick, agents, config = {}, spawnChild }) {
  return {
    procreation: runProcreation(tick, agents, spawnChild, config),
    similarityBonding: runSimilarityBonding(tick, agents, config),
    market: runMarket(tick, agents, config),
    industry: runIndustry(tick, agents, config),
    fiscal: runFiscal(tick, agents, config),
    crafting: runCrafting(tick, agents),
    shelter: runShelterRepair(config),
    residence: runResidence(tick, agents, config),
    health: runHealth(tick, agents, config),
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
  };
}

/** 复位阶段二全部内存态（图存储由 loop.reset 的 graph.__reset 负责）。 */
export function __reset() {
  seeded = false;
  accounts = new Map();
  reproducedPairs.clear();
  childrenBorn = 0;
  wroteBook = false;
  itemIds = {};
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
