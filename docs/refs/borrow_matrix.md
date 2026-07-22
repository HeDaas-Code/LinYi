# 借鉴矩阵：方案借鉴点 → 参考项目映射

> 团队合稿。将本方案 §14.4 列出的 14 个借鉴点与具体参考项目 / 文件 / 行号一一对应。覆盖度必须为 100%。
> 上游规范：[`docs/系统重构方案_v1.md`](../系统重构方案_v1.md) §14.4。
> 参考项目技术笔记：[`tech_notes/`](./tech_notes/) 7 份。
> LinYi 落地位置以 [`specs/refactor-novelist-system-v1/tasks.md`](../../.trae/specs/refactor-novelist-system-v1/tasks.md) 的 Task 编号为准。

## 借鉴点总览

| # | 本方案借鉴点 | 主参考 | 辅助参考 | 关键文件/章节 | LinYi 落地位置 | 覆盖状态 |
|---|-------------|--------|----------|---------------|----------------|----------|
| 1 | Story Bible 真源 | Webnovel Writer | NovelPilot / AI Novel Factory | `story_contract_schema.py:23-58` / `lib/types.ts` / `factory-db.ts:33-47` | `src/novelist_brain/models.py::StoryBible` + `story_bible/{novel_id}.json` | ✅ |
| 2 | Strand Weave 节奏 | Webnovel Writer | ainovel-cli | `references/shared/strand-weave-pattern.md` / `internal/flow/router.go:38-81` | `src/novelist_brain/planner.py::Planner`（四线编织） | ✅ |
| 3 | ContinuityAuditor 六维 | InkOS | ainovel-cli / NovelPilot | `packages/core/src/agents/continuity.ts` / `internal/eval/grade.go` / `lib/types.ts` | `src/novelist_brain/continuity_auditor.py::ContinuityAuditor` | ✅ |
| 4 | 去 AI 味规则 | ainovel-cli | Webnovel Writer | `internal/stylestat/stylestat.go:73-100` / `internal/rules/checker.go:17-90` / `anti-ai-guide.md` | `src/novelist_brain/quality_engine.py::QualityEngine` + `src/novelist_brain/prompts.py` | ✅ |
| 5 | 滚动规划 | ainovel-cli | AI Novel Factory | `internal/flow/router.go:38-81` / `ctxpack/strategy.go` / `orchestrator.ts:146-176` | `src/novelist_brain/planner.py::Planner` + `chapter_manager.py::ChapterManager` | ✅ |
| 6 | 雪花写作法提示词 | AI_NovelGenerator_YILING | NovelPilot | `prompt_definitions.py:160-264` / `architecture.py:49-202` / `lib/agents.ts` | `src/novelist_brain/prompts.py`（雪花 4 步提示词组） | ✅ |
| 7 | 显式叙事结构 | NovelDreamer | AI_NovelGenerator_YILING | `story_generator.py:22-191` / `prompt_definitions.py:236-309` | `src/novelist_brain/prompts.py`（结构选择器常量） + `planner.py` | ✅ |
| 8 | 单一真源（SQLite/JSON） | AI Novel Factory | Webnovel Writer | `docs/PRODUCTION_ARCHITECTURE.md` §Source Of Truth / `factory-db.ts:33-47` / `.story-system/` 多 JSON | `src/novelist_brain/persistence.py` + `story_bible/{novel_id}.json` | ✅ |
| 9 | 多 Agent 流水线 | NovelPilot | InkOS | `lib/agents.ts`（9-Agent 固定顺序）/ `agent-retry.ts:28-80` / `agent-fallbacks.ts:259-285` / `composer.ts::composeGovernedChapter` | `src/novelist_brain/creation_executive.py::CreationExecutive` + `module_registry.py::register_agent` | ✅ |
| 10 | 文风指纹 | ainovel-cli | InkOS | `internal/stylestat/stylestat.go:29-100` / `internal/eval/grade.go` / `style-analyzer.ts` / `ai-tells.ts:48-120` | `src/novelist_brain/quality_engine.py::QualityEngine` + `models.py::StoryBible.style_fingerprint` | ✅ |
| 11 | 题材模板 | Webnovel Writer | AI_NovelGenerator_YILING | `templates/genres/*.md`（37 题材）/ `genre-profiles.md` / `csv/题材与调性推理.csv` / `story_system_engine.py:164 _route` / `prompt_definitions.py:161-177` | `src/novelist_brain/coc_mapping_engine.py::COCMappingEngine` + `prompts.py` | ✅ |
| 12 | Foreshadowing Tracker | NovelPilot | Webnovel Writer | `lib/types.ts::ForeshadowingItem` / `prompts.ts:38-48` / `foreshadowing.md` / `index_manager.py` chase_debt | `src/novelist_brain/models.py::StoryBible.foreshadowing_ledger` + `planner.py::ForeshadowingOp` | ✅ |
| 13 | Director/Worker 协作 | AI Novel Factory | — | `novel-director.ts:1-199` / `worker.ts:66-88` / `autopilot-worker.ts:68-82` / `PRODUCTION_ARCHITECTURE.md` §Director Model | `src/novelist_brain/creation_executive.py::CreationExecutive`（Director）+ `scheduler.py`（Worker）+ `circuit_breaker.py` | ✅ |
| 14 | 风格迁移（外部语料） | NovelDreamer | — | `story_generator.py:577-599` / `:465-481` / `:647-650` | `src/novelist_brain/prompts.py`（风格迁移提示词） + `memory.py`（外部语料检索） | ✅ |

## 借鉴点详细映射

### 1. Story Bible 真源

- **主参考**：Webnovel Writer
  - 文件：`docs/refs/webnovel-writer/scripts/data_modules/story_contract_schema.py:23-58`（`MasterSetting` / `VolumeBrief` / `ChapterBrief` / `ReviewContract` 四个 Pydantic 模型）
  - 关键设计：`.story-system/MASTER_SETTING.json`（卷级合同，含 `core_tone` / `pacing_strategy` / `override_policy`）+ `volume_XXX.json` + `chapter_XXX.json` + `review_XXX.json` + `chapter_XXX.commit.json` 四层合同链
  - 行号：`story_contract_schema.py:23-58`；`story_contracts.py:90 merge_contract_layers`（locked / append_only / override_allowed 三段式合并）
- **辅助参考**：NovelPilot / AI Novel Factory
  - NovelPilot：`lib/types.ts` 中的 `StoryBible` 单一容器（concept/theme/genre/tone/characters/worldbuilding/plot/parts/chapters/styleGuide/foreshadowingTracker 11 段）
  - AI Novel Factory：`packages/ai-novel-core/src/factory-db.ts:33-47` 的 `projects` + `artifacts` + `checkpoints` 表组合，提供"DB 内单一真源"对照样本
- **LinYi 落地**：`src/novelist_brain/models.py::StoryBible` dataclass（含 `world_contract` / `character_registry` / `plot_compass` / `foreshadowing_ledger` / `chapter_blueprint` / `style_fingerprint` / `continuity_rules` 七段，对应 Task 1.1.1）+ `story_bible/{novel_id}.json` 持久化（Task 1.8.5）
- **改造要点**：Webnovel Writer 的合同链过深（master → volume → chapter → commit → 派生视图五层），LinYi 简化为单层 `StoryBible` + `WorldStateContract`；NovelPilot 把所有状态塞进单一对象对长篇不友好，LinYi 应参考 InkOS 的 `RuntimeStateDelta` 增量模型而非全量 bible；NovelPilot `StoryBible.chapters` 字段会随长篇膨胀，LinYi 必须分章存储，bible 只持有章号索引与摘要；Webnovel Writer 的 `OverrideBundle`（locked / append_only / override_allowed）三段式合并语义可直接搬到 LinYi 的 `WorldStateContract`

### 2. Strand Weave 节奏

- **主参考**：Webnovel Writer
  - 文件：`docs/refs/webnovel-writer/references/shared/strand-weave-pattern.md`
  - 关键设计：Quest / Fire / Constellation 三线交织（55-65% / 20-30% / 10-20%）+ 硬规则（Quest 不连续超过 5 章；Fire 不超过 10 章不出现；Constellation 不超过 15 章不出现）+ `state.json::strand_tracker` 持久化结构（`last_quest_chapter` / `last_fire_chapter` / `last_constellation_chapter` / `current_dominant` / `chapters_since_switch` / `history`）+ 前 30 章现成织网模板
- **辅助参考**：ainovel-cli
  - 文件：`internal/flow/router.go:38-81`（纯函数 `Route(s State) *Instruction` + `State` 结构 + 11 条优先级互斥决策表）
  - 文件：`internal/agents/ctxpack/strategy.go`（按 store 重建上下文 + 按策略压缩 + 可恢复）
- **LinYi 落地**：`src/novelist_brain/planner.py::Planner`（Task 2.2）+ `src/novelist_brain/models.py` 中的 strand_tracker 字段
  - SubTask 2.2.3：实现四线编织（Quest 50-70% / Fire 10-30% / Constellation 10-30% / Rest 0-20%）占比计算与阈值检查
- **改造要点**：Webnovel Writer 的 5/10/15 阈值是全题材通用硬编码值；LinYi 应让 `PacingRuleEngine` 在每章 brief 时读取当前题材的 `pacing_config`（参见 `genre-profiles.md` 的 `strand_quest_max` / `strand_fire_gap_max` / `transition_max_consecutive`），动态决定阈值；Webnovel Writer `strand-weave-pattern.md` 没读取 `genre-profiles.md` 的题材级配置是已知缺陷，LinYi 必须修正；ainovel-cli 的纯函数 FSM `Route` 契约（State 字段全部显式声明，禁止 Route 内读 Store）可作 `PacingRuleEngine` 实现思路，便于单测与回放

### 3. ContinuityAuditor 六维

- **主参考**：InkOS
  - 文件：`docs/refs/inkos/packages/core/src/agents/continuity.ts`（`DIMENSION_LABELS` 37 维正交审计）
  - 关键设计：37 维拆解（人物 / 时间线 / 地理 / 道具 / 伏笔 / 动机 / 能力 / 关系 / 世界观规则 / 情感弧 / motifs / 叙事视角 / 语气基调等），每维有标签、有 fanfic 模式定制化注释，使连续性问题可定位、可统计、可回归
- **辅助参考**：ainovel-cli / NovelPilot
  - ainovel-cli：`internal/eval/grade.go::Grade`（diag Findings 三层映射 hard_fail/warning/note + `StyleDelta` 回归检测本期 vs 上期偏移）+ `internal/domain/review.go::ReviewEntry + DimensionScore + ConsistencyIssue`
  - NovelPilot：`lib/types.ts::ContinuityIssue`（`category` / `severity` / `issue` / `evidence` / `suggestedFix` 五字段，category 枚举 `character|timeline|foreshadowing|worldbuilding|motif`，severity 枚举 `low|medium|high`）+ `prompts.ts:96-102`
- **LinYi 落地**：`src/novelist_brain/continuity_auditor.py::ContinuityAuditor`（Task 4.1）+ `src/novelist_brain/models.py::StoryBible.continuity_rules` 字段（Task 1.1.1）
  - SubTask 4.5.1：六维审计 + issue 输出格式
- **改造要点**：InkOS 37 维对 LinYi 初期过重，先裁剪到 10-15 个核心维度（人物一致性 / 时间线 / 伏笔回收 / 动机 / 世界观规则 / 情感弧 / 视角 / 语气基调 / 道具 / 地理），后续按需扩展；`DIMENSION_LABELS` 的字典结构便于增量添加；NovelPilot `ContinuityIssue` 的 `category` + `severity` + `evidence` + `suggestedFix` 五字段是连续性问题的最小完备结构，LinYi 应直接照搬，配合 InkOS 维度枚举扩展为 LinYi 六维；ainovel-cli 的 `StyleDelta` 回归检测可发现"改一处坏全书"，应原样移植；InkOS 维度虽正交但实际有耦合（人物动机变化影响情感弧），LinYi 需考虑引入"跨维度关联告警"

### 4. 去 AI 味规则

- **主参考**：ainovel-cli
  - 文件：`docs/refs/ainovel-cli/internal/stylestat/stylestat.go:73-100`（`patternDefs` 8 类 AI tic 正则：矫正句『不是…而是…』/ 计时量词『X息/X瞬』/ 明喻『像一/仿佛/如同』/ 沉默节拍 / 神态模板 / 躯体反应 / 思维标记 / 抽象套话）
  - 文件：`internal/rules/checker.go:17-90`（`Check` 三类机械检查：`forbidden_chars` / `forbidden_phrases` / `fatigue_words`，`Violation` 结构 `Rule/Target/Actual/Severity`）
  - 文件：`assets/references/anti-ai-tone.md`（5 大类：结构 / 用词 / 描写 / 对话 / 节奏情感）
  - 文件：`assets/prompts/editor.md`（7 维 LLM 评审，aesthetic 含 4 子项 AI 味 / 叙事手法 / 情感打动力 / 全书固化）
- **辅助参考**：Webnovel Writer
  - 文件：`docs/refs/webnovel-writer/skills/webnovel-write/references/anti-ai-guide.md`（8 大倾向：每段写完整闭环 / 用副词修饰一切 / 全员同一反应 / 对话像辩论赛 / 情绪贴标签 / 信息均匀分布 / 安全着陆 / 展示后解释；5 个即时检查；10 条 AI 癖好 → 替代方向 → 示例速查表）
  - 文件：`skills/webnovel-write/references/style-adapter.md`（分题材风格加权：玄幻/修仙动作比重更高；都市信息节奏更快；言情情绪弧线前置；悬疑线索投放要可回收）
- **LinYi 落地**：`src/novelist_brain/quality_engine.py::QualityEngine`（Task 4.2）+ `src/novelist_brain/prompts.py`（去 AI 味提示词）
  - SubTask 4.5.2：自动修正 + 人工标记 + 评分
- **改造要点**：ainovel-cli "统计归代码、裁定归 LLM" 双轨策略必须直接采纳——`stylestat` 全书级统计只产出 Stats，不许直接驱动重写决策；`patternDefs` 正则针对中文网文 AI 味，传统文学修辞里"明喻"是合法手法，必须按本书纵向基线对比才安全；Webnovel Writer 的 8 大倾向 + 替代速查表可整体迁移到 LinYi 去 AI 味规则库；`fatigue_words` 注释明说"不跨章累计"，LinYi 必须配合 `stylestat.RepeatedSentences` 跨章检测补齐；机械规则兜底确定性禁忌 + LLM 评审负责审美与一致性的分层应原样移植

### 5. 滚动规划

- **主参考**：ainovel-cli
  - 文件：`docs/refs/ainovel-cli/README.md` 长期规划章节 + `internal/flow/router.go:38-81`（纯函数 FSM，11 条优先级决策）
  - 文件：`internal/agents/ctxpack/strategy.go` + `builder.go` + `restore.go`（`buildWriterStoreSummaryText` 从 store 重建上下文：progress / chapterPlan / outline / snapshots / foreshadow / pendingReviews / styleRules；`WriterRestorePack` 压缩恢复包）
  - 文件：`assets/prompts/architect-long.md` + `architect-short.md`（双规划师 + 远期指南针 + 近期视野双窗口）
- **辅助参考**：AI Novel Factory
  - 文件：`packages/ai-novel-core/src/orchestrator.ts:146-176 buildChapterCausalPlan`（5 段因果：`previousInput` / `sceneObjective` / `protagonistDecision` / `irreversibleConsequence` / `nextHandoff` + `characterStateDelta` + `foreshadowingOperation` + `requiredContinuityAnchors`；弧线切分 `arcSize = max(3, ceil(totalChapters/4))`；首章 vs 后续章分支）
  - 文件：`orchestrator.ts:188-201 buildChapterTasks`
- **LinYi 落地**：`src/novelist_brain/planner.py::Planner`（Task 2.2，远期指南针 + 近期视野双窗口）+ `src/novelist_brain/chapter_manager.py::ChapterManager`（Task 2.1，"卷 → 章 → 段"三级数据结构与持久化）
- **改造要点**：ainovel-cli 的 `architect_long` 与 `architect_short` 双规划师 + 弧/卷分层是为分层书量身设计，LinYi 若不分层需简化为单规划师 + 远/近视野双窗口，但"远期指南针 + 近期视野"的双窗口思想应保留；ainovel-cli 的纯函数 `Route` 契约（State 字段全部显式声明，禁止 Route 内读 Store）应直接照搬，把"调度"从 LLM 手里收回改由确定性事实查表，可单测、可回放、可解释；AI Novel Factory 的 5 段因果 + 弧线切分可作 LinYi `ChapterBrief` schema 字段直接采用；`arcSize` / `chapterNumber % 3` 等经验值应提取为 `book.yaml` 可配置项，不要硬编码

### 6. 雪花写作法提示词

- **主参考**：AI_NovelGenerator_YILING
  - 文件：`docs/refs/AI_NovelGenerator_YILING/prompt_definitions.py:160-264`（4 个雪花提示词：`core_seed_prompt` 单句公式"当[主角]遭遇[核心事件]..." / `character_dynamics_prompt` 含表面/深层/灵魂需求三角与角色弧线 5 阶段 / `world_building_prompt` 物理/社会/隐喻三维交织 / `plot_architecture_prompt` 触发/对抗/解决三幕 + 每幕 3 个转折点 + 伏笔回收方案）
  - 文件：`novel_generator/architecture.py:49-202`（雪花 4 步流水线）+ `architecture.py:22-47, 90-105`（`partial_architecture.json` 断点恢复：阶段性 JSON 持久化 + 失败时跳过已完成步骤）
  - 文件：`prompt_definitions.py:266-309`（章纲 6 字段元数据：`chapter_role` / `chapter_purpose` / `suspense_level` / `foreshadowing` / `plot_twist_level` / `chapter_summary`）
- **辅助参考**：NovelPilot
  - 文件：`lib/agents.ts`（Premise Architect → Character Director → World Builder → Plot Strategist 阶段对应雪花前 4 步）
  - 文件：`lib/prompts.ts:50-107`（`SCHEMAS` 字典驱动 + `COMPACT_JSON_RULES` "valid JSON only, no markdown, no explanations"）
- **LinYi 落地**：`src/novelist_brain/prompts.py`（Task 2.4 雪花 4 步提示词组 + 章纲元数据格式）+ `src/novelist_brain/planner.py::Planner`（作为 PlanCompass 目标产物）
- **改造要点**：YILING 部分提示词偏向通俗网文（"认知过山车" / "灵魂黑夜"），与林逸"严肃文学"自我叙事存在张力（与 §14.3.7 警告一致），需在 `IdentityCore` 中保留自由发挥空间，提示词做混合使用而非全盘照搬；雪花法结构化程度高（4 步 + 6 字段 + 5 维树 + 4 类场景），过度依赖会让小说过于工整；`partial_architecture.json` 断点恢复模式可被 LinYi 任何多步生成流程借鉴；YILING `consistency_checker.py` 仅 71 行单维 LLM 审校，需扩展为 LinYi 六维；NovelPilot 的 schema 驱动 + `COMPACT_JSON_RULES` 强约束可借鉴以降低 JSON 解析失败率；YILING 状态全部存为散 txt 文件（`Novel_architecture.txt` / `character_state.txt` / `global_summary.txt`），LinYi 必须收敛为单一真源

### 7. 显式叙事结构

- **主参考**：NovelDreamer
  - 文件：`docs/refs/NovelDreamer/story_generator.py:22-191`（`story_structure_chooser` 提示词手册，内嵌 7 种结构的 Sections + When to Use）
  - 关键设计：7 种结构供 LLM 选择——Classic / Freytag's Pyramid / Hero's Journey / Three Act Structure / Dan Harmon's Story Circle / Fichtean Curve / Save the Cat Beat Sheet / Seven-Point Story Structure；要求 LLM "reference similar popular works and how they aided your decision"
  - 文件：`story_generator.py:199-290 blueprint_prompt`（按 Synopsis → Theme → Setting → World-Building → Characters → Timeline → Title → Chapter Breakdown → Writing Advice 顺序展开）
  - 文件：`story_generator.py:328-381, 492-506`（每章三幕 `act_generator_prompt` + `Acts` Pydantic model + `JsonOutputParser` 结构化输出）
- **辅助参考**：AI_NovelGenerator_YILING
  - 文件：`prompt_definitions.py:236-309`（三幕式情节 + 章节悬念密度 / 伏笔 / 认知颠覆 6 字段元数据）
- **LinYi 落地**：`src/novelist_brain/prompts.py`（Task 2.4 结构选择器常量：`STRUCTURES = {name: {sections: [...], when_to_use: "..."}}`）+ `src/novelist_brain/planner.py::Planner`（节拍曲线选择）
- **改造要点**：NovelDreamer 结构选择器是显式 LLM 调用（`story_generator.py:514-517 get_story_structure`），每次调用增加 token 成本，LinYi 应仅在小说初始化时调用一次并把结果缓存在 `StoryBible` 中，避免每次生成章节都重选；NovelDreamer 整体面向英文长篇，提示词、handbook、`popular_works_prompt` 示例全部是英文，需完整本地化；NovelDreamer 812 行单文件 prompt + 函数 + UI 全部混杂，借鉴前必须先做拆分；NovelDreamer 章节循环无断点恢复，LinYi 必须改为持久化每章状态（参考 YILING 的 `partial_architecture.json` 模式）；NovelDreamer Act 级粒度与 LinYi 章级粒度不匹配，LinYi 应把 Act 粒度映射为 Strand 节拍，而非直接复用为 Act 1/2/3；`summarize_story_structure` 二次调用冗余，LinYi 可让第一次调用直接返回结构化 JSON 省去第二次

### 8. 单一真源（SQLite/JSON）

- **主参考**：AI Novel Factory
  - 文件：`docs/refs/ai-novel-factory/docs/PRODUCTION_ARCHITECTURE.md` §Source Of Truth + §No More Split State（"唯一真源是 `.ai-novel-factory/factory.sqlite`，项目工作区下的 markdown/JSON 都是 artifacts/cache"）
  - 文件：`packages/ai-novel-core/src/factory-db.ts:33-47`（13+ 张核心表：`projects` / `workflow_runs` / `workflow_steps` / `agent_turns` / `messages` / `message_parts` / `artifacts` / `memory_items` / `graph_nodes` / `graph_edges` / `checkpoints` / `events` / `jobs`）
  - 文件：`factory-db.ts:157 FactoryOperationalStatus`（`getOperationalStatus()` 作为 readiness probe 共享视图）
  - 文件：`factory-db.ts:216 stateChangeFingerprint` + `:202 stableJsonString`（按 key 排序生成稳定 JSON 指纹，避免 `lastUpdatedAt` 噪声触发 drift 误报）+ `:237-261 compactJsonString`（大 JSON 截断到 900-1600 字符避免 snapshot 爆炸）
- **辅助参考**：Webnovel Writer
  - 文件：`docs/refs/webnovel-writer/.story-system/` 多 JSON 真源（`MASTER_SETTING.json` / `anti_patterns.json` / `chapters/chapter_XXX.json` / `volumes/volume_XXX.json` / `reviews/chapter_XXX.review.json` / `commits/chapter_XXX.commit.json` / `events/chapter_XXX.events.json`）+ `.webnovel/` 派生只读视图分层
  - 文件：`scripts/data_modules/sql_state_manager.py`（state.json 大数据迁 SQLite）
  - 文件：`.webnovel/projection_log.jsonl`（投影执行状态 done/skipped/failed，可观测派生层设计）
- **LinYi 落地**：`src/novelist_brain/persistence.py`（Task 1.7 原子写入：`.tmp` + 原子 rename；启动校验 `.latest` 指向）+ `story_bible/{novel_id}.json`（Task 1.8.5）+ `chapters/{novel_id}/{volume_id}/{chapter_id}/`（SubTask 2.1.1）+ `oc_registry/{novel_id}.json`（SubTask 1.3.6）
- **改造要点**：AI Novel Factory 的核心约束"所有重要状态必须落 DB + 暴露给 API snapshot"应采纳；但 `factory-db.ts` 单文件 1500+ 行承担 schema + CRUD + 事件 + snapshot + 检索 + memory + embedding + cosine similarity 全部职责，LinYi 必须按职责拆分（schema / repository / event-store / snapshot / retriever）；17 类事件枚举（`PROJECT_CREATED` / `WORKFLOW_RUN_STARTED` / `DRIFT_DETECTED` / `JOB_RESTORE_READY` 等）可整体迁移，并在末尾追加 `CHAPTER_COMMIT_ACCEPTED` 等小说专属事件；本地 SQLite vs 生产 Postgres 迁移成本——`INTEGER PRIMARY KEY` 自增在 Postgres 改 `SERIAL`、`JSON` 改 `JSONB`；Webnovel Writer 多 JSON vs 单 SQLite 权衡——LinYi 初期用 JSON 文件 + 索引（开发友好），后期可升级 SQLite；多 JSON 跨章查询需 join，单 SQLite 事务一致性更好；Webnovel Writer 的 `projection_log.jsonl` 可观测派生层设计应直接借鉴

### 9. 多 Agent 流水线

- **主参考**：NovelPilot
  - 文件：`docs/refs/novelpilot/lib/agents.ts`（9-Agent 固定顺序流水线：Premise Architect → Character Director → World Builder → Plot Strategist → Chapter Architect → Prose Writer → Style Editor → Continuity Detective → Publisher Agent；`AGENT_DEFINITIONS` + `mergeAgentOutput` + `resetFromAgent` 按 index 回滚）
  - 文件：`lib/agent-retry.ts:28-80`（`NON_RETRYABLE_PATTERNS` 与 `RETRYABLE_PATTERNS` 双列表 + 默认 retryable + `DEFAULT_AGENT_RETRY_POLICY` maxRetries=2 / retryDelayMs=1200 + `getRetryPolicyForAgent` 按 agent 定制）
  - 文件：`lib/agent-fallbacks.ts:259-285 buildFallbackAgentOutput`（9 个 agent 每个都有降级输出 + 中英日三语 + `AGENT_FALLBACK_RECOVERY_MESSAGE` 透明告知降级）
  - 文件：`lib/prompts.ts:50-107`（`SCHEMAS` 字典 + `COMPACT_JSON_RULES`）
- **辅助参考**：InkOS
  - 文件：`packages/core/src/agents/composer.ts::composeGovernedChapter`（按 plan 选 context、按 budget 压缩、写 runtime artifacts 三段式章级编排器）
- **LinYi 落地**：`src/novelist_brain/creation_executive.py::CreationExecutive`（Task 2.3）+ `src/novelist_brain/module_registry.py::register_agent`（Task 1.6.2 解锁新模块注册无需改 main.py）
  - SubTask 2.3.1：接收 `ChapterIntent + NarrativeLine + skill_checks + world_state`
  - SubTask 2.3.2：按 `scene_type`（dialogue/action/psychological/environment/transition）分支生成
- **改造要点**：NovelPilot 9-Agent 严格顺序流水线是短篇取向（drafting agent 一次写完所有章节），LinYi 长篇必须改为"初始化 9 步 + 每章循环"模式，否则延迟不可接受；"concept → character → world → plot → outline → drafting → editor → continuity"的阶段划分可借鉴为"全书初始化阶段"子步骤；NovelPilot `resetFromAgent` 按 agent index 回滚是粗粒度（回滚 drafting 会丢已写章节），LinYi 应设计更细粒度（按 chapter + agent 双维度）；NovelPilot retry 错误模式分类（`NON_RETRYABLE_PATTERNS` 直接放弃 / `RETRYABLE_PATTERNS` 才重试 / 默认 retryable）应直接挪用，避免对"insufficient credits"这类不可恢复错误浪费重试配额；fallback 全覆盖 + `AGENT_FALLBACK_RECOVERY_MESSAGE` 透明告知降级原则应采纳；NovelPilot fallback 是通用占位与用户题材无关，LinYi 应从已完成早期 agent 输出提取题材信息使降级内容更贴近用户意图；NovelPilot `StoryBible.chapters` 字段膨胀风险——LinYi 必须分章存储，bible 只持有章号索引与摘要；InkOS `composeGovernedChapter` 三段式（plan + budget + artifacts）可借鉴为章级编排器范本

### 10. 文风指纹

- **主参考**：ainovel-cli
  - 文件：`docs/refs/ainovel-cli/internal/stylestat/stylestat.go:29-37`（`Stats` 结构：`Patterns` / `TopPhrases` / `RepeatedSentences` / `Ending` / `OpeningTimeRate` / `TitleFormats` 覆盖句式 tic / 复读 / 章末同构 / 开篇时间词 / 标题格式混用等"全书纵向基线"维度）
  - 文件：`stylestat.go:60-63`（`EndingStat.ShortRatio` + `MedianRunes`：捕捉"短结尾本身合法、全书同构才是问题"这一洞察，是单章评审天然失明的强补充）
  - 文件：`stylestat.go:73-100`（`patternDefs` 8 类 AI tic 正则）+ `stylestat.go:18`（`phraseWindow=20` 最近 20 章窗口挖掘 3-6 字高频短语）+ `stylestat.go:15`（`minChapters=5` 章数不足直接返回 nil 避免小样本噪声）
  - 文件：`internal/eval/grade.go::StyleDelta`（本期 vs 上期 style_stats 偏移超阈值告警，可发现"改一处坏全书"的回归）
- **辅助参考**：InkOS
  - 文件：`packages/core/src/agents/style-analyzer.ts::analyzeStyle`（句长 / TTR / topPatterns 统计）
  - 文件：`packages/core/src/agents/ai-tells.ts:48-120`（4 维纯规则：dim 20 段落等长 CV<0.15 / dim 21 套话密度>3 次/千字 / dim 22 公式化转折≥3 次 / dim 23 列表式结构；`HEDGE_WORDS` / `TRANSITION_WORDS` 中英文双语言字典 `ai-tells.ts:24-32`）
- **LinYi 落地**：`src/novelist_brain/quality_engine.py::QualityEngine`（Task 4.2，统计归代码 + 裁定归 LLM 双轨）+ `src/novelist_brain/models.py::StoryBible.style_fingerprint` 字段（Task 1.1.1）
- **改造要点**：ainovel-cli `stylestat` 全书级基线对比思路应直接挪用，只需把 `patternDefs` 正则按目标语言调整（现有正则针对中文网文 AI 味）；`EndingStat.ShortRatio` + `MedianRunes` 必须保留——单章评审天然失明，全书纵向基线对比才能发现问题；`StyleDelta` 回归检测应原样移植；`stylestat` 不允许直接驱动重写决策，必须坚持"统计归代码、裁定归 LLM"；InkOS `ai-tells` 四维纯规则检测零 LLM 成本、可单测、可回归，应直接挪用——`CV<0.15` / `密度>3‰` / `转折≥3 次` / `列表式结构` 四阈值是经验值但可调；中英文双语言字典（`HEDGE_WORDS` / `TRANSITION_WORDS`）设计让 LinYi 多语言支持低成本；`patternDefs` 正则的假阳性——8 类 AI tic 正则不做语法分析，在传统文学修辞里"明喻"是合法手法，按本书纵向基线对比才安全，若直接当硬规则阻断会误伤

### 11. 题材模板

- **主参考**：Webnovel Writer
  - 文件：`docs/refs/webnovel-writer/templates/genres/*.md`（37 个中文网文题材模板：修仙 / 规则怪谈 / 克苏鲁 / 都市 / 言情等，结构统一：核心卖点 / 流派细分 / 世界观 / 机缘获取 / 战力体系 / 大纲结构 / 实体标签；每个模板自带实体 XML schema 可直接喂给 Data Agent）
  - 文件：`references/genre-profiles.md`（每个题材 `hook_config` / `coolpoint_config` / `micropayoff_config` / `pacing_config` / `override_config` 五组配置，如爽文 `combo_interval=5, milestone_interval=10`）
  - 文件：`references/csv/题材与调性推理.csv`（列设计：关键词 / 意图与同义词 / 题材别名 / 推荐基础检索表 / 推荐动态检索表 / 核心调性 / 节奏策略 / 毒点）
  - 文件：`scripts/data_modules/story_system_engine.py:164 _route`（题材路由算法：关键词命中 → 显式题材 fallback → 文本推断 fallback → 报错）+ `story_system_engine.py:395 _load_reasoning` + `_apply_reasoning` + `_rank_anti_patterns`（三层裁决：题材路由 → 检索召回 → 冲突裁决优先级排序）
- **辅助参考**：AI_NovelGenerator_YILING
  - 文件：`prompt_definitions.py:161-177`（`genre` 字段贯穿全流程，无独立模板库）
  - 文件：`config_manager.py:16-22, 112-118`（5 种任务角色独立配置模型：`architecture_llm` / `chapter_outline_llm` / `prompt_draft_llm` / `final_chapter_llm` / `consistency_review_llm`）
- **LinYi 落地**：`src/novelist_brain/coc_mapping_engine.py::COCMappingEngine`（Task 3.1 题材驱动 Rulebook 定制：克苏鲁 → 神话知识 + sanity；都市 → 社交博弈）+ `src/novelist_brain/prompts.py`（题材模板库）
  - SubTask 3.1.2：实现题材驱动 Rulebook 定制
  - SubTask 3.1.3：实现 Campaign Arc Template（引入 → 上升 → 转折 → 高潮 → 余韵）
- **改造要点**：Webnovel Writer 37 题材模板由社区贡献，质量参差，`多子多福.md` `知乎短篇.md` 等小众题材可能字段缺失或与主结构不一致，LinYi 引入前需逐文件 review + 补全；题材模板需结合林逸人物画像做轻量化定制（参见 §14.3.4 改造要点）；CSV 知识表迁移到 LinYi SQLite 时必须显式定义外键（`裁决规则.csv` 引用 `题材与调性推理.csv` 的题材别名，改一张要同步多张）；Webnovel Writer `story_system_engine.py`（601 行）+ `chapter_commit_schema.py`（278 行）等核心模块加起来 3000+ 行 Python 全部 TS/Python 重写需要 2-3 周人力；题材路由算法（关键词命中 → 显式题材 fallback → 文本推断 fallback → 报错）可整体改写为 LinYi `GenreRouter`；YILING 多 LLM 任务路由 config 模式（5 种任务独立指定模型）可直接映射 LinYi `LLMService` 多模型路由表

### 12. Foreshadowing Tracker

- **主参考**：NovelPilot
  - 文件：`docs/refs/novelpilot/lib/types.ts::ForeshadowingItem`（字段：`item` / `introducedIn` / `status` / `suggestedPayoff` / `payoffChapter` / `emotionalPurpose`；`status` 枚举 `planned|unresolved|paid-off` 贯穿 plot → chapter-outline → continuity 三个 agent）
  - 文件：`lib/prompts.ts:38-48 CHAPTER_OUTLINE_SCHEMA`（直接嵌入 `foreshadowingTracker` 字段，使章节规划阶段就强制声明本章埋/收哪些伏笔）
  - 文件：`lib/types.ts::ContinuityIssue`（除 issues 外还输出 `unresolvedForeshadowing` / `repeatedMotifs` / `missingPayoffs` / `overallDiagnosis`）
- **辅助参考**：Webnovel Writer
  - 文件：`skills/webnovel-query/references/advanced/foreshadowing.md`（核心 / 支线 / 装饰三层级 + 回收周期 + 权重 + 紧急度公式 `紧急度 = (已过章节 / 目标章节) × 层级权重` + 🔴 / 🟡 / 🟢 状态判定 + "同时进行不超过 5 条"约束）
  - 文件：`scripts/data_modules/index_manager.py`（`chase_debt` + `debt_events` + `chapter_reading_power` 三张 SQLite 表实现"债务产生 / 偿还 / 利息"滚动账本；`override_contracts` 表记录违背软建议时的 Override 决策带理由）
- **LinYi 落地**：`src/novelist_brain/models.py::StoryBible.foreshadowing_ledger` 字段（Task 1.1.1）+ `src/novelist_brain/planner.py::ForeshadowingOp`（Task 2.2.4 引入 / 回收 / 强化操作生成）
- **改造要点**：NovelPilot `ForeshadowingItem.emotionalPurpose` 字段是关键创新——把"情感承诺"显式化，使审计能判断"回收是否兑现情感意图"而非仅"是否提到"，LinYi 应直接采纳这个字段；NovelPilot `introducedIn` / `payoffChapter` 用 `Ch.1` / `Ch.3` 字符串格式，简单可读，但 LinYi 若需排序 / 查询应改为数字章号；NovelPilot `ContinuityIssue` 的 `unresolvedForeshadowing` / `missingPayoffs` 字段是"审计报告"而非"问题列表"的设计应保留；Webnovel Writer 的核心 / 支线 / 装饰三层级 + 紧急度公式 + 🔴🟡🟢 状态 + "同时不超过 5 条"约束是 LinYi Foreshadowing Tracker 的最小可用模型；Webnovel Writer 的 `chase_debt` 滚动账本设计（债务产生 / 偿还 / 利息）可借鉴为伏笔"读者遗忘曲线"模型；AI Novel Factory 的 `foreshadowingOperation` 按 `chapterNumber % 3 === 0` 切换伏笔操作是经验值，应提取为 `book.yaml` 可配置项

### 13. Director/Worker 协作

- **主参考**：AI Novel Factory
  - 文件：`docs/refs/ai-novel-factory/packages/ai-novel-core/src/novel-director.ts:1-199`（`NovelDirectorCommand` 联合类型 4 类：advance / discuss / retry_chapter / interrupt + `id` / `stage` / `reason` 公共字段；`decideNovelDirectorCommand` 函数只决定"下一步做什么 + 为什么"不执行；4 个工厂方法 `createFollowUpAdvanceCommand` / `createManualAdvanceCommand` / `createManualRetryChapterCommand` / `createManualInterruptCommand`）
  - 文件：`packages/ai-novel-core/src/worker.ts:66-88 startNovelAutopilotWorker`（worker 启动 + status + once 模式，只负责 claim job / heartbeat lease / retry transient failure / resume after restart，不持有工作流策略）
  - 文件：`packages/ai-novel-core/src/autopilot-worker.ts:68-82`（4 档 backoff 常量：`AUTOPILOT_LEASE_SECONDS=60` / `AUTOPILOT_HEARTBEAT_MS` / `AUTOPILOT_PROVIDER_RETRY_BASE_MS=10000` / `AUTOPILOT_RATE_LIMIT_RETRY_MAX_MS=120000` + `AUTOPILOT_NETWORK_RETRY_BASE_MS=5000` + `AUTOPILOT_STALE_LLM_REQUEST_MS=max(180000, LLM_TIMEOUT_MS+60000)` + `restoreAutopilotJobs` + `runNovelAutopilotWorkerOnce` 一次性扫描恢复）
  - 文件：`docs/PRODUCTION_ARCHITECTURE.md` §Director Model（权威规则：UI 不能推进工作流状态；API handler 不能发明工作流进度，只能创建命令/job；Agent 可以 propose/draft/review/critique 但不能直接改 stage 或 chapter status；Orchestrator + writing pipeline 只在执行 Director command 时才能 mutate state；每个 Director 决策必须通过 `DIRECTOR_COMMAND_DECIDED` 事件审计）
  - 文件：`novel-director.ts:71 buildDirectorDiscussionMessage`（按 stage 给出阶段感知提示词，如 `setting_review` 阶段"请审阅已冻结设定，指出设定漏洞、角色动机风险和进入主线规划前必须锁定的内容"）
- **辅助参考**：—（§14.4 明确无辅助参考）
- **LinYi 落地**：`src/novelist_brain/creation_executive.py::CreationExecutive`（Director 角色，Task 2.3）+ `src/novelist_brain/scheduler.py`（Worker 调度）+ `src/novelist_brain/circuit_breaker.py`（lease / heartbeat / backoff）
- **改造要点**：AI Novel Factory 核心约束"决定下一步"和"执行下一步"分离应直接采纳——LinYi `CreationExecutive` 只决定"下一步做什么 + 为什么"不执行，类似 `NovelDirectorCommand` 的 4 类命令（advance / discuss / retry_chapter / interrupt）接口设计可搬到 LinYi `Director` 类；4 档 backoff 常量是经过线上实践调过的，可直接复用；UI / API / Agent 不能 mutate state 的权威规则 LinYi 应严格遵守——所有状态变更必须流经 `CreationExecutive` 层；lease / heartbeat 机制是 LinYi 多 Agent 流水线最缺的"机器死亡后状态自愈"能力，`restoreAutopilotJobs` + `runNovelAutopilotWorkerOnce` 一次性扫描恢复是现成模板；每个 Director 决策必须通过 `DIRECTOR_COMMAND_DECIDED` 事件审计应采纳——LinYi 事件日志记录每次决策的 `id` / `stage` / `reason`；ai-novel-factory 8 阶段状态机（`worldbuilding_dialogue` → `setting_review` → `master_planning` → `chapter_task_generation` → `drafting` → `reviewing` → `replanning` → `complete`）适合通用小说，LinYi 是滚动规划的长篇网文，`master_planning` 不应是一次性的，应改为可重入的"卷规划"阶段，与 `chapter_task_generation` 形成"卷 → 章"两级滚动；`buildDirectorDiscussionMessage` 按 stage 给出阶段感知提示词的思路值得借鉴

### 14. 风格迁移（外部语料）

- **主参考**：NovelDreamer
  - 文件：`docs/refs/NovelDreamer/story_generator.py:465-481 popular_works_prompt`（用 LLM 从结构选择器输出中抽取"similar popular works"列表，Pydantic `PopularWorks` 结构化）
  - 文件：`story_generator.py:577-599 get_quotes_for_work`（对每个作品调用 `wikiquote.search()` + `wikiquote.quotes(max_quotes=10)` 拉取语录；含 `try/except Exception` 容错返回 None）
  - 文件：`story_generator.py:647-650 format_quotes`（拼成 `famous_work_reference` 注入 `write_act_prompt` 作为风格参考）
  - 关键设计：流程为 `story_structure_chooser` → `popular_works_prompt` 抽取相似作品 → `get_quotes_for_work` 拉语录 → `format_quotes` 拼装 → 注入 `write_act_prompt` 作为风格参考
- **辅助参考**：—（§14.4 明确无辅助参考）
- **LinYi 落地**：`src/novelist_brain/prompts.py`（风格迁移提示词：保留 `get_quotes_for_work(name)` 接口签名）+ `src/novelist_brain/memory.py`（外部语料检索召回扩展，对应 spec.md `memory.py` 检索与召回扩展）
- **改造要点**：NovelDreamer 用 Wikiquote 仅覆盖英文经典作品，对中文长篇作用有限，LinYi 应替换为中文诗词库 / 网文风格样本库 / 林逸已读作品的片段库；底层 `get_quotes_for_work(name)` 接口签名可保留，但 retrieval 后端要换；NovelDreamer 整体面向英文长篇，提示词、handbook、`popular_works_prompt` 示例全部是英文，需完整本地化；风格迁移应仅在小说初始化时调用一次并缓存到 `StoryBible.style_fingerprint`，避免每章重复调用增加 token 成本（与 §14.3.6 警告一致）；NovelDreamer 812 行单文件 prompt + 函数 + UI 全部混杂在 `story_generator.py`，借鉴前必须先剥离 UI 层（`USE_STREAMLIT` / `log_area` / `log_data` / `story = {}` 全局变量散落在 `:15, 634, 643, 660, 800-806`）；NovelDreamer `get_quotes_for_work` 有简单 try/except 但其他 LLM 调用基本裸跑，LinYi 必须加 retry + 超时 + 回退（参考 NovelPilot `agent-retry.ts` + `agent-fallbacks.ts`）；NovelDreamer 每章约 9 次 LLM 调用（act 生成 1 + act JSON 转换 1 + 三幕写作 3 + 章摘要 1 + 可能的 act 摘要 3），长篇生成总成本不可忽视，LinYi 应做 token 预算控制

## 覆盖度统计

- **总借鉴点**：14
- **已覆盖**：14
- **覆盖率**：100%
- **主参考分布**：
  - Webnovel Writer：3（#1 Story Bible 真源 / #2 Strand Weave 节奏 / #11 题材模板）
  - ainovel-cli：3（#4 去 AI 味规则 / #5 滚动规划 / #10 文风指纹）
  - AI Novel Factory：2（#8 单一真源 / #13 Director/Worker 协作）
  - NovelPilot：2（#9 多 Agent 流水线 / #12 Foreshadowing Tracker）
  - NovelDreamer：2（#7 显式叙事结构 / #14 风格迁移）
  - InkOS：1（#3 ContinuityAuditor 六维）
  - AI_NovelGenerator_YILING：1（#6 雪花写作法提示词）
- **辅助参考分布**：
  - NovelPilot：3 次（#1 / #6 / #9 中作为辅助或主参考被对照）
  - Webnovel Writer：4 次（#4 / #8 / #11 / #12 中作为辅助或主参考被对照）
  - AI Novel Factory：3 次（#1 / #5 / #9 中作为辅助或主参考被对照）
  - ainovel-cli：2 次（#2 / #3）
  - InkOS：2 次（#9 / #10）
  - AI_NovelGenerator_YILING：2 次（#7 / #11）
- **无辅助参考的借鉴点**：2（#13 Director/Worker 协作 / #14 风格迁移——与 §14.4 矩阵一致）
- **来源溯源**：所有 7 个参考项目源码已克隆至 `/workspace/docs/refs/<project>/`，拉取时间 2026-07-21，详见 §14.5。
