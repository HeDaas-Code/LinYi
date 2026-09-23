/**
 * economy 内部共享存储辅助（不作为 Normify 模块暴露）。
 *
 * 统一账户 / 流水 / 订单三类图节点（infra.store.graph）的读写与余额原子增减，
 * 供 account / recorder / querier / orders / matching 复用，避免重复访问底层存储。
 */

import * as graph from '../infra/store/graph.js';

export const TYPES = {
  account: 'economy.account',
  tx: 'economy.tx',
  order: 'economy.order',
  business: 'economy.business',
  production: 'economy.production',
  bankruptcy: 'economy.bankruptcy',
  loan: 'economy.loan',
};

export function readAccount(accountId) {
  return graph.read(accountId);
}

export function listAccounts() {
  return graph.read({ type: TYPES.account });
}

export function writeAccount(accountId, data) {
  return graph.write({ id: accountId, type: TYPES.account, data });
}

export function readTx(txId) {
  return graph.read(txId);
}

export function listTxs() {
  return graph.read({ type: TYPES.tx });
}

export function writeTx(txId, data) {
  return graph.write({ id: txId, type: TYPES.tx, data });
}

export function readOrder(orderId) {
  return graph.read(orderId);
}

export function listOrders() {
  return graph.read({ type: TYPES.order });
}

export function writeOrder(orderId, data) {
  return graph.write({ id: orderId, type: TYPES.order, data });
}

export function readBusiness(businessId) {
  return graph.read(businessId);
}

export function listBusinesses() {
  return graph.read({ type: TYPES.business });
}

export function writeBusiness(businessId, data) {
  return graph.write({ id: businessId, type: TYPES.business, data });
}

export function readProduction(planId) {
  return graph.read(planId);
}

export function listProductions() {
  return graph.read({ type: TYPES.production });
}

export function writeProduction(planId, data) {
  return graph.write({ id: planId, type: TYPES.production, data });
}

export function readBankruptcy(caseId) {
  return graph.read(caseId);
}

export function listBankruptcies() {
  return graph.read({ type: TYPES.bankruptcy });
}

export function writeBankruptcy(caseId, data) {
  return graph.write({ id: caseId, type: TYPES.bankruptcy, data });
}

export function readLoan(loanId) {
  return graph.read(loanId);
}

export function listLoans() {
  return graph.read({ type: TYPES.loan });
}

export function writeLoan(loanId, data) {
  return graph.write({ id: loanId, type: TYPES.loan, data });
}

/**
 * 原子增减账户余额：读取 → 校验 → 写回，返回新余额。
 * @param {string} accountId
 * @param {number} delta 正为入账，负为出账
 * @returns {number} 新余额
 * @throws {Error} account_missing / account_closed / insufficient_balance
 */
export function applyBalance(accountId, delta) {
  const node = graph.read(accountId);
  if (node === null || node.type !== TYPES.account) {
    throw new Error('account_missing: ' + accountId);
  }
  if (node.data.closed) {
    throw new Error('account_closed: ' + accountId);
  }
  const next = node.data.balance + delta;
  if (next < 0) {
    throw new Error('insufficient_balance: ' + accountId);
  }
  graph.write({ id: accountId, type: TYPES.account, data: { ...node.data, balance: next } });
  return next;
}
