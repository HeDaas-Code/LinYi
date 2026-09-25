import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as economy from '../src/economy/index.js';
import * as estore from '../src/economy/_store.js';
import * as survival from '../src/survival/index.js';
import { loop } from '../src/runtime/index.js';

const business = economy.industry.business;
const production = economy.industry.production;

/** 货币供应总量 = 全部账户余额之和（含金库/税收池/供应池）。 */
function totalMoney() {
  return estore.listAccounts().reduce((s, n) => s + (typeof n.data.balance === 'number' ? n.data.balance : 0), 0);
}

function fresh() {
  economy.__reset();
  survival.resources.food.__reset();
  survival.resources.water.__reset();
  survival.resources.energy.__reset();
  survival.resources.medical.__reset();
}

function survivalRate(report) {
  const worldAgents = report.world.agents ?? {};
  const initialIds = report.agents.map((a) => a.id);
  let alive = 0;
  for (const id of initialIds) {
    const rec = worldAgents[id];
    if (rec && rec.alive !== false) alive += 1;
  }
  return initialIds.length > 0 ? alive / initialIds.length : 0;
}

function varied(values) {
  return new Set(values).size >= 2;
}

test('D1: 企业收入来自真实买方转账，未售出商品不入账，货币守恒', () => {
  fresh();
  const buyer = economy.ledger.account.open({ ownerId: 'buyer', balance: 100 });
  const b = business.found({ founderId: 'r1', capital: 100 });

  // 生产 3 件商品进入库存
  const plan = production.plan({ businessId: b.businessId, output: 3, energyInput: 0, foodInput: 0 });
  production.output({ planId: plan.planId });

  const moneyBefore = totalMoney();
  // 买方只买 2 件（真实付款转账）
  const op = business.operate({ businessId: b.businessId, goodsPrice: 7, buyers: [{ accountId: buyer.accountId, quantity: 2 }] });
  assert.equal(op.sold, 2);
  assert.equal(op.revenue, 14);
  assert.equal(op.unsold, 1, '未售出 1 件应留在库存');

  // 货币守恒：买方 -14、企业 +14，总量不变
  assert.ok(Math.abs(totalMoney() - moneyBefore) < 1e-9, '买卖交易不得改变货币总量');
  assert.equal(economy.ledger.account.balance(buyer.accountId), 86);
  assert.equal(economy.ledger.account.balance(b.accountId), 114);

  // 未售出商品留在企业库存
  const biz = business.list().find((x) => x.businessId === b.businessId);
  assert.equal(biz.inventory.goods, 1);
});

test('D1: 无买方时收入为 0，库存不动（不凭空印钞）', () => {
  fresh();
  const b = business.found({ founderId: 'r1', capital: 50 });
  const plan = production.plan({ businessId: b.businessId, output: 4, energyInput: 0, foodInput: 0 });
  production.output({ planId: plan.planId });

  const moneyBefore = totalMoney();
  const op = business.operate({ businessId: b.businessId, goodsPrice: 7, buyers: [] });
  assert.equal(op.revenue, 0);
  assert.equal(op.sold, 0);
  assert.equal(op.unsold, 4);
  assert.ok(Math.abs(totalMoney() - moneyBefore) < 1e-9);
});

test('D3: 企业可亏损（成本支出使余额下降）', async () => {
  const report = await loop.run({ agentCount: 50, ticks: 200, seed: 1, phase2: true, phase3: true });
  const s = report.phase2.summary;
  assert.ok(s.businessCosts > 0, '应产生真实成本（能源+原料）');
  assert.ok(s.businessRevenue > 0, '应产生销售收入');
  assert.ok(s.lossTicks > 0, '应存在收入 < 成本+工资的亏损 tick（企业余额非单调）');
});

test('D1: 200 tick 货币总量守恒（1/50/200 tick 三段相等，无线性印钞）', async () => {
  const m1 = await loop.run({ agentCount: 50, ticks: 1, seed: 42, phase2: true, phase3: true });
  const t1 = totalMoney();
  const m50 = await loop.run({ agentCount: 50, ticks: 50, seed: 42, phase2: true, phase3: true });
  const t50 = totalMoney();
  const m200 = await loop.run({ agentCount: 50, ticks: 200, seed: 42, phase2: true, phase3: true });
  const t200 = totalMoney();

  assert.ok(Math.abs(t1 - t50) < 1e-6, '1→50 tick 货币总量应不变');
  assert.ok(Math.abs(t50 - t200) < 1e-6, '50→200 tick 货币总量应不变');
});

test('D4: 能源/医疗消耗与存活人口相关', async () => {
  const small = await loop.run({ agentCount: 20, ticks: 200, seed: 42, phase2: true, phase3: true });
  const large = await loop.run({ agentCount: 50, ticks: 200, seed: 42, phase2: true, phase3: true });

  const se = small.phase2.summary.residentEnergyUsed;
  const le = large.phase2.summary.residentEnergyUsed;
  assert.ok(le > se, '更多人口应消耗更多能源（取暖/照明/制作）');
  // 能源消耗与人口规模大致成比例（20→50 约 2.5 倍）
  assert.ok(le / se > 1.5 && le / se < 4.0, '能源消耗应随人口近似线性增长');

  // 患病居民真实消耗医疗物资（治疗次数与消耗量均 > 0）
  assert.ok(large.phase2.summary.treated > 0, '应存在治疗行为');
  assert.ok(large.resources.medical.totalConsumed > 0, '治疗应真实消耗医疗物资');
});

test('涌现性: 50 居民 × 200 tick × 3 种子关键经济字段跨种子差异', async () => {
  const seeds = [1, 2, 3];
  const rows = [];
  for (const seed of seeds) {
    const report = await loop.run({ agentCount: 50, ticks: 200, seed, phase2: true, phase3: true });
    const s = report.phase2.summary;
    assert.equal(survivalRate(report), 1, '默认参数下存活率必须保持 1.00');
    rows.push({ seed, businesses: s.businesses, goodsProduced: s.goodsProduced, wagesPaid: s.wagesPaid, bankruptcies: s.bankruptcies, trades: s.trades });
  }

  // 全部五项都应跨种子分化。这些差异来自居民的自主行为（上工/交易/制作）经由
  // 真实账本传导到企业盈亏，进而决定破产与否——企业**会因经营失败而消亡**。
  // 注：企业仍由 bootstrap 创办（config.businessCount），「居民自行创办企业」
  // 尚未接入行动空间；分化来自经营结果而非创办决策，这一点是已知边界。
  assert.ok(varied(rows.map((r) => r.businesses)), 'businesses 应跨种子出现差异');
  assert.ok(varied(rows.map((r) => r.goodsProduced)), 'goodsProduced 应跨种子出现差异');
  assert.ok(varied(rows.map((r) => r.wagesPaid)), 'wagesPaid 应跨种子出现差异');
  assert.ok(varied(rows.map((r) => r.bankruptcies)), 'bankruptcies 应跨种子出现差异');
  assert.ok(varied(rows.map((r) => r.trades)), 'trades 应跨种子出现差异');
});
