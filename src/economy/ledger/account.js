/**
 * truman-town.economy.ledger.account — 账户 / Account
 *
 * 开户、查询余额与销户。账户以 infra.store.graph 节点持久化（type=economy.account），
 * 账户 ID 由 infra.identity 生成（全局唯一有序）。
 *
 * RPC：economy.ledger.account.open / balance / close
 */

import * as identity from '../../infra/identity.js';
import * as store from '../_store.js';

function validBalance(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * 开户。initial/balance 为初始余额（缺省 0）。
 * @param {{ ownerId?: string, balance?: number }} [input]
 * @returns {{ accountId: string, ownerId: string|null, balance: number }}
 */
export function open(input = {}) {
  const accountId = identity.next('acct');
  const ownerId = (typeof input?.ownerId === 'string' && input.ownerId.trim() !== '') ? input.ownerId : null;
  const balance = validBalance(input?.balance) ? input.balance : 0;
  store.writeAccount(accountId, {
    ownerId,
    balance,
    opening: balance,
    openedAt: Date.now(),
    closed: false,
  });
  return { accountId, ownerId, balance };
}

/**
 * 查询余额。账户不存在或已销户返回 undefined。
 * @param {string} accountId
 * @returns {number|undefined}
 */
export function balance(accountId) {
  const node = store.readAccount(accountId);
  if (node === null || node.data.closed) return undefined;
  return node.data.balance;
}

/**
 * 销户（标记 closed，保留余额供审计）。
 * @param {string} accountId
 * @returns {object|null} 销户快照；账户不存在返回 null
 */
export function close(accountId) {
  const node = store.readAccount(accountId);
  if (node === null) return null;
  store.writeAccount(accountId, { ...node.data, closed: true, closedAt: Date.now() });
  return {
    accountId,
    ownerId: node.data.ownerId,
    balance: node.data.balance,
    closed: true,
  };
}
