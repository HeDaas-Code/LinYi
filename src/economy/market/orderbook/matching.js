/**
 * truman-town.economy.market.orderbook.matching — 撮合引擎 / Matching Engine
 *
 * match 对某 symbol 的公开买卖单做价格优先、时间优先的贪心撮合（只读，不改单），
 * 返回可成交交易；settle 执行交易：经 ledger.transaction.recorder 落账、
 * 扣减订单剩余量（成交清空）并回写 market.price 发现的最新价。
 *
 * RPC：economy.market.orderbook.matching.match / settle
 */

import * as identity from '../../../infra/identity.js';
import * as ledgerTx from '../../ledger/transaction/index.js';
import * as price from '../price.js';
import * as store from '../../_store.js';

/**
 * 撮合（只读）：最高买价 ≥ 最低卖价即成交，价取卖单价，量取双边剩余较小者。
 * @param {{ symbol: string }} input
 * @returns {object[]} 成交数组
 */
export function match(input = {}) {
  const symbol = input?.symbol;
  if (typeof symbol !== 'string' || symbol.trim() === '') {
    throw new TypeError('matching.match: symbol 必须为非空字符串');
  }
  const open = store.listOrders()
    .map((n) => n.data)
    .filter((o) => o.symbol === symbol && o.status === 'open');
  const buys = open
    .filter((o) => o.side === 'buy')
    .sort((a, b) => (b.price - a.price) || (a.placedAt - b.placedAt));
  const sells = open
    .filter((o) => o.side === 'sell')
    .sort((a, b) => (a.price - b.price) || (a.placedAt - b.placedAt));

  const buyRemain = new Map(buys.map((o) => [o.orderId, o.remaining]));
  const sellRemain = new Map(sells.map((o) => [o.orderId, o.remaining]));
  const trades = [];
  let i = 0;
  let j = 0;
  while (i < buys.length && j < sells.length) {
    const buy = buys[i];
    const sell = sells[j];
    if (buy.price < sell.price) break;
    const qty = Math.min(buyRemain.get(buy.orderId), sellRemain.get(sell.orderId));
    if (qty > 0) {
      trades.push({
        tradeId: identity.next('trade'),
        symbol,
        price: sell.price,
        quantity: qty,
        amount: sell.price * qty,
        buyOrderId: buy.orderId,
        sellOrderId: sell.orderId,
        buyerAccount: buy.accountId,
        sellerAccount: sell.accountId,
      });
    }
    buyRemain.set(buy.orderId, buyRemain.get(buy.orderId) - qty);
    sellRemain.set(sell.orderId, sellRemain.get(sell.orderId) - qty);
    if (buyRemain.get(buy.orderId) <= 0) i += 1;
    if (sellRemain.get(sell.orderId) <= 0) j += 1;
  }
  return trades;
}

function reduceOrder(orderId, qty) {
  const node = store.readOrder(orderId);
  if (node === null) return;
  const remaining = node.data.remaining - qty;
  const filled = remaining <= 0;
  store.writeOrder(orderId, {
    ...node.data,
    remaining: Math.max(0, remaining),
    status: filled ? 'filled' : 'open',
    filledAt: filled ? Date.now() : node.data.filledAt,
  });
}

/**
 * 结算交易：逐笔落账、扣减订单剩余量、更新价格，返回回执数组。
 * @param {{ trades: object[] }} input
 * @returns {object[]} [{ tradeId, receipt }]
 */
export function settle(input = {}) {
  const trades = input?.trades;
  if (!Array.isArray(trades)) throw new TypeError('matching.settle: trades 必须为数组');
  const receipts = [];
  for (const trade of trades) {
    const receipt = ledgerTx.recorder.post({
      from: trade.buyerAccount,
      to: trade.sellerAccount,
      amount: trade.amount,
      ref: 'trade:' + trade.tradeId,
    });
    reduceOrder(trade.buyOrderId, trade.quantity);
    reduceOrder(trade.sellOrderId, trade.quantity);
    price.update({ symbol: trade.symbol, price: trade.price });
    receipts.push({ tradeId: trade.tradeId, receipt });
  }
  return receipts;
}
