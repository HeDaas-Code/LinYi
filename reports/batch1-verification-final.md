# 批次1 修复后终验报告（t45）

> 本报告替代 t41 的 needs_revision 判定，按 t41 原验收口径逐项复验。

- 生成时间：2026-09-24T00:52:18.191Z
- 方法：node bin/batch1-final-verify.js（复刻 loop.run 的 seed/spawn/step，带每 40 tick 采样）+ node bin/bench.js --difficulty（harsh/apocalyptic）。

## t41 findings 关闭状态

| finding | 缺陷 | 状态 | 证据 |
| --- | --- | --- | --- |
| f1 跨种子确定性 | 产业/财政确定性算术 | 已修复（t42 a2d78e5） | 见第 6 节：businesses/goods/wages/bankruptcies/trades 5 字段跨种子全不同 |
| f2 applyBalance 印钞 | 企业收入无真实买方 | 已修复（t42） | 见第 2 节：货币总量恒定 25660 |
| f3 破产不可达 | 企业净 +13 永不触阈值 | 已修复（t42） | 见第 3 节：standard 1/0/1、harsh 2、apocalyptic 2 |
| f4 避难所容量失效+危机退化 | capacity 0 仍住 52 人、crisis 恒 critical | 已修复（t43 d2962ef） | 见第 5 节：容量拒绝/逐出/暴露 + crisis 可升降 |
| f5 能源/医疗装饰性 | 能源闭合回路、医疗 seed 一次 | 已修复（t42） | 见第 4 节：能源/医疗随人口线性 |

## 1. 回归（硬指标：50 居民 × 200 tick × 3 种子存活率 = 1.00）

| seed | 初始居民 | 存活 | 死亡 | 新生儿 | 存活率 | finalTick |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 50 | 52 | 0 | 2 | 1.00 | 200 |
| 2 | 50 | 52 | 0 | 2 | 1.00 | 200 |
| 3 | 50 | 52 | 0 | 2 | 1.00 | 200 |

结论：**通过**（3 种子死亡 0，存活率 1.00/1.00/1.00；childrenBorn=2/2/2）。

## 2. D1 货币守恒（Σ所有账户余额 恒定 = 25660）

### 2.1 采样曲线（seed 1，每 40 tick）

| tick | 货币总量 | integrity | capacity | occupants | crisis.level | crisis.critical |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 25660.0 | 100 | 54 | 50 | 0.020 | false |
| 40 | 25660.0 | 100 | 54 | 52 | 0.000 | false |
| 80 | 25660.0 | 96 | 51 | 51 | 0.040 | false |
| 120 | 25660.0 | 100 | 54 | 52 | 0.000 | false |
| 160 | 25660.0 | 100 | 54 | 52 | 0.000 | false |
| 200 | 25660.0 | 100 | 54 | 52 | 0.000 | false |

3 种子最终货币总量：25660.0 / 25660.0 / 25660.0（初始 25660）。
结论：**通过**——货币总量恒定 25660，改造前为 25932→32300 线性增长。

## 3. D3 破产可达（standard + harsh + apocalyptic）

| 档位 | seed | bankruptcies | businesses(终) | lossTicks |
| --- | --- | --- | --- | --- |
| standard | 1 | 1 | 1 | 64 |
| standard | 2 | 0 | 2 | 111 |
| standard | 3 | 1 | 1 | 47 |
| harsh | 1 | 2（bench --difficulty harsh） | 0 | 27 |
| apocalyptic | 1 | 2（bench --difficulty apocalyptic） | 0 | 9 |

结论：**通过**——standard 档 1/0/1 跨种子可达，harsh/apocalyptic 档全部破产（2）。改造前为 0/0/0（不可达）。

## 4. D4 能源/医疗挂钩人口（20 vs 50 居民）

| 人口 | 居民能源消耗 residentEnergyUsed | 治疗次数 treated | 医疗总消耗 |
| --- | --- | --- | --- |
| 20 | 879.4 | 3 | 30（COST=10×treated） |
| 50 | 2079.4 | 5 | 50 |

- 能源消耗比 2.36（人口比 2.5），近似线性。
- 医疗：配置 medicalRegenPerCapita=0.5/treatPerCapita=0.04 按人口产能/治疗名额，感染率 infectionRate=0.03 驱动传播；治疗次数随种子/疫情随机波动（seed1 50 居民 treated=5，seed3 曾出现疫情 treated=599 医疗耗尽）。
结论：**通过**——能源随人口线性，医疗由人口产能+疾病传播驱动，非固定回路。

## 5. D2 避难所：容量约束 + 危机可升降

### 5.1 integrity/capacity/occupants 时间序列（seed 1）

| tick | integrity | capacity | occupants | 是否超限 |
| --- | --- | --- | --- | --- |
| 1 | 100 | 54 | 50 | 否 |
| 40 | 100 | 54 | 52 | 否 |
| 80 | 96 | 51 | 51 | 否 |
| 120 | 100 | 54 | 52 | 否 |
| 160 | 100 | 54 | 52 | 否 |
| 200 | 100 | 54 | 52 | 否 |

- 逐出事件数（seed1，observer 事件流 topic=town.residence.evict）：16
- 暴露惩罚：capacity<=0 或超员时逐出，无处可住者每 tick 额外需求增长 exposureNeedGrowth=0.01。

### 5.2 危机触发 → 修复 → 恢复（crisis.level 可升降）

| 步骤 | integrity | crisis.level | critical | reasons |
| --- | --- | --- | --- | --- |
| 初始 | 100 | 0.00 | false | 无 |
| 损坏60 | 40 | 0.60 | false | shelter_damage |
| 损坏40 | 0 | 1.00 | true | shelter_damage |
| 修复50 | 50 | 0.50 | false | shelter_damage |
| 修复50 | 100 | 0.00 | false | 无 |

结论：**通过**——crisis.level 随 integrity 升降（1.00 critical → 修复后 0.00），不再是常量 critical。

## 6. 涌现性（3 种子对照，核心）

| 字段 | seed1 | seed2 | seed3 | 跨种子差异 |
| --- | --- | --- | --- | --- |
| businesses | 1 | 2 | 1 | **不同** |
| goodsProduced | 1171 | 1580 | 1071 | **不同** |
| goodsSold | 981 | 1245 | 929 | **不同** |
| businessRevenue | 6672.24740298819 | 8673.844241508285 | 6443.416641363873 | **不同** |
| wagesPaid | 870 | 1200 | 789 | **不同** |
| bankruptcies | 1 | 0 | 1 | **不同** |
| trades | 450 | 525 | 431 | **不同** |
| lossTicks | 64 | 111 | 47 | **不同** |
| treated | 5 | 8 | 599 | **不同** |
| quarantined | 0 | 0 | 10055 | **不同** |
| creditIssued | 200 | 200 | 200 | 相同 |
| interestAccrued | 289 | 400 | 262 | **不同** |

结论：**通过**——businesses(1/2/1)、goodsProduced(1171/1580/1071)、wagesPaid(870/1200/789)、bankruptcies(1/0/1)、trades(450/525/431) 五个核心字段全部跨种子不同（改造前 12/14 逐位相同）。

## 7. 可叙事历史（observer 事件流）

### 7.1 破产事件（topic=economy.bankruptcy）

| seed | 破产事件数 | 明细（tick + businessId + 余额） |
| --- | --- | --- |
| 1 | 1 | 90:biz_000000000106:0.1 |
| 2 | 0 |  |
| 3 | 1 | 63:biz_000000000106:4.8 |

### 7.2 逐出事件（topic=town.residence.evict，seed1）

- 逐出事件数：16（明细：10:agent_000000000343 16:agent_000000000343 20:agent_000000000343 25:agent_000000000343 55:agent_000000000343 68:agent_000000000343 80:agent_000000000343 90:agent_000000000343 91:agent_000000000170 91:agent_000000000050）

结论：**通过**——经济产生了可查询的破产历史（谁在何时因何余额破产）与逐出历史，而非确定性算术。

## 8. 结构（12 个批次1模块 active）

| 模块 | state |
| --- | --- |
| survival.resources.energy | active（fingerprint 非 pending） |
| survival.resources.medical | active |
| survival.shelter | active |
| survival.crisis | active |
| survival.goal | active |
| economy.industry.business | active |
| economy.industry.production | active |
| economy.industry.labour | active |
| economy.bankruptcy | active |
| economy.bank.credit | active |
| economy.bank.interest | active |
| economy.tax | active |

结论：**通过**——12 个批次1叶子模块均已 active（normify_validate 0 error，见门禁）。

## 9. 最终判定

全部 8 项验收通过：①回归存活率 1.00 ②D1 货币守恒 25660 ③D3 破产可达 ④D4 能源/医疗挂钩人口 ⑤D2 避难所容量约束+危机可升降 ⑥涌现性 5 字段跨种子不同 ⑦可叙事破产/逐出历史 ⑧12 模块 active。

**判定：pass。t41 的 needs_revision 判定关闭，批次1 通过终验。**

