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

/** 每个居民的标签数（与 agent.traits.tagset 的 50 标签设定一致）。 */
const TAG_COUNT = 50;
/** 共有标签数（保证任意两居民有较高相似度，便于繁衍配对）。 */
const SHARED_TAG_COUNT = 45;

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

function sortedPairKey(a, b) {
  return a < b ? a + ':' + b : b + ':' + a;
}

/**
 * 生成 50 个特质标签（45 个共有 + 5 个居民特有），供 loop 播种 / 子代遗传使用。
 * @param {number} agentIndex 居民序号（用于生成唯一后缀）
 * @returns {Array<{ key: string, weight: number }>}
 */
export function makeTags(agentIndex = 0) {
  const tags = [];
  for (let i = 0; i < SHARED_TAG_COUNT; i += 1) tags.push({ key: 'base' + i, weight: 1.0 });
  for (let i = 0; i < TAG_COUNT - SHARED_TAG_COUNT; i += 1) tags.push({ key: 'u' + agentIndex + '_' + i, weight: 1.0 });
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

  return {
    shelter: shelter.length,
    residences: agents.length,
    accounts: agents.length,
    price: priceValue,
    itemIds: { ...itemIds },
  };
}

/** 生育：找最契合的一对 → 恋爱 → 子代 → 谱系 → 注册进主循环。 */
function runProcreation(tick, agents, spawnChild) {
  const maxChildren = 2;
  const result = { childId: null, parents: null, familyId: null };
  if (childrenBorn >= maxChildren || agents.length < 2) return result;

  const ids = agents.map((a) => a.id);
  const pairs = social.procreation.match.pair({ agentIds: ids, k: Math.max(4, ids.length), threshold: 0.3 });
  if (pairs.length === 0) return result;

  // 跳过已生育过的配对，取下一个未生育的兼容对（防同一对反复繁殖）
  let pair = null;
  for (const p of pairs) {
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

  observer.recorder.eventLog.record({
    tick,
    topic: 'social.procreation',
    payload: { a: pair.a, b: pair.b, childId: child.id, familyId },
  });

  result.childId = child.id;
  result.parents = [pair.a, pair.b];
  result.familyId = familyId;
  return result;
}

/** 市场：挂买卖单 → 撮合 → 结算 → 写交易事件日志。 */
function runMarket(tick, agents) {
  const result = { trades: 0 };
  if (agents.length < 2) return result;
  const sellerAcct = accounts.get(agents[0].id);
  const buyerAcct = accounts.get(agents[1].id);
  if (!sellerAcct || !buyerAcct) return result;

  try {
    economy.market.orderbook.orders.place({ side: 'sell', symbol: SYMBOL, price: 4, quantity: 1, accountId: sellerAcct });
    economy.market.orderbook.orders.place({ side: 'buy', symbol: SYMBOL, price: 4, quantity: 1, accountId: buyerAcct });
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

/** 居住分配：确保每个居民（含新生子代）都有住所。 */
function runResidence(tick, agents) {
  const assigned = [];
  for (const a of agents) {
    if (town.residence.residenceOf(a.id) === null) {
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
  return { assigned };
}

/** 健康检查：症状推进 → 疫情检测 → 隔离 → 分诊治疗，并写 observer 日志。 */
function runHealth(tick, agents, config) {
  const result = { infected: 0, epidemic: false, treated: 0, quarantined: 0 };
  if (agents.length === 0) return result;
  const ids = agents.map((a) => a.id);

  for (const a of agents) {
    if (survival.health.disease.status({ agentId: a.id }).infected) {
      survival.health.disease.symptom({ agentId: a.id, delta: 0.05, tick });
    }
  }

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

  const triage = survival.health.treatment.triage({ agents: ids, tick });
  if (triage.length > 0) {
    const patient = triage[0];
    const healed = survival.health.treatment.apply({ agentId: patient.agentId, tick });
    treatCount += 1;
    observer.recorder.actionLog.record({
      tick,
      agentId: patient.agentId,
      action: 'treatment',
      outcome: { severity: healed.severity, consumed: healed.consumed, health: healed.health },
    });
    result.treated = 1;
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
    procreation: runProcreation(tick, agents, spawnChild),
    market: runMarket(tick, agents),
    crafting: runCrafting(tick, agents),
    residence: runResidence(tick, agents),
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
