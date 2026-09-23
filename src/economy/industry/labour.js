/**
 * truman-town.economy.industry.labour — 劳动与雇佣 / Labour
 *
 * 发布职位并雇佣智能体（hire），按 tick 通过 economy.ledger.transaction 真实转账
 * 发薪（pay）。企业账户余额不足时不产生负余额，而是记录欠薪（owed）。
 *
 * RPC：economy.industry.labour.hire / pay
 */

import * as store from '../_store.js';
import * as ledger from '../ledger/index.js';
import * as pubsub from '../../infra/events/pubsub.js';

function assertId(id, what) {
  if (typeof id !== 'string' || id.trim() === '') throw new TypeError('labour: ' + what + ' 必须为非空字符串');
  return id;
}

function validNum(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

/** 依 ownerId 反查智能体账户（未销户）。 */
function resolveAccount(agentId) {
  const found = store.listAccounts().find((n) => n.data.ownerId === agentId && !n.data.closed);
  return found ? found.id : null;
}

function load(businessId) {
  const node = store.readBusiness(businessId);
  return (node !== null && node.type === store.TYPES.business) ? node.data : null;
}

/**
 * 雇佣智能体。可显式传入 accountId，否则按 ownerId 反查其 ledger 账户。
 * @param {{ businessId: string, agentId: string, wage?: number, role?: string, accountId?: string, tick?: number }} input
 * @returns {object} 雇佣记录
 */
export function hire(input = {}) {
  const businessId = assertId(input?.businessId, 'businessId');
  const agentId = assertId(input?.agentId, 'agentId');
  const wage = validNum(input?.wage, 1);
  const role = (typeof input?.role === 'string' && input.role.trim() !== '') ? input.role : 'worker';
  const biz = load(businessId);
  if (biz === null || biz.status !== 'active') throw new Error('business_not_active: ' + businessId);
  if (biz.employees.some((e) => e.agentId === agentId)) throw new Error('already_employed: ' + agentId);

  const accountId = (typeof input?.accountId === 'string' && input.accountId.trim() !== '') ? input.accountId : resolveAccount(agentId);
  const emp = { agentId, accountId, wage, role, owed: 0, hiredAt: Date.now() };
  biz.employees.push(emp);
  store.writeBusiness(businessId, biz);
  pubsub.publish('economy.labour.hired', { businessId, agentId, wage, role });
  return { businessId, ...emp };
}

/**
 * 发薪：逐员工从企业账户向员工账户转账 wage + 历史欠薪。余额不足时累计欠薪，
 * 不产生负余额。
 * @param {{ businessId: string, tick?: number }} input
 * @returns {{ paid: object[], owed: object[] }}
 */
export function pay(input = {}) {
  const businessId = assertId(input?.businessId, 'businessId');
  const biz = load(businessId);
  if (biz === null || biz.status !== 'active') throw new Error('business_not_active: ' + businessId);

  const paid = [];
  const owed = [];
  for (const emp of biz.employees) {
    const due = emp.wage + (emp.owed || 0);
    if (!emp.accountId) {
      emp.owed = due;
      owed.push({ agentId: emp.agentId, amount: emp.wage, reason: 'no_account' });
      continue;
    }
    const bal = ledger.account.balance(biz.accountId) ?? 0;
    if (bal >= due) {
      try {
        ledger.transaction.recorder.post({ from: biz.accountId, to: emp.accountId, amount: due, ref: 'wage', memo: '工资' });
        emp.owed = 0;
        paid.push({ agentId: emp.agentId, amount: due });
      } catch {
        emp.owed = due;
        owed.push({ agentId: emp.agentId, amount: emp.wage, reason: 'transfer_failed' });
      }
    } else {
      emp.owed = due;
      owed.push({ agentId: emp.agentId, amount: emp.wage, reason: 'insufficient_balance' });
    }
  }
  store.writeBusiness(businessId, biz);
  if (paid.length > 0) pubsub.publish('economy.labour.paid', { businessId, paid });
  if (owed.length > 0) pubsub.publish('economy.labour.owed', { businessId, owed });
  return { paid, owed };
}

/** 列出某企业员工（辅助方法）。 */
export function staff(businessId) {
  const biz = load(businessId);
  return biz === null ? [] : biz.employees;
}
