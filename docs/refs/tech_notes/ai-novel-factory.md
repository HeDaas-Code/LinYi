# AI Novel Factory 技术笔记

## 项目概述

- **主语言**：TypeScript（核心引擎 + Worker + Server），Tauri/Rust（桌面壳，仅 `apps/desktop/src-tauri`），HTML/CSS/JS（thin client）。
- **定位**：生产级 server-first AI 小说工作流系统。Web、Desktop、CLI、OpenCode 插件四种客户端共用同一个核心引擎 + 同一个持久化数据库。**核心目标是把"工作流状态"彻底变成数据库的财产，而不是文件系统的财产。**
- **核心目标**：通过 SQLite 单一真源 + Director/Worker 双进程架构，让多客户端、多进程、可恢复、可审计的长篇创作成为可能。
- **仓库结构（关键目录）**：
  - `packages/ai-novel-core/`：核心引擎，包含状态机、`factory-db.ts` SQLite schema、Director、Worker、agent 编排、LLM runtime、memory/RAG、Super Graph、writing pipeline。
  - `packages/ai-novel-core/src/`：核心源码 TS 文件（`factory-db.ts` 1500+ 行、`orchestrator.ts`、`writing-pipeline.ts`、`novel-director.ts`、`worker.ts`、`autopilot-worker.ts`、`chapter-consistency.ts` 等）。
  - `packages/ai-novel-core/resources/writing/`：写作指南、质量规则、词汇资源（`agents/` 6 个 agent 提示词、`style/` 7 个文风文件 + `vocabulary/` 10 类词汇、`automation/consistency-check.md`、`examples/`）。
  - `packages/ai-novel-server/`：独立 HTTP/SSE API 服务 + 静态 web 托管。
  - `packages/opencode-ai-novel-factory/`：OpenCode 插件 + CLI 适配器（仅暴露生产工具）。
  - `apps/desktop/`：Tauri 桌面壳 + Web 前端（`app.js` / `index.html` / `style.css` + `src/` 几个 `.mjs` 视图模块）。
  - `docs/PRODUCTION_ARCHITECTURE.md`：生产架构法律文本（部署形态、Source of Truth、Director Model、Agent Execution、Message System、Context Contract、Event Contract）。
  - `docs/plans/`：10 个 2026-06-02 日期戳记的设计 plan（多 Agent TUI、autonomous CLI、live discussion、streaming TUI、Tauri web shared studio 等）。
  - `PRIORITY_ISSUE_SOLUTION.md`：插件优先级冲突解决方案（强化工具描述 + 关键词 + 用户引导）。

## 核心创新点

### 1. SQLite 作为唯一真源（factory.sqlite）

`PRODUCTION_ARCHITECTURE.md` §Source Of Truth 明确："唯一真源是 `.ai-novel-factory/factory.sqlite`，项目工作区下的 markdown/JSON 都是 artifacts/cache"。核心表（`factory-db.ts:33-47`）：
- `projects`：项目元数据、当前阶段、run status、状态快照。
- `workflow_runs` / `workflow_steps` / `agent_turns`：可审计的工作流与 agent 轮次。
- `messages` / `message_parts`：消息是一等公民（`messageId` 全局稳定、`conversationId` 划定作用域、`type`/`status`/`time`/`data_json`/`metadata`）。
- `artifacts` / `memory_items` / `graph_nodes` / `graph_edges`：产物、长期记忆、Super Graph。
- `checkpoints` / `events`：drift guard、append-only 事件日志（17 类事件，含 `DIRECTOR_COMMAND_DECIDED`、`DRIFT_DETECTED`、`JOB_RESTORE_READY`）。
- `jobs`：durable 后台任务（Redis 可协调但**不能替代此表**）。

这是 LinYi 借鉴点 §14.4 "单一真源" 的主参考——核心约束不是"用 SQLite"，而是"所有重要状态必须落 DB + 暴露给 API snapshot"。

### 2. Director/Worker 双进程架构 + Lease 协调

`novel-director.ts` 定义 `NovelDirectorCommand`（4 类：advance / discuss / retry_chapter / interrupt），核心函数 `decideNovelDirectorCommand`（`novel-director.ts:114`）只决定"下一步做什么 + 为什么"，不执行。Worker 进程（`worker.ts:66 startNovelAutopilotWorker`）只负责 claim job、heartbeat lease、retry transient failure、resume after restart——**不持有工作流策略**。

权威规则（`PRODUCTION_ARCHITECTURE.md` §Director Model）：
- UI 不能推进工作流状态；
- API handler 不能发明工作流进度，只能创建命令/job；
- Agent 可以 propose/draft/review/critique，但不能直接改 stage 或 chapter status；
- Orchestrator + writing pipeline 只在执行 Director command 时才能 mutate state；
- 每个 Director 决策必须通过 `DIRECTOR_COMMAND_DECIDED` 事件审计。

`autopilot-worker.ts:68-82` 用 lease/heartbeat/backoff 四档常量（`AUTOPILOT_LEASE_SECONDS=60`、`AUTOPILOT_HEARTBEAT_MS`、`AUTOPILOT_PROVIDER_RETRY_BASE_MS=10000`、`AUTOPILOT_RATE_LIMIT_RETRY_MAX_MS=120000`）保证可恢复——这正是 LinYi 多 Agent 流水线最缺的"机器死亡后状态自愈"能力。

### 3. 8 阶段状态机 + Run/Step/Turn 三级状态

`PRODUCTION_ARCHITECTURE.md` §State Machine 定义：
- **8 个项目阶段**：`worldbuilding_dialogue` → `setting_review` → `master_planning` → `chapter_task_generation` → `drafting` → `reviewing` → `replanning` → `complete`。
- **Run 状态**：idle / running / paused / blocked / failed / completed。
- **Step/Turn 状态**：pending / in_progress / completed / failed / cancelled。
- **强制约束**：只有 `server/core` 能持久化这些状态，core 内部决策必须流经 Director 层——禁止散落在 API handler / UI / agent prompt / worker loop。`buildDirectorDiscussionMessage`（`novel-director.ts:71`）按 stage 给出阶段感知的提示词（如 `setting_review` 阶段："请审阅已冻结设定，指出设定漏洞、角色动机风险和进入主线规划前必须锁定的内容"）。

### 4. 章节因果计划（Chapter Causal Plan）滚动规划

`orchestrator.ts:146 buildChapterCausalPlan` 实现章节级滚动规划——不是写完全书才动，而是每章生成时基于章节序号、总章数、项目 idea 实时计算：
- 弧线（arc）划分：`arcSize = max(3, ceil(totalChapters/4))`，把全书切成 4 段弧线。
- 5 段固定结构：`previousInput / sceneObjective / protagonistDecision / irreversibleConsequence / nextHandoff`——"承接 / 推进 / 选择 / 代价 / 交棒"。
- `characterStateDelta` 强制角色状态可追踪变化（信任/债务/恐惧/野心/伤口/阵营关系）。
- `foreshadowingOperation` 按 `chapterNumber % 3 === 0` 切换伏笔操作（回收 vs 新增）。
- `requiredContinuityAnchors` 区分首章（"主角唯一身份 / 核心缺口 / 第一枚主线线索"）与后续章（"上一章关键物件 / 关系变化 / 未解决问题 / 代价"）。

这是 §14.4 "滚动规划"的工程化样本——把"长篇规划的连续性"转化为可计算的字段。

### 5. 多 Agent 圆桌讨论（7 角色固定顺序）

`PRODUCTION_ARCHITECTURE.md` §Agent Execution 规定一次 discussion 是一个 durable `workflow_run`，顺序固定：
1. `Showrunner`（opening_brief）
2. `World Architect`（specialist_turn）
3. `Author`（specialist_turn）
4. `Editor`（specialist_turn）
5. `Reviewer`（specialist_turn）
6. `Prose Stylist`（specialist_turn）
7. `Showrunner`（closing_synthesis）

每轮 `agent_turn` 必须记录 `runId / role / discussion stage / input context / output text / status / error / model / timestamps`——这是 LinYi 多 Agent 流水线可审计的现成 schema。`AGENT_ROLES`（`orchestrator.ts:34`）的 6 个角色常量定义了角色枚举。

### 6. 上下文合同（12 层固定顺序）

`PRODUCTION_ARCHITECTURE.md` §Context Contract 规定上下文组装顺序：
1. system/developer protocol → 2. role base prompt → 3. role dynamic prompt → 4. original project mission → 5. current workflow state → 6. Super Graph constraints → 7. global consensus → 8. current context packet → 9. recent transcript → 10. memory/RAG recalls → 11. current user/autopilot instruction → 12. tool and artifact results。

`context-packet.ts` 把当前上下文包持久化为 `.ai-novel/context/current-context.md` 并作为 artifact 索引——可审计、可重放。

## 可直接复用的设计

### A. factory-db SQLite schema（13+ 张表）

`packages/ai-novel-core/src/factory-db.ts:33-47` 的核心表清单可直接作为 LinYi `StoryBible` schema 的设计起点。关键映射：
- `projects` ↔ LinYi 项目元数据；
- `messages` + `message_parts` ↔ LinYi 创作对话日志（一等公民）；
- `artifacts` ↔ LinYi 章节产物 + 审查报告 + 设定文件；
- `memory_items` + `embeddings` ↔ LinYi 长期记忆；
- `graph_nodes` + `graph_edges` ↔ LinYi 实体关系图谱；
- `checkpoints` ↔ LinYi drift guard；
- `events` ↔ LinYi 事件审计（17 类事件枚举可整体迁移）；
- `jobs` ↔ LinYi 后台任务（带 lease/heartbeat）。

`FactoryDb.getOperationalStatus()`（`factory-db.ts:157`）作为 readiness probe 共享视图，LinYi 的 `/api/health` + `/api/ready` 双探针可直接照抄。

### B. NovelDirector 命令模型

`novel-director.ts:3-32` 的 `NovelDirectorCommand` 联合类型（advance / discuss / retry_chapter / interrupt 四类 + `id` / `stage` / `reason` 公共字段）+ `decideNovelDirectorCommand` 函数 + `createFollowUpAdvanceCommand` / `createManualAdvanceCommand` / `createManualRetryChapterCommand` / `createManualInterruptCommand` 四个工厂函数——这套接口设计可直接搬到 LinYi 的 `Director` 类。LinYi 只需把"决定下一步"和"执行下一步"分离即可。

### C. Worker Lease + Heartbeat 常量与恢复机制

`autopilot-worker.ts:68-82` 的 4 档常量（lease/heartbeat/network-retry/rate-limit-retry）+ `restoreAutopilotJobs` 函数 + `runNovelAutopilotWorkerOnce` 一次性扫描恢复——这是 LinYi 后台 worker 的现成模板。`AUTOPILOT_NETWORK_RETRY_BASE_MS=5000`、`AUTOPILOT_RATE_LIMIT_RETRY_MAX_MS=120000`、`AUTOPILOT_STALE_LLM_REQUEST_MS=max(180000, LLM_TIMEOUT_MS+60000)` 这三个常量值值得直接复用——是经过线上实践调过的。

### D. 17 类事件枚举

`PRODUCTION_ARCHITECTURE.md` §Event Contract 列出 17 类事件：`PROJECT_CREATED / PROJECT_STATE_UPDATED / WORKFLOW_RUN_STARTED / WORKFLOW_RUN_UPDATED / AGENT_TURN_UPDATED / DISCUSSION_STARTED / CONSENSUS_UPDATED / ARTIFACT_RECORDED / MEMORY_ITEM_RECORDED / EMBEDDING_UPSERTED / JOB_CREATED / JOB_CLAIMED / JOB_HEARTBEAT / JOB_UPDATED / JOB_RESTORE_READY / DRIFT_DETECTED / CHECKPOINT_CREATED`。LinYi 的事件日志（事件审计表）可直接采用这套命名 + 在末尾追加 webnovel-writer 的 `CHAPTER_COMMIT_ACCEPTED` 等小说专属事件。

### E. 章节因果计划 5 段结构

`orchestrator.ts:146-176 buildChapterCausalPlan` 的 5 段结构（previousInput / sceneObjective / protagonistDecision / irreversibleConsequence / nextHandoff）+ `characterStateDelta` + `foreshadowingOperation` + `requiredContinuityAnchors` 8 个字段——LinYi 的 `ChapterBrief` schema 可以直接采用这套字段，因为它把"长篇连续性"工程化为可计算的字段。`isFirstChapter` 的分支（首章 vs 后续章的 anchors 不同）也值得复用。

### F. Message 一等公民 + 4 状态

`messages.ts` 的 `BaseMessage`（`messageId / conversationId / type / status / time / data / metadata`）+ `messageId` 在 streaming 中保持稳定（"complete LLM interaction by one agent is one message unless the agent explicitly emits multiple semantic outputs"）+ 4 状态（queued / streaming / completed / failed / cancelled）——LinYi 的多 Agent 对话日志可直接采用这套模型。`message_parts` 作为多模态扩展点也值得借鉴。

### G. 上下文合同 12 层顺序

`PRODUCTION_ARCHITECTURE.md` §Context Contract 的 12 层固定顺序是经过实战检验的 LLM 上下文工程模板。LinYi 的 `ContextAssembler` 可直接采用这套顺序，只需把"Super Graph constraints"换成 LinYi 的"WorldStateContract constraints"。

## 需要改造才能借鉴的部分

### 1. 通用 production 框架 → 网文专属

ai-novel-factory 是通用小说工作流，没有网文专属概念（Strand Weave / 爽点 / 题材模板 / 追读力）。LinYi 需要在 `factory-db.ts` 的 schema 中追加：`strand_tracker` / `chase_debt` / `chapter_reading_power` / `genre_profile` / `foreshadowing` 等表，并把这些表的字段从 webnovel-writer 借鉴过来。

### 2. Super Graph 替换为 WorldStateContract

ai-novel-factory 用 `super-graph.ts` 的 `graph_nodes` / `graph_edges` 表存储实体关系。LinYi 用 WorldStateContract（更结构化的合同），需要把 Super Graph 的图查询能力（constraint violation 检测）映射到 WorldStateContract 的字段约束检查。`super-graph.ts` 的 `initializeSuperGraph` + `upsertCheckpointInSuperGraph` 接口可以保留，但底层语义需改写。

### 3. 8 阶段状态机精简

ai-novel-factory 的 8 阶段（`worldbuilding_dialogue` → `setting_review` → `master_planning` → `chapter_task_generation` → `drafting` → `reviewing` → `replanning` → `complete`）适合通用小说，但 LinYi 是滚动规划的长篇网文——`master_planning` 阶段不应是一次性的，而是每 N 章滚动一次。建议 LinYi 把 `master_planning` 改为可重入的"卷规划"阶段，与 `chapter_task_generation` 形成"卷→章"两级滚动。

### 4. 圆桌讨论固定 7 角色 → LinYi 灵活编排

`AGENT_ROLES` 固定 6 角色 + Showrunner 双开闭——这套圆桌适合通用小说的"世界观收敛 + 风格统一"讨论。LinYi 网文场景中，章节创作更适合"Context Agent → Writer → Reviewer → Data Agent"的 4 角色流水线（webnovel-writer 模式），讨论只在卷首/卷末触发。建议 LinYi 把 discussion 阶段的 7 角色圆桌和 writing 阶段的 4 角色流水线分开。

### 5. Tauri 桌面壳不必复用

`apps/desktop/src-tauri/` 仅 5 个文件，桌面壳价值有限。LinYi 若要桌面端，建议直接用 Electron + Web 复用 web 前端，避免 Rust 工具链负担。ai-novel-factory 的 Tauri 集成也是其工程复杂度的负担之一。

### 6. PRIORITY_ISSUE_SOLUTION 反映的 SEO/优先级问题不适用

`PRIORITY_ISSUE_SOLUTION.md` 整篇文档处理的是 OpenCode 插件市场里 AI 选错项目的问题（强化工具描述、加唯一标识关键词、强制用户指定插件名）。LinYi 不走 OpenCode 插件市场，这套解决方案无借鉴价值。

## 潜在风险

- **TypeScript 编译产物已 commit**：`packages/ai-novel-core/dist/` 下打包了 30+ 个 `.js/.cjs/.d.ts` 文件，说明开发流程依赖预编译产物。LinYi 借鉴源码时要直接读 `src/*.ts`，不要被 `dist/` 干扰。
- **`factory-db.ts` 体量巨大**：单文件 1500+ 行，承担 schema + CRUD + 事件 + snapshot + 检索 + memory + embedding + cosine similarity 全部职责。LinYi 借鉴时要按职责拆分（schema / repository / event-store / snapshot / retriever），否则单文件不可维护。
- **本地 SQLite vs 生产 Postgres 的迁移成本**：`PRODUCTION_ARCHITECTURE.md` 明确"production should use same schema concepts with Postgres"，但仓库只实现 SQLite。LinYi 若考虑线上部署，需自行实现 Postgres 版本——SQLite 的 `INTEGER PRIMARY KEY` 自增在 Postgres 中要改为 `SERIAL`，`JSON` 字段要改 `JSONB`，prepared statement 接口也需替换。
- **Redis 可选但生产必需**：`PRODUCTION_ARCHITECTURE.md` §Redis Role 说"local 可选，production 推荐"——分布式 job lock / worker lease / SSE pubsub / agent heartbeat / hot runtime status 都依赖 Redis。LinYi 若部署多实例，需要把 Redis 引入技术栈。
- **OpenCode 插件耦合**：`packages/opencode-ai-novel-factory/` 是为 OpenCode 设计的适配器，含 `tui.ts` / `tui-controller.ts` / `discussion.ts` 等 OpenCode 专属逻辑。LinYi 不走 OpenCode，这部分整体不可复用。
- **`buildChapterCausalPlan` 字段是硬编码模板**：弧线切 4 段、伏笔每 3 章切换——这些是经验值而非可配置项。LinYi 借鉴时应把这些参数提取为 `book.yaml` 的可配置项（参见 webnovel-writer v7 `book.yaml` 的设计）。
- **维护活跃度**：仓库 10 个设计 plan 都集中在 2026-06-02，说明项目处于快速迭代期，schema 可能频繁变更。LinYi 借鉴前应锁定一个稳定 commit。

## 架构对照信息（供 architecture_compare.md 使用）

- **模块拆分方式**：core / server / worker / desktop / opencode-plugin 五包。core 内部按职责分文件（factory-db / orchestrator / director / worker / writing-pipeline / chapter-consistency / messages / super-graph / knowledge / embedding / runtime-llm / abort / context-packet / discussion）。每个文件单一职责，但 `factory-db.ts` 体量过大。
- **事件/数据流**：User → API → jobs/events → Worker claim → Director decide → Executor 执行 → 结果回写 events/artifacts/state/graph/memory → UI 渲染 projection。SSE 推送状态变更，UI 不重建状态。所有重要动作产出 events（17 类）。
- **状态管理**：8 阶段项目状态机 + Run/Step/Turn 三级状态 + 每个状态只能由 core 持久化。`stateChangeFingerprint`（`factory-db.ts:216`）用稳定 JSON 字符串计算指纹，避免 `lastUpdatedAt` 噪声触发 drift 误报。
- **提示词组织**：`packages/ai-novel-core/resources/writing/` 三层——`agents/` 6 个角色提示词（writer/editor/chapter_planner/style_controller/consistency-check + writer_enhanced）、`style/` 7 个文风文件 + `vocabulary/` 10 类词汇 JSON、`examples/` 4 个示例（含 `classical-chinese-guide.md` 古文指南、`vocabulary-usage-demo.md`）。提示词用 Markdown，agent 输入按 12 层 Context Contract 顺序组装。
- **错误处理**：`abort.ts` 的 `throwIfStopped` + `AutopilotStopError` 提供 abort 机制；`autopilot-worker.ts` 4 档 backoff（network/provider/rate-limit/no-progress）；`chapter-consistency.ts` 的 `isRoleOrGenericName` + `ROLE_TITLE_SUFFIXES` 把人名识别失败软降级为 quarantine 而非崩溃；`factory-db.ts:198 readJson` 对坏 JSON 容错回退。
- **性能优化**：`stableJsonString`（`factory-db.ts:202`）按 key 排序生成稳定 JSON 用于指纹；`compactJsonString` + `compactDbRow`（`factory-db.ts:237-261`）把大 JSON 截断到 900-1600 字符避免 snapshot 爆炸；`cosineSimilarity`（`factory-db.ts:280`）内置余弦相似度用于 embedding 检索；`makeStableId`（`factory-db.ts:267`）用 FNV-1a 哈希生成稳定 ID。
- **扩展机制**：`message_parts` 多模态扩展点（markdown/image/artifact/tool_call/tool_result/structured_json）；`AGENT_ROLES` 是 const 数组，新增 agent 加一行；`artifact.kind` 枚举（state/consensus/transcript/context/chapter/plan/memory/style/graph/checkpoint）9 类，新增 kind 加枚举值；事件类型用字符串（非 TS enum），新事件类型直接 emit。

## 借鉴点映射（供 borrow_matrix.md 使用）

参考 §14.4 借鉴矩阵，AI Novel Factory 作为主/辅参考能覆盖的借鉴点：

| §14.4 借鉴点 | 主/辅 | 关键文件 / 行号 |
|---|---|---|
| 单一真源（SQLite/JSON） | **主参考** | `docs/PRODUCTION_ARCHITECTURE.md` §Source Of Truth + §No More Split State；`packages/ai-novel-core/src/factory-db.ts:33-47`（13+ 张核心表）；`factory-db.ts:157 FactoryOperationalStatus` |
| Director/Worker 协作 | **主参考** | `packages/ai-novel-core/src/novel-director.ts:1-199`（4 类 command + decide 函数 + 4 个工厂方法）；`packages/ai-novel-core/src/worker.ts:66-88`（worker 启动 + status + once 模式）；`autopilot-worker.ts:68-82`（4 档 backoff 常量） |
| 滚动规划 | 辅助参考 | `orchestrator.ts:146-176 buildChapterCausalPlan`（5 段因果 + 弧线切分 + 首章/后续章分支）；`orchestrator.ts:188-201 buildChapterTasks`（按章号生成 task） |
| 多 Agent 流水线 | 辅助参考 | `PRODUCTION_ARCHITECTURE.md` §Agent Execution（7 角色圆桌固定顺序）；`orchestrator.ts:34 AGENT_ROLES`；`writing-pipeline.ts:52 WritingProgressEvent.role`（7 角色枚举）；`writing-pipeline.ts:103 QualityGateResult` |
| 雪花写作法提示词 | 辅助参考 | `packages/ai-novel-core/resources/writing/agents/chapter_planner.md`（章节结构设计师 + 4 段结构 300/1500/800/400）；`resources/writing/agents/writer.md`（Writer 角色提示词） |
| ContinuityAuditor 六维 | 辅助参考 | `packages/ai-novel-core/src/chapter-consistency.ts`（`extractChinesePersonNames` 三模式正则 + `GENERIC_NAMES` + `ROLE_TITLE_SUFFIXES` 过滤 + quarantine 软降级）；`resources/writing/automation/consistency-check.md` |
| Story Bible 真源 | 辅助参考 | `factory-db.ts` 的 `projects` 表 + `artifacts` 表 + `checkpoints` 表组合；可对照 webnovel-writer `.story-system/` 多 JSON 方案做"DB vs 文件"权衡 |
| 去 AI 味规则 | 辅助参考 | `resources/writing/style/writing-style-guide.md` + `style/tone.md` + `style/rhythm.md` + `style/dialogue.md`；`resources/writing/examples/classical-chinese-guide.md`（古文风格指南） |
| 文风指纹 | 辅助参考 | `writing-pipeline.ts:13-30 NovelWorkspacePaths`（`styleProfilePath` / `styleRulebookPath` / `styleReferencesPath` / `styleAntiPatternsPath` 4 个文风文件路径）；`resources/writing/vocabulary/` 10 类词汇 + `vocabulary_index.json` 索引 |
| Foreshadowing Tracker | 辅助参考 | `orchestrator.ts:172-174` 的 `foreshadowingOperation`（按 `chapterNumber % 3` 切换回收/新增）；`buildChapterCausalPlan` 的 `requiredContinuityAnchors` |

**未覆盖的借鉴点**（AI Novel Factory 不擅长）：Strand Weave 节奏（参考 webnovel-writer）；题材模板（参考 webnovel-writer 37 模板）；风格迁移外部语料（参考 NovelDreamer）；显式叙事结构（参考 NovelDreamer）。
