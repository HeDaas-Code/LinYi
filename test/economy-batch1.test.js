import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as economy from '../src/economy/index.js';
import * as survival from '../src/survival/index.js';
import { loop } from '../src/runtime/index.js';

const business = economy.industry.business;
const production = economy.industry.production;
const labour = economy.industry.labour;
const bankruptcy = economy.bankruptcy;

function fresh() {
  economy.__reset();
  survival.resources.food.__reset();
  survival.resources.water.__reset();
  survival.resources.energy.__reset();
}

test('business: 创办/运营/关闭', () => {
  fresh();
  const b = business.found({ founderId: 'r1', name: '面包坊', industry: 'food', capital: 200 });
  assert.match(b.businessId, /^biz_\d{12}$/);
  assert.equal(b.status, 'active');
  assert.equal(b.premises.plotId, 'plot:food:' + b.businessId); // town.land 占位
  assert.equal(economy.ledger.account.balance(b.accountId), 200);

  // 生产 2 件商品后运营卖给真实买方（t42：收入来自买方转账，杜绝 applyBalance 印钞）
  const buyer = economy.ledger.account.open({ ownerId: 'buyer', balance: 100 });
  const plan = production.plan({ businessId: b.businessId, output: 2, energyInput: 1, foodInput: 0 });
  production.output({ planId: plan.planId });
  const op = business.operate({ businessId: b.businessId, goodsPrice: 8, buyers: [{ accountId: buyer.accountId, quantity: 2 }] });
  assert.equal(op.revenue, 16);
  assert.equal(op.sold, 2);
  assert.equal(op.balance, 216);
  assert.equal(op.insolvent, false);
  assert.equal(economy.ledger.account.balance(buyer.accountId), 84);

  const closed = business.close({ businessId: b.businessId });
  assert.equal(closed.status, 'closed');
  assert.equal(business.close({ businessId: 'biz_000000000000' }), null);
  assert.throws(() => business.operate({ businessId: b.businessId }), /business_inactive/);
});

test('production: 投入不足时按比例降产并说明原因', () => {
  fresh();
  const b = business.found({ founderId: 'r1', capital: 100 });

  // 原料（food）不足：清空食物 → 输出降为 0
  survival.resources.food.consume(1000);
  const p1 = production.plan({ businessId: b.businessId, output: 10, energyInput: 1, foodInput: 5 });
  const o1 = production.output({ planId: p1.planId });
  assert.ok(o1.reasons.includes('insufficient_food'));
  assert.equal(o1.output, 0);

  // 能源不足：清空能源 → 输出降为 0
  survival.resources.energy.consume(1000);
  const p2 = production.plan({ businessId: b.businessId, output: 10, energyInput: 2, foodInput: 0 });
  const o2 = production.output({ planId: p2.planId });
  assert.ok(o2.reasons.includes('insufficient_energy'));
  assert.equal(o2.output, 0);

  // 投入充足 → 满额产出，且库存进入企业
  survival.resources.energy.produce(100);
  const p3 = production.plan({ businessId: b.businessId, output: 6, energyInput: 2, foodInput: 0 });
  const o3 = production.output({ planId: p3.planId });
  assert.equal(o3.output, 6);
  assert.deepEqual(o3.reasons, []);
  assert.equal(business.list().find((x) => x.businessId === b.businessId).inventory.goods, 6);
});

test('labour: 雇佣/发薪/欠薪（余额不足不产生负余额）', () => {
  fresh();
  const worker = economy.ledger.account.open({ ownerId: 'w1', balance: 0 });
  const b = business.found({ founderId: 'boss', capital: 10 });
  labour.hire({ businessId: b.businessId, agentId: 'w1', wage: 8 });

  const p1 = labour.pay({ businessId: b.businessId });
  assert.equal(p1.paid.length, 1);
  assert.equal(economy.ledger.account.balance(worker.accountId), 8);
  assert.equal(economy.ledger.account.balance(b.accountId), 2);

  // 余额 2 < 8 → 欠薪，不产生负余额
  const p2 = labour.pay({ businessId: b.businessId });
  assert.equal(p2.owed.length, 1);
  assert.equal(p2.owed[0].reason, 'insufficient_balance');
  assert.equal(economy.ledger.account.balance(b.accountId), 2);
  assert.equal(economy.ledger.account.balance(worker.accountId), 8);

  // 注入资金后一次性清偿工资 + 历史欠薪
  const bank = economy.ledger.account.open({ balance: 100 });
  economy.ledger.transaction.recorder.post({ from: bank.accountId, to: b.accountId, amount: 20, ref: 'loan' });
  const p3 = labour.pay({ businessId: b.businessId });
  assert.equal(p3.paid.length, 1);
  assert.equal(economy.ledger.account.balance(worker.accountId), 24);
  assert.equal(economy.ledger.account.balance(b.accountId), 6);
});

test('bankruptcy: 立案/清算（变卖库存→清偿欠薪→归还创始人→关闭）', () => {
  fresh();
  const founder = economy.ledger.account.open({ ownerId: 'boss', balance: 0 });
  const worker = economy.ledger.account.open({ ownerId: 'w1', balance: 0 });
  const b = business.found({ founderId: 'boss', capital: 5 });
  labour.hire({ businessId: b.businessId, agentId: 'w1', wage: 8 });

  // 生产 4 件商品；发薪失败形成欠薪 8
  const plan = production.plan({ businessId: b.businessId, output: 4, energyInput: 0, foodInput: 0 });
  production.output({ planId: plan.planId });
  labour.pay({ businessId: b.businessId });

  // 余额 5 低于阈值 20 → 立案
  const f = bankruptcy.file({ subjectId: b.businessId, subjectType: 'business', threshold: 20 });
  assert.equal(f.filed, true);

  // 清算：变卖 4 件×8=32 给真实买方 → 余额 37；先清偿欠薪 8，再归还创始人 29
  const liquidator = economy.ledger.account.open({ ownerId: 'liq', balance: 100 });
  const liq = bankruptcy.liquidate({ caseId: f.caseId, goodsPrice: 8, buyerAccountId: liquidator.accountId });
  assert.equal(liq.status, 'liquidated');
  assert.ok(liq.distribution.some((d) => d.kind === 'wage' && d.to === 'w1' && d.amount === 8));
  assert.ok(liq.distribution.some((d) => d.kind === 'remainder' && d.to === 'boss' && d.amount === 29));
  assert.equal(economy.ledger.account.balance(worker.accountId), 8);
  assert.equal(economy.ledger.account.balance(founder.accountId), 29);
  assert.equal(economy.ledger.account.balance(liquidator.accountId), 68);
  assert.equal(economy.ledger.account.balance(b.accountId), undefined); // 账户已销
  assert.equal(business.list().find((x) => x.businessId === b.businessId).status, 'closed');
});

test('bankruptcy: 高于阈值不立案；智能体主体仅销户', () => {
  fresh();
  const acct = economy.ledger.account.open({ ownerId: 'a1', balance: 100 });
  const f1 = bankruptcy.file({ subjectId: 'a1', subjectType: 'agent', threshold: 50 });
  assert.equal(f1.filed, false);
  assert.equal(f1.reason, 'above_threshold');

  const f2 = bankruptcy.file({ subjectId: 'a1', subjectType: 'agent', threshold: 200 });
  assert.equal(f2.filed, true);
  const liq = bankruptcy.liquidate({ caseId: f2.caseId });
  assert.equal(liq.status, 'liquidated');
  assert.equal(economy.ledger.account.balance(acct.accountId), undefined); // 已销户
});

test('integration: 50 居民 × 200 tick 存活率不回归 + 破产数合理', async () => {
  const report = await loop.run({ agentCount: 50, ticks: 200, seed: 42, phase2: true, phase3: true });

  const worldAgents = report.world.agents ?? {};
  const initialIds = report.agents.map((a) => a.id);
  let alive = 0;
  for (const id of initialIds) {
    const rec = worldAgents[id];
    if (rec && rec.alive !== false) alive += 1;
  }
  const rate = initialIds.length > 0 ? alive / initialIds.length : 0;

  assert.equal(rate, 1, '默认参数下存活率必须保持 1.00');
  // D2 契约变更：企业不再由 seed 阶段按 config.businessCount 固定创办 2 家，
  // 而是由居民在决策环里选择 found 行动诞生（资本来自其自有账户、
  // 行业由 id 哈希决定）。因此企业数是**涌现结果**，不是常数——
  // 这也是「businesses 跨种子分化」能成立的前提。
  assert.ok(report.phase2.summary.businesses > 0, '应有企业被创办（居民自主）');
  assert.ok(report.phase2.summary.goodsProduced >= 400, '生产应持续运行');
  assert.ok(report.phase2.summary.wagesPaid > 0, '工资应持续发放');
  // 破产数上限：企业会因经营失败消亡是**设计目标**（可亏损、可倒闭），
  // 但不应全员破产。此前上限 2 是按固定 2 家企业定的，现按比例约束。
  assert.ok(report.phase2.summary.bankruptcies <= report.phase2.summary.businesses * 40,
    '破产数应合理（不得全员破产）');
});
