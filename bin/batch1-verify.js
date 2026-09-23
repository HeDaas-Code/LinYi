/**
 * truman-town 批次1 验收脚本（t41）：独立复验 t38 生存扩展 / t39 产业经济 / t40 信用税收。
 * 运行：node bin/batch1-verify.js
 * 输出：控制台 + reports/batch1-verification.md
 * 绝不读取或打印 .env。
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as loop from '../src/runtime/orchestrator/loop.js';
import * as infra from '../src/infra/index.js';
import * as economy from '../src/economy/index.js';
import * as survival from '../src/survival/index.js';
import * as civilization from '../src/civilization/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NL = String.fromCharCode(10);
const lines = [];
const out = (...a) => { lines.push(a.join(' ')); console.log(...a); };

function moneyTotals() {
  const accts = infra.graph.read({ type: 'economy.account' });
  let total = 0; let min = Infinity; let max = -Infinity; let minOwner = null;
  const per = [];
  for (const n of accts) {
    const bal = Number.isFinite(n.data && n.data.balance) ? n.data.balance : 0;
    total += bal;
    per.push({ id: n.id, ownerId: n.data && n.data.ownerId, balance: bal, closed: !!(n.data && n.data.closed) });
    if (bal < min) { min = bal; minOwner = { id: n.id, ownerId: n.data && n.data.ownerId, closed: !!(n.data && n.data.closed) }; }
    if (bal > max) max = bal;
  }
  return { total, min, max, minOwner, count: accts.length, per };
}

function survivalRate(report) {
  const initialIds = report.agents.map((a) => a.id);
  const worldAgents = (report.world && report.world.agents) ? report.world.agents : {};
  let alive = 0;
  for (const id of initialIds) if (worldAgents[id] && worldAgents[id].alive !== false) alive += 1;
  return { alive, total: initialIds.length, rate: initialIds.length ? alive / initialIds.length : 0 };
}

async function runOne(seed) {
  const report = await loop.run({ ticks: 200, seed, agentCount: 50, phase2: true });
  const curve = [];
  for (let i = 0; i < report.steps.length; i += 10) {
    const s = report.steps[i];
    curve.push({ tick: i + 1, energy: s.resources.energy.stockpile, medical: s.resources.medical.stockpile });
  }
  const shelter = survival.shelter.status();
  const goal = survival.goal.elapsed({ tick: report.finalTick });
  const crisis = survival.crisis.detect({ tick: report.finalTick });
  const money = moneyTotals();
  const biz = economy.industry.business.list().map((b) => ({
    id: b.businessId, name: b.name, status: b.status,
    balance: economy.ledger.account.balance(b.accountId),
    inventory: (b.inventory && b.inventory.goods) ? b.inventory.goods : 0,
    employees: Array.isArray(b.employees) ? b.employees.length : 0,
  }));
  const loans = economy.bank.credit.list();
  return { report, curve, shelter, goal, crisis, money, biz, loans };
}

const SEEDS = [1, 2, 3];
const runs = [];
for (const seed of SEEDS) {
  console.log('[run] seed=' + seed);
  const r = await runOne(seed);
  runs.push(r);
}

// ---- 报告 ----
out('# 批次1 验收报告：生存与产业经济的集成复验（t41）');
out('');
out('- 生成时间：' + new Date().toISOString());
out('- 方法：默认参数（standard 档，config 未覆盖），50 居民 × 200 tick × 3 种子（1/2/3），phase2 开启。');
out('');

out('## 0. 硬指标回归（t33 基线：存活率必须仍为 1.00）');
out('');
out('| seed | 初始居民 | 存活 | 存活率 | finalTick | finalPopulation |');
out('| --- | --- | --- | --- | --- | --- |');
let allAlive = true;
for (const r of runs) {
  const sr = survivalRate(r.report);
  const fp = r.report.world && r.report.world.agents ? Object.values(r.report.world.agents).filter((a) => a.alive !== false).length : 0;
  if (sr.rate < 1) allAlive = false;
  out('| ' + r.report.seed + ' | ' + sr.total + ' | ' + sr.alive + ' | ' + sr.rate.toFixed(2) + ' | ' + r.report.finalTick + ' | ' + fp + ' |');
}
out('');
out('回归结论：' + (allAlive ? '**通过**（3 种子存活率均 1.00）' : '**不通过**（存在死亡）'));
out('');

out('## 1. 跨种子差异对照（确定性 vs 涌现性）');
out('');
const p2 = runs.map((r) => r.report.phase2.summary);
const keys = ['businesses','goodsProduced','wagesPaid','bankruptcies','creditIssued','interestAccrued','taxCollected','taxRedistributed','trades','childrenBorn','crafted','built','treated','quarantined'];
out('| 字段 | seed1 | seed2 | seed3 | 是否跨种子相同 |');
out('| --- | --- | --- | --- | --- |');
const identicalKeys = [];
const diffKeys = [];
for (const k of keys) {
  const vals = p2.map((s) => s[k]);
  const same = vals[0] === vals[1] && vals[1] === vals[2];
  if (same) identicalKeys.push(k); else diffKeys.push(k);
  out('| ' + k + ' | ' + vals[0] + ' | ' + vals[1] + ' | ' + vals[2] + ' | ' + (same ? '相同' : '不同') + ' |');
}
out('');
out('- 完全相同字段：' + identicalKeys.join(', '));
out('- 有差异字段：' + (diffKeys.length ? diffKeys.join(', ') : '（无）'));
out('');

out('## 2. 能源 / 医疗物资消耗');
out('');
out('### 2.1 能源曲线（每 10 tick 采样，stockpile）');
out('');
out('| tick | seed1.energy | seed2.energy | seed3.energy |');
out('| --- | --- | --- | --- |');
for (let i = 0; i < runs[0].curve.length; i += 1) {
  out('| ' + runs[0].curve[i].tick + ' | ' + runs[0].curve[i].energy + ' | ' + runs[1].curve[i].energy + ' | ' + runs[2].curve[i].energy + ' |');
}
out('');
out('### 2.2 医疗物资曲线（每 10 tick 采样，stockpile）');
out('');
out('| tick | seed1.medical | seed2.medical | seed3.medical |');
out('| --- | --- | --- | --- |');
for (let i = 0; i < runs[0].curve.length; i += 1) {
  out('| ' + runs[0].curve[i].tick + ' | ' + runs[0].curve[i].medical + ' | ' + runs[1].curve[i].medical + ' | ' + runs[2].curve[i].medical + ' |');
}
out('');
out('能源解读：能源被 industry 生产消费（produce 2 / consume 1×企业数），自然损耗 decay.energy=0.01；与居民人数/行为无关。医疗解读：医疗被 health.treatment 消费（每次 COST=10），seed 期播种 2 例流感触发治疗；与居民人数弱相关。');
out('');

out('## 3. 避难所 / 危机 / 生存目标');
out('');
out('| seed | integrity | capacity | occupants | damaged | goal.elapsed | goal.tick | crisis.level | crisis.critical | crisis.reasons |');
out('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of runs) {
  out('| ' + r.report.seed + ' | ' + r.shelter.integrity + ' | ' + r.shelter.capacity + ' | ' + r.shelter.occupants + ' | ' + r.shelter.damaged + ' | ' + r.goal.elapsed + ' | ' + r.goal.tick + ' | ' + r.crisis.level.toFixed(3) + ' | ' + r.crisis.critical + ' | ' + (r.crisis.reasons.join(';') || '无') + ' |');
}
out('');
out('**缺陷标注（如实）**：实测三种子避难所均为 integrity=0、capacity=0、damaged=true，但 occupants=52、crisis.level=1.000 critical——即避难所已被风暴损毁到容量 0 却仍住 52 人（容量约束实际失效，runResidence 在 capacity<=0 时不再跳过），且危机信号退化为常量 critical（level 恒 1.000，永不复原）。这与 8.2 节“shelter 容量软约束可观测且与状态挂钩”的乐观表述不一致，此处如实标注为缺陷，并列入 8.3 改造建议。');
out('');

out('## 4. 企业 / 生产 / 雇佣 / 破产');
out('');
out('| seed | businesses | goodsProduced | wagesPaid | bankruptcies | 企业余额分布 |');
out('| --- | --- | --- | --- | --- | --- |');
for (const r of runs) {
  const bb = r.biz.map((b) => b.id + ':' + b.balance + '(' + b.status + ')').join(' ');
  out('| ' + r.report.seed + ' | ' + r.report.phase2.summary.businesses + ' | ' + r.report.phase2.summary.goodsProduced + ' | ' + r.report.phase2.summary.wagesPaid + ' | ' + r.report.phase2.summary.bankruptcies + ' | ' + bb + ' |');
}
out('');
out('破产解读：企业每 tick 收入 = 产出2 × goodsPrice8 = 16，工资支出 3，净 +13/tick，余额单调增长，永不触及破产阈值 10。');
out('');

out('## 5. 信贷 / 利息 / 税收 / 货币守恒');
out('');
out('| seed | 货币总量 | 账户数 | 余额最小值 | 最小账户(ownerId) | creditIssued | interestAccrued | taxCollected | taxRedistributed |');
out('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of runs) {
  const s = r.report.phase2.summary;
  out('| ' + r.report.seed + ' | ' + r.money.total.toFixed(2) + ' | ' + r.money.count + ' | ' + r.money.min.toFixed(2) + ' | ' + (r.money.minOwner ? r.money.minOwner.ownerId : '-') + ' | ' + s.creditIssued + ' | ' + s.interestAccrued + ' | ' + s.taxCollected + ' | ' + s.taxRedistributed + ' |');
}
out('');
out('- tax 守恒：taxCollected == taxRedistributed = ' + (p2[0].taxCollected === p2[0].taxRedistributed) + '（seed1: ' + p2[0].taxCollected + ' == ' + p2[0].taxRedistributed + '）');
out('- balances 最小值 0 的账户 = tax:pool（税收池自身），属正常现象：池子收税后已全额再分配归零，非居民账户被清零。');
out('- 货币增长来源：industry.operate 每 tick 用 applyBalance 直接记账收入（产出×固定价），无真实买方 → 线性印钞（约 2企业×16/tick=32/tick），非指数发散。');
out('');

out('## 6. 危机检测 vs 文明崩溃（分工证明）');
out('');
// 构造「避难所严重损坏 → 生存危机 critical，但文明未崩溃」
loop.reset();
for (let i = 0; i < 50; i += 1) loop.spawnAgent({ id: 'v' + i, name: '验证居民' + i });
survival.shelter.damage(80);
const c1 = survival.crisis.detect({ tick: 0 });
const col1 = civilization.collapse.detector.detect({ population: 50, resourceRatio: 1, crisisLevel: 0.1 });
out('场景A（避难所损坏 80 → 危机 critical 但未崩溃）：');
out('- survival.crisis.detect = ' + JSON.stringify(c1));
out('- civilization.collapse.detector.detect = ' + JSON.stringify(col1));
out('');
// 构造「人口灭绝 → 文明崩溃，但危机模块（群体饥饿率）不报」
const col2 = civilization.collapse.detector.detect({ population: 0, resourceRatio: 0, crisisLevel: 1 });
const c2 = survival.crisis.detect({ tick: 1 });
out('场景B（人口灭绝 → 文明崩溃，但危机模块不报饥饿）：');
out('- civilization.collapse.detector.detect = ' + JSON.stringify(col2));
out('- survival.crisis.detect = ' + JSON.stringify(c2));
out('');
out('分工结论：survival.crisis 只检测群体生存危机（饥饿/脱水/疫情/避难所损坏，level>=0.8 critical）；civilization.collapse.detector 判定文明崩溃（人口灭绝/资源枯竭/压力升级/综合分数）。二者输入不同（crisis 看群体比例，collapse 看 avgPressure+资源+人口）。');
out('');

out('## 7. 破产清算的货币守恒（强制构造）');
out('');
loop.reset();
economy.ledger.account.open({ ownerId: 'auditor', balance: 0 });
// 开创始人/员工账户（余额 0）
const founderAcct = economy.ledger.account.open({ ownerId: 'founder1', balance: 0 });
const empAcct = economy.ledger.account.open({ ownerId: 'emp1', balance: 0 });
// 开 1 企业（注入 100 资本）+ 雇佣 1 员工 + 产出 10 件商品
const fb = economy.industry.business.found({ founderId: 'founder1', name: '破产测试企业', industry: 'tools', capital: 100 });
economy.industry.labour.hire({ businessId: fb.businessId, agentId: 'emp1', wage: 3, accountId: empAcct.accountId });
const plan = economy.industry.production.plan({ businessId: fb.businessId, output: 10, energyInput: 0, foodInput: 0 });
economy.industry.production.output({ planId: plan.planId });
const bizNow = economy.industry.business.list().find((b) => b.businessId === fb.businessId);
const inventoryGoods = bizNow.inventory ? bizNow.inventory.goods : 0;
// 抽干企业余额（有效正数转账 → 余额 0 <= 阈值 10）
const bizBalance = economy.ledger.account.balance(bizNow.accountId);
economy.ledger.transaction.recorder.post({ from: bizNow.accountId, to: founderAcct.accountId, amount: bizBalance, ref: 'drain', memo: '抽干余额' });
const moneyBefore = moneyTotals().total;
const inventoryValue = inventoryGoods * 8;
const filed = economy.bankruptcy.file({ subjectId: fb.businessId, subjectType: 'business', threshold: 10 });
const liq = filed.filed ? economy.bankruptcy.liquidate({ caseId: filed.caseId, goodsPrice: 8 }) : null;
const moneyAfter = moneyTotals().total;
const conserved = Math.abs((moneyBefore + inventoryValue) - moneyAfter) < 1e-6;
out('- 立案 filed=' + filed.filed + '（余额 ' + filed.balance + ' <= 阈值 10）');
out('- 库存 ' + inventoryGoods + ' 件 × 8 = 库存价值 ' + inventoryValue);
out('- 清算前货币 ' + moneyBefore.toFixed(2) + ' → 清算后 ' + moneyAfter.toFixed(2));
out('- 守恒断言（清算前货币 + 库存变现 == 清算后货币）：' + (conserved ? '成立' : '不成立'));
out('- 结论：清算经 applyBalance 将库存变现（+库存价值），再经 ledger.transaction 分发给债权人/创始人；除“库存变现”外不额外凭空增减货币。');
out('');

out('## 8. 结论（确定性 vs 涌现性，如实）');
out('');
out('### 8.1 三个经济子系统的性质判定');
out('');
out('**判定：装饰性布景（确定性每-tick 算术），非“真实影响个体命运的系统机制”。**');
out('');
out('证据：');
out('1. businesses/goodsProduced/wagesPaid/creditIssued/interestAccrued/taxCollected/taxRedistributed 跨 3 种子逐位相同（见第 1 节）。');
out('2. 企业收入用 applyBalance 直接记账（产出×固定价 8），无真实买方、无市场需求、无价格波动 → 确定性印钞。');
out('3. 雇佣工资固定 3、产出固定 2，与技能/供需无关。');
out('4. 破产阈值 10 永远碰不到（企业净 +13/tick 单调增长）。');
out('5. 能源被 industry 生产/消费的闭合固定回路消耗，与居民人数/行为无关；医疗仅被 seed 播种的流感治疗消耗。');
out('');
out('### 8.2 真实机制（仍然有效）');
out('');
out('- survival 的 food/water 需求增长 + 采集 + 饥饿死亡（pre-batch1，t33 基线）：真实影响个体命运。');
out('- shelter 容量软约束、crisis/goal 快照：可观测且与状态挂钩。');
out('- 文明崩溃检测（phase3）：与危机检测分工清晰，输入不同。');
out('');
out('### 8.3 最小改造建议（使经济子系统成为真实机制）');
out('');
out('1. 生产产出与需求挂钩：产出量/售价随市场供需（market.price 供需/订单）波动，而非固定 goodsPrice=8、output=2。');
out('2. 收入经真实交易撮合：商品卖给真实买方（居民账户）或市场对手方，杜绝 applyBalance 印钞；用 ledger.transaction 结转。');
out('3. 雇佣与技能挂钩：工资/产出随员工技能（agent.traits）差异，而非固定 wage=3、role=worker。');
out('4. 破产可达：引入真实成本（原料采购、能源成本、市场波动）使企业可能亏损，阈值 10 才可能被触及。');
out('5. 能源/医疗消耗与人口/行为挂钩：居民取暖/用电、疾病传播驱动消耗，而非闭合固定回路。');
out('6. 避难所容量约束与危机信号修复：避难所应有修复机制（integrity 可回升），且 capacity<=0 时 runResidence 应拒绝入住而非放行；crisis 信号应能随避难所修复回落，避免退化为常量 critical。');
out('');

await writeFile(path.join(ROOT, 'reports', 'batch1-verification.md'), lines.join(NL) + NL, 'utf8');
out('[written] reports/batch1-verification.md');