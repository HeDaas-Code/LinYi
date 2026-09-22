/**
 * truman-town.economy.ledger.transaction.validator — 交易校验器 / Transaction Validator
 *
 * 校验单笔转账（余额充足、账户有效、金额合法）与批量转账的原子性（所有腿
 * 全部可行才通过，任何一步透支即整体失败）。附带破产检测钩子：
 * 当账户余额不足时触发 onBankruptcy 注册的回调。
 *
 * RPC：economy.ledger.transaction.validator.check / atomic
 */

import * as account from '../account.js';

/** @type {Set<(info: object) => void>} */
const bankruptcyHandlers = new Set();

function fireBankruptcy(info) {
  for (const handler of bankruptcyHandlers) {
    try {
      handler(info);
    } catch (err) {
      console.error('[validator] bankruptcy handler 抛错：', err);
    }
  }
}

/**
 * 注册破产检测钩子（余额不足时触发）。
 * @param {(info: object) => void} handler
 * @returns {() => void} 取消订阅函数
 */
export function onBankruptcy(handler) {
  if (typeof handler !== 'function') {
    throw new TypeError('validator.onBankruptcy: handler 必须为函数');
  }
  bankruptcyHandlers.add(handler);
  return () => bankruptcyHandlers.delete(handler);
}

function invalid(amount) {
  return typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0;
}

/**
 * 校验单笔转账。
 * @param {{ from: string, to: string, amount: number }} tx
 * @returns {{ valid: boolean, reason?: string, account?: string, balance?: number, required?: number }}
 */
export function check(tx) {
  const from = tx?.from;
  const to = tx?.to;
  const amount = tx?.amount;
  if (invalid(amount)) return { valid: false, reason: 'amount_invalid' };
  if (typeof from !== 'string' || from === '' || typeof to !== 'string' || to === '') {
    return { valid: false, reason: 'account_invalid' };
  }
  if (from === to) return { valid: false, reason: 'self_transfer' };
  const fromBalance = account.balance(from);
  if (fromBalance === undefined) return { valid: false, reason: 'account_missing', account: from };
  const toBalance = account.balance(to);
  if (toBalance === undefined) return { valid: false, reason: 'account_missing', account: to };
  if (fromBalance < amount) {
    fireBankruptcy({ account: from, required: amount, balance: fromBalance, reason: 'insufficient_balance' });
    return { valid: false, reason: 'insufficient_balance', account: from, balance: fromBalance, required: amount };
  }
  return { valid: true };
}

/**
 * 校验批量转账的原子性：所有腿结构合法、账户存在，且按序执行时任何账户余额
 * 不为负。任一失败返回 { valid:false, reason, index }。
 * @param {Array<{ from: string, to: string, amount: number }>} transfers
 * @returns {object}
 */
export function atomic(transfers) {
  if (!Array.isArray(transfers)) return { valid: false, reason: 'transfers_not_array' };
  const balances = new Map();
  const getBalance = (id) => {
    if (balances.has(id)) return balances.get(id);
    const b = account.balance(id);
    if (b === undefined) return undefined;
    balances.set(id, b);
    return b;
  };
  for (let i = 0; i < transfers.length; i += 1) {
    const t = transfers[i];
    if (invalid(t?.amount)) return { valid: false, reason: 'amount_invalid', index: i };
    if (typeof t?.from !== 'string' || t.from === '' || typeof t?.to !== 'string' || t.to === '') {
      return { valid: false, reason: 'account_invalid', index: i };
    }
    if (t.from === t.to) return { valid: false, reason: 'self_transfer', index: i };
    if (getBalance(t.from) === undefined) return { valid: false, reason: 'account_missing', account: t.from, index: i };
    if (getBalance(t.to) === undefined) return { valid: false, reason: 'account_missing', account: t.to, index: i };
  }
  for (let i = 0; i < transfers.length; i += 1) {
    const t = transfers[i];
    const fromBalance = balances.get(t.from) - t.amount;
    if (fromBalance < 0) {
      fireBankruptcy({ account: t.from, required: t.amount, balance: balances.get(t.from), reason: 'insufficient_balance', index: i });
      return { valid: false, reason: 'insufficient_balance', account: t.from, balance: balances.get(t.from), required: t.amount, index: i };
    }
    balances.set(t.from, fromBalance);
    balances.set(t.to, balances.get(t.to) + t.amount);
  }
  return { valid: true };
}

/** 清空破产检测钩子（测试用）。 */
export function __reset() {
  bankruptcyHandlers.clear();
}
