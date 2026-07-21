# 参考项目架构对照表

> 团队合稿。覆盖 7 个参考项目在 7 个架构维度上的异同，用于指导 LinYi 重构方案 §3-§7 的实现选择。
>
> 数据来源：`/workspace/docs/refs/tech_notes/` 下 7 份技术笔记的"架构对照信息"小节。
> 配套文档：`/workspace/docs/系统重构方案_v1.md` §9.0.1.2、§14.4 借鉴矩阵。

## 项目总览

| # | 项目 | 主语言 | 定位 | 在本方案中的角色 |
|---|------|--------|------|------------------|
| 1 | ainovel-cli | Go | 长篇网文自动生成 | 引擎架构与审计工程化样本 |
| 2 | InkOS | TypeScript | 通用/剧本/影游创作智能体 | 状态真源与多 Agent 流水线样本 |
| 3 | NovelPilot | TypeScript/Next.js | 9 Agent 短篇流水线 | 故事圣经与连续性侦探样本 |
| 4 | Webnovel Writer | Python | Claude Code 网文插件 | 网文节奏与 Story System 真源样本 |
| 5 | AI Novel Factory | TypeScript | 生产级小说工作流 | Director/Worker 协作与 SQLite 真源样本 |
| 6 | NovelDreamer | Python | 研究型长篇故事生成 | 显式叙事结构与风格迁移样本 |
| 7 | AI_NovelGenerator_YILING | Python | 雪花写作法 GUI 工具 | 雪花写作法工程实现样本 |

## 维度 1：模块拆分方式

**ainovel-cli** 采用"三分法"模块边界——Engine（确定性调度，无 LLM）+ Workers（规划师/写作/编辑等 LLM 循环）+ Arbiter（语义裁定），三者职责互斥。源码层面按职责拆为 `internal/flow/`（FSM 路由）、`internal/eval/`（评审）、`internal/rules/`（机械检查）、`internal/agents/ctxpack/`（上下文压缩）、`internal/stylestat/`（风格统计）等多包，每个包单一职责可独立单测。

**InkOS** 采用 TypeScript monorepo 三包结构：`packages/cli`（命令入口）、`packages/core`（核心引擎）、`packages/studio`（可视化）。core 内部再按职责拆 `agents/`（composer/continuity/ai-tells/style-analyzer）、`models/`（input-governance/runtime-state/forecast schema）、`forecast/`（剧情预测）等子目录，每文件单一职责，配合 Zod schema 强契约。

**NovelPilot** 是 Next.js 全栈单体，按"Agent 流水线"维度切分：`lib/agents.ts`（9 Agent 定义与编排）、`lib/types.ts`（StoryBible 与所有数据结构）、`lib/prompts.ts`（SCHEMAS 字典）、`lib/agent-retry.ts` + `lib/agent-fallbacks.ts`（错误防线）、`lib/agent-context.ts`（上下文压缩）。模块边界与 Agent 边界对齐，简单清晰但不利于长篇循环扩展。

**Webnovel Writer** 采用三层架构：Skill（用户接口层，8 个 `/webnovel-*` 命令）+ Agent（业务执行层，4 个：context/reviewer/data/deconstruction）+ scripts（数据层，含 `data_modules/` 下的 story_system_engine/story_contracts/runtime_contract_builder/chapter_commit_schema/sql_state_manager 等）。每个 Skill 自带 `references/` 提示词库，`shared/` 是单一事实源禁止复制。

**AI Novel Factory** 拆为 core / server / worker / desktop / opencode-plugin 五包，多客户端共享同一 core。core 内部按文件单一职责拆分（factory-db / orchestrator / director / worker / writing-pipeline / chapter-consistency / messages / super-graph / knowledge / embedding / runtime-llm / abort / context-packet / discussion），但 `factory-db.ts` 单文件 1500+ 行承担 schema+CRUD+事件+snapshot+检索+memory+embedding 全部职责，是过度集中的反例。

**NovelDreamer** 几乎没有模块拆分——整个项目核心逻辑都集中在 `story_generator.py` 单文件（812 行），prompt 字符串、Pydantic model、`generate_story()` 主流程、Streamlit UI 全部混在一起。这是研究原型的典型形态，可读但不可单独复用某个模块。

**AI_NovelGenerator_YILING** 采用 lib/ui 分层：lib 层再分 `architecture` / `blueprint` / `chapter` / `finalization` / `knowledge` / `vectorstore` 子模块，适配器（`llm_adapters` / `embedding_adapters`）与配置（`config_manager`）独立顶层文件，提示词集中在 `prompt_definitions.py`（671 行）。lib/ui 严格分离使核心逻辑可被 LinYi 借鉴而不被 GUI 干扰。

**对 LinYi 的启示**：LinYi 应采纳"三分法 + 多包单一职责"的混合模式——Engine（确定性调度，参考 ainovel-cli 的纯函数 Route）、Workers（LLM 循环，参考 Webnovel Writer 的 4 Agent 流水线）、Auditor（连续性审计，参考 InkOS 的 37 维 + NovelPilot 的 ContinuityIssue）。必须避免 AI Novel Factory 的 `factory-db.ts` 单文件膨胀反例，按 schema / repository / event-store / snapshot / retriever 拆分。NovelDreamer 的单文件形态是反面教材，绝不能让 prompt 与生成逻辑混居。

## 维度 2：事件/数据流

**ainovel-cli** 的事件流是"事实驱动查表"——`LoadState` 一次性把 Store 中的所有事实（Progress/ArcBoundary/FoundationMissing/PlanningTier 等）加载到 `State` 结构，`flow.Route(s State) *Instruction` 纯函数查表得出下一步要执行的 Worker 与任务，Engine 不允许在 Route 内部读 Store。这种"零 IO、零副作用"的 Route 使调度可单测、可回放、可解释，每步落盘形成 Step 级 checkpoint。

**InkOS** 把每章治理为一组带 Zod schema 校验的工件流：`intent.md`（本章意图）→ `context.json`（上下文包）→ `rule-stack.yaml`（适用规则栈）→ `trace.json`（执行轨迹）。输入侧 `author_intent.md` + `current_focus.md` 双文件构成"作者指南针"，所有章级决策必须与之对齐（`ForecastIntentAlignment.score` 量化）。状态变更不是"重写整个 state"而是结构化 `RuntimeStateDelta`（含 hookOps 的 upsert/mention/resolve/defer 四种操作）。

**NovelPilot** 是严格的 9 Agent 顺序流水线：Premise Architect → Character Director → World Builder → Plot Strategist → Chapter Architect → Prose Writer → Style Editor → Continuity Detective → Publisher。每个 Agent 输出由 JSON schema 驱动（`SCHEMAS` 字典 + `COMPACT_JSON_RULES` 强约束"valid JSON only, no markdown"），所有输出汇聚到单一真源容器 `StoryBible`。无分支、无循环，适合短篇但不适合长篇连载。

**Webnovel Writer** 的事件流是"合同链 + 投影"：用户 → Skill → Agent → `.story-system/` 合同与提交链（master/volume/chapter/review/commit 五级 JSON）→ accepted `CHAPTER_COMMIT` → 5 路投影（state / index / summary / memory / vector）→ Dashboard 只读视图。`projection_log.jsonl` 记录每路投影的 done/skipped/failed 状态，是"可观测派生层"的范本。`/webnovel-write` 9 步流水线（preflight → runtime contract → context-agent → draft → reviewer → polish → data-agent → commit → backup）每步可断点续传。

**AI Novel Factory** 的事件流是"Director 决策驱动"：User → API → jobs/events 表 → Worker claim job（lease/heartbeat）→ Director decide（只决定"下一步做什么 + 为什么"，不执行）→ Executor 执行 → 结果回写 events/artifacts/state/graph/memory → UI 渲染 projection（SSE 推送，UI 不重建状态）。所有重要动作产出 events（17 类枚举，含 `DIRECTOR_COMMAND_DECIDED`、`DRIFT_DETECTED`、`JOB_RESTORE_READY`），是可审计事件溯源的范本。

**NovelDreamer** 的事件流纯线性无分支：用户 prompt → `get_story_structure`（选 7 种结构之一）→ `get_story_structure_summerize`（冗余二次调用）→ `get_popular_works_json` → `get_quotes_for_work`（每个作品调 Wikiquote）→ `get_story_blue_print` → 章循环（`generate_acts` → `convert_acts_to_json` → 三幕 `write_act` → `summarize`）。所有 LLM 调用串行，无并发无缓存。

**AI_NovelGenerator_YILING** 的事件流是"雪花 4 步 → 蓝图分块 → 章节生成 → 定稿"：架构雪花 4 步（每步写 `partial_architecture.json` 断点）→ 章节蓝图分块（自适应 chunk_size，检测已有最大章号续传）→ 章节生成（`build_chapter_prompt` → `summarize_recent_chapters` → `knowledge_search` → 向量检索 → `knowledge_filter` 三级过滤 → `next_chapter_draft_prompt` → `generate_chapter_draft`）→ 定稿（`finalize_chapter` 更新 `global_summary.txt` + `character_state.txt` + 向量库）→ 可选一致性审校。

**对 LinYi 的启示**：LinYi 应融合三层事件流模式——(1) 顶层采用 AI Novel Factory 的 Director 决策驱动 + 17 类事件审计，保证"机器死亡后状态自愈"；(2) 章级采用 Webnovel Writer 的合同链 + 5 路投影 + `projection_log.jsonl` 可观测，避免"哪路没同步"的黑箱；(3) 调度层采用 ainovel-cli 的纯函数 Route + LoadState 一次性加载，保证可单测可回放。必须规避 NovelDreamer 的纯线性无分支（长篇必须有循环 + 弧末后处理 + 重写队列）和 NovelPilot 的 9 Agent 顺序执行（长篇延迟不可接受）。

## 维度 3：状态管理

**ainovel-cli** 的状态全部由 `State` 结构显式声明（`router.go:38-64`），包含 Progress、ArcBoundary、FoundationMissing、PlanningTier 等字段，禁止 Route 内读 Store。Store 每步落盘形成 Step 级 checkpoint，崩溃后从最近 Step 恢复。状态边界清晰——"统计归代码、裁定归 LLM"的双轨使 stylestat 的 `Stats` 结构（Patterns/TopPhrases/RepeatedSentences/Ending/OpeningTimeRate/TitleFormats）成为全书纵向基线的纯事实载体。

**InkOS** 的状态管理是"增量 delta + 显式 schema"的范本。`RuntimeStateDelta`（`packages/core/src/models/runtime-state.ts`）包含 `currentStatePatch/hookOps/chapterSummary/subplotOps/emotionalArcOps` 五类结构化变更，而非"重写整个 state"。`HookRecord` schema 特别精细——`hookId/startChapter/status/lastAdvancedChapter/expectedPayoff/payoffTiming/dependsOn/coreHook/halfLifeChapters/promoted`，`halfLifeChapters` 量化"读者多久没看到这个 hook 推进就会忘"，`promoted` 标记核心 hook。所有持久化工件用 `version: z.literal(1)` 显式版本化以支持迁移。

**NovelPilot** 把所有状态塞进单一 `StoryBible` 对象（`lib/types.ts`），包含 concept/theme/genre/tone/characters/worldbuilding/plot/parts/chapters/styleGuide/foreshadowingTracker。简单直接但对长篇不友好——每章更新整个 bible 序列化成本高，所有章节正文都存在 `StoryBible.chapters` 长篇时膨胀到无法整体序列化。失败时 `resetFromAgent` 按 agent index 回滚后续状态，是粗粒度回滚（回滚 drafting 会丢掉已写章节）。

**Webnovel Writer** 的状态管理是真源分层 + override 三段式的最完整实现。`MASTER_SETTING.json` 是顶层真源，`anti_patterns.json` 是 append-only，每章 `chapter_XXX.commit.json` 是事实入账点；`.webnovel/state.json`、`index.db`、`summaries/`、`memory_scratchpad.json`、`projection_log.jsonl` 都是派生只读视图。`override_policy` 三段式（`locked` / `append_only` / `override_allowed`）配合 `OverrideBundle` Pydantic 校验，对应"大纲即法律 / 设定即物理 / 发明需识别"三防定律。`strand_tracker` / `chase_debt` / `chapter_reading_power` 是滚动状态。

**AI Novel Factory** 的状态管理是 SQLite 单一真源的最强实现。`factory.sqlite` 是唯一真源，13+ 张核心表（projects/workflow_runs/workflow_steps/agent_turns/messages/message_parts/artifacts/memory_items/graph_nodes/graph_edges/checkpoints/events/jobs）。8 阶段项目状态机（`worldbuilding_dialogue` → `setting_review` → `master_planning` → `chapter_task_generation` → `drafting` → `reviewing` → `replanning` → `complete`）+ Run/Step/Turn 三级状态。`stateChangeFingerprint`（`factory-db.ts:216`）用稳定 JSON 字符串计算指纹，避免 `lastUpdatedAt` 噪声触发 drift 误报。权威规则：只有 core 能持久化状态，禁止散落在 API handler / UI / agent prompt / worker loop。

**NovelDreamer** 几乎没有状态管理——全局变量 `log_data` / `log_area` / `USE_STREAMLIT` / `story = {}` dict 临时存章节文本，`chapter_summaries = []` 滚动列表作为跨章上下文。无持久化、无 checkpoint、无恢复机制，所有章节一次性跑完才退出。这是研究原型的状态管理真空地带。

**AI_NovelGenerator_YILING** 的状态管理是"散 txt 文件 + 断点恢复 + 向量库"的混合：`Novel_architecture.txt` / `Novel_directory.txt` / `global_summary.txt` / `character_state.txt` / `chapter_X.txt` / `outline_X.txt` / `plot_arcs.txt` 散落在 `filepath` 下，`partial_architecture.json` 提供阶段性断点恢复，Chroma 向量库持久化在 `vectorstore/` 目录。无内存态缓存，每次都从文件读取。散文件方案简单但跨章查询需要 join，是 LinYi 应规避的反例。

**对 LinYi 的启示**：LinYi 应采用"SQLite 单一真源 + 增量 delta + 显式版本化"的复合方案——(1) 真源落地参考 AI Novel Factory 的 SQLite 13+ 表 schema，把 Webnovel Writer 的 `.story-system/` 多 JSON 收敛为 SQLite 表（master_settings/chapter_briefs/volume_briefs/review_contracts/chapter_commits/story_events），文件 JSON 只作为导出/审计快照；(2) 状态变更参考 InkOS 的 RuntimeStateDelta 增量模型 + HookRecord 的 halfLifeChapters/promoted 字段，而非 NovelPilot 的全量 StoryBible；(3) 必须从一开始给所有持久化工件加 version 字段（InkOS 的 `z.literal(1)` 模式），否则 schema 演化迁移成本爆炸；(4) 坚决规避 YILING 的散 txt 文件与 NovelDreamer 的无持久化。

## 维度 4：提示词组织

**ainovel-cli** 的提示词组织是"机械规则 + LLM 评审分层"的范本。`assets/prompts/editor.md` 是 7 维 LLM 评审提示词（aesthetic 含 4 子项：AI 味/叙事手法/情感打动力/全书固化），`assets/references/anti-ai-tone.md` 是 5 大类去 AI 味判据（结构/用词/描写/对话/节奏情感）。`internal/stylestat/stylestat.go` 的 `patternDefs`（行 73-85）内置 8 类 AI 文风 tic 正则作为代码侧判据，与 LLM 评审正交——机械规则兜底确定性禁忌，LLM 负责语义级审美与一致性。

**InkOS** 的提示词组织核心是"双文件治理 + Zod schema 校验"。`author_intent.md`（稳定的长期意图）+ `current_focus.md`（当前活跃焦点）共同构成"作者指南针"，所有章级决策必须与之对齐。每个章级工件都有 Zod schema：`ChapterIntent` / `ContextPackage` / `RuleStack` / `ChapterTrace`，使"作者到底要什么"从模糊 prompt 提升为结构化工件。`rule-stack.yaml` 用于解决"全书规则 vs 本章特例"的冲突。

**NovelPilot** 的提示词组织是"SCHEMAS 字典 + COMPACT_JSON_RULES"强约束模式。`lib/prompts.ts` 的 `SCHEMAS` 字典为每个 Agent 定义独立 JSON schema，prompt 末尾强制"Respond with ONLY valid JSON matching this schema (no markdown fences)"。`COMPACT_JSON_RULES`（行 50-51）"Return valid JSON only. No markdown, no explanations, no comments. Use short sentences for string values."——这种强约束显著降低 JSON 解析失败率。每个 agent prompt 末尾嵌入完整 schema 字符串（`prompts.ts:223-229`），长 schema 显著增加 token 消耗。

**Webnovel Writer** 的提示词组织是"Skill 入口 + references 按需加载 + shared 单一事实源 + 题材模板"四层。`SKILL.md` 是入口；`references/` 按需加载（`context-minimal-writing-flow-plan` 主张最小化加载）；`shared/` 是单一事实源禁止复制；`templates/genres/` 37 个中文网文题材模板（修仙/规则怪谈/克苏鲁…）；`csv/` 8 张知识表（人设与关系/写作技法/命名规则/场景写法/桥段套路/爽点与节奏/金手指与设定/题材与调性推理）+ `裁决规则.csv`。提示词遵循"指令块 + 上下文 + 示例 + 错误"四段式 Markdown front matter。`story_system_engine.py:395 _load_reasoning` + `_apply_reasoning` + `_rank_anti_patterns` 实现三层裁决（题材路由 → 检索召回 → 冲突裁决优先级排序）。

**AI Novel Factory** 的提示词组织是"resources 三层 + 12 层 Context Contract"工程化样本。`packages/ai-novel-core/resources/writing/` 三层——`agents/` 6 个角色提示词（writer/editor/chapter_planner/style_controller/consistency-check + writer_enhanced）、`style/` 7 个文风文件 + `vocabulary/` 10 类词汇 JSON、`examples/` 4 个示例（含 `classical-chinese-guide.md` 古文指南）。12 层 Context Contract 固定顺序：system/developer protocol → role base prompt → role dynamic prompt → original project mission → current workflow state → Super Graph constraints → global consensus → current context packet → recent transcript → memory/RAG recalls → current user/autopilot instruction → tool and artifact results。`context-packet.ts` 把当前上下文包持久化为 `.ai-novel/context/current-context.md` 可审计可重放。

**NovelDreamer** 的提示词组织最原始——模块级字符串常量（`story_structure_chooser` / `summarize_story_structure` / `blueprint_prompt` / `chapter_json_prompt` / `act_generator_prompt` / `acts_json` / `write_act_prompt` / `write_act_extra` / `popular_works_prompt` / `summarize_story_part`），无格式化抽象，全部走 `str.format(**kwargs)`。但 `story_structure_chooser`（`story_generator.py:22-191`）内嵌 7 种结构（Classic / Freytag / Hero's Journey / Three Act / Story Circle / Fichtean Curve / Save the Cat / Seven-Point）的"Sections"与"When to Use" handbook，是该项目最可被 LinYi Planner 直接借用的资产。

**AI_NovelGenerator_YILING** 的提示词组织是"集中管理 + 中英双版本"模式。`prompt_definitions.py`（671 行）集中管理 9 类提示词常量：雪花 4 步（`core_seed` / `character_dynamics` / `world_building` / `plot_architecture`）、章纲（`chapter_blueprint` + `chunked_chapter_blueprint`）、摘要（`summarize_recent_chapters` / `summary_prompt`）、角色状态（`create_character_state` / `update_character_state`）、章节正文（`first_chapter_draft` / `next_chapter_draft`）、知识库（`knowledge_search` / `knowledge_filter`）、扩写（`enrich`）、角色导入（`Character_Import_Prompt`）。另有 `prompt_definitions_en.py` 英文版本。`knowledge_filter_prompt` 三级流程（冲突检测 → 价值评估 → 结构重组）是 ContinuityAuditor 重复检测维的现成参考。

**对 LinYi 的启示**：LinYi 应采用"分层提示词库 + 12 层 Context Contract + Zod schema 校验"的复合方案——(1) 提示词库参考 Webnovel Writer 的四层（shared 单一事实源 / references 按需加载 / 题材模板 / 知识表）+ YILING 的集中管理 9 类常量，但必须用 TypeScript 重写而非 Python；(2) 上下文组装参考 AI Novel Factory 的 12 层固定顺序，把"Super Graph constraints"换成 LinYi 的"WorldStateContract constraints"；(3) 输入治理参考 InkOS 的双文件（author_intent + current_focus）+ Zod schema 校验，把模糊 prompt 提升为结构化工件；(4) 去 AI 味参考 ainovel-cli 的"机械规则 + LLM 评审分层"双轨，正则归代码、裁定归 LLM；(5) 规避 NovelPilot 的 schema prompt 嵌入（长 schema 增加 token），改用 function calling。

## 维度 5：错误处理

**ainovel-cli** 的错误处理是"机械规则 + LLM 评审 + Grade 三层映射 + StyleDelta 回归"四层防线。`internal/rules/checker.go:17` 的 `Check` 函数对正文做三种机械检查——`forbidden_chars`（出现即 error）、`forbidden_phrases`（出现即 error）、`fatigue_words`（超阈值才 warning，不跨章累计）。`Violation` 结构（`Rule/Target/Actual/Severity`）是纯事实。`internal/eval/grade.go` 的 `Grade` 函数把 diag Findings 三层映射（hard_fail/warning/note），含 `StyleDelta` 回归检测——本期 vs 上期 style_stats 偏移超阈值则告警，可发现"改一处坏全书"的回归。

**InkOS** 的错误处理核心是"Zod schema 全量校验 + contextFingerprint 绑定"。每个工件都跑 Zod 校验，运行时契约一旦落盘，schema 变更需要迁移（用 `version: z.literal(1)` 显式版本化）。`contextFingerprint`（`forecast/schema.ts:73`）用于绑定生成时的上下文指纹——分支必须绑定生成时的上下文快照，否则事后无法判断"这个分支基于什么前提"。37 维连续性审计的 `DIMENSION_LABELS` 字典结构便于增量添加维度。

**NovelPilot** 的错误处理是"retry 分类 + fallback 全覆盖 + resetFromAgent"三层防线，是 LLM 调用健壮性的实用设计范本。`NON_RETRYABLE_PATTERNS`（401/402/403/504/unauthorized/insufficient credits/model not found）直接放弃；`RETRYABLE_PATTERNS`（timeout/invalid json/502/503/rate limit/network）才重试；`isRetryableError` 默认 true——未知错误先重试避免误伤。`DEFAULT_AGENT_RETRY_POLICY` maxRetries=2、retryDelayMs=1200。`buildFallbackAgentOutput` 为 9 个 agent 每个提供结构完整的占位内容（中英日三语），`AGENT_FALLBACK_RECOVERY_MESSAGE` 透明告知降级发生。`resetFromAgent` 按 agent index 回退后续状态。

**Webnovel Writer** 的错误处理是"三层关卡 + blocking 阻断 + 可信断点续传"。`blocking_count > 0` 阻断 Step 4；`severity=critical` 自动 blocking；`preflight` 预检 + `doctor` 体检 + `write-gate` 三层关卡。重复执行 `/webnovel-write` 时先检查可信断点，从失败点继续。`hooks/guard_runtime_write.py` 守护运行时写权限。`override_contracts` 表专门记录违背软建议时的 Override 决策（带理由），可供 ContinuityAuditor 复用。

**AI Novel Factory** 的错误处理是"abort + 4 档 backoff + 软降级 quarantine"生产级方案。`abort.ts` 的 `throwIfStopped` + `AutopilotStopError` 提供 abort 机制；`autopilot-worker.ts` 4 档 backoff（network/provider/rate-limit/no-progress），关键常量 `AUTOPILOT_LEASE_SECONDS=60` / `AUTOPILOT_PROVIDER_RETRY_BASE_MS=10000` / `AUTOPILOT_RATE_LIMIT_RETRY_MAX_MS=120000` / `AUTOPILOT_STALE_LLM_REQUEST_MS=max(180000, LLM_TIMEOUT_MS+60000)` 是经过线上实践调过的。`chapter-consistency.ts` 的 `isRoleOrGenericName` + `ROLE_TITLE_SUFFIXES` 把人名识别失败软降级为 quarantine 而非崩溃；`factory-db.ts:198 readJson` 对坏 JSON 容错回退。`restoreAutopilotJobs` + `runNovelAutopilotWorkerOnce` 一次性扫描恢复——这是 LinYi 多 Agent 流水线最缺的"机器死亡后状态自愈"能力。

**NovelDreamer** 的错误处理几乎不存在——`get_quotes_for_work` 有 `try/except Exception` 并打印错误返回 None；其他 LLM 调用无重试、无超时控制、无回退。无测试、无错误恢复、`log()` 函数还使用 `global log_data` 字符串拼接，对长篇生成来说日志体积会爆炸。这是研究原型的错误处理真空地带。

**AI_NovelGenerator_YILING** 的错误处理是"通用重试 + 清洗重试 + 断点恢复 + 吞异常"四层。`call_with_retry` 通用重试 + `fallback_return` 默认值（`common.py:18-38`）；`invoke_with_cleaning` LLM 清洗重试，移除 `<think>...</think>` 标签与 ` ``` ` 标记 + 空内容重试机制（`common.py:61-84`）；`partial_architecture.json` 阶段性断点恢复（`architecture.py:22-47`）；多处 `try/except` 吞异常并返回空字符串/默认值。`log_llm_io` 默认只记录长度，避免泄露用户素材。但 `invoke_with_cleaning` 与 LinYi LLMService 双层重试会冲突，需在适配层关闭其中一层。

**对 LinYi 的启示**：LinYi 应采用"retry 分类 + 4 档 backoff + 软降级 + 回归检测"的生产级方案——(1) LLM 调用健壮性直接挪用 NovelPilot 的 `NON_RETRYABLE_PATTERNS` / `RETRYABLE_PATTERNS` 双列表 + 默认 retryable 策略，避免对"insufficient credits"这类不可恢复错误浪费重试配额；(2) Worker 恢复直接采用 AI Novel Factory 的 4 档 backoff 常量 + `restoreAutopilotJobs` 一次性扫描恢复，这是"机器死亡后状态自愈"的现成模板；(3) 评审错误处理参考 ainovel-cli 的 Grade 三层映射 + StyleDelta 回归检测，发现"改一处坏全书"的回归；(4) 软降级参考 AI Novel Factory 的 quarantine 模式（人名识别失败不崩溃）+ Webnovel Writer 的 `severity=critical` 自动 blocking；(5) 坚决规避 NovelDreamer 的裸跑无重试，规避 YILING 的双层重试冲突。

## 维度 6：性能优化

**ainovel-cli** 的性能优化集中在上下文窗口治理与统计窗口控制。`ctxpack` 的 `StoreSummaryCompact` 策略（`internal/agents/ctxpack/strategy.go` + `builder.go` + `restore.go`）：`buildWriterStoreSummaryText` 从 store 重建上下文（progress/chapterPlan/outline/snapshots/foreshadow/pendingReviews/styleRules），`WriterRestorePack` 是压缩后的恢复包——"按 store 重建 + 按策略压缩 + 可恢复"三段式。stylestat 的 `phraseWindow=20`（最近 20 章窗口挖高频短语）+ `minChapters=5`（章数不足直接返回 nil 避免小样本噪声）是统计窗口的精细化控制。

**InkOS** 的性能优化核心是"Zod schema 分级校验 + Forecast 分支成本控制"。Zod 对每个工件全量校验，长篇多章时累积开销不小，建议分级校验——开发/CI 全量校验、生产只校验关键字段。Narrative Forecast 的 2-5 分支（`FORECAST_MIN_BRANCHES=2` / `FORECAST_MAX_BRANCHES=5`）每分支都要 LLM 生成完整 beats + decisions + risks，2-5 分支意味着 2-5 倍 LLM 成本，建议 LinYi 用"1 主分支 + 2 候选"轻量版或仅在关键决策点触发。

**NovelPilot** 的性能优化是"agent-context 截断 + compact 函数族"。`lib/agent-context.ts` 的 `truncate` + `compact*` 函数族处理长上下文，`buildDraftingContext`（行 358-409）构建 prior summaries + ending excerpt 的章级上下文。但 9-Agent 顺序执行的累积延迟是硬伤——每个 agent 一次 LLM 调用，9 个 agent 串行可能数分钟，NovelPilot 似乎是短篇取向（drafting agent 一次写完所有章节）。LinYi 长篇必须改为"初始化 9 步 + 每章循环"模式。

**Webnovel Writer** 的性能优化是"SQLite + 向量索引 + 检索回退 + memory_compactor"四层。`index.db` SQLite + 可选 `vectors.db` 向量索引；`auto/graph_hybrid` 检索回退 BM25（向量失效时退化到关键词检索）；`memory_compactor.py` + `budget.py` 控制长期记忆体量；`migrate_state_to_sqlite.py` 把 state.json 大数据迁到 SQLite 避免 JSON 膨胀。`limit_chapter_blueprint` 取最近 100 章避免 prompt 超长。`apply_content_rules` 按章节时间距离分级（≤2 章 SKIP / 3-5 章 MOD40% / >5 章 OK）避免近章重复。

**AI Novel Factory** 的性能优化是"稳定指纹 + 紧凑 JSON + 余弦相似度 + FNV-1a 哈希"工程化方案。`stableJsonString`（`factory-db.ts:202`）按 key 排序生成稳定 JSON 用于指纹，避免 `lastUpdatedAt` 噪声触发 drift 误报；`compactJsonString` + `compactDbRow`（行 237-261）把大 JSON 截断到 900-1600 字符避免 snapshot 爆炸；`cosineSimilarity`（行 280）内置余弦相似度用于 embedding 检索；`makeStableId`（行 267）用 FNV-1a 哈希生成稳定 ID。`FactoryDb.getOperationalStatus()`（行 157）作为 readiness probe 共享视图，`/api/health` + `/api/ready` 双探针可直接照抄。

**NovelDreamer** 几乎没有性能优化——无并发，所有 LLM 调用串行；无缓存；无 token 预算控制。每章约 9 次 LLM 调用（act 生成 1 + act JSON 转换 1 + 三幕写作 3 + 章摘要 1 + 可能的 act 摘要 3），长篇生成总成本不可忽视。`summarize_story_structure` 二次调用冗余（先让 LLM 选结构，再让 LLM 总结一遍结构分析），多花一次调用。

**AI_NovelGenerator_YILING** 的性能优化是"分块生成 + LLM 任务路由 + 字数限制 + 跳过近章"四层。`compute_chunk_size()` 基于 `max_tokens / 200` 自适应分块；`limit_chapter_blueprint()` 仅保留最近 100 章目录避免 prompt 超长；LLM 任务路由（`config_manager.py:16-22, 112-118`）5 种任务独立配置模型（architecture/chapter_outline/prompt_draft/final_chapter/consistency_review），如架构用 Gemini 3.5 Flash、定稿用 DeepSeek V4 Pro——不同任务用不同模型性价比组合；限制摘要 2000 字 + 限制检索片段 2000 字；`apply_content_rules` 跳过近章内容。无并发调用。

**对 LinYi 的启示**：LinYi 应采用"SQLite 真源 + 稳定指纹 + 多模型路由 + 上下文压缩"的复合方案——(1) 性能基座参考 AI Novel Factory 的 `stableJsonString` + `compactJsonString` + `cosineSimilarity` + `makeStableId` 四件套，避免 snapshot 爆炸与 drift 误报；(2) 多模型路由直接挪用 YILING 的 5 种任务独立配置模式（架构/章纲/草稿/定稿/审校用不同模型），是性价比最优解；(3) 上下文压缩参考 ainovel-cli 的 ctxpack 三段式（按 store 重建 + 按策略压缩 + 可恢复）+ Webnovel Writer 的 `limit_chapter_blueprint` 取最近 100 章 + `apply_content_rules` 时间距离规则；(4) 检索回退参考 Webnovel Writer 的 `auto/graph_hybrid` 向量 + BM25 双路；(5) 规避 NovelDreamer 的串行无缓存（每章 9 次 LLM 调用长篇不可接受）与 NovelPilot 的 9 Agent 顺序延迟。

## 维度 7：扩展机制

**ainovel-cli** 的扩展机制是"决策表硬编码 + patternDefs 正则可扩展"。Route 的 11 条决策优先级（`router.go:66-80`）是硬编码的 if-else 链，新增决策点需改源码——前期不建议过早抽象，但若预期决策维度会演化需考虑配置化或规则引擎。`patternDefs`（行 73-85）的 8 类 AI tic 正则可按目标语言调整（现有正则针对中文网文 AI 味），是相对灵活的扩展点。`Instruction` 的 `Agent/Task/Reason/Chapter` 四字段是 Worker 派发的最小契约，新增 Worker 只需扩展 Agent 枚举。

**InkOS** 的扩展机制是"DIMENSION_LABELS 字典 + version 显式版本化 + Skill 系统"。37 维连续性审计的 `DIMENSION_LABELS` 字典结构便于增量添加维度（建议 LinYi 先裁剪到 10-15 个核心维度，后续按需扩展）。所有持久化工件用 `version: z.literal(1)` 显式版本化以支持 schema 迁移。Skill 系统较重，LinYi 若不需要"用户自定义技能"可暂不引入，先用固定 agent 集合。`message_parts` 多模态扩展点（markdown/image/artifact/tool_call/tool_result/structured_json）值得借鉴。

**NovelPilot** 的扩展机制是"AGENT_DEFINITIONS + SCHEMAS 字典 + 按 agent 定制 policy"。`AGENT_DEFINITIONS` 定义 9 个 agent 的元数据，`SCHEMAS` 字典为每个 agent 定义独立 JSON schema，新增 agent 加一个 definition + 一个 schema 即可。`getRetryPolicyForAgent`（行 18-22）支持按 agent 定制 retry policy（Chapter Architect 有独立 policy）。`buildFallbackAgentOutput` 为每个 agent 提供降级输出，新增 agent 需同步加 fallback。但 9-Agent 固定顺序流水线本身不支持分支或循环扩展。

**Webnovel Writer** 的扩展机制是"题材四件套 + Skill references + hooks.json"最完整方案。新增题材 = 在 `templates/genres/` 加 md + 在 `题材与调性推理.csv` 加行 + 在 `裁决规则.csv` 加裁决优先级 + 在 `genre-profiles.md` 加 profile（五组配置：hook/coolpoint/micropayoff/pacing/override）。Skill 通过 `references/` Markdown 加载新规则，无需改代码。`hooks.json` + `session_start.py` 支持插件级 hook。`story_system_engine.py:164 _route` 中的题材路由算法（关键词命中 → 显式题材 fallback → 文本推断 fallback → 报错）可整体改写为 LinYi 的 `GenreRouter`。

**AI Novel Factory** 的扩展机制是"message_parts 多模态 + AGENT_ROLES const + artifact.kind 枚举 + 事件字符串"。`message_parts` 多模态扩展点（markdown/image/artifact/tool_call/tool_result/structured_json）；`AGENT_ROLES` 是 const 数组，新增 agent 加一行；`artifact.kind` 枚举（state/consensus/transcript/context/chapter/plan/memory/style/graph/checkpoint）9 类，新增 kind 加枚举值；事件类型用字符串（非 TS enum），新事件类型直接 emit。这种"枚举 + 字符串"的混合模式兼顾类型安全与扩展灵活。

**NovelDreamer** 几乎没有扩展机制——添加新结构需手工编辑 `story_structure_chooser` 字符串内嵌的 handbook；添加新 LLM 后端需替换 `model = ChatOpenAI(...)` 全局变量；无插件/钩子机制。但 `story_structure_chooser` 的 7 种结构 handbook 可直接抽离为 `STRUCTURES = {name: {sections: [...], when_to_use: "..."}}` 常量文件，让 Planner 既可让 LLM 选也可让用户/IdentityCore 显式指定。

**AI_NovelGenerator_YILING** 的扩展机制是"工厂函数 + 常量追加 + 别名同步"。添加新 LLM 后端仅需扩展 `llm_adapters.py` 的 `create_llm_adapter` 工厂（11 种后端：OpenAI/DeepSeek/Gemini/Azure/Ollama/MLStudio/Volcano/SiliconFlow/Grok 等）；添加新提示词在 `prompt_definitions.py` 中追加常量；添加新章节字段需同步修改 `chapter_directory_parser._FIELD_ALIASES`。`EVENT_TYPE_ALIASES`（35 个事件类型别名归一化）是网文写作中"突破/突破境界/power_up"这类同义事件归一化的现成参考。

**对 LinYi 的启示**：LinYi 应采用"题材四件套 + 字典维度 + 枚举扩展 + 别名归一化"的复合方案——(1) 题材扩展直接挪用 Webnovel Writer 的四件套模式（templates md + CSV 行 + 裁决规则 + genre-profiles），是网文经验工程化的最完整样本；(2) 连续性审计维度参考 InkOS 的 DIMENSION_LABELS 字典结构便于增量添加，但初期裁剪到 10-15 维避免过重；(3) Agent 与 artifact 扩展参考 AI Novel Factory 的 const 数组 + 枚举值 + 字符串事件混合模式；(4) 事件归一化参考 YILING 的 `EVENT_TYPE_ALIASES` 35 个别名，网文同义事件必须归一才能查重；(5) 必须从一开始给所有持久化工件加 version 字段（InkOS 模式），否则 schema 演化迁移成本爆炸；(6) 规避 ainovel-cli 的 11 条决策表硬编码（若预期决策维度演化需配置化）与 NovelDreamer 的无扩展机制。

## 7×7 对照矩阵（速查表）

| 维度 | ainovel-cli | InkOS | NovelPilot | Webnovel Writer | AI Novel Factory | NovelDreamer | AI_NovelGenerator_YILING |
|------|-------------|-------|------------|-----------------|------------------|--------------|--------------------------|
| 模块拆分 | Engine+Workers+Arbiter 三分法，多包单一职责 | monorepo cli/core/studio，core 内 agents/models/forecast | 9 Agent 流水线，lib 按 Agent 边界切分 | Skill+Agent+scripts 三层，每 Skill 自带 references | core/server/worker/desktop/plugin 五包，core 内按文件职责拆 | 无拆分，单文件 812 行 prompt+逻辑+UI 混居 | lib/ui 分层，lib 内 architecture/blueprint/chapter 子模块 |
| 事件/数据流 | LoadState 一次性加载→Route 查表→Instruction 派发，每步落盘 | 章级四件套工件流（intent/context/rule-stack/trace）+ RuntimeStateDelta 增量 | 9 Agent 顺序链，输出汇聚到 StoryBible 单一容器 | 合同链+5 路投影+projection_log.jsonl 可观测 | Director 决策驱动+17 类事件审计+SSE 推送 UI projection | 纯线性无分支，结构选择→蓝图→章循环（acts→三幕→摘要） | 雪花 4 步→蓝图分块→章节生成→定稿→可选审校 |
| 状态管理 | State 显式字段+Store 每步落盘 Step 级 checkpoint | RuntimeStateDelta 增量+HookRecord（halfLifeChapters/promoted）+version 显式 | StoryBible 单一全量对象+resetFromAgent 按 index 粗粒度回滚 | MASTER_SETTING 顶层+commit 派生 view+override_policy 三段式 | SQLite 13+ 表唯一真源+8 阶段状态机+stateChangeFingerprint | 全局变量+chapter_summaries 滚动列表，无持久化无 checkpoint | 散 txt 文件+partial_architecture.json 断点+Chroma 向量库 |
| 提示词组织 | editor.md 7 维+anti-ai-tone.md 5 大类+stylestat 8 类正则双轨 | 双文件（author_intent+current_focus）+Zod schema 校验+rule-stack | SCHEMAS 字典+COMPACT_JSON_RULES 强约束（schema 嵌入增 token） | SKILL.md 入口+references 按需+shared 单一源+37 题材+8 CSV | resources 三层（agents/style/vocabulary）+12 层 Context Contract | 模块级字符串常量+str.format，7 种结构 handbook 内嵌 | prompt_definitions.py 集中 9 类常量+中英双版本+knowledge_filter 三级 |
| 错误处理 | 机械规则+LLM 评审+Grade 三层映射+StyleDelta 回归 | Zod 全量校验+contextFingerprint 绑定+version 迁移 | retry 分类+fallback 全覆盖（三语）+resetFromAgent 三层防线 | blocking 阻断+severity=critical+preflight/doctor/write-gate 三关卡 | abort+4 档 backoff+quarantine 软降级+restoreAutopilotJobs 自愈 | 裸跑无重试无超时，仅 get_quotes 有 try/except | call_with_retry+invoke_with_cleaning+断点恢复+吞异常四层 |
| 性能优化 | ctxpack StoreSummaryCompact 三段式+phraseWindow=20+minChapters=5 | Zod 分级校验建议+Forecast 2-5 分支成本高（建议 1+2 轻量版） | agent-context truncate+compact 函数族，9 Agent 串行延迟硬伤 | SQLite+向量索引+graph_hybrid 回退 BM25+memory_compactor+budget | stableJsonString 指纹+compactJsonString 截断+cosineSimilarity+FNV-1a | 无并发无缓存无 token 预算，每章 9 次 LLM 调用 | 分块生成+5 任务 LLM 路由+限制 2000 字+limit 100 章+apply_content_rules |
| 扩展机制 | Route 11 条决策表硬编码+patternDefs 正则可扩展+Instruction 四字段 | DIMENSION_LABELS 字典+version 显式+Skill 系统+message_parts 多模态 | AGENT_DEFINITIONS+SCHEMAS 字典+按 agent 定制 retry policy | 题材四件套（md+CSV+裁决+profile）+Skill references+hooks.json | message_parts+AGENT_ROLES const+artifact.kind 枚举+事件字符串 | 无扩展机制，新结构手工编辑字符串，新 LLM 替换全局变量 | create_llm_adapter 工厂+常量追加+_FIELD_ALIASES 同步+EVENT_TYPE_ALIASES 35 别名 |

## 对 LinYi 重构的综合启示

**第一，调度层应采纳 ainovel-cli 的纯函数 Route + AI Novel Factory 的 Director 决策双轨**。ainovel-cli 的"LoadState 一次性加载 → Route 查表 → Instruction 派发"是确定性调度的范本，11 条优先级互斥决策表保证"同一状态永远得出同一指令"，可单测、可回放、可解释；AI Novel Factory 的 Director/Worker 双进程 + lease/heartbeat + 4 档 backoff + `restoreAutopilotJobs` 一次性扫描恢复，是"机器死亡后状态自愈"的现成模板。LinYi 应把"决定下一步"与"执行下一步"分离——Director 只决定"做什么 + 为什么"，Worker 只 claim job + 执行 + heartbeat，不持有工作流策略。必须规避 NovelPilot 的 9 Agent 固定顺序（长篇延迟不可接受）与 NovelDreamer 的纯线性无分支（无循环无弧末后处理）。

**第二，状态管理应采用 AI Novel Factory 的 SQLite 单一真源 + InkOS 的 RuntimeStateDelta 增量模型 + Webnovel Writer 的 override_policy 三段式**。AI Novel Factory 的 13+ 张核心表（projects/workflow_runs/workflow_steps/agent_turns/messages/message_parts/artifacts/memory_items/graph_nodes/graph_edges/checkpoints/events/jobs）是 LinYi StoryBible schema 的设计起点；InkOS 的 RuntimeStateDelta（currentStatePatch/hookOps/chapterSummary/subplotOps/emotionalArcOps）+ HookRecord（halfLifeChapters/promoted）是状态变更的精细化模型，而非 NovelPilot 的全量 StoryBible；Webnovel Writer 的 `locked` / `append_only` / `override_allowed` 三段式对应"大纲即法律 / 设定即物理 / 发明需识别"三防定律。必须从一开始给所有持久化工件加 version 字段（InkOS 的 `z.literal(1)` 模式），坚决规避 YILING 的散 txt 文件与 NovelDreamer 的无持久化。

**第三，提示词组织应融合 Webnovel Writer 的四层知识库 + AI Novel Factory 的 12 层 Context Contract + InkOS 的双文件治理**。Webnovel Writer 的 `shared/` 单一事实源 + `references/` 按需加载 + `templates/genres/` 37 题材模板 + `csv/` 8 张知识表 + `裁决规则.csv` 三层裁决，是网文经验工程化的最完整样本；AI Novel Factory 的 12 层 Context Contract 固定顺序（system protocol → role prompt → project mission → workflow state → constraints → consensus → context packet → transcript → memory/RAG → instruction → tool results）是经过实战检验的 LLM 上下文工程模板；InkOS 的 `author_intent.md` + `current_focus.md` 双文件 + Zod schema 校验把"作者到底要什么"从模糊 prompt 提升为结构化工件。去 AI 味应坚持 ainovel-cli 的"统计归代码、裁定归 LLM"双轨——stylestat 正则归代码、editor.md 7 维评审归 LLM，不许 stylestat 直接驱动重写决策。

**第四，错误处理与性能优化应直接挪用 NovelPilot 的 retry 分类 + AI Novel Factory 的 4 档 backoff + YILING 的多模型路由**。NovelPilot 的 `NON_RETRYABLE_PATTERNS` / `RETRYABLE_PATTERNS` 双列表 + 默认 retryable 策略，避免对"insufficient credits"这类不可恢复错误浪费重试配额；AI Novel Factory 的 `AUTOPILOT_LEASE_SECONDS=60` / `AUTOPILOT_PROVIDER_RETRY_BASE_MS=10000` / `AUTOPILOT_RATE_LIMIT_RETRY_MAX_MS=120000` / `AUTOPILOT_STALE_LLM_REQUEST_MS=max(180000, LLM_TIMEOUT_MS+60000)` 是经过线上实践调过的常量，值得直接复用；YILING 的 5 种任务独立配置模型（architecture/chapter_outline/prompt_draft/final_chapter/consistency_review）是性价比最优解。性能基座参考 AI Novel Factory 的 `stableJsonString` + `compactJsonString` + `cosineSimilarity` + `makeStableId` 四件套，避免 snapshot 爆炸与 drift 误报；上下文压缩参考 ainovel-cli 的 ctxpack 三段式 + Webnovel Writer 的 `limit_chapter_blueprint` 取最近 100 章 + `apply_content_rules` 时间距离规则。必须规避 NovelDreamer 的裸跑无重试与 YILING 的双层重试冲突。

**第五，扩展机制应采用 Webnovel Writer 的题材四件套 + InkOS 的 DIMENSION_LABELS 字典 + AI Novel Factory 的枚举扩展 + YILING 的别名归一化**。新增题材 = 在 `templates/genres/` 加 md + 在题材 CSV 加行 + 在裁决规则 CSV 加优先级 + 在 genre-profiles 加 profile（hook/coolpoint/micropayoff/pacing/override 五组配置），是网文经验工程化的最完整扩展点；连续性审计维度参考 InkOS 的 DIMENSION_LABELS 字典结构便于增量添加，但初期裁剪到 10-15 维避免过重；Agent 与 artifact 扩展参考 AI Novel Factory 的 const 数组 + 枚举值 + 字符串事件混合模式；事件归一化参考 YILING 的 `EVENT_TYPE_ALIASES` 35 个别名，网文同义事件必须归一才能查重。需要重点规避的陷阱：ainovel-cli 的 11 条决策表硬编码（若预期决策维度演化需配置化）、NovelPilot 的 fallback 内容题材不适配（应从已完成早期 agent 输出提取题材信息）、AI Novel Factory 的 `factory-db.ts` 单文件 1500+ 行膨胀（必须按 schema/repository/event-store/snapshot/retriever 拆分）、InkOS 的 37 维维度耦合（人物动机变化影响情感弧，需考虑跨维度关联告警）。
