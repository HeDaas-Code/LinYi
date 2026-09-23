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

function load(businessId) {
  const node = store.readBusiness(businessId);
  return (node !== null && node.type === store.TYPES.business) ? node.data : null;
}

function save(businessId, data) {
  return store.writeBusiness(businessId, data).data;
}

/**
 * 创办企业：创始人 + 名称 + 行业 + 初始资本。为企业开一个 ledger 账户承载资本。
 * @param {{ founderId: string, name?: string, industry?: string, capital?: number, tick?: number }} input
 * @returns {object} 企业快照
 */
export function found(input = {}) {
  const founderId = assertId(input?.founderId, 'founderId');
  const name = (typeof input?.name === 'string' && input.name.trim() !== '') ? input.name : '未命名企业';
  const industry = (typeof input?.industry === 'string' && input.industry.trim() !== '') ? input.industry : 'general';
  const capital = validNum(input?.capital, 100);

  const businessId = identity.next('biz');
  const account = ledger.account.open({ ownerId: businessId, balance: capital });
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
 * 每 tick 运营：卖出库存商品按 goodsPrice 计收入、写入账户余额，并判定资不抵债。
 * 工资支出由 labour.pay 单独执行（本方法只结算收入与偿债能力）。
 * @param {{ businessId: string, goodsPrice?: number, tick?: number }} input
 * @returns {object} 运营结果
 */
export function operate(input = {}) {
  const businessId = assertId(input?.businessId, 'businessId');
  const biz = load(businessId);
  if (biz === null) throw new Error('business_not_found: ' + businessId);
  if (biz.status !== 'active') throw new Error('business_inactive: ' + businessId);

  const goodsPrice = validNum(input?.goodsPrice, 8);
  const sold = biz.inventory?.goods ?? 0;
  const revenue = sold * goodsPrice;
  if (revenue > 0) store.applyBalance(biz.accountId, revenue);
  biz.inventory = { goods: 0 };

  const balance = ledger.account.balance(biz.accountId) ?? 0;
  const insolvent = balance <= 0;
  biz.history.push({ at: Date.now(), event: 'operate', revenue, balance, insolvent });
  if (insolvent) {
    biz.status = 'insolvent';
    pubsub.publish('economy.business.insolvent', { businessId, balance });
  }
  save(businessId, biz);
  return {
    businessId,
    revenue,
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
