# Webnovel Writer 技术笔记

## 项目概述

- **主语言**：Python 3.10+（CLI + 数据层），Claude Code Skill 配置（YAML/Markdown），Dashboard 前端 React + Vite。
- **定位**：跑在 Claude Code 上的长篇网文创作插件。一句话目标——让 AI 写到几百章依然记得住设定、接得住伏笔、守得住大纲。它不是一次性生成器，而是面向长篇连载的一致性系统。
- **核心目标**：把"必须记住、不能写崩"的约束，变成 Claude Code 会自动执行的步骤——动笔前查资料、写完登记事实、过审、同步索引/摘要/记忆/Dashboard，边写边攒。
- **版本**：当前 v6.2.1；v7 重构 RFC 已在 Discussions #118 公示，方向是把 `.story-system/` 压平为 git-based story repo（见 `docs/architecture/story-repo-spec-2026-06-10.md`）。
- **仓库结构（关键目录）**：
  - `webnovel-writer/scripts/`：CLI 入口 `webnovel.py` 与全部业务模块。`data_modules/` 是核心数据层，含 `story_system_engine.py`、`story_contracts.py`、`runtime_contract_builder.py`、`chapter_commit_schema.py`、`sql_state_manager.py`、`index_manager.py` 等。
  - `webnovel-writer/skills/`：8 个 Skill 命令（init/plan/write/review/query/learn/dashboard/doctor），每个 Skill 配 `SKILL.md` + `references/` 提示词。
  - `webnovel-writer/agents/`：4 个 Agent（context-agent / reviewer / data-agent / deconstruction-agent）。
  - `webnovel-writer/references/`：共享知识库——CSV 知识表（`csv/`）、`shared/` 单一事实源（strand-weave / cool-points / core-constraints）、`review/`、`taxonomy/`。
  - `webnovel-writer/templates/genres/`：37 个中文网文题材模板（修仙、规则怪谈、克苏鲁…）。
  - `webnovel-writer/dashboard/`：只读可视化面板，前端打包好随插件分发。
  - `docs/architecture/`：架构文档，含 v7 草案 `story-repo-spec-2026-06-10.md`。

## 核心创新点

### 1. Story System 合同与提交链（三防定律的工程化）

`docs/architecture/story-repo-spec-2026-06-10.md` §1 提出 9 条设计不变量，工程化为 `.story-system/` 主链：
- **MASTER_SETTING.json**（卷级合同）：题材路由、core_tone、pacing_strategy、override_policy（locked / append_only / override_allowed 三段式）。
- **volume_XXX.json / chapter_XXX.json / review_XXX.json**：卷/章/审查合同，由 `RuntimeContractBuilder.build_for_chapter`（`runtime_contract_builder.py:18`）逐章刷新。
- **chapter_XXX.commit.json**：一章写完的事实提交，schema 由 `chapter_commit_schema.py` 的 Pydantic 模型（`ReviewResult` / `FulfillmentResult` / `ExtractionResult`）强约束。
- **三防定律**："大纲即法律 / 设定即物理 / 发明需识别"对应 `locked` / `append_only` / `override_allowed` 的合同分层（`story_contracts.py:90 merge_contract_layers`）。

### 2. 真源分层（master → volume → chapter → commit → 派生视图）

`story_contracts.py` 用 Pydantic 把合同结构化（`MasterSetting` / `ChapterBrief` / `VolumeBrief` / `ReviewContract`，见 `story_contract_schema.py:23-58`），并约定：
- `MASTER_SETTING.json` 是顶层真源；`anti_patterns.json` 是 append-only；每章 commit 是事实入账点。
- `.webnovel/state.json`、`index.db`、`summaries/`、`memory_scratchpad.json`、`projection_log.jsonl` 都是派生只读视图——`scripts/projections.py` 与各 `*_projection_writer.py` 负责投影。
- `.webnovel/projection_log.jsonl` 记录投影执行状态（done/skipped/failed），用于定位"哪一路没同步"——这是 LinYi 可以直接借鉴的"可观测派生层"设计。

### 3. Strand Weave 三线交织节奏系统

`references/shared/strand-weave-pattern.md` 把网文节奏量化为 Quest / Fire / Constellation 三线（55-65% / 20-30% / 10-20%），并定义硬规则：
- Quest 不连续超过 5 章；Fire 不超过 10 章不出现；Constellation 不超过 15 章不出现。
- `state.json` 的 `strand_tracker` 结构持久化 `last_quest_chapter / last_fire_chapter / last_constellation_chapter / current_dominant / chapters_since_switch / history`，每章 `update_state.py` 自动更新。
- 前 30 章有现成织网模板，作为初始化阶段的章纲生成锚点。

### 4. 追读力系统（Hook / Cool-point / 微兑现 / 债务追踪）

- `references/shared/cool-points-guide.md` 把爽点工程化为六种执行模式 + 30/40/30 三段式结构 + 压扬比例控制 + 升级三维度。
- `references/genre-profiles.md` 为每个题材定义 `hook_config / coolpoint_config / micropayoff_config / pacing_config / override_config` 五组配置（如爽文 `combo_interval=5, milestone_interval=10`）。
- `index_manager.py` 的 `chase_debt` + `debt_events` + `chapter_reading_power` 三张 SQLite 表实现"债务产生 / 偿还 / 利息"的滚动账本。
- v5.3 引入追读力系统后，`override_contracts` 表专门记录违背软建议时的 Override 决策（带理由），可供 ContinuityAuditor 复用。

### 5. 37 题材模板 + 8 CSV 知识表 + 裁决规则三层

- `templates/genres/*.md`：37 个题材模板，结构统一（核心卖点 / 流派细分 / 世界观 / 机缘获取 / 战力体系 / 大纲结构 / 实体标签）。每个模板自带实体 XML schema，可直接喂给 Data Agent。
- `references/csv/`：8 张知识表（人设与关系、写作技法、命名规则、场景写法、桥段套路、爽点与节奏、金手指与设定、题材与调性推理）+ `裁决规则.csv`。
- `story_system_engine.py:395 _load_reasoning` + `_apply_reasoning` + `_rank_anti_patterns` 实现三层裁决：题材路由 → 检索召回 → 冲突裁决优先级排序。`冲突裁决` 字段用 `>` 分隔优先级链，`毒点权重` 控制反模式排序——这是把"网文经验"工程化为可执行规则的最完整样本。

## 可直接复用的设计

### A. 合同分层与 override_policy 三段式

`story_contract_schema.py:17 OverrideBundle`（`locked / append_only / override_allowed`）+ `story_contracts.py:90 merge_contract_layers` 这套合并语义可直接搬到 LinYi 的 WorldStateContract。LinYi 的"硬约束 / 软建议 / 可覆盖"三层完全对应。文件级落地建议：LinYi `WorldStateContract` Pydantic/TS schema 直接复刻 `OverrideBundle`，再加项目级字段。

### B. Strand Weave Tracker 数据结构与阈值

`references/shared/strand-weave-pattern.md` 中的 `strand_tracker` JSON 结构（含 `history[].dominant` 兼容映射）和"5/10/15 章警告阈值"是即开即用的。LinYi 的 `PacingTracker` 可以直接照抄字段名，再在 `StrandRuleEngine` 里实现 4 条 if-else 警告（Quest 连续 / Fire 断档 / Constellation 断档 / 切换未更新）。

### C. 37 题材模板 + 题材路由 CSV

`templates/genres/` 37 个题材文件本身就是 LinYi 题材模板库的天然起点。`story_system_engine.py:164 _route` 中的题材路由算法（关键词命中 → 显式题材 fallback → 文本推断 fallback → 报错）可整体改写为 LinYi 的 `GenreRouter`。`题材与调性推理.csv` 的列设计（关键词 / 意图与同义词 / 题材别名 / 推荐基础检索表 / 推荐动态检索表 / 核心调性 / 节奏策略 / 毒点）是 LinYi 题材知识表的字段模板。

### D. 章节事实提交 Schema（CHAPTER_COMMIT）

`chapter_commit_schema.py` 的 `ExtractionResult`（accepted_events / state_deltas / entity_deltas / entities_appeared / scenes / chapter_meta / dominant_strand / summary_text）+ `FulfillmentResult`（planned_nodes / covered_nodes / missed_nodes / extra_nodes）+ `EVENT_TYPE_ALIASES`（35 个事件类型别名归一化）是 LinYi `ChapterCommit` schema 的现成参考。`AcceptedEventInput.normalize_aliases` 的 alias 归一化逻辑值得直接复刻——网文写作中"突破/突破境界/power_up"这类同义事件必须归一才能查重。

### E. Anti-AI 写作指南与替代方案速查表

`skills/webnovel-write/references/anti-ai-guide.md` 列出 LLM 写作的 8 大固有倾向（每段写完整闭环 / 用副词修饰一切 / 全员同一反应 / 对话像辩论赛 / 情绪贴标签 / 信息均匀分布 / 安全着陆 / 展示后解释）+ 5 个即时检查 + 替代方案速查表（10 条 AI 癖好 → 替代方向 → 示例）。`style-adapter.md` 进一步把"分题材风格加权"（玄幻/修仙动作比重更高；都市信息节奏更快；言情情绪弧线前置；悬疑线索投放要可回收）做成可执行硬约束。这两份文档可整体迁移到 LinYi 的 `去 AI 味规则库`。

### F. 伏笔三层级与紧急度公式

`skills/webnovel-query/references/advanced/foreshadowing.md` 的核心/支线/装饰三层级 + 回收周期 + 权重 + `紧急度 = (已过章节 / 目标章节) × 层级权重` 公式 + 🔴/🟡/🟢 状态判定 + "同时进行不超过 5 条"约束，是 LinYi Foreshadowing Tracker 的最小可用模型。

## 需要改造才能借鉴的部分

### 1. Python + Claude Code Skill 强耦合 → LinYi TS 架构

Webnovel Writer 用 Python CLI + Claude Code Skill 协议，Skill 通过 `SKILL.md` 描述触发。LinYi 用 TypeScript + 自有引擎，需要把 `SKILL.md` 的指令块改写成 TS 中的 prompt template，把 `references/` Markdown 改成可通过 RAG 检索的知识库。`scripts/webnovel.py` CLI 入口设计可以保留，但底层 `data_modules/` 的 Python 类需要 TS 重写——`story_system_engine.py` 的 CSV 检索 + 三层路由算法可作算法参考，不能直接调用。

### 2. CSV 知识表 → 结构化数据源

`references/csv/` 8 张 CSV 表是给非程序员作者手改设计的（Excel 友好）。LinYi 若采用 SQLite 单一真源（参见 ai-novel-factory 笔记），需把 CSV 内容迁移到 SQLite 的 `genre_rules / pacing_rules / anti_patterns` 表，并把 `story_system_engine.py` 的 `_collect_tables` + `_apply_reasoning` 改写为 SQL 查询。代价是失去"作者手改 Excel"的便利，收益是事务一致性。

### 3. `.story-system/` 多 JSON 文件 → 单一真源

Webnovel Writer 在 `.story-system/` 下维护 `MASTER_SETTING.json` / `anti_patterns.json` / `chapters/chapter_XXX.json` / `volumes/volume_XXX.json` / `reviews/chapter_XXX.review.json` / `commits/chapter_XXX.commit.json` / `events/chapter_XXX.events.json` 七类 JSON。多文件好处是每章独立可审计，但坏处是跨章查询需要 join。LinYi 倾向 SQLite 单一真源，可以把这些 JSON 的内容映射为 SQLite 表（`master_settings / chapter_briefs / volume_briefs / review_contracts / chapter_commits / story_events`），文件 JSON 只作为导出/审计快照。

### 4. Strand Weave 阈值硬编码 → 题材感知配置

`strand-weave-pattern.md` 的 5/10/15 章阈值是全题材通用值。`genre-profiles.md` 里其实有 `strand_quest_max / strand_fire_gap_max / transition_max_consecutive` 题材级配置，但 `strand-weave-pattern.md` 没读取。LinYi 应让 `PacingRuleEngine` 在每章 brief 时读取当前题材的 `pacing_config`，动态决定阈值。

### 5. v7 草案尚未落地

`docs/architecture/story-repo-spec-2026-06-10.md` 描述的 v7 "git-based story repo"（`定稿/` `大纲/` `文风/` `工作区/` 四伞目录 + 承诺每条一文件 + 决策卡 + 修复卡 + 盘面状态机）目前只是 RFC 0.4，代码尚未实现。LinYi 可以借鉴这套心智模型设计自己的目录结构，但不要直接抄 v6 的 `.story-system/` 多 JSON 落地——v7 才是作者友好的最终形态。

## 潜在风险

- **Python ↔ TS 跨语言重写成本**：`story_system_engine.py`（601 行）+ `chapter_commit_schema.py`（278 行）+ `sql_state_manager.py` 等核心模块加起来 3000+ 行 Python，全部 TS 重写需要 2-3 周人力。建议优先重写 `story_system_engine` + `chapter_commit_schema`，其他模块按需取算法。
- **37 题材模板版权与质量**：模板由社区贡献，质量参差。`多子多福.md` `知乎短篇.md` 等小众题材可能字段缺失或与主结构不一致。LinYi 引入前需逐文件 review + 补全。
- **CSV 知识表演化风险**：8 张 CSV 之间有隐含依赖（`裁决规则.csv` 引用 `题材与调性推理.csv` 的题材别名），改一张要同步多张。LinYi 若迁到 SQLite 必须显式定义外键。
- **Dashboard 前端打包后维护性**：`dashboard/frontend/` 是 React + Vite 预打包产物，跟着插件发，本地不跑 npm build。LinYi 若复用 Dashboard 思路，应改为按需静态简报（v7 §13 已建议"Dashboard 改为按需静态简报，只读 story repo"）。
- **`.story-system/` 多文件 vs v7 单一 git repo 的演化阵痛**：项目自己也在重构中，LinYi 直接借鉴会面临"抄 v6 还是等 v7"的两难。建议借鉴 v7 的设计心智（承诺每条一文件、决策卡、盘面状态机），落地用 v6 的工程实现。

## 架构对照信息（供 architecture_compare.md 使用）

- **模块拆分方式**：Skill（用户接口层）+ Agent（业务执行层：context/reviewer/data/deconstruction）+ scripts（数据层：contracts/runtime/commit/projection/index/memory）。每个 Skill 自带 `references/` 提示词库，`shared/` 是单一事实源禁止复制。
- **事件/数据流**：用户 → Skill → Agent → `.story-system/` 合同与提交链 → accepted CHAPTER_COMMIT → 5 路投影（state / index / summary / memory / vector）→ Dashboard 只读视图。`projection_log.jsonl` 是观测点。
- **状态管理**：MASTER_SETTING 顶层 + 章节级 chapter_brief + commit 派生 view。`override_policy` 三段式（locked / append_only / override_allowed）+ `OverrideBundle` Pydantic 校验。`state.json` 的 `strand_tracker / chase_debt / chapter_reading_power` 是滚动状态。
- **提示词组织**：`SKILL.md` 是入口；`references/` 按需加载（context-minimal-writing-flow-plan 主张最小化加载）；`shared/` 单一事实源；`templates/genres/` 37 题材模板；`csv/` 8 张知识表。提示词遵循"指令块 + 上下文 + 示例 + 错误"四段式 Markdown front matter。
- **错误处理**：`blocking_count > 0` 阻断 Step 4；`severity=critical` 自动 blocking；`preflight` 预检 + `doctor` 体检 + `write-gate` 三层关卡。重复执行 `/webnovel-write` 时先检查可信断点，从失败点继续。`hooks/guard_runtime_write.py` 守护运行时写权限。
- **性能优化**：`index.db` SQLite + 可选 `vectors.db` 向量索引；`auto/graph_hybrid` 检索回退 BM25；`memory_compactor.py` + `budget.py` 控制长期记忆体量；`migrate_state_to_sqlite.py` 把 state.json 大数据迁到 SQLite。
- **扩展机制**：新增题材 = 在 `templates/genres/` 加 md + 在 `题材与调性推理.csv` 加行 + 在 `裁决规则.csv` 加裁决优先级 + 在 `genre-profiles.md` 加 profile。Skill 通过 `references/` Markdown 加载新规则。`hooks.json` + `session_start.py` 支持插件级 hook。

## 借鉴点映射（供 borrow_matrix.md 使用）

参考 §14.4 借鉴矩阵，Webnovel Writer 作为主/辅参考能覆盖的借鉴点：

| §14.4 借鉴点 | 主/辅 | 关键文件 / 行号 |
|---|---|---|
| Story Bible 真源 | **主参考** | `scripts/data_modules/story_contract_schema.py:23-58`（MasterSetting/VolumeBrief/ReviewContract Pydantic）；`story_contracts.py:90 merge_contract_layers`；`.story-system/MASTER_SETTING.json` + `chapter_XXX.commit.json` |
| Strand Weave 节奏 | **主参考** | `references/shared/strand-weave-pattern.md`（三线 60/20/20 + 5/10/15 阈值 + 前 30 章织网模板 + strand_tracker schema） |
| ContinuityAuditor 六维 | 辅助参考 | `references/review-schema.md`（Issue Schema: severity/category/location/description/evidence/fix_hint/blocking）；`chapter_commit_schema.py:117 FulfillmentResult`（planned/covered/missed/extra_nodes） |
| 去 AI 味规则 | 辅助参考 | `skills/webnovel-write/references/anti-ai-guide.md`（8 大倾向 + 5 即时检查 + 10 条替代速查）；`style-adapter.md`（分题材风格加权 + AI 痕迹快速替换） |
| 滚动规划 | 辅助参考 | `scripts/data_modules/runtime_contract_builder.py:14-48`（每章 rebuild volume_brief + review_contract）；`update_master_outline.py` |
| 单一真源 | 辅助参考 | `.story-system/` 多 JSON 真源 + `.webnovel/` 派生视图分层；可对照 LinYi SQLite 方案做"多 JSON vs 单 SQLite"权衡 |
| 文风指纹 | 辅助参考 | v7 §6 `文风/风格宪法.md` + `金句库/`（diff 草稿与终稿超阈值自动收割 few-shot）；`scripts/data_modules/style_sampler.py`；v6 仅部分实现，v7 才完整 |
| 题材模板 | **主参考** | `templates/genres/*.md`（37 题材）；`references/genre-profiles.md`（hook/coolpoint/micropayoff/pacing/override 五组配置）；`references/csv/题材与调性推理.csv` |
| Foreshadowing Tracker | 辅助参考 | `skills/webnovel-query/references/advanced/foreshadowing.md`（核心/支线/装饰三层 + 紧急度公式 + 🔴🟡🟢 状态）；`index_manager.py` chase_debt 表 |
| 显式叙事结构 | 辅助参考 | v7 §4 章节文件 front matter（章号/标题/卷/视角/书内时间/开启承诺/推进承诺/兑付承诺/合同）；v6 部分实现 |
| 多 Agent 流水线 | 辅助参考 | 4 个 Agent（context-agent / reviewer / data-agent / deconstruction-agent）；`/webnovel-write` 9 步流水线（preflight → runtime contract → context-agent → draft → reviewer → polish → data-agent → commit → backup） |

**未覆盖的借鉴点**（Webnovel Writer 不擅长）：雪花写作法提示词（参考 AI_NovelGenerator）；风格迁移外部语料（参考 NovelDreamer）；Director/Worker 协作（参考 ai-novel-factory）。
