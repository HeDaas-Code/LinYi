# ainovel-cli 技术笔记

> 源码路径：`/workspace/docs/refs/ainovel-cli/`
> 语言：Go（模块路径 `github.com/voocel/ainovel-cli`）
> 关注模块：`internal/flow/`、`internal/eval/`、`internal/rules/`、`internal/agents/ctxpack/`、`internal/stylestat/`

## 项目概述

ainovel-cli 是一个以 Go 实现的长篇小说生成 CLI，架构核心是"三分法"：**Engine**（确定性调度，无 LLM）+ **Workers**（规划师/写作/编辑等 LLM 循环）+ **Arbiter**（语义裁定，处理纯事实无法决策的事项）。整个流水线由一个 FSM 路由驱动——`flow.Route` 是纯函数，依据已落盘的事实（Progress、ArcBoundary、FoundationMissing、PlanningTier 等）查表得出下一步要执行的 Worker 与任务，覆盖每章下一步、弧末后处理、队列驱动等"查表型"决策；而"语义理解型"决策（选规划师、用户 Steer、总结）交由 Arbiter 处理。Engine 不允许在 Route 内部读 Store，所有事实由 `LoadState` 一次性加载到 `State` 结构，使得 Route 可独立单测、零 IO、零副作用。

## 核心创新点

1. **纯函数路由 + 11 条优先级互斥决策表**（`internal/flow/router.go:66-80`）：Route 函数注释显式列出 11 条决策优先级（Phase=Complete → 补齐 → PendingRewrites → Reviewing → Steering → 弧末评审缺失 → 弧摘要缺失 → 卷摘要缺失 → 下一弧骨架 → 卷末决策 → 默认 writer）。每条互斥、自上而下匹配第一个，保证"同一状态永远得出同一指令"，是确定性叙事调度的范本。

2. **统计归代码、裁定归 LLM 的双轨去 AI 味策略**：`internal/stylestat/stylestat.go` 是全书级风格统计器，注释（行 1-6）明确"统计归代码（确定性、零幻觉），裁定归 LLM"。`patternDefs`（行 73-85）内置 8 类 AI 文风 tic 正则——矫正句『不是…而是…』、计时量词『X息/X瞬』、明喻『像一/仿佛/如同』、沉默节拍、神态模板（眼中闪过/嘴角勾起/咬了咬唇）、躯体反应（心头一紧/身子一颤/倒吸凉气）、思维标记（心想/意识到/感到）、抽象套话。同时 `minePhrases` 在最近 20 章窗口内挖掘 3-6 字高频短语（`phraseWindow=20`，行 18），跨章逐字重复长句也单独计数。章数不足 `minChapters=5`（行 15）时直接返回 nil，避免小样本噪声。

3. **机械规则检查器与 LLM 评审分层**：`internal/rules/checker.go:17` 的 `Check` 函数对正文做三种机械检查——`forbidden_chars`（出现即 error）、`forbidden_phrases`（出现即 error）、`fatigue_words`（超阈值才 warning，不跨章累计）。`Violation` 结构（`Rule/Target/Actual/Severity`）是纯事实，severity 按规则类型固定映射。这层机械检查与 `assets/prompts/editor.md` 的 7 维 LLM 评审正交：机械规则兜底确定性禁忌，LLM 负责语义级审美与一致性。

## 可直接复用的设计

- **FSM 路由的纯函数契约**（`router.go:38-64` 的 `State` 结构 + `router.go:81` 的 `Route(s State) *Instruction`）：State 字段全部显式声明，禁止 Route 内读 Store。LinYi 重构应直接照搬这个契约——把"调度"从 LLM 手里收回，改由确定性事实查表，可单测、可回放、可解释。`Instruction`（`router.go:30-36`）的 `Agent/Task/Reason/Chapter` 四字段是 Worker 派发的最小契约，Reason 字段同时用于日志与失败裁定，值得保留。

- **stylestat 的全书级基线对比思路**（`stylestat.go:29-37` 的 `Stats` 结构）：`Patterns/TopPhrases/RepeatedSentences/Ending/OpeningTimeRate/TitleFormats` 字段覆盖句式 tic、复读、章末同构、开篇时间词、标题格式混用等"全书纵向基线"维度。LinYi 的 `internal/stylestat/` 可直接挪用，只需把 `patternDefs` 正则按目标语言调整（现有正则针对中文网文 AI 味）。`EndingStat.ShortRatio` + `MedianRunes`（行 60-63）捕捉"短结尾本身合法、全书同构才是问题"这一洞察，是单章评审天然失明的强补充。

- **机械规则 + LLM 评审分层**（`checker.go` + `editor.md`）：机械规则兜底确定性禁忌（错别字、禁用词、疲劳词），LLM 评审负责审美与一致性。`internal/eval/grade.go` 的 `Grade` 函数把 diag Findings 三层映射（hard_fail/warning/note），含 `StyleDelta` 回归检测——本期 vs 上期 style_stats 偏移超阈值则告警，可发现"改一处坏全书"的回归。这套分层 + 回归检测应原样移植。

- **ctxpack 的 StoreSummaryCompact 策略**（`internal/agents/ctxpack/strategy.go` + `builder.go` + `restore.go`）：`buildWriterStoreSummaryText` 从 store 重建上下文（progress/chapterPlan/outline/snapshots/foreshadow/pendingReviews/styleRules），`WriterRestorePack` 是压缩后的恢复包。LinYi 长篇写作的上下文窗口治理可直接参考这个"按 store 重建 + 按策略压缩 + 可恢复"三段式。

## 需要改造才能借鉴的部分

- **滚动规划（指南针 + 视野）**：ainovel 的 `architect_long` 与 `architect_short` 双规划师 + 弧/卷分层是为其"分层书"量身设计。LinYi 若不分层，需简化为单规划师 + 远/近视野双窗口，但"远期指南针 + 近期视野"的双窗口思想应保留。

- **Arbiter 的语义裁定边界**：ainovel 把"选规划师身份""用户 Steer 处理""全书总结"留给 Arbiter，这是其三分法的关键。LinYi 若用单一 LLM Orchestrator，需明确哪些决策走确定性、哪些走语义，否则 Arbiter 职责会被静默吞掉。

- **Step 级 checkpoint 恢复**：ainovel 的 Store 每步落盘，崩溃后从最近 Step 恢复。LinYi 若用事件溯源或更粗粒度 checkpoint，需重新设计恢复粒度——太细浪费 IO，太粗丢工作。

## 潜在风险

- **patternDefs 正则的假阳性**：8 类 AI tic 正则不做语法分析（注释行 71-72 自承"近似"），在传统文学修辞里"明喻"是合法手法，按本书纵向基线对比才安全；若直接当硬规则阻断会误伤。LinYi 必须坚持"统计归代码、裁定归 LLM"，不许 stylestat 直接驱动重写决策。

- **机械规则的跨章失明**：`fatigue_words` 注释（`checker.go:70-72`）明说"不跨章累计——跨章问题后续交诊断"。LinYi 若只靠 checker 会有跨章复读漏检，需配合 stylestat 的 `RepeatedSentences` 跨章检测补齐。

- **Route 的 11 条决策表维护成本**：决策表是硬编码的 if-else 链，新增决策点需改源码。LinYi 若预期决策维度会演化，需考虑配置化或规则引擎，但前期不建议过早抽象。

## 架构对照信息

| 维度 | ainovel-cli | LinYi 目标 |
|---|---|---|
| 调度 | 纯函数 FSM Route（11 条查表决策） | 待定（应采纳纯函数契约） |
| 三分法 | Engine + Workers + Arbiter | 待定（建议保留语义裁定层） |
| 去 AI 味 | stylestat 全书统计 + 8 类正则 + anti-ai-tone 判据 | 待定（应直接挪用 stylestat） |
| 评审 | 7 维 LLM + 机械规则 + Grade 三层映射 + StyleDelta 回归 | 待定（分层 + 回归应移植） |
| 上下文 | ctxpack StoreSummaryCompact + WriterRestorePack | 待定（按 store 重建思路可借鉴） |
| 检查点 | Step 级落盘 | 待定（粒度需重设） |

## 借鉴点映射

| LinYi 模块 | 对应 ainovel 设计 | 文件路径 |
|---|---|---|
| 调度 FSM | 纯函数 Route + State 契约 | `internal/flow/router.go:38-81` |
| 去 AI 味统计 | stylestat Compute + patternDefs | `internal/stylestat/stylestat.go:73-100` |
| 机械规则检查 | rules.Check + 三类规则 | `internal/rules/checker.go:17-90` |
| 评审分层与回归 | eval.Grade + StyleDelta | `internal/eval/grade.go` |
| 上下文压缩 | ctxpack StoreSummaryCompact | `internal/agents/ctxpack/strategy.go` |
| 去 AI 味判据 | 5 大类（结构/用词/描写/对话/节奏情感） | `assets/references/anti-ai-tone.md` |
| 7 维评审提示词 | aesthetic 含 4 子项（AI 味/叙事手法/情感打动力/全书固化） | `assets/prompts/editor.md` |
| 评审数据结构 | ReviewEntry + DimensionScore + ConsistencyIssue | `internal/domain/review.go` |
