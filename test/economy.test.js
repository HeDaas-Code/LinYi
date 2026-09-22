import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as economy from '../src/economy/index.js';
import * as pubsub from '../src/infra/events/pubsub.js';

const account = economy.ledger.account;
const validator = economy.ledger.transaction.validator;
const recorder = economy.ledger.transaction.recorder;
const querier = economy.ledger.transaction.querier;
const orders = economy.market.orderbook.orders;
const matching = economy.market.orderbook.matching;
const price = economy.market.price;

function fresh() {
  economy.__reset();
}

test('account: 开户/查询/销户', () => {
  fresh();
  const a = account.open({ ownerId: 'r1', balance: 100 });
  assert.match(a.accountId, /^acct_\d{12}$/);
  assert.equal(a.balance, 100);
  assert.equal(account.balance(a.accountId), 100);
  const closed = account.close(a.accountId);
  assert.equal(closed.closed, true);
  assert.equal(account.balance(a.accountId), undefined);
  assert.equal(account.close('acct_000000000000'), null);
});

test('validator.check: 余额校验', () => {
  fresh();
  const a = account.open({ balance: 50 });
  const b = account.open({ balance: 0 });
  assert.equal(validator.check({ from: a.accountId, to: b.accountId, amount: 30 }).valid, true);
  assert.equal(validator.check({ from: a.accountId, to: b.accountId, amount: 100 }).reason, 'insufficient_balance');
  assert.equal(validator.check({ from: a.accountId, to: 'acct_999999999999', amount: 10 }).reason, 'account_missing');
  assert.equal(validator.check({ from: a.accountId, to: a.accountId, amount: 10 }).reason, 'self_transfer');
  assert.equal(validator.check({ from: a.accountId, to: b.accountId, amount: 0 }).reason, 'amount_invalid');
});

test('validator.atomic: 批量转账原子性', () => {
  fresh();
  const a = account.open({ balance: 100 });
  const b = account.open({ balance: 0 });
  const c = account.open({ balance: 0 });
  assert.equal(validator.atomic([
    { from: a.accountId, to: b.accountId, amount: 40 },
    { from: b.accountId, to: c.accountId, amount: 30 },
  ]).valid, true);
  const fail = validator.atomic([
    { from: a.accountId, to: b.accountId, amount: 30 },
    { from: b.accountId, to: c.accountId, amount: 50 },
  ]);
  assert.equal(fail.valid, false);
  assert.equal(fail.reason, 'insufficient_balance');
  assert.equal(fail.index, 1);
  assert.equal(fail.account, b.accountId);
});

test('validator: 破产检测钩子触发与退订', () => {
  fresh();
  const fired = [];
  const off = validator.onBankruptcy((info) => fired.push(info));
  const a = account.open({ balance: 10 });
  const b = account.open();
  validator.check({ from: a.accountId, to: b.accountId, amount: 100 });
  assert.equal(fired.length, 1);
  assert.equal(fired[0].account, a.accountId);
  assert.equal(fired[0].required, 100);
  assert.equal(fired[0].balance, 10);
  off();
  validator.check({ from: a.accountId, to: b.accountId, amount: 100 });
  assert.equal(fired.length, 1);
});

test('recorder.post: 落账/发事件/回执', () => {
  fresh();
  const events = [];
  pubsub.subscribe('economy.transaction', (p) => events.push(p));
  const a = account.open({ balance: 100 });
  const b = account.open({ balance: 0 });
  const receipt = recorder.post({ from: a.accountId, to: b.accountId, amount: 30 });
  assert.match(receipt.txId, /^tx_\d{12}$/);
  assert.equal(receipt.amount, 30);
  assert.equal(receipt.fromBalanceAfter, 70);
  assert.equal(receipt.toBalanceAfter, 30);
  assert.equal(account.balance(a.accountId), 70);
  assert.equal(account.balance(b.accountId), 30);
  assert.equal(events.length, 1);
  assert.equal(events[0].amount, 30);
  assert.deepEqual(recorder.receipt(receipt.txId), receipt);
  assert.equal(recorder.receipt('tx_999999999999'), null);
});

test('recorder.post: 校验失败抛错', () => {
  fresh();
  const a = account.open({ balance: 10 });
  const b = account.open();
  assert.throws(
    () => recorder.post({ from: a.accountId, to: b.accountId, amount: 100 }),
    (e) => e.code === 'TRANSACTION_INVALID' && e.reason === 'insufficient_balance',
  );
});

test('querier: 流水查询与对账', () => {
  fresh();
  const a = account.open({ balance: 100 });
  const b = account.open({ balance: 0 });
  recorder.post({ from: a.accountId, to: b.accountId, amount: 40 });
  recorder.post({ from: a.accountId, to: b.accountId, amount: 10 });

  const txsA = querier.query({ accountId: a.accountId });
  assert.equal(txsA.length, 2);
  assert.equal(querier.query({ accountId: a.accountId, limit: 1 }).length, 1);
  assert.equal(querier.query({ from: a.accountId }).length, 2);
  assert.equal(querier.query({ to: b.accountId }).length, 2);
  assert.equal(querier.query({ txId: txsA[0].txId }).length, 1);

  const auditA = querier.audit(a.accountId);
  assert.equal(auditA.current, 50);
  assert.equal(auditA.net, 50);
  assert.equal(auditA.consistent, true);
  assert.equal(auditA.transactionCount, 2);
});

test('orders: 挂单/撤单与校验', () => {
  fresh();
  const a = account.open({ balance: 1000 });
  const o = orders.place({ side: 'buy', symbol: 'FOOD', price: 10, quantity: 5, accountId: a.accountId });
  assert.match(o.orderId, /^ord_\d{12}$/);
  assert.equal(o.status, 'open');
  assert.equal(o.remaining, 5);
  assert.throws(() => orders.place({ side: 'hold', symbol: 'FOOD', price: 10, quantity: 1, accountId: a.accountId }), /side/);
  assert.throws(() => orders.place({ side: 'buy', symbol: 'FOOD', price: 10, quantity: 1, accountId: 'acct_999999999999' }), /账户不存在/);
  assert.equal(orders.cancel(o.orderId).status, 'cancelled');
  assert.equal(orders.cancel(o.orderId), null);
});

test('matching: 撮合与结算（含部分成交）', () => {
  fresh();
  const buyer = account.open({ balance: 1000 });
  const seller = account.open({ balance: 0 });
  const buy = orders.place({ side: 'buy', symbol: 'FOOD', price: 12, quantity: 3, accountId: buyer.accountId });
  const sell = orders.place({ side: 'sell', symbol: 'FOOD', price: 10, quantity: 2, accountId: seller.accountId });

  const trades = matching.match({ symbol: 'FOOD' });
  assert.equal(trades.length, 1);
  assert.equal(trades[0].price, 10);
  assert.equal(trades[0].quantity, 2);
  assert.equal(trades[0].amount, 20);
  assert.equal(trades[0].buyOrderId, buy.orderId);
  assert.equal(trades[0].sellOrderId, sell.orderId);

  const receipts = matching.settle({ trades });
  assert.equal(receipts.length, 1);
  assert.equal(account.balance(buyer.accountId), 980);
  assert.equal(account.balance(seller.accountId), 20);
  assert.equal(price.quote({ symbol: 'FOOD' }), 10);

  // 卖单已成交，买单剩 1；新增卖单继续撮合剩余量
  const sell2 = orders.place({ side: 'sell', symbol: 'FOOD', price: 11, quantity: 5, accountId: seller.accountId });
  const trades2 = matching.match({ symbol: 'FOOD' });
  assert.equal(trades2.length, 1);
  assert.equal(trades2[0].quantity, 1);
  assert.equal(trades2[0].price, 11);
  matching.settle({ trades: trades2 });
  assert.equal(price.quote({ symbol: 'FOOD' }), 11);
  assert.equal(account.balance(buyer.accountId), 969);
  assert.equal(account.balance(seller.accountId), 31);
});

test('price: 报价与更新', () => {
  fresh();
  assert.equal(price.quote({ symbol: 'FOOD' }), null);
  price.update({ symbol: 'FOOD', price: 10 });
  assert.equal(price.quote({ symbol: 'FOOD' }), 10);
  assert.throws(() => price.update({ symbol: 'FOOD', price: -1 }), /非负数/);
});
