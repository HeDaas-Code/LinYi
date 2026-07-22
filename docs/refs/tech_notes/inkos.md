# InkOS 技术笔记

> 源码路径：`/workspace/docs/refs/inkos/`
> 语言：TypeScript（monorepo：`packages/cli`、`packages/core`、`packages/studio`）
> 关注模块：`packages/core/src/agents/`、`packages/core/src/models/`、`packages/core/src/forecast/`

## 项目概述

InkOS 是一个 TypeScript 实现的"操作系统式"小说写作平台，核心思想是把创作过程治理为可校验的运行时契约——每一章不是"一次 LLM 调用"，而是一组带 Zod schema 校验的工件：`intent.md`（本章意图）、`context.json`（上下文包）、`rule-stack.yaml`（适用规则栈）、`trace.json`（执行轨迹）。输入侧用 `author_intent.md` + `current_focus.md` 双文件治理：前者是稳定的长期意图，后者是当前活跃焦点，二者共同构成"作者指南针"，所有章级决策必须与之对齐（`ForecastIntentAlignment.score` 量化对齐度）。InkOS 把"小说"当作一个有状态系统来管理，hook、subplot、emotional arc 都是显式状态对象，通过 `RuntimeStateDelta` 增量更新（hookOps 含 upsert/mention/resolve/defer 四种操作）。

## 核心创新点

1. **37 维连续性审计维度**（`packages/core/src/agents/continuity.ts` 的 `DIMENSION_LABELS`）：把"连续性"拆成 37 个可独立打分的维度（人物、时间线、地理、道具、伏笔、动机、能力、关系、世界观规则、情感弧、 motifs、叙事视角、语气基调等），每个维度有标签、有 fanfic 模式定制化注释。这种"维度正交化"使连续性问题可定位、可统计、可回归——而不是一句"不太连贯"的模糊反馈。

2. **AI-tells 结构化四维检测**（`packages/core/src/agents/ai-tells.ts:1-9` 注释明列 dim 20-23）：纯规则（无 LLM）检测 AI 生成文本的四个结构特征：
   - **dim 20 段落等长**（`ai-tells.ts:48-69`）：≥3 段时计算变异系数 CV，CV<0.15 触发 warning——段落长度过于均匀是 AI 生成的强信号。
   - **dim 21 套话密度**（`ai-tells.ts:71-93`）：统计"似乎/可能/或许/大概/某种程度上"等模糊词，密度>3 次/千字触发 warning。
   - **dim 22 公式化转折**（`ai-tells.ts:95-120`）：同一转折词（然而/不过/与此同时/另一方面）重复≥3 次触发 warning。
   - **dim 23 列表式结构**：连续同前缀句检测。中英文双支持（`HEDGE_WORDS`/`TRANSITION_WORDS` 双语言字典，行 24-32）。

3. **Narrative Forecast 多分支剧情预测**（`packages/core/src/forecast/schema.ts`）：非正典的多分支剧情投影，2-5 个隔离分支（`FORECAST_MIN_BRANCHES=2`、`FORECAST_MAX_BRANCHES=5`，行 7-8），每个分支含 `beats`（章级节拍）、`characterDecisions`（角色决策）、`projectedChanges`（characters/relationships/world/hooks 四类变更）、`risks`（continuity/causality/character 三类风险）、`uncertainties`、`intentAlignment`（与作者意图对齐度 0-100）。Forecast 永不自动转正典，存储在 `story/runtime/narrative-forecasts/` 供作者对比。`branchId` 由 runner 确定性分配（`branch-1..branch-N`，行 91-94 注释），模型不能碰撞或跳号。

## 可直接复用的设计

- **输入治理双文件模式**（`author_intent.md` + `current_focus.md`）：长期意图与当前焦点分离，避免"作者一次性写完所有要求后被遗忘"。`packages/core/src/models/input-governance.ts` 用 Zod schema 校验 `ChapterIntent`/`ContextPackage`/`RuleStack`/`ChapterTrace`。LinYi 应直接采纳这套"双文件 + Zod 校验"治理，把"作者到底要什么"从模糊 prompt 提升为结构化工件。

- **每章运行时契约四件套**（intent.md + context.json + rule-stack.yaml + trace.json）：每章产出不仅是正文，还包含意图声明、上下文包快照、适用规则栈、执行轨迹。这使得"为什么这章这么写"可追溯、可审计、可回放。LinYi 的章节工件应至少包含 intent + trace，rule-stack 用于解决"全书规则 vs 本章特例"的冲突。

- **RuntimeStateDelta 增量更新模型**（`packages/core/src/models/runtime-state.ts` 的 `RuntimeStateDelta`：`currentStatePatch/hookOps/chapterSummary/subplotOps/emotionalArcOps`）：状态变更不是"重写整个 state"，而是结构化 delta。`HookRecord` schema（`hookId/startChapter/status/lastAdvancedChapter/expectedPayoff/payoffTiming/dependsOn/coreHook/halfLifeChapters/promoted`）特别值得借鉴——`halfLifeChapters` 量化"读者多久没看到这个 hook 推进就会忘"，`promoted` 标记核心 hook，是伏笔追踪的精细化设计。

- **AI-tells 四维纯规则检测**（`ai-tells.ts` 全文）：CV<0.15、密度>3‰、转折≥3 次、列表式结构这四个阈值是经验值但可调。LinYi 的去 AI 味层应直接挪用这套结构化检测——零 LLM 成本、可单测、可回归。中英文双语言字典（行 24-32）的设计让 LinYi 多语言支持低成本。

- **Composer 治理上下文**（`packages/core/src/agents/composer.ts` 的 `composeGovernedChapter`）：按 plan 选 context、按 budget 压缩、写 runtime artifacts——这是"章级编排器"的范本，把"选什么进上下文""压到多大""写哪些工件"三件事显式化。

## 需要改造才能借鉴的部分

- **37 维审计的维度裁剪**：37 维对 LinYi 初期可能过重。建议先裁剪到 10-15 个核心维度（人物一致性、时间线、伏笔回收、动机、世界观规则、情感弧、视角、语气），后续按需扩展。`DIMENSION_LABELS` 的字典结构便于增量添加。

- **Zod schema 全量校验的开销**：InkOS 对每个工件都跑 Zod 校验，长篇多章时累积开销不小。LinYi 可考虑分级校验——开发/CI 全量校验、生产只校验关键字段。

- **Narrative Forecast 的 2-5 分支成本**：每分支都要 LLM 生成完整 beats + decisions + risks，2-5 分支意味着 2-5 倍 LLM 成本。LinYi 可考虑"1 主分支 + 2 候选"的轻量版，或仅在关键决策点触发 Forecast。

- **Skill 系统的抽象层级**：InkOS 的 Skill 系统较重，LinYi 若不需要"用户自定义技能"可暂不引入，先用固定 agent 集合。

## 潜在风险

- **Zod schema 演化的迁移成本**：运行时契约一旦落盘，schema 变更需要迁移。InkOS 用 `version: z.literal(1)`（`forecast/schema.ts:65`）显式版本化，LinYi 必须从一开始就给所有持久化工件加 version 字段。

- **37 维的维度耦合**：维度虽正交，但实际审计时维度间有耦合（人物动机变化影响情感弧）。InkOS 似乎按维度独立打分，LinYi 需考虑是否引入"跨维度关联告警"。

- **Forecast 分支的决策幻觉**：LLM 生成的 branches 可能看似合理实则基于幻觉设定。`contextFingerprint`（`forecast/schema.ts:73`）用于绑定生成时的上下文指纹，LinYi 应保留这个设计——分支必须绑定生成时的上下文快照，否则事后无法判断"这个分支基于什么前提"。

- **hookOps 半衰期的经验性**：`halfLifeChapters` 是经验参数，不同题材差异大（悬疑 vs 日常）。LinYi 不应硬编码，需按题材或读者模型动态调整。

## 架构对照信息

| 维度 | InkOS | LinYi 目标 |
|---|---|---|
| 输入治理 | author_intent + current_focus 双文件 + Zod | 待定（应采纳双文件） |
| 章级契约 | intent/context/rule-stack/trace 四件套 | 待定（至少 intent + trace） |
| 连续性审计 | 37 维正交 + DIMENSION_LABELS | 待定（建议裁剪到 10-15 维） |
| 去 AI 味 | ai-tells 四维纯规则 + style-analyzer 统计 | 待定（四维检测应直接挪用） |
| 状态管理 | RuntimeStateDelta + HookRecord（halfLife/promoted） | 待定（delta 模型应借鉴） |
| 剧情预测 | NarrativeForecast 2-5 隔离分支 + intentAlignment | 待定（建议轻量 1+2 版） |
| 编排 | composeGovernedChapter（plan+budget+artifacts） | 待定（三段式可借鉴） |

## 借鉴点映射

| LinYi 模块 | 对应 InkOS 设计 | 文件路径 |
|---|---|---|
| 输入治理 | 双文件 + Zod schema 校验 | `packages/core/src/models/input-governance.ts` |
| 章级工件 | intent/context/rule-stack/trace 四件套 | `packages/core/src/models/input-governance.ts` |
| 连续性审计 | 37 维 DIMENSION_LABELS | `packages/core/src/agents/continuity.ts` |
| 去 AI 味 | ai-tells 四维（CV/套话/转折/列表） | `packages/core/src/agents/ai-tells.ts:48-120` |
| 风格统计 | analyzeStyle（句长/TTR/topPatterns） | `packages/core/src/agents/style-analyzer.ts` |
| 状态增量 | RuntimeStateDelta + HookRecord | `packages/core/src/models/runtime-state.ts` |
| 剧情预测 | NarrativeForecast 2-5 分支 + intentAlignment | `packages/core/src/forecast/schema.ts:64-89` |
| 章级编排 | composeGovernedChapter | `packages/core/src/agents/composer.ts` |
