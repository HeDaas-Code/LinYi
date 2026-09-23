# 参数审计与调优报告（t28）

> 目标：楚门小镇最小闭环 MVP 的"运行时主循环 → 生存 → 决策 → AI → 观察者 → 控制/观测"闭环中，
> 修复四类阻断性缺陷（种子未生效 / 无死亡 / 稀缺度口径 / 经济停滞），并把暴露出的决策与资源模型
> 调到合理区间。本文档按"问题 / 证据 / 修复 / 前后数据 / 被否方案"记录每一项。

## 修复总览

| 编号 | 问题 | 修复文件 | 结果 |
|---|---|---|---|
| P0-1 | 种子未生效（结构计数器几乎相同） | `_stage2.js` | 不同种子产生结构性差异 |
| P0-2 | 无死亡机制 + "空转满足" | `loop.js`、`config.js` | 资源枯竭→饥饿→死亡，写 observer |
| P0-3 | 稀缺度口径错误（初始 0.8） | `food.js`、`water.js` | 初始稀缺度=0，真正枯竭才逼近阈值 |
| P1-4 | 经济 125 笔后停滞 | `_stage2.js` | 对手方轮转 + 数量随机，不再单边枯竭 |
| 附加 | 决策永远"进食/饮水" + 水源无补充 | `loop.js`、`config.js` | 采集/休息被激活，食物与水均可补充 |

---

## P0-1 种子未生效

**问题**：`--seeds 1,2,3`（8 居民 × 30 tick）给出几乎相同结果：日志总数 725/726/724，
born=2、trades=30、crafted=3、breakdowns=1 完全一致。

**证据（修复前）**：
```
seed 1 total 725 born 2 trades 30 crafted 3 breakdowns 1 collapses 1 pop 10
seed 2 total 726 born 2 trades 30 crafted 3 breakdowns 1 collapses 1 pop 10
seed 3 total 724 born 2 trades 30 crafted 3 breakdowns 1 collapses 1 pop 10
```

**根因**：`loop.run` 确实在 `reset()` 后调用 `rng.seed(options.seed)`，但只有 `survival.events` 的
事件抽取（roller）消费 rng；结构性子系统全部确定性——`makeTags` 固定 45 个 `base{i}` + 5 个
`u{index}_{i}`（无 rng）、`match.pair` 对所有配对 jaccard≈0.818 按 id 决胜、市场固定
seller=agents[0]/buyer=agents[1]/price=4/quantity=1、制作/心理也固定人选。事件差异被 capacity=500
的口径掩盖（见 P0-3），故 3 个种子结构上不可区分。

**修复**：
1. `makeTags`：特有标签改为从 20 个候选池用 `rng.shuffle` 无放回抽样 + `rng.float` 权重，
   使不同个体/不同种子的特质结构不同（jaccard 随之分化）。
2. `runProcreation`：配对顺序 `rng.shuffle(pairs)` 后再跳过已生育配对，让"谁和谁生育"随种子变化。
3. `runMarket`：买卖双方 `rng.choice` 轮转 + 数量 `rng.int(1,3)`，让交易结构随种子变化。

**证据（修复后）**：
```
seed 1 total 719 born 2 trades 21 crafted 3 breakdowns 1 collapses 1 pop 10
seed 2 total 713 born 2 trades 18 crafted 3 breakdowns 1 collapses 1 pop 10
seed 3 total 714 born 2 trades 20 crafted 3 breakdowns 1 collapses 1 pop 10
```
trades 21/18/20 至少一项结构性不同，满足验收（born/trades/collapse tick 任一不同即可）。
`test/tuning.test.js` 固化该验收。

**被否方案**：仅依赖事件 rng 制造差异（结构性子系统仍确定性，差异会被容量口径掩盖）。

---

## P0-2 无死亡机制 + "空转满足"

**问题**：资源在 tick3+ 已归零，但 survivalRate 恒为 1.0、人口持续上涨。

**根因**：①没有死亡机制；② `consume` 夹在 [0, stockpile]（库存为 0 时 consumed=0），但 `effectFor`
仍无条件 `meter.update(delta:-0.5)` 降低需求——"吃空气"也能满足（空转满足），于是需求永远上不到顶、
死亡永远不会触发。

**修复**：
1. `effectFor`：`eat/drink` 仅在 `consume().consumed > 0` 时降低需求（消除空转满足）。
2. `loop.js` 新增 `runMortality`：需求（food 或 water）≥ `starvationThreshold` 且连续
   `starvationTicks` 个 tick → 健康每 tick 下降 `starvationHealthDecline` → 健康归零死亡：
   `registry.unregister` + `world-state.alive=false/deathTick` + `eventLog.record('agent.death')`。
3. `config.js` 新增三个可调参数：`starvationThreshold=0.9`、`starvationTicks=5`、
   `starvationHealthDecline=0.2`。

**证据（修复后）**：`decay=0.1/needGrowth=0.3/eventProbability=0`，4 居民 40 tick → 4 人全部死亡，
食物归零，`agent.death` 事件写入，registry 清空。`test/tuning.test.js` 固化。

**被否方案**：直接按 `stockpile===0` 判死（无健康衰减缓冲，过于突兀，且无法区分饥饿/脱水）。

---

## P0-3 稀缺度口径错误

**问题**：`scarcity = 1 - stockpile/capacity`，初始 stockpile=100、capacity=500 → 初始稀缺度已 0.80，
喝一口水即撞 0.90 阈值 → 崩溃 tick1。

**证据（修复前）**：`food.query().scarcity === 0.8`（`1 - 100/500`），`firstCollapse.tick === 1`。

**修复**：把 `food`/`water` 的 `defaultCapacity` 由 500 改为 100（与初始库存口径一致），
初始稀缺度=0，库存降到 ≤10 才逼近 0.9。

**证据（修复后）**：初始 `scarcity === 0`；`consume(90)` 后 stockpile=10 → `scarcity === 0.9`。
`test/survival.test.js` 与 `test/tuning.test.js` 固化。

**被否方案**：①保留 capacity=500 改公式为相对消费速率（需新增参考基线参数，复杂且易再生口径漂移）；
②把初始库存提到 500（改动全部资源曲线与冒烟断言，影响面大）。

---

## P1-4 经济停滞

**问题**：125 笔交易后买方余额归零，交易停止。

**归因**：价格固定 4、初始余额 500、买方固定为 `agents[1]`（卖方固定 `agents[0]`）且无任何收入来源——
单一买方持续净流出 4/笔，500 ÷ 4 = 125 笔后必然归零。

**修复（模型层最小改动）**：市场买卖双方按 `rng.choice` 轮转（所有居民轮流出任买方/卖方），
成交数量 `rng.int(1,3)` 随机；价格仍走 `config.price`（缺省 4，保持市场发现价稳定）。
轮转后货币在居民间循环，不再单边枯竭；同时这一随机化也直接服务于 P0-1 的种子差异。

**证据**：`integration2.test.js` 的市场发现价仍为 4、交易数 ≥1、同 seed 摘要可复现均通过；
扫描中 20 居民 × 200 tick 交易数在 20~40 区间波动、破产账户数不再随时间单调上升。

**被否方案**：①给居民发工资/固定收入（会制造无锚货币增发与通胀，超出最小修复）；
②让价格随机波动（破坏"市场发现价=4"的确定性契约与现有断言）。

---

## 附加：决策模型与水源补充（"合理区间"的必要修复）

**问题**：`scoreAction` 在"对应需求居首"时无条件 +2，而需求只有 food/water 两类，
故 dominantNeed 恒为 food 或 water → 智能体**永远**选择进食/饮水，采集（forage）与休息从不被选中；
且 forage 只产食物、水源无任何补充来源 → 20 居民下水源 5 tick 内归零、全员脱水死亡。

**修复**：
1. `scoreAction`：仅当主导需求 ≥ `eatThreshold`（缺省 0.4）才给 eat/drink +2；未达阈值时
   forage 加权 `1.2 + scarcity`（资源越稀缺越应采集）、rest 加权 0.5。形成"不缺就采集、缺了就吃"的闭环。
2. `effectFor.forage`：采集同时产出食物与水源（`forageYield` 缺省 2）。
3. `config.js` 新增 `eatThreshold=0.4`、`forageYield=2`。

**效果**：4 居民 × 15 tick 下食物在 95~100 波动（采集补得上消耗）、水源 100→70（仍衰减但不归零），
居民全部存活；20 居民下资源与人口进入动态平衡而非必然灭绝。

**被否方案**：新增"取水"第五行动（需改候选池/评分/效应/测试，面太大）；只调 decay/eventProbability
（无法解决"决策永远进食 + 水源无补充"的结构性失衡）。

---

## 验收状态

- `npm test` 全绿（276/276，含新增 `test/tuning.test.js` 4 例回归）。
- `normify_validate` 0 error（无新增模块，全部为既有模块内联修改）。
- 种子结构性差异、死亡、稀缺度口径、经济轮转均有回归测试锁定。