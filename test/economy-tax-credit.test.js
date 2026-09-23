import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as economy from '../src/economy/index.js';
import * as estore from '../src/economy/_store.js';
import { loop } from '../src/runtime/index.js';

const business = economy.industry.business;
const bankruptcy = economy.bankruptcy;

function fresh() {
  economy.__reset();
}

/** 货币供应总量 = 全部账户（含金库/税收池）余额之和。 */
function totalMoney() {
  return estore.listAccounts().reduce((s, n) => s + (typeof n.data.balance === 'number' ? n.data.balance : 0), 0);
}

test('credit: 放贷/还款经真实转账（金库↔借款人），货币守恒', () => {
  fresh();
  const borrower = economy.ledger.account.open({ ownerId: 'b1', balance: 0 });
  const t = economy.bank.credit.open({ capital: 500 });
  assert.equal(economy.ledger.account.balance(t.treasuryAccountId), 500);

  const loan = economy.bank.credit.apply({ borrowerId: 'b1', borrowerType: 'agent', principal: 100, rate: 0.05, term: 10, tick: 0 });
  assert.equal(loan.status, 'active');
  assert.equal(loan.outstanding, 100);
  assert.equal(economy.ledger.account.balance(t.treasuryAccountId), 400);
  assert.equal(economy.ledger.account.balance(borrower.accountId), 100);

  const r = economy.bank.credit.repay({ loanId: loan.loanId, amount: 60, tick: 5 });
  assert.equal(r.paid, 60);
  assert.equal(r.outstanding, 40);
  assert.equal(economy.ledger.account.balance(borrower.accountId), 40);

  const r2 = economy.bank.credit.repay({ loanId: loan.loanId, amount: 100 });
  assert.equal(r2.status, 'repaid');
  assert.equal(economy.bank.credit.get(loan.loanId).outstanding, 0);
  assert.equal(economy.ledger.account.balance(borrower.accountId), 0);
});

test('interest: 单利计息仅增债务，不触碰账户余额（货币守恒）', () => {
  fresh();
  economy.bank.credit.open({ capital: 1000 });
  const borrower = economy.ledger.account.open({ ownerId: 'b1', balance: 0 });
  const loan = economy.bank.credit.apply({ borrowerId: 'b1', principal: 100, rate: 0.1, term: 0, tick: 0 });
  const moneyBefore = totalMoney();

  for (let i = 1; i <= 3; i += 1) economy.bank.interest.accrue({ loanId: loan.loanId, mode: 'simple', tick: i });
  const s = economy.bank.credit.get(loan.loanId);
  assert.ok(Math.abs(s.accruedInterest - 30) < 1e-9);
  assert.ok(Math.abs(s.outstanding - 130) < 1e-9);
  assert.ok(Math.abs(totalMoney() - moneyBefore) < 1e-9);
});

test('interest: 复利债务指数增长，货币供应仍守恒（不因复利造钱）', () => {
  fresh();
  economy.bank.credit.open({ capital: 1000 });
  const borrower = economy.ledger.account.open({ ownerId: 'b1', balance: 0 });
  const loan = economy.bank.credit.apply({ borrowerId: 'b1', principal: 100, rate: 0.1, term: 0, tick: 0 });
  const moneyBefore = totalMoney();

  for (let i = 1; i <= 3; i += 1) economy.bank.interest.accrue({ loanId: loan.loanId, mode: 'compound', tick: i });
  const s = economy.bank.credit.get(loan.loanId);
  assert.ok(Math.abs(s.outstanding - 133.1) < 1e-9);
  assert.ok(Math.abs(totalMoney() - moneyBefore) < 1e-9);
});

test('credit: 违约标记后不再计息', () => {
  fresh();
  economy.bank.credit.open({ capital: 1000 });
  economy.ledger.account.open({ ownerId: 'b1', balance: 0 });
  const loan = economy.bank.credit.apply({ borrowerId: 'b1', principal: 100, rate: 0.1, term: 0, tick: 0 });
  const d = economy.bank.credit.markDefault({ loanId: loan.loanId });
  assert.equal(d.status, 'defaulted');
  const a = economy.bank.interest.accrue({ loanId: loan.loanId, mode: 'compound', tick: 1 });
  assert.equal(a.interest, 0);
  assert.equal(a.status, 'defaulted');
});

test('tax: 征税与再分配严格守恒（collect == redistribute，货币总量不变）', () => {
  fresh();
  economy.tax.open({});
  const a = economy.ledger.account.open({ ownerId: 'a1', balance: 100 });
  const b = economy.ledger.account.open({ ownerId: 'a2', balance: 50 });
  const c = economy.ledger.account.open({ ownerId: 'a3', balance: 0 });
  const moneyBefore = totalMoney();

  const col = economy.tax.collect({ rate: 0.1, base: 'balance', accountIds: [a.accountId, b.accountId] });
  assert.ok(Math.abs(col.collected - 15) < 1e-9);
  assert.ok(Math.abs(economy.tax.poolBalance() - 15) < 1e-9);

  const red = economy.tax.redistribute({ mode: 'per_capita', recipients: [a.accountId, b.accountId, c.accountId] });
  assert.ok(Math.abs(red.redistributed - 15) < 1e-9);
  assert.ok(Math.abs(economy.tax.poolBalance()) < 1e-9);
  // 守恒断言：征税额 == 再分配额，且货币总量不变
  assert.ok(Math.abs(col.collected - red.redistributed) < 1e-9);
  assert.ok(Math.abs(totalMoney() - moneyBefore) < 1e-9);
});

test('bankruptcy: 清算按工资→贷款→创始人优先级分配', () => {
  fresh();
  const founder = economy.ledger.account.open({ ownerId: 'boss', balance: 0 });
  const b = business.found({ founderId: 'boss', capital: 100 });
  economy.bank.credit.open({ capital: 1000 });
  const loan = economy.bank.credit.apply({ borrowerId: b.businessId, borrowerType: 'business', principal: 80, rate: 0.05, term: 0, tick: 0 });

  const f = bankruptcy.file({ subjectId: b.businessId, subjectType: 'business', threshold: 200 });
  const liq = bankruptcy.liquidate({ caseId: f.caseId, goodsPrice: 8 });
  assert.equal(liq.status, 'liquidated');
  assert.ok(liq.distribution.some((d) => d.kind === 'loan' && d.amount === 80));
  assert.ok(liq.distribution.some((d) => d.kind === 'remainder' && d.amount === 100));
  assert.equal(economy.bank.credit.get(loan.loanId).status, 'repaid');
});

test('integration: 50 居民 × 200 tick 存活率 1.00 + 复利不膨胀货币总量', async () => {
  const runSimple = await loop.run({ agentCount: 50, ticks: 200, seed: 42, phase2: true, phase3: true, interestMode: 'simple' });
  const mSimple = totalMoney();
  const runCompound = await loop.run({ agentCount: 50, ticks: 200, seed: 42, phase2: true, phase3: true, interestMode: 'compound' });
  const mCompound = totalMoney();

  // 存活率 1.00（默认参数不回归）
  const initialIds = runCompound.agents.map((a) => a.id);
  const worldAgents = runCompound.world.agents ?? {};
  const alive = initialIds.filter((id) => !worldAgents[id] || worldAgents[id].alive !== false).length;
  assert.equal(alive / initialIds.length, 1, '默认参数下存活率必须保持 1.00');

  // 复利不膨胀货币：单利与复利下货币总量一致（利息只增债务，不造钱）
  assert.ok(Math.abs(mSimple - mCompound) < 1e-6, '单利/复利下货币总量应一致');

  // 与基线对比：1 tick 控制局 ≈ 初始货币供应
  const runBase = await loop.run({ agentCount: 50, ticks: 1, seed: 42, phase2: true, phase3: true });
  const mBase = totalMoney();
  // 200 tick 货币增长来自经营收入（线性），绝非复利指数膨胀；留足余量
  assert.ok(mCompound < mBase + 50000, '200 tick 货币总量应相对基线有界增长（非复利指数膨胀）');
});
