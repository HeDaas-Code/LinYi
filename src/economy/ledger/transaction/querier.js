/**
 * truman-town.economy.ledger.transaction.querier — 流水查询器 / Transaction Querier
 *
 * query 按条件（账户/来源/去向/序号区间/txId/上限）查询流水；
 * audit 对某账户按流水重放净额并与当前余额对账，返回一致性结论。
 *
 * RPC：economy.ledger.transaction.querier.query / audit
 */

import * as graph from '../../../infra/store/graph.js';
import * as recorder from './recorder.js';

const ACCOUNT_TYPE = 'economy.account';
const TX_TYPE = 'economy.tx';

/**
 * 查询流水。支持 input.txId（单笔）、accountId/from/to、since/until、limit。
 * @param {object} [input]
 * @returns {object[]} 按 seq 升序的流水数组
 */
export function query(input = {}) {
  if (typeof input.txId === 'string' && input.txId !== '') {
    const r = recorder.receipt(input.txId);
    return r === null ? [] : [r];
  }
  let txs = graph.read({ type: TX_TYPE }).map((n) => n.data);
  txs.sort((a, b) => a.seq - b.seq);
  const accountId = input.accountId ?? input.account;
  if (accountId) txs = txs.filter((t) => t.from === accountId || t.to === accountId);
  if (input.from) txs = txs.filter((t) => t.from === input.from);
  if (input.to) txs = txs.filter((t) => t.to === input.to);
  if (input.since !== undefined) txs = txs.filter((t) => t.seq >= input.since);
  if (input.until !== undefined) txs = txs.filter((t) => t.seq <= input.until);
  if (Number.isInteger(input.limit) && input.limit >= 0) txs = txs.slice(0, input.limit);
  return txs;
}

/**
 * 对某账户对账：以开户余额为基准重放全部相关流水，与当前余额比对。
 * @param {string} accountId
 * @returns {object}
 */
export function audit(accountId) {
  const node = graph.read(accountId);
  const accountData = (node !== null && node.type === ACCOUNT_TYPE) ? node.data : null;
  const txs = query({ accountId });
  const opening = accountData ? accountData.opening : 0;
  const net = txs.reduce((acc, t) => {
    if (t.to === accountId) return acc + t.amount;
    if (t.from === accountId) return acc - t.amount;
    return acc;
  }, opening);
  const current = accountData ? accountData.balance : undefined;
  return {
    accountId,
    current,
    opening,
    net,
    transactionCount: txs.length,
    consistent: accountData ? current === net : false,
    transactions: txs,
  };
}
