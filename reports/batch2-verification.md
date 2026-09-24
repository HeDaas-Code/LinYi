# 批次2 验收报告（t51）— 智能体与社会模块涌现性复验

> 按批次1 升级标准执行：模块必须证明让个体产生可观测分叉。本报告覆盖 ①②③④⑤⑥ 六项，⑦性能与⑧长跑按 captain 指令**推迟到 t54（t53 修复后）复验**。

- 生成时间：2026-09-24T06:25:27.498Z
- HEAD：4f04aea（t50 结构件收尾后）
- 方法：node bin/_t51_full.js（3 种子 50×200 phase2+phase3 全字段采集 + 4 组消融）＋ node bin/_t51_narrative.js（事件流/决策流/行为流抽取）＋ normify_validate。

## 判定口径

- ①结构 ②回归 ③涌现 ④消融 ⑤叙事 ⑥装饰性排查 → 本轮判定。
- ⑦性能 ⑧长跑 → **deferred to t54**（captain 已定位 t50 引入约 3.9× 性能回归，t53 修复中）。
- 因 ⑦⑧ 未判定 + ④⑥ 发现 society 部分装饰性 → 最终 verdict = **needs_revision**（不判 pass）。

---

## ① 结构：22 个模块 active + tree.json 与工作区一致

- 批次2 交付的 22 个叶子模块（t46 人格生命周期 6 + t47 记忆/预演/解释 4 + t48 日程/职业 4 + t49 家族/关系 5 + t50 平台/声誉 3）**全部 active**：均无 `state: planned`，fingerprint 非 pending。
- 连同内部辅助模块，tree.json 中共 39 个批次2相关模块全部 active。
- tree.json 与工作区一致：`modules` 共 227 个，其中 `state: planned` 84 个、无 state 字段（默认 active）143 个；工作区 .md 文件同样 227 个（planned 84 / 无 state 143）——**一致**（t49 漏提交 tree.json 的问题已被 t50 的 4f04aea 收尾消除）。
- normify_validate（repoRoot+dir）：**0 error** / 1 条既有 dep/unanchored 警告（269 条箭头未锚定，非阻塞）。

**判定：通过。**

---

## ② 回归：50 居民 × 200 tick × 3 种子存活率 1.00

| seed | 存活 | 存活率 | finalTick | 人口(含新生儿) |
| --- | --- | --- | --- | --- |
| 1 | 50/50 | 1.00 | 200 | 52 |
| 2 | 50/50 | 1.00 | 200 | 52 |
| 3 | 50/50 | 1.00 | 200 | 52 |

**判定：通过**（3 种子死亡 0，存活率 1.00/1.00/1.00）。

---

## ③ 涌现性总表（50×200×3 种子，t46~t50 全部新字段）

### 3.1 人格（t46，persona.personality 5 维度均值）

| 维度 | seed1 | seed2 | seed3 | 跨种子 |
| --- | --- | --- | --- | --- |
| adventurous 冒险性 | 0.4948 | 0.4776 | 0.4643 | **不同** |
| sociable 社交性 | 0.5701 | 0.5574 | 0.5764 | **不同** |
| industrious 勤勉度 | 0.5278 | 0.5432 | 0.5248 | **不同** |
| cautious 谨慎度 | 0.4988 | 0.4830 | 0.4804 | **不同** |
| generous 慷慨度 | 0.5432 | 0.5419 | 0.5214 | **不同** |
| 主导 sociable 人数 | 16 | 18 | 22 | **不同** |

### 3.2 日程/职业/公共角色（t48）

| 字段 | seed1 | seed2 | seed3 | 跨种子 |
| --- | --- | --- | --- | --- |
| schedule.averageLength | 13.74 | 13.46 | 13.54 | **不同** |
| schedule.totalReplans | 658 | 666 | 657 | **不同** |
| careers.guard | 7 | 9 | 4 | **不同** |
| careers.medic | 7 | 6 | 14 | **不同** |
| careers.teacher | 14 | 8 | 14 | **不同** |
| society.effects | literacy+safety+treat | ritual+literacy | treat+safety | **不同** |
| society.holders | teacher/guard/doctor/teacher | priest×3+teacher | doctor+guard×3 | **不同** |

### 3.3 家族/关系/社区（t49）

| 字段 | seed1 | seed2 | seed3 | 跨种子 |
| --- | --- | --- | --- | --- |
| family.families | 15 | 15 | 19 | **不同** |
| family.size(最大) | 4 | 4 | 3 | **不同** |
| graph.edges | 204 | 203 | 202 | **不同** |
| graph.communities | 10 | 10 | 14 | **不同** |

### 3.4 平台/声誉（t50）

| 字段 | seed1 | seed2 | seed3 | 跨种子 |
| --- | --- | --- | --- | --- |
| posts | 852 | 825 | 867 | **不同** |
| replies | 5086 | 4983 | 4953 | **不同** |
| reacts | 2515 | 2579 | 2523 | **不同** |
| reputation.mean | 57.10 | 58.17 | 58.32 | **不同** |
| feedSignature | (全不同) | (全不同) | (全不同) | **不同** |

### 3.5 行动分布（t47 决策 + t48 日程驱动）

| 行动 | seed1 | seed2 | seed3 | 跨种子 |
| --- | --- | --- | --- | --- |
| forage% | 29.0 | 29.8 | 27.7 | **不同** |
| rest% | 24.3 | 23.8 | 24.5 | **不同** |
| work% | 18.6 | 18.2 | 20.0 | **不同** |
| eat% | 14.1 | 14.1 | 13.9 | 不同(微) |
| drink% | 14.1 | 14.1 | 13.9 | 不同(微) |

**判定：通过。** 22 个新字段中 ≥20 个跨种子出现差异（远大于要求的 6 个）。仍相同的字段为**设计使然**：schedule.count=50/50/50（人人有日程）、careers.count=50/50/50（人人有职业）、childrenBorn=2/2/2（确定性繁衍阈值）。

---

## ④ 消融实验（核心）：开 vs 关 对照（seed1）

行动分布（eat/drink/forage/rest/work 五项占比 %）：

| 配置 | eat | drink | forage | rest | work | 存活率 | 食物库存 | treated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 全开(baseline) | 14.1 | 14.1 | 29.0 | 24.3 | 18.6 | 1.00 | 92.4 | 2 |
| scheduleEnabled=false | 19.9 | 19.8 | 59.3 | **0.9** | **0.0** | 1.00 | 84.9 | 2 |
| careerEnabled=false | 13.2 | 13.0 | 46.7 | 27.1 | **0.0** | 1.00 | 89.7 | 2 |
| societyEnabled=false | 14.1 | 14.1 | 29.4 | 23.8 | 18.6 | 1.00 | 100 | 5 |
| repTriage+repCredit=false | 14.1 | 14.1 | 29.0 | 24.3 | 18.6 | 1.00 | 92.4 | 2 |

结论：
- **schedule 是真实机制**：关闭后 work 18.6%→0%、rest 24.3%→0.9%、forage 29%→59.3%，行动分布剧烈塌缩。
- **career 是真实机制**：关闭后 work 18.6%→0%（职业是「work」行动的唯一来源），forage 升到 46.7%。
- **society 是弱效应**：关闭后行动分布几乎不变（14.1/14.1/29.4/23.8/18.6 vs 14.1/14.1/29.0/24.3/18.6），仅资源流有微弱差异（食物 92.4→100、treated 2→5）。原因见 ⑥：4 个公共角色里只有 doctor 的 treatmentCapacity 被真正消费。
- **reputation triage/credit 是弱效应**：关闭后一切可观测指标不变（reputationTriageSwaps 恒 0、credit 利息乘数仅在极端声誉差时起效）。

**判定：部分通过**——schedule/career 为真实机制（证伪了「实现了但没接线」），但 society 与 reputation 的消融证实为弱效应。

---

## ⑤ 可叙事历史（≥8 条，覆盖各域）

| 域 | 事件（tick + 主体 + 载荷） |
| --- | --- |
| 人格 | agent.trait.drift tick10：42/50 居民在生存压力下特质漂移 |
| 记忆 | decisionLog tick2 agent_001：召回语义记忆「第 1 tick 选择 forage（主导需求 food）」（score 1.15）注入决策 |
| 日程 | agent.schedule.replan tick14 agent_003（trigger=interrupt 紧急重排） |
| 职业 | actionLog tick9 agent_001/003/005 执行「work」（职业→工作行为可观测） |
| 家族 | social.procreation tick1 agent_016×agent_050 相似度 0.979 → 子代 agent_234、家族 family_233 |
| 关系 | social.friendship.similarity tick1 agent_001×agent_005 相似度 0.982 建友谊 |
| 平台 | social.platform.post tick1 agent_019 发布 post_251（context=chat） |
| 声誉 | economy.bankruptcy tick29 biz_106 余额 6.82 → 创始人声誉 −30 |
| 避难所(补充) | town.residence.evict tick19 agent_505（reason=over_capacity 超员逐出） |

**判定：通过。** 9 条事件覆盖人格/记忆/日程/职业/家族/关系/平台/声誉 8 域 + 避难所，均取自 observer 事件流/决策流/行为流。

---

## ⑥ 装饰性布景排查（调用点 + 消费点）

### 6.1 逐模块调用/消费表

| 模块 | 调用点(file:line) | 消费点 | 判定 |
| --- | --- | --- | --- |
| persona.identity | loop.js:140 / _stage2.js:262 | 描述注入 AI 上下文 | 真实 |
| persona.motivation | loop.js:217 | decision.context.topMotivation | 真实 |
| persona.personality | loop.js:215/259 | profile.evaluate 修正行动评分 | 真实 |
| lifecycle | loop.js:139/444 | 年龄→自然衰老死亡 | 真实 |
| traits.evolution | loop.js:482 / _stage2.js:260 | drift→tagset→性格重算 | 真实 |
| tagset.similarity | _stage2.js:265/520 | 繁衍匹配+友谊 | 真实 |
| memory.semantic | loop.js:320 | decision.context.semantic 召回 | 真实 |
| anticipation.pruner/simulator | loop.js decide() | 候选修剪+推演评分 | 真实 |
| decision.explainer | loop.js:346/353 | decision.reason→decisionLog | 真实 |
| schedule.planner/executor | loop.js:183/203/608 | 行动覆盖（消融证实） | 真实 |
| role.career | loop.js:172 | occupation→work（消融证实） | 真实 |
| **role.society** | loop.js:176/189 | **仅 treatmentCapacity 被读** | **弱效应** |
| family.registry/chronicle | _stage2.js:318-337 / loop.js:475 | 家族史(死亡写入) | 真实 |
| relationship.family/friendship | _stage2.js:701 | 繁衍+友谊边 | 真实 |
| graph.edges/community | _stage2.js:808/813 | feeds 社区亲和 | 真实 |
| platform.posts/feeds | _stage2.js:974-1025 | feeds.rank 排序 | 真实 |
| reputation | _stage2.js:639/864（读）547-1017（写） | 信用乘数+feed 分诊 | 真实(弱 triage) |

### 6.2 发现的装饰性缺陷

**society 模块 4 个公共角色中 3 个是「只写不读」：**
- teacher → `literacyRate`：仅写入 society.js，全 src 无任何读取（grep 证实）。
- guard → `safety`：仅写入 society.js，无读取。
- priest → `ritualBonus`：仅写入 society.js，无读取。
- doctor → `treatmentCapacity`：被 loop.js:191 `applySocietyEffects` 读取（唯一真实消费点）。

即 society 的消融「几乎无效应」的根因：除医生治疗名额外，教师/治安官/祭司的社区影响是纯装饰。

**判定：发现缺陷**——society 为弱效应/部分装饰性，需 needs_revision。

---

## ⑦ 性能（deferred to t54）

- captain 证据：同口径 200×50 phase2 only——基线 6939444=2941/3140/3156ms，t52(3d7c206)=3823/3717/3759ms(1.22×)，**当前 HEAD 4f04aea=11711ms(≈3.9×)**；npm test 44.6s→182.7s；CPU profile 58.9% 在 structuredClone（feeds.rank→reputation.query→graph.read→clone）。
- 本任务顺带观察（不判分）：单次 phase2-only 50×200 实测 4778ms。注意：测量时工作区已出现 t53（infra-engineer）对 feeds.js/reputation.js/_stage2.js 的**未提交改动**（`git status` 可见），故该数值是半改状态代码，且 feeds.js 中已出现 `reputation.scoreMap()`/`edgeWeightMap()` 批量读——这印证了 captain「性能测量会与 t53 互相干扰」的判断，最终口径以 t54 在 t53 落地后为准。
- **不做通过/不通过判定，由 t54 在 t53 落地后复验。**

## ⑧ 长跑稳定性（deferred to t54）

- 50×2000 存活率与墙钟（批次2 新增记忆检索/社区发现/信息流排序易引入 O(t²) 退化，t31/t33/t52 三次先例）——**由 t54 复验。**

---

## 逐模块最终判定

| 域 | 模块 | 判定 |
| --- | --- | --- |
| 人格 | identity/motivation/personality/lifecycle/evolution/similarity | 真实机制 |
| 记忆/决策 | memory.semantic / anticipation(pruner/simulator) / decision.explainer | 真实机制 |
| 日程/职业 | schedule.planner/executor / role.career | 真实机制（消融证实） |
| 公共角色 | role.society | **弱效应（3/4 效应装饰性）** |
| 家族/关系 | family.registry/chronicle / relationship.family / graph.edges/community | 真实机制 |
| 平台/声誉 | platform.posts/feeds / reputation | 真实机制（声誉 triage 弱） |

---

## 最终判定

- 通过：①结构 ②回归 ③涌现（22 字段分叉）⑤叙事（8 域）——四项 clean pass。
- 部分通过：④消融（schedule/career 真实，society/reputation 弱）。
- 缺陷：⑥ society 3/4 效应只写不读（装饰性）。
- 未判定：⑦性能 ⑧长跑（t53 修复后 t54 复验）。

**verdict = needs_revision**：因 ⑦⑧ 未判定（已知 3.9× 回归）+ ⑥ society 部分装饰性，本任务不判 pass。t54 补测 ⑦⑧ 并对 society 缺陷闭环。

