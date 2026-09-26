/**
 * truman-town.economy.industry.business — 企业 / Business
 *
 * 创办（found）、每 tick 运营（operate）与关闭（close）企业。企业以 graph store
 * 节点持久化（type=economy.business），并持有一个 ledger 账户承载资本与经营资金。
 *
 * 假设（town.land / town.building.space 尚未实现）：企业在内部记录占位的地块/场所
 * 标识（premises.plotId / buildingId），不做真实空间占用，见报告说明。
 *
 * RPC：economy.industry.business.found / operate / close
 */

import * as identity from '../../infra/identity.js';
import * as ledger from '../ledger/index.js';
import * as store from '../_store.js';
import * as pubsub from '../../infra/events/pubsub.js';

function assertId(id, what) {
  if (typeof id !== 'string' || id.trim() === '') throw new TypeError('business: ' + what + ' 必须为非空字符串');
  return id;
}

function validNum(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

function validCount(v, fallback) {
  return Number.isInteger(v) && v >= 0 ? v : fallback;
}

function load(businessId) {
  const node = store.readBusiness(businessId);
  return (node !== null && node.type === store.TYPES.business) ? node.data : null;
}

function save(businessId, data) {
  return store.writeBusiness(businessId, data).data;
}

/**
 * 创办企业：创始人 + 名称 + 行业 + 初始资本。
 *
 * **货币守恒**：企业账户的初始余额有两个来源，二者互斥——
 *  - `capitalFrom` 给出资人账户 id：企业账户**从 0 开立**，再把 capital 真实转进来。
 *    这是居民自行创办时必须走的路径（钱来自其自有账户，总量不变）。
 *  - 不给 `capitalFrom`：账户直接以 capital 开立（凭空注入），仅供测试与初始引导。
 * 曾经的 bug：调用方既把本金转给供应池、又让这里 open(balance: capital) 开等额账户，
 * 等于双倍记账，货币总量因此不守恒。
 * @param {{ founderId: string, name?: string, industry?: string, capital?: number, tick?: number, capitalFrom?: string }} input
 * @returns {object} 企业快照
 */
export function found(input = {}) {
  const founderId = assertId(input?.founderId, 'founderId');
  const name = (typeof input?.name === 'string' && input.name.trim() !== '') ? input.name : '未命名企业';
  const industry = (typeof input?.industry === 'string' && input.industry.trim() !== '') ? input.industry : 'general';
  const capital = validNum(input?.capital, 100);
  const capitalFrom = (typeof input?.capitalFrom === 'string' && input.capitalFrom !== '') ? input.capitalFrom : null;

  const businessId = identity.next('biz');
  const account = ledger.account.open({ ownerId: businessId, balance: capitalFrom === null ? capital : 0 });
  if (capitalFrom !== null && capital > 0) {
    ledger.transaction.recorder.post({
      from: capitalFrom, to: account.accountId, amount: capital,
      ref: 'found_capital', memo: '创办资本' });
  }
  const biz = {
    businessId,
    founderId,
    name,
    industry,
    capital,
    accountId: account.accountId,
    premises: { plotId: 'plot:' + industry + ':' + businessId, buildingId: null },
    employees: [],
    owedWages: {},
    inventory: { goods: 0 },
    status: 'active',
    foundedAt: Date.now(),
    closedAt: null,
    history: [],
  };
  save(businessId, biz);
  pubsub.publish('economy.business.founded', { businessId, founderId, name, industry, capital });
  return biz;
}

/**
 * 每 tick 运营：把库存商品卖给「真实买方」（buyers 数组，逐户付款），
 * 通过 economy.ledger.transaction 真实转账结转收入，绝不 applyBalance 凭空造钱。
 * 未售出的商品保留在企业库存（inventory.goods），不计入收入。
 * 工资支出由 labour.pay 单独执行（本方法只结算销售收入与偿债能力）。
 * @param {{ businessId: string, goodsPrice?: number, buyers?: Array<{accountId:string, quantity?:number}>, tick?: number }} input
 * @returns {object} 运营结果（revenue / sold / unsold / balance / insolvent / status）
 */
export function operate(input = {}) {
  const businessId = assertId(input?.businessId, 'businessId');
  const biz = load(businessId);
  if (biz === null) throw new Error('business_not_found: ' + businessId);
  if (biz.status !== 'active') throw new Error('business_inactive: ' + businessId);

  const goodsPrice = validNum(input?.goodsPrice, 8);
  const buyers = Array.isArray(input?.buyers) ? input.buyers : [];

  let inventory = biz.inventory?.goods ?? 0;
  let sold = 0;
  let revenue = 0;

  // 逐买方成交：买方账户余额不足则按可负担数量成交，交易失败则跳过。
  for (const buyer of buyers) {
    if (inventory <= 0) break;
    const accountId = buyer?.accountId;
    const qty = validCount(buyer?.quantity, 1);
    if (typeof accountId !== 'string' || accountId.trim() === '' || qty <= 0) continue;
    const balance = ledger.account.balance(accountId) ?? 0;
    const affordable = Math.min(qty, Math.floor(balance / goodsPrice));
    const units = Math.min(inventory, affordable);
    if (units <= 0) continue;
    try {
      ledger.transaction.recorder.post({
        from: accountId, to: biz.accountId, amount: units * goodsPrice, ref: 'goods_sale', memo: '购买商品',
      });
    } catch {
      continue; // 转账失败（销户/余额变动），跳过该买方
    }
    inventory -= units;
    sold += units;
    revenue += units * goodsPrice;
  }

  biz.inventory = { goods: inventory };

  const balance = ledger.account.balance(biz.accountId) ?? 0;
  const insolvent = balance <= 0;
  biz.history.push({ at: Date.now(), event: 'operate', revenue, sold, unsold: inventory, balance, insolvent });
  if (insolvent) {
    biz.status = 'insolvent';
    pubsub.publish('economy.business.insolvent', { businessId, balance });
  }
  save(businessId, biz);
  return {
    businessId,
    revenue,
    sold,
    unsold: inventory,
    balance,
    employees: biz.employees.length,
    insolvent,
    status: biz.status,
  };
}

/**
 * 关闭企业（标记 closed，保留账本供审计）。
 * @param {{ businessId: string }} input
 * @returns {object|null} 企业快照；不存在返回 null
 */
export function close(input = {}) {
  const businessId = assertId(input?.businessId, 'businessId');
  const biz = load(businessId);
  if (biz === null) return null;
  biz.status = 'closed';
  biz.closedAt = Date.now();
  save(businessId, biz);
  pubsub.publish('economy.business.closed', { businessId });
  return biz;
}

/** 列出全部企业（辅助方法）。 */
export function list() {
  return store.listBusinesses().map((n) => n.data);
}
