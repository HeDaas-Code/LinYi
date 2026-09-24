# 批次2 修复报告（t56）— 声誉分诊反馈无效（triageSwaps 恒 0、treated 恒 2）

> 修复 f2：声誉分诊（reputationTriage）此前在默认种子下是空操作——队列长度 ≤ 治疗名额、
> 且患病者声誉始终停在初始值 50，声誉排序既不改变“谁被治疗”，也不改变任何可观测指标。
> 本修复采用「路线 A（制造稀缺）＋ 强化声誉信号 + 新增被治疗者声誉构成指标」，让声誉
> 排序在疫情压力下真实改变“谁被治疗”，并给出开/关消融证据。

- 生成时间：2026-09（t56）
- 基线 HEAD：4510212（t53 结构件 + t55 society 修复，本修复不触碰 loop.js / disease.js / trauma.js / research.js）
- 改动文件：src/runtime/orchestrator/_stage2.js、src/infra/config.js + test/reputation-triage.test.js
- 方法：根因定位（逐 tick 探针）→ 稀缺 + 声誉信号强化 → 新增观测指标 → 50×200×3 消融 → npm test（390 pass）→ normify refresh + build。

---

## 1 根因（两层，比船长定位更进一层）

船长的定位是“capacity ≥ queue，重排序不改变谁能被治疗”（对，但只是第一层）。实测根因有两层：

1. **无稀缺**：`capacity = min(queue, ceil(50 × treatPerCapita))`，treatPerCapita=0.04 → 50 居民时 capacity=2。
   默认种子的患病队列长度 ≤ 2（初始 2 例 + 传播几乎不成功），队列不超过名额，排序对“谁能被治疗”无影响。

2. **患病者声誉恒为 50（更深一层）**：即便把 capacity 压到 1 制造稀缺，重排序仍为 0。原因：
   - 初始 2 例在 seed（tick 0）播种、在 tick 1 即被治疗，来不及参与市场/平台获得声誉分化；
   - 声誉初值 `INITIAL=50`（src/social/reputation.js:18），分诊公式 `effective = severity + boost×(score-50)/50`
     在 score=50 时恒为 0，**无论 boost 调多大都无法重排**（实测 boost=10 仍 swaps=0）；
   - 治疗是满治愈（`recover` step 恒 ≥ 0.5，severity ≤ 0.6 一治即愈），疾病没有持续压力让声誉分化。

结论：**声誉分诊不是“排序逻辑错了”，而是“没有足够患病者 + 患病者声誉未分化”的输入缺失**。
在疫情种子（如 seed 2/4，默认参数下就存在大规模传播）里，声誉分诊其实已经在工作（seed 4 默认
swaps≈8174、treated≈599）；默认种子 1 因疾病从未扩散而完全空转。

## 2 修复（路线 A：制造稀缺 + 强化声誉信号 + 新增观测指标）

> 设计原则：只动 config 参数与 _stage2 分诊块 + 新增模块级汇总字段，**不新增随机数调用**，
> 不触碰平台（posts/replies/react）与信贷路径；确定性，不扰动全局 rng 序列的结构。

| 项 | 变更 | 效果 |
| --- | --- | --- |
| 稀缺 | config `treatPerCapita: 0.04 → 0.02` | 50 居民 capacity 2→1；疫情压力下队列 > 名额，排序真实影响谁能被治疗 |
| 声誉信号 | config `reputationTriageBoost: 0.4 → 1.0` | 声誉项区间从 [-0.4,0.4] 扩到 [-1,1]，与严重度 [0,1] 同级，声誉分化时显著改变排序 |
| 观测指标 | _stage2 新增 `reputationTriageTreatedScore` | 累计被治疗者的声誉得分，开/关分诊时“被治疗者声誉构成”直接可比 |

代码位置：src/runtime/orchestrator/_stage2.js 分诊块（857-881）+ `rankTriageByReputation`（902-908）；
新增字段 `reputationTriageTreatedScore`（模块级累计 + __reset 清零 + summary 暴露）。

## 3 消融实验（reputationTriageEnabled 开 vs 关，50×200）

| seed | 开关 | treated | swaps | treatedScore（合计） | 被治疗者平均声誉 |
| --- | --- | --- | --- | --- | --- |
| 2（疫情） | ON | 399 | 9724 | 35440.4 | 88.8 |
| 2（疫情） | OFF | 399 | 0 | 22382.8 | 56.1 |
| 4（疫情） | ON | 399 | 9638 | 35093.2 | 88.0 |
| 4（疫情） | OFF | 399 | 0 | 22326.2 | 56.0 |

判定：**通过**。开启声誉分诊时 swaps 从恒 0 变为数千次；被治疗者平均声誉 56 → 88，
即“高声誉者优先获得治疗名额”真实改变了被治疗者身份分布（等价于路线 B 的可观测指标，已说明）。

## 4 平台指标与信贷路径红线

| 约束 | 结果 |
| --- | --- |
| ③ 平台指标（seed 1 锚点） | postCount=853 / replyCount=4993 / reactCount=2602，与基线逐值一致（treatPerCapita 变化不改变 seed 1 疾病状态，因该种子疾病本就未扩散） |
| ② 声誉→信贷路径 | seed 1：reputationCreditEnabled ON=157.3 vs OFF=297.0，差异显著保留 |
| ① 生存率 1.00（50×200×3） | 3 种子存活率均 1.00（疾病不引入死亡路径，见第 5 节） |

## 5 生存率红线

| seed | 存活率 |
| --- | --- |
| 1 | 1.00 |
| 2 | 1.00 |
| 3 | 1.00 |

判定：通过（疾病仅影响健康/症状，死亡仍只由饥饿/脱水触发；本次仅改治疗名额与声誉排序，不新增死亡路径）。

## 6 测试

新增 test/reputation-triage.test.js 4 条用例，全部通过：

| 用例 | 断言 | 结果 |
| --- | --- | --- |
| rankTriageByReputation：声誉显著时改变排序 | 高声誉(90)优先于严重度更高但低声誉(20)者 | pass |
| rankTriageByReputation：声誉中性时保持严重度降序 | score=50 时按 severity 降序 | pass |
| t56 消融：开/关在疫情种子下可观测差异 | ON swaps>0 且 treatedScore≠OFF | pass |
| t56 约束：seed 1 平台指标不变 + 信贷路径 + 存活 1.00 | 853/4993/2602 + interest 差>50 + alive=50 | pass |

npm test 全量：390/390 pass，0 fail。

## 7 已知边界（诚实说明）

- 默认种子 1/3 疾病从未形成疫情（初始 2 例在声誉分化前即被治愈、传播未成功），声誉分诊
  在这两个种子仍无可排序对象（swaps=0）。这是**疾病输入缺失**，不是分诊逻辑错误；
  在疫情种子（2/4）下已真实生效。若要求种子 1 也产生消融差异，需提高感染压力
  （infectionRate）或让初始病例存活更久——这会改变共享 rng 消耗并连带改变平台指标，
  与本任务「不得改变平台指标」的约束冲突，故未采纳。
