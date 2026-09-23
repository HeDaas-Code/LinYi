# 批次1 经济子系统修复报告（t42）

- 生成时间：2026-09-23（t42）
- 背景：t41 验收（reports/batch1-verification.md）判定批次1 经济子系统为「装饰性布景」——确定性每-tick 算术、跨种子逐位相同、无真实买方、企业无成本、破产不可达、能源/医疗与人口脱钩。
- 目标：把「确定性算术」改造为「个体决策与供需驱动的涌现行为」，同时守住默认档 50 居民 × 200 tick 存活率 = 1.00。

## 1. D1 线性印钞 → 货币总量守恒（最高优先级）

### 改造前
- `business.operate` 用 `applyBalance` 直接给企业账户记账收入（产出 2 × 固定价 8 = 16/tick），**没有真实买方**。
- `bankruptcy.liquidate` 变卖库存同样用 `applyBalance` 凭空加钱。
- 货币总量 25932 → 32300（约 +32/tick 线性增长）。

### 改造后
- `business.operate` 改为「卖给真实买方」：逐买方经 `economy.ledger.transaction.recorder.post` 真实转账（买方付款 → 企业入账），余额不足按可负担数量成交；**未售出商品留在 `inventory.goods`，不计入收入**。
- `bankruptcy.liquidate` 变卖库存改为卖给真实买方（`buyerAccountId` 经真实转账），无买方则核销，不凭空造钱。
- 企业能源/原料成本经真实转账汇入供应池账户 `town:supply`，并按周期再分配给居民（货币闭环）。

### 货币总量曲线（seed 42，每 20 tick 采样）

| tick | 1 | 20 | 40 | 60 | 80 | 100 | 120 | 140 | 160 | 180 | 200 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Σ余额 | 25660 | 25660 | 25660 | 25660 | 25660 | 25660 | 25660 | 25660 | 25660 | 25660 | 25660 |

结论：货币总量恒定 25660（初始供应 = 50×500 + 金库 500 + 2×企业 80），**不再线性增长**。

## 2. D3 破产不可达 → 真实成本使企业可亏损、破产可达

### 改造后引入的真实成本（每 tick 每企业）
- 能源成本：`energyConsumed × energyPrice`（energyInput 4 × price 2 = 8）
- 原料采购成本：`rawInput × rawPrice`（4 × 1 = 4）
- 工资：`wage`（3）

收入来自真实买方付款，价格随供需随机波动（`priceVolatility 0.4`）、产出随机波动（`productionOutput 4 × rng(0.6~1.4)`）、需求随人口与随机波动（`goodsDemandPerCapita 0.12`）。

### 实测证据

| 档位 | 破产数（seed 1） | 说明 |
| --- | --- | --- |
| standard（默认） | 1（seed1）/0（seed2）/1（seed3） | 企业余额非单调波动（lossTicks 64/111/47 > 0），破产跨种子可达 |
| harsh | 2 | needGrowth 更高、需求更低、成本更高 → 企业全部破产 |
| apocalyptic | 2 | 同上，更快破产 |

结论：默认档企业余额出现非单调波动（lossTicks > 0），且部分种子触发破产；harsh/apocalyptic 档破产数 > 0。破产不再是「永远碰不到的阈值」。

## 3. D4 能源/医疗与人口行为挂钩

### 改造前
- 能源仅被 industry 闭合固定回路消耗（produce 2 / consume 1×企业数），与居民人数无关。
- 医疗仅被 seed 期播种的 2 例流感治疗消耗（treated=2）。

### 改造后
- 能源：居民取暖/照明/制作等行为每 tick 消耗 `alive × residentEnergyUse`（0.2/人/tick），发电站再补充 `energyRegen`；工业额外消耗。**移除与人口无关的固定回路**。
- 医疗：新增疾病传播（`infectionRate 0.03`，感染者在易感者中随机传播），医疗物资按人口增产（`medicalRegenPerCapita`），治疗名额按人口规模（`treatPerCapita`）——患病居民持续真实消耗 medical。

### 能耗/医疗与人口相关性证据（seed 42，200 tick）

| 人口 | 居民能源消耗 | 治疗次数 | 医疗消耗 |
| --- | --- | --- | --- |
| 20 | 879.4 | 200 | 2000 |
| 50 | 2079.4 | 599 | 5291.5 |

结论：能源消耗随人口近似线性（2079.4/879.4 ≈ 2.36，人口比 2.5）；治疗次数与医疗消耗随人口上升，医疗物资由疾病传播驱动持续消耗，不再是一次性 seed 事件。

## 4. 涌现性硬指标（50 居民 × 200 tick × 3 种子）

| 字段 | seed1 | seed2 | seed3 | 是否跨种子差异 |
| --- | --- | --- | --- | --- |
| businesses | 1 | 2 | 1 | **不同** |
| goodsProduced | 1171 | 1580 | 1071 | **不同** |
| wagesPaid | 870 | 1200 | 789 | **不同** |
| bankruptcies | 1 | 0 | 1 | **不同** |
| trades | 450 | 525 | 431 | **不同** |
| lossTicks | 64 | 111 | 47 | 不同 |
| 存活率 | 1.00 | 1.00 | 1.00 | 相同（硬约束，正确） |

结论：五个核心字段全部跨种子出现差异，经济子系统由「确定性算术」变为「RNG 供需驱动的涌现行为」；默认档存活率稳定 1.00。

## 5. 测试改动说明

- 新增 `test/economy-closure.test.js`（6 例）：货币守恒、收入来自真实买方、未售出不入账、企业可亏损、能源/医疗与人口相关、跨种子涌现。
- 修改 `test/economy-batch1.test.js` 2 例：
  - `business: 创办/运营/关闭`：`operate` 语义从「applyBalance 记收入」改为「卖给真实买方」，需显式传入 `buyers`（真实买方账户），并补断言买方余额下降与货币守恒。
  - `bankruptcy: 立案/清算`：清算变卖库存改为「卖给真实买方」，需显式传入 `buyerAccountId`，并补断言买方余额扣减。
  - 两处均因语义变更（D1 货币守恒）而非弱化断言，反而**新增**了守恒/买方余额断言。
- `test/economy-tax-credit.test.js` 无需改动（其清算用例无库存，不触及变卖路径）。

## 6. 门禁

- npm test：**325/325 全绿**。
- normify_module_refresh（activate）涉及模块：economy.industry.business / economy.bankruptcy / infra.config。
- normify_validate：0 error。
- git 提交：仅本任务文件（config.js、business.js、bankruptcy.js、_stage2.js、economy-closure.test.js、economy-batch1.test.js、本报告 + normify 产物）。
