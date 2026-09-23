/**
 * truman-town.economy.bank.interest — 利息 / Interest
 *
 * 按 tick 对贷款计息，支持单利（仅对本金计息，默认）与复利（对未偿余额计息）。
 * 计息仅写入贷款债务（accruedInterest / outstanding），不触碰任何账户余额，
 * 因此无论单利/复利都不会凭空创造货币——债务增长不等于货币供应增长。
 *
 * RPC：economy.bank.interest.accrue
 */

import * as store from '../_store.js';

function validNum(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

/**
 * 对单笔贷款计息一次（一个计息周期）。
 * @param {{ loanId: string, mode?: 'simple'|'compound', rate?: number, tick?: number }} input
 * @returns {object} 计息结果
 */
export function accrue(input = {}) {
  const loanId = input?.loanId;
  const node = store.readLoan(loanId);
  if (node === null || node.type !== store.TYPES.loan) throw new Error('loan_not_found: ' + loanId);
  if (node.data.status !== 'active') {
    return { loanId, interest: 0, mode: input?.mode === 'compound' ? 'compound' : 'simple', outstanding: node.data.outstanding, accruedInterest: node.data.accruedInterest, status: node.data.status, overdue: node.data.overdue };
  }

  const mode = input?.mode === 'compound' ? 'compound' : 'simple';
  const rate = validNum(input?.rate ?? node.data.rate, 0);
  // 单利：仅本金；复利：未偿余额（本金 + 已计利息）
  const base = mode === 'compound' ? node.data.outstanding : node.data.principal;
  const interest = base * rate;

  const data = {
    ...node.data,
    accruedInterest: node.data.accruedInterest + interest,
    outstanding: node.data.outstanding + interest,
  };
  if (data.dueTick !== null && Number.isInteger(input?.tick) && input.tick >= data.dueTick) {
    data.overdue = true;
  }
  store.writeLoan(loanId, data);
  return { loanId, interest, mode, outstanding: data.outstanding, accruedInterest: data.accruedInterest, status: data.status, overdue: data.overdue };
}

/**
 * 对全部在途贷款各计息一次。
 * @param {{ mode?: 'simple'|'compound', rate?: number, tick?: number }} input
 * @returns {Array<object>} 逐笔计息结果
 */
export function accrueAll(input = {}) {
  const results = [];
  for (const node of store.listLoans()) {
    if (node.data.status !== 'active') continue;
    results.push(accrue({ loanId: node.data.loanId, mode: input?.mode, rate: input?.rate, tick: input?.tick }));
  }
  return results;
}

/** 利息模块无独立内存态（债务随贷款节点由 graph.__reset 清空）。 */
export function __reset() {}
