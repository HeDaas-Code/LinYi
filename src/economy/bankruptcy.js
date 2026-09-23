/**
 * truman-town.economy.bankruptcy — 破产清算 / Bankruptcy
 *
 * 对余额低于阈值的智能体或企业启动破产（file），清算资产并按规则分配（liquidate）：
 * 企业变卖库存商品（按 goodsPrice）→ 优先清偿员工欠薪 → 剩余归还创始人 → 关闭账户/企业；
 * 智能体仅关闭其账户（保留余额供审计）。案例以 graph store 持久化（type=economy.bankruptcy）。
 *
 * 与 bank.credit/interest 的先后：本模块采用「余额阈值」判定，不依赖信贷；最小信贷
 * 留待 bank 树单独实现，见报告说明。
 *
 * RPC：economy.bankruptcy.file / liquidate
 */

import * as identity from '../infra/identity.js';
import * as store from './_store.js';
import * as ledger from './ledger/index.js';
import * as pubsub from '../infra/events/pubsub.js';
import * as bank from './bank/index.js';

function assertId(id, what) {
  if (typeof id !== 'string' || id.trim() === '') throw new TypeError('bankruptcy: ' + what + ' 必须为非空字符串');
  return id;
}

function validNum(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

function loadCase(caseId) {
  const node = store.readBankruptcy(caseId);
  return (node !== null && node.type === store.TYPES.bankruptcy) ? node.data : null;
}

function saveCase(caseId, data) {
  return store.writeBankruptcy(caseId, data).data;
}

function resolveAgentAccount(agentId) {
  const found = store.listAccounts().find((n) => n.data.ownerId === agentId && !n.data.closed);
  return found ? found.id : null;
}

/** 取主体余额（business 用其账户；agent 按 ownerId 反查账户）。 */
function balanceOf(subjectId, subjectType) {
  if (subjectType === 'business') {
    const biz = store.readBusiness(subjectId);
    if (biz === null) throw new Error('business_not_found: ' + subjectId);
    return ledger.account.balance(biz.data.accountId) ?? 0;
  }
  const acctId = resolveAgentAccount(subjectId);
  if (acctId === null) throw new Error('agent_account_not_found: ' + subjectId);
  return ledger.account.balance(acctId) ?? 0;
}

/**
 * 启动破产：余额低于阈值则立案（case），否则返回 filed:false。
 * @param {{ subjectId: string, subjectType?: 'agent'|'business', threshold?: number, tick?: number }} input
 * @returns {object}
 */
export function file(input = {}) {
  const subjectId = assertId(input?.subjectId, 'subjectId');
  const subjectType = input?.subjectType === 'business' ? 'business' : 'agent';
  const threshold = validNum(input?.threshold, 0);
  const balance = balanceOf(subjectId, subjectType);
  if (balance > threshold) {
    return { filed: false, caseId: null, subjectId, subjectType, balance, threshold, reason: 'above_threshold' };
  }
  const caseId = identity.next('bkr');
  const rec = {
    caseId,
    subjectId,
    subjectType,
    balance,
    threshold,
    status: 'filed',
    filedAt: Date.now(),
    liquidatedAt: null,
    proceeds: 0,
    distribution: [],
  };
  saveCase(caseId, rec);
  pubsub.publish('economy.bankruptcy.filed', { caseId, subjectId, subjectType, balance });
  return { filed: true, caseId, subjectId, subjectType, balance, threshold };
}

/**
 * 清算：变卖企业库存（卖给真实买方，经 ledger.transaction 结转，无买方则核销）→
 * 清偿员工欠薪 → 清偿贷款 → 剩余归还创始人 → 关闭账户/企业。智能体主体仅关闭其账户。
 * @param {{ caseId: string, goodsPrice?: number, buyerAccountId?: string, tick?: number }} input
 * @returns {object} 清算结果
 */
export function liquidate(input = {}) {
  const caseId = assertId(input?.caseId, 'caseId');
  const rec = loadCase(caseId);
  if (rec === null) throw new Error('bankruptcy_case_not_found: ' + caseId);
  if (rec.status !== 'filed') throw new Error('bankruptcy_case_closed: ' + caseId);

  const distribution = [];
  let proceeds = 0;

  if (rec.subjectType === 'business') {
    const biz = store.readBusiness(rec.subjectId);
    if (biz === null) throw new Error('business_not_found: ' + rec.subjectId);
    const goodsPrice = validNum(input?.goodsPrice, 8);
    const goods = biz.data.inventory?.goods ?? 0;
    // 1) 变卖库存商品给真实买方（真实转账结转；无买方或余额不足则核销库存）
    if (goods > 0 && typeof input?.buyerAccountId === 'string' && input.buyerAccountId !== '') {
      try {
        ledger.transaction.recorder.post({
          from: input.buyerAccountId, to: biz.data.accountId, amount: goods * goodsPrice, ref: 'bankruptcy_sale', memo: '破产变卖库存',
        });
      } catch { /* 买方余额不足则核销，不凭空造钱 */ }
    }
    proceeds = ledger.account.balance(biz.data.accountId) ?? 0;

    // 2) 清偿员工欠薪
    for (const emp of biz.data.employees) {
      const amount = Math.min(emp.owed || 0, proceeds);
      if (amount > 0 && emp.accountId) {
        try {
          ledger.transaction.recorder.post({ from: biz.data.accountId, to: emp.accountId, amount, ref: 'bankruptcy_wage', memo: '破产清偿欠薪' });
          distribution.push({ to: emp.agentId, kind: 'wage', amount });
          proceeds -= amount;
        } catch { /* 账户不可用则跳过 */ }
      }
    }
    // 3) 清偿银行贷款（债权人优先于创始人权益，保持 t39 工资优先规则）
    for (const loan of bank.credit.listByBorrower(biz.data.businessId)) {
      const amount = Math.min(loan.outstanding, proceeds);
      if (amount > 0) {
        try {
          const paid = bank.credit.repay({ loanId: loan.loanId, amount, tick: input?.tick });
          distribution.push({ to: 'bank', kind: 'loan', amount: paid.paid });
          proceeds -= paid.paid;
        } catch { /* 余额不足则跳过 */ }
      }
      const after = bank.credit.get(loan.loanId);
      if (after !== null && after.status === 'active' && after.outstanding > 0) {
        bank.credit.markDefault({ loanId: loan.loanId });
      }
    }
    // 4) 剩余归还创始人
    const founder = biz.data.founderId;
    const founderAcct = founder ? resolveAgentAccount(founder) : null;
    const remaining = Math.min(proceeds, ledger.account.balance(biz.data.accountId) ?? 0);
    if (remaining > 0 && founderAcct) {
      try {
        ledger.transaction.recorder.post({ from: biz.data.accountId, to: founderAcct, amount: remaining, ref: 'bankruptcy_remainder', memo: '破产剩余资产' });
        distribution.push({ to: founder, kind: 'remainder', amount: remaining });
        proceeds -= remaining;
      } catch { /* 忽略 */ }
    }
    // 3) 关闭企业账户与企业
    ledger.account.close(biz.data.accountId);
    biz.data.status = 'closed';
    biz.data.closedAt = Date.now();
    store.writeBusiness(rec.subjectId, biz.data);
  } else {
    // 智能体：仅关闭账户（余额保留供审计）
    const acctId = resolveAgentAccount(rec.subjectId);
    if (acctId !== null) ledger.account.close(acctId);
  }

  const done = {
    ...rec,
    status: 'liquidated',
    liquidatedAt: Date.now(),
    proceeds,
    distribution,
  };
  saveCase(caseId, done);
  pubsub.publish('economy.bankruptcy.liquidated', { caseId, subjectId: rec.subjectId, subjectType: rec.subjectType, distribution });
  return done;
}

/** 列出全部破产案例（辅助方法）。 */
export function list() {
  return store.listBankruptcies().map((n) => n.data);
}
