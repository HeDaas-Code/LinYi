/**
 * truman-town.economy.market.orderbook.orders — 订单管理 / Order Manager
 *
 * 挂单（place）与撤单（cancel）。订单以 graph 节点持久化（type=economy.order），
 * 下单校验账户有效、方向/价格/数量合法；订单 ID 由 infra.identity 生成。
 *
 * RPC：economy.market.orderbook.orders.place / cancel
 */

import * as identity from '../../../infra/identity.js';
import * as account from '../../ledger/account.js';
import * as store from '../../_store.js';

/**
 * 挂单。
 * @param {{ side: 'buy'|'sell', symbol: string, price: number, quantity: number, accountId?: string }} input
 * @returns {object} 订单快照
 */
export function place(input = {}) {
  const side = input?.side;
  if (side !== 'buy' && side !== 'sell') {
    throw new TypeError('orders.place: side 必须为 buy|sell');
  }
  const symbol = input?.symbol;
  if (typeof symbol !== 'string' || symbol.trim() === '') {
    throw new TypeError('orders.place: symbol 必须为非空字符串');
  }
  const price = input?.price;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    throw new TypeError('orders.place: price 必须为正数');
  }
  const quantity = input?.quantity;
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
    throw new TypeError('orders.place: quantity 必须为正数');
  }
  const accountId = input?.accountId ?? input?.ownerId;
  if (typeof accountId !== 'string' || accountId === '') {
    throw new TypeError('orders.place: accountId 必须为非空字符串');
  }
  if (account.balance(accountId) === undefined) {
    throw new Error('orders.place: 账户不存在或已销户: ' + accountId);
  }
  const orderId = identity.next('ord');
  const order = {
    orderId,
    accountId,
    side,
    symbol,
    price,
    quantity,
    remaining: quantity,
    status: 'open',
    placedAt: Date.now(),
  };
  store.writeOrder(orderId, order);
  return order;
}

/**
 * 撤单（标记 cancelled）。不存在或已成交/已撤返回 null。
 * @param {string} orderId
 * @returns {object|null}
 */
export function cancel(orderId) {
  const node = store.readOrder(orderId);
  if (node === null || node.data.status !== 'open') return null;
  store.writeOrder(orderId, { ...node.data, status: 'cancelled', cancelledAt: Date.now() });
  return { ...node.data, status: 'cancelled' };
}
