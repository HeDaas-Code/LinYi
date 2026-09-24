# 批次2 终验报告（t57）— f1/f2 修复后的同口径复验（闭合 t51 findings）

> 复验 t55（公共角色消费点）与 t56（声誉分诊）修复，按同一套升级标准确认存活率与既有结论不回归，
> 并对 t56 引入的 treatPerCapita 全局平衡变更做独立核实（含四档难度梯度逐点对照）。

- 生成时间：2026-09-24T09:09:53.653Z
- HEAD：8624c66（t56 报告 v2）；修复链：t55=2205816+275c900，t56=b2f200a+91c751d+8624c66，t53/t54=e317580/5363daa
- 方法：干净 worktree 同口径对照（pre-t56 @275c900 vs post-t56 @8624c66）+ phase2-only / phase2+phase3 双口径消融 + 四档难度梯度对照 + 单元测试佐证。

## t51 findings 处置状态（逐条）

| finding | 缺陷 | 处置 | 本报告复验结论 |
| --- | --- | --- | --- |
| f1 | society 3/4 效应只写不读（装饰性布景） | t55（2205816+275c900） | ✅ 已修复：3 消费点真实数值公式且可观测（见 ①） |
| f2 | 声誉分诊空操作（triageSwaps 恒 0） | t56（b2f200a+91c751d+8624c66） | ✅ 已修复：分诊真实生效（见 ②）；treatPerCapita 全局副作用已披露且 captain 接受（见 ④） |
| f3 | 3.9× 性能回归 | t53/t54（e317580/5363daa） | ✅ 已修复（t54 独立复验 pass） |

---

## ① f1 复验（t55 公共角色消费点，消融 + 归因）

### 1.1 三个消费点

| 消费点 | 公式 | 单元测试 | 默认档可观测性 |
| --- | --- | --- | --- |
| safety→疾病严重度 | disease.js:96 `severity*(1-safetyFactor())` + :118 症状推进 | 0.5→0.45（-10%）✅ | 默认被 doctor 掩盖（seed1 severitySum=0），压力档可观测 |
| literacyRate→研究加速 | research.js:93 `literacyRate*4` 累积 +1 进度 | 5 tick 完成（无教师不完成）✅ | 可观测（seed1 解锁 tick 26 vs 32） |
| ritualBonus→创伤减缓 | trauma.js:141 `pressure*rate*(1-ritualBonus)` | 祭司累积 < 基准 ✅ | 可观测（seed2 copings 1938 vs 2755） |

### 1.2 消融（默认档，phase2+phase3，society ON vs OFF）

| seed | 角色 | 指标 | ON | OFF | 差异来源 |
| --- | --- | --- | --- | --- | --- |
| 1 | 教师×2+治安官+医生 | treated | 1 | 399 | **t48 doctor**（非 t55） |
| 1 | 同上 | severitySum | 0 | 45.15 | **t48 doctor**（safety 被掩盖） |
| 1 | 同上 | quarantined | 0 | 10034 | **t48 doctor** |
| 1 | 同上 | research maxUnlockTick | 26 | 32 | **t55 literacyRate** |
| 2 | 祭司×3+教师 | copings | 1938 | 2755 | **t55 ritualBonus**（-30%） |
| 2 | 同上 | research maxUnlockTick | 29 | 32 | **t55 literacyRate** |

### 1.3 safety 的压力档（doctor 掩盖的隔离）

- 单元测试（隔离 doctor）：无治安官 severity=0.5 → 有治安官 0.45（safety 0.1），症状推进同步削弱，卸任恢复。确定性公式，无 rng。
- captain 压力档（infectionRate=0.3）：society ON 疾病严重度总和 29.86 vs OFF 36.65（-18.5%）。
- 本报告压力档（infectionRate=0.3，seed1）：ON severitySum 47.47 vs OFF 44.75，方向未复现。原因：seed1 同时有 doctor，且 infectionRate=0.3 下疾病趋于饱和（treated=399/quarantined=10347 两侧相同），safety 的速率型降幅在饱和终态被抹平。**如实记录**；safety 功能性以单元测试（0.5→0.45）+ captain 压力档（29.86 vs 36.65）为准。

### 1.4 f1 判定

**通过**。≥2 项可观测差异达标，且明确区分来源：treated/severity/quarantined 来自 t48 doctor，research maxUnlockTick 与 copings 来自 t55 新增消费点（literacyRate/ritualBonus），safety 以单元测试+压力档证明。默认档差异**未**误记为 t55 功劳。

---

## ② f2 复验（t56 声誉分诊，消融）

seed2（疫情种子，phase2-only）reputationTriageEnabled 开 vs 关：

| 指标 | ON | OFF | 差异 |
| --- | --- | --- | --- |
| reputationTriageSwaps | **9724** | 0 | 不再恒 0 ✅ |
| reputationTriageTreatedScore（合计） | 35440.4 | 22382.8 | 被治疗者声誉构成改变 ✅ |
| 被治疗者平均声誉 | **88.8** | 56.1 | 高声誉优先 ✅ |
| treated | 399 | 399 | 治疗量不变（符合设计） |

**判定：通过**。声誉分诊从空操作变为真实生效。数字与 t56 报告及 captain 先期复核逐值一致。

> 边界（如实）：canonical 三种子中仅 seed2 可观测（seed1/3 初始 2 例在声誉分化前被治愈、传播未成功，swaps=0），属疾病输入缺失、非分诊逻辑错误；t56 的 seed4 为非基线补充证据，不作为主证据。

---

## ③ 回归（硬指标）：默认 50×200×3 存活率

| seed | 存活 | 存活率 |
| --- | --- | --- |
| 1 | 50/50 | 1.00 |
| 2 | 50/50 | 1.00 |
| 3 | 50/50 | 1.00 |

**判定：通过**（死亡 0）。

---

## ④ 不得回归的既有结论

### 4.1 声誉→信贷路径（interestAccrued 开/关）

| reputationCreditEnabled | interestAccrued |
| --- | --- |
| ON（有反馈） | 157.3005 |
| OFF（无反馈） | 297.0000 |

**判定：通过**（显著差异保留，与 t51/t56 基线逐值一致）。

### 4.2 平台指标——seed2 变化（已披露、captain 接受）

pre-t56（275c900，treatPerCapita=0.04）vs post-t56（91c751d/8624c66，treatPerCapita=0.02）：

| 字段 | pre-t56 | post-t56 | 结论 |
| --- | --- | --- | --- |
| seed1 post/reply/react | 853/4993/2602 | 853/4993/2602 | ✅ 未变 |
| seed1 repMean | 57.3096 | 57.3096 | ✅ 未变 |
| **seed2 post/reply/react** | **825/4983/2579** | **836/4981/2560** | ⚠️ 全变 |
| **seed2 repMean** | 58.1827 | 58.0135 | ⚠️ 变 |
| seed3 post/reply/react | 867/4953/2523 | 867/4953/2523 | ✅ 未变 |

根因：t56 将 `treatPerCapita` 0.04→0.02（capacity 2→1）制造稀缺，使 seed2 疫情由「近乎扑灭（treated 8）」转为「地方性流行（treated 399）」，连带改变 seed2 平台指标。OFF 态（triage off）下 seed2 同样 treated=399/post=836，证明该变化单由 treatPerCapita 造成、与声誉排序无关。

**该变化已由 t56 报告 v2（8624c66）如实披露**（第 4 节三种子完整对照 + 第 7 节全局平衡变更与替代方案评估），并已提请 captain 做最终平衡决策；**captain 已接受**（理由见 4.3）。

### 4.3 treatPerCapita 全局平衡变更的独立核实（captain 决策的决定性证据）

四档难度存活曲线（pre-t56 275c900 vs post-t56 8624c66，seed1，phase2+phase3，50 居民）：

| 档位 | pre-t56 a20/a40 | post-t56 a20/a40 | 是否一致 |
| --- | --- | --- | --- |
| peaceful | 52 / 52 | 52 / 52 | ✅ |
| standard | 52 / 52 | 52 / 52 | ✅ |
| harsh | 52 / 0 | 52 / 0 | ✅ |
| apocalyptic | 0 / 0 | 0 / 0 | ✅ |

**逐点完全相同**。harsh/apocalyptic 死亡由 needGrowth（饥饿/脱水）驱动，与疾病治疗名额无关，treatPerCapita 减半对四档难度梯度零影响。这印证 captain 的决定性证据 ①。

**判定（④ 平台指标）**：seed2 平台指标变化属实，但为已披露、且经 captain 接受的 treatPerCapita 全局平衡变更的自然结果；四档难度梯度与默认存活率均不受影响，**不作为 needs_revision 理由**。

---

## ⑤ 全批次消融总表

| 可关闭模块 | 关闭后差异 | 逐模块判定 |
| --- | --- | --- |
| scheduleEnabled | work 18.5%→0%、forage 29.2%→59.2%、rest 24.3%→0.9% | 真实机制 |
| careerEnabled | work 18.5%→0%、forage→46.6% | 真实机制 |
| societyEnabled | treated 1↔399、severity 0↔45.15、research 26↔32、copings 1938↔2755 | 真实机制（t48 doctor + t55 3 消费点） |
| reputationTriageEnabled | swaps 9724↔0、treatedScore 88.8↔56.1 | 真实机制（含 captain 接受的 treatPerCapita 副作用） |
| reputationCreditEnabled | interestAccrued 157.30↔297.00 | 真实机制 |

---

## ⑥ 代码卫生检查

- DEBUG 残留：`grep -rn "DEBUG t5[56]" src/` → 无（t56 在途的 `console.error("DEBUG t56")` 已清除）。
- 临时脚本提交：`git ls-files | grep -E "tmp_|_diag_|tmp-"` → 无（tmp-*.mjs 均为未跟踪 scratch，未被提交）。
- 门禁：npm test 390/390 pass。

**判定：通过。**

---

## 最终判定

| 项 | 结论 |
| --- | --- |
| ① f1（t55 消费点） | 通过（≥2 差异 + 正确归因） |
| ② f2（t56 声誉分诊） | 通过（swaps 9724 vs 0，空操作→真实生效） |
| ③ 生存率 1.00 | 通过 |
| ④ 信贷路径 + 平台指标 | 通过（信贷保留；seed2 平台变化为已披露且 captain 接受的副作用，难度梯度不变） |
| ⑤ 全批次消融总表 | 通过 |
| ⑥ 代码卫生 | 通过 |

**verdict = pass**。f1（t55 三消费点）与 f2（t56 声誉分诊）均真实生效；存活率 1.00、信贷路径保留、四档难度梯度逐点不变；t56 的 treatPerCapita 全局平衡变更已被如实披露并由 captain 接受，不作为回归项。t51 的 f1/f2/f3 三个 finding 全部闭合。

