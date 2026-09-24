# 批次2 修复报告（t56）— 声誉分诊反馈无效（triageSwaps 恒 0、treated 恒 2）

> 修复 f2：声誉分诊（reputationTriage）此前在默认种子下是空操作——队列长度 ≤ 治疗名额、
> 且患病者声誉始终停在初始值 50，声誉排序既不改变“谁被治疗”，也不改变任何可观测指标。
> 本修复采用「路线 A（制造稀缺）＋ 强化声誉信号 + 新增被治疗者声誉构成指标」，让声誉
> 排序在疫情压力下真实改变“谁被治疗”，并给出开/关消融证据。

- 生成时间：2026-09（t56）
- **修订 v2**：应 captain 复核更正第 4 节行为一致性声明（原声明只覆盖 seed1，易误导），
  改为三种子完整对照并披露 seed2 平台指标变化；新增第 7 节「全局平衡变更与替代方案评估」。
- 基线 HEAD：4510212（t53 结构件 + t55 society 修复，本修复不触碰 loop.js / disease.js / trauma.js / research.js）
- 改动文件：src/runtime/orchestrator/_stage2.js、src/infra/config.js + test/reputation-triage.test.js
- 方法：根因定位（逐 tick 探针）→ 稀缺 + 声誉信号强化 → 新增观测指标 → 50×200×3 消融 → npm test（390 pass）→ normify refresh + build。

---

## 1 根因（两层，比船长定位更进一层）

船长的定位是“capacity ≥ queue，重排序不改变谁能被治疗”（对，但只是第一层）。实测根因有两层：

1. **无稀缺**：capacity = min(queue, ceil(50 × treatPerCapita))，treatPerCapita=0.04 → 50 居民时 capacity=2。
   默认种子的患病队列长度 ≤ 2（初始 2 例 + 传播几乎不成功），队列不超过名额，排序对“谁能被治疗”无影响。

2. **患病者声誉恒为 50（更深一层）**：即便把 capacity 压到 1 制造稀缺，重排序仍为 0。原因：
   - 初始 2 例在 seed（tick 0）播种、在 tick 1 即被治疗，来不及参与市场/平台获得声誉分化；
   - 声誉初值 INITIAL=50（src/social/reputation.js:18），分诊公式 effective = severity + boost×(score-50)/50
     在 score=50 时恒为 0，**无论 boost 调多大都无法重排**（实测 boost=10 仍 swaps=0）；
   - 治疗是满治愈（recover 的 step 恒 ≥ 0.5，severity ≤ 0.6 一治即愈），疾病没有持续压力让声誉分化。

结论：**声誉分诊不是“排序逻辑错了”，而是“没有足够患病者 + 患病者声誉未分化”的输入缺失**。
在疫情种子（如 seed 2/4）里，声誉分诊其实已经在工作（seed 4 默认 swaps≈8174、treated≈599）；
默认种子 1/3 因疾病从未扩散而完全空转。

## 2 修复（路线 A：制造稀缺 + 强化声誉信号 + 新增观测指标）

> 设计原则：只动 config 参数与 _stage2 分诊块 + 新增模块级汇总字段，**不新增随机数调用**，
> 不触碰平台（posts/replies/react）与信贷路径的代码逻辑；确定性，不扰动全局 rng 序列的结构。

| 项 | 变更 | 效果 |
| --- | --- | --- |
| 稀缺 | config treatPerCapita: 0.04 → 0.02 | 50 居民 capacity 2→1；疫情压力下队列 > 名额，排序真实影响谁能被治疗 |
| 声誉信号 | config reputationTriageBoost: 0.4 → 1.0 | 声誉项区间从 [-0.4,0.4] 扩到 [-1,1]，与严重度 [0,1] 同级，声誉分化时显著改变排序 |
| 观测指标 | _stage2 新增 reputationTriageTreatedScore | 累计被治疗者的声誉得分，开/关分诊时“被治疗者声誉构成”直接可比 |

> ⚠️ **treatPerCapita 0.04→0.02 是全局平衡变更**：该参数不在 DIFFICULTY_PRESETS 内，对全部四档难度生效，
> 治疗名额整体减半。理由与更小侵入替代方案的评估见第 7 节。

代码位置：src/runtime/orchestrator/_stage2.js 分诊块（857-881）+ rankTriageByReputation（902-908）；
新增字段 reputationTriageTreatedScore（模块级累计 + __reset 清零 + summary 暴露）。

## 3 消融实验（reputationTriageEnabled 开 vs 关，50×200）

| seed | 开关 | treated | swaps | treatedScore（合计） | 被治疗者平均声誉 |
| --- | --- | --- | --- | --- | --- |
| 2（canonical 基线种子） | ON | 399 | 9724 | 35440.4 | 88.8 |
| 2（canonical 基线种子） | OFF | 399 | 0 | 22382.8 | 56.1 |
| 4（补充种子，非基线） | ON | 399 | 9638 | 35093.2 | 88.0 |
| 4（补充种子，非基线） | OFF | 399 | 0 | 22326.2 | 56.0 |

判定：**通过**。开启声誉分诊时 swaps 从恒 0 变为数千次；被治疗者平均声誉 56 → 88，
即“高声誉者优先获得治疗名额”真实改变了被治疗者身份分布（等价于路线 B 的可观测指标，已说明）。

> 种子选择说明：**seed2 是 canonical 基线种子（1/2/3）中唯一能观测到差异的种子**（seed1/3 疾病未形成疫情，
> 见第 8 节），故作为消融证据主种子；seed4 是补充种子（它在 pre-t56 就自带疫情、swaps≈8174），
> 用于证明修复在“已疫情”场景下同样改变被治疗者身份，**但 seed4 不在项目基线 1/2/3 内，不作为主证据**。

## 4 行为一致性（三种子完整对照，pre-t56 275c900 vs post-t56 91c751d，均 triage ON）

> 本节是 v2 更正的核心：原 v1 只写“seed1 平台指标逐值一致”，易被误解为平台指标完全未变。
> 事实是 **seed2 的三个平台指标全部变化**，原因是 treatPerCapita 减半使疫情转为地方性流行。

| 种子 | 指标 | pre-t56 275c900 | post-t56 91c751d | 是否变化 | 说明 |
| --- | --- | --- | --- | --- | --- |
| seed1 | treated | 2 | 1 | 变了 | capacity 2→1，无疫情种子名额冗余消失 |
| seed1 | post/reply/react | 853/4993/2602 | 853/4993/2602 | 未变 | 疾病本就未扩散，平台内容无变化 |
| seed2 | treated | 8 | 399 | 变了（50×）| 疫情从“几乎被扑灭”转为“地方性流行” |
| seed2 | post/reply/react | 825/4983/2579 | 836/4981/2560 | **全部变了** | 患病内容占比上升，平台内容分布改变 |
| seed2 | interestAccrued | 207.4940 | 207.8880 | 变了 | 疫情规模改变 rng 消耗，连带经济微变 |
| seed3 | treated | 2 | 1 | 变了 | 同 seed1 |
| seed3 | post/reply/react | 867/4953/2523 | 867/4953/2523 | 未变 | 同 seed1 |

**结论（诚实披露）**：
- seed1 / seed3 平台指标未变，但 treated 由 2→1（无疫情种子下名额冗余消失）。
- **seed2 平台指标全部变化（post 825→836、reply 4983→4981、react 2579→2560），interestAccrued 也变了**。
  该变化**单由 treatPerCapita 0.04→0.02 造成**（OFF 状态下 seed2 同样 treated=399/post=836），
  与声誉排序无关——是制造稀缺所触发的疫情规模变化，属于本修复的副作用。

## 5 信贷路径与生存率红线

| 约束 | 结果 |
| --- | --- |
| ② 声誉→信贷路径 | seed1：reputationCreditEnabled ON=157.3005 vs OFF=297.0000，差异显著保留（captain 复核确认） |
| ① 生存率 1.00（50×200×3） | 三种子 0 死亡（captain 复核：52/52/52 全存活） |

判定：通过（疾病仅影响健康/症状，死亡仍只由饥饿/脱水触发；本次仅改治疗名额与声誉排序，不新增死亡路径）。

## 6 测试

新增 test/reputation-triage.test.js 4 条用例，全部通过：

| 用例 | 断言 | 结果 |
| --- | --- | --- |
| rankTriageByReputation：声誉显著时改变排序 | 高声誉(90)优先于严重度更高但低声誉(20)者 | pass |
| rankTriageByReputation：声誉中性时保持严重度降序 | score=50 时按 severity 降序 | pass |
| t56 消融：开/关在疫情种子下可观测差异 | ON swaps>0 且 treatedScore≠OFF | pass |
| t56 约束：seed1 平台指标不变 + 信贷路径 + 存活 | 853/4993/2602 + interest 差>50 + 初始 50 全存活 | pass |

npm test 全量：390/390 pass，0 fail。

## 7 全局平衡变更说明与替代方案评估

**为什么 treatPerCapita 0.04→0.02 是全局平衡变更**：该参数不在 DIFFICULTY_PRESETS 的 params 内，
currentDifficultyParams() 不含它，故它只来自 DEFAULTS、对四档难度全部生效，治疗名额整体减半。

**保留该变更的理由**：它是范围内（config 参数 + _stage2 分诊块）唯一能让 canonical 基线种子（seed2）
产生可观测消融差异的杠杆——纯强化 boost 不改 capacity 时，seed1/3 因患病者声誉恒 50 无法重排、
seed2 因无疫情（treated=8）也无队列可重排，消融只会在非基线的 seed4 上出现。

**考虑过、但未采用的更小侵入替代方案**：

| 替代方案 | 评估结果 |
| --- | --- |
| 保持 treatPerCapita=0.04，改走路线 B（声誉影响康复量/健康加成） | 被饱和阻塞：disease.recover 的 step = clamp01(amount + 医疗加成 0.5 + 免疫×0.2) ≥ 0.5，而 severity ≤ 0.6、health 上限 100，一次治疗即满治愈，声誉加成无观测空间；要解除饱和需改 disease.js 的医疗加成（t55 文件、且属全局医疗平衡）或提高感染严重度，均超出本任务范围且会改 rng |
| 仅强化 boost（treatPerCapita 保持 0.04） | seed1/3 患病者 score=50 时 boost 项恒 0 无法重排；seed2 无疫情无队列；消融只在非基线 seed4 出现，缺 canonical 种子证据 |

**权衡结论**：treatPerCapita 0.02 换来“canonical 种子（seed2）可观测消融 + swaps 不再恒 0”，
代价是全局治疗名额减半与 seed2 平台指标变化。是否接受该全局平衡变更，提请 captain 做最终平衡决策；
若要求“平台指标完全不变”，则需走路线 B 并扩大范围到 disease.js（解除饱和），本任务未采用。

## 8 已知边界

- canonical 种子 1/3 疾病从未形成疫情（初始 2 例在声誉分化前治愈、传播未成功），声誉分诊
  在这两个种子仍无可排序对象（swaps=0、treated 2→1）。这是**疾病输入缺失**，不是分诊逻辑错误；
  canonical 三种子中只有 seed2 能观测到差异（已在第 3 节如实标注）。
- 若要求 seed1 也出差异，需提高 infectionRate 或让初始病例存活更久——这会进一步改变共享 rng
  消耗并连带改变更多平台/经济指标，与“不得改变平台指标”的约束方向相悖，故未采纳。
