# AI_NovelGenerator_YILING 技术笔记

## 项目概述

- **主语言 / 技术栈**：Python 3.9+（推荐 3.10–3.12），GUI 使用 `customtkinter`（PyQt 系），LLM 适配层依赖 `langchain-openai` / `langchain-chroma` / `google-genai` / `azure-ai-inference`，向量库使用 Chroma。完整依赖见 `/workspace/docs/refs/AI_NovelGenerator_YILING/requirements.txt`。
- **定位**：基于雪花写作法的中文长篇小说 GUI 创作工具，面向个人作者。
- **核心目标**：通过雪花写作法的多阶段结构化流程 + 向量检索 + 角色状态追踪 + 一致性审校，让 LLM 生成逻辑严谨、设定统一的长篇故事。
- **仓库结构**（核心约 3961 行）：
  - `main.py`（12 行）— 入口，启动 `customtkinter` GUI。
  - `prompt_definitions.py`（671 行）— **集中提示词库**，含雪花 4 步、章纲、章节正文、角色状态、知识库过滤等 9 类提示词。
  - `consistency_checker.py`（71 行）— 一致性检查单点工具。
  - `chapter_directory_parser.py`（159 行）— 鲁棒的章节蓝图文本解析器（中英文 + Markdown / Box-drawing 前缀）。
  - `config_manager.py`（317 行）— 多 LLM/Embedding 配置管理与任务路由。
  - `llm_adapters.py`（428 行）— 11 种 LLM 后端适配器（OpenAI / DeepSeek / Gemini / Azure / Ollama / MLStudio / Volcano / SiliconFlow / Grok 等）。
  - `embedding_adapters.py`（307 行）— Embedding 适配器（OpenAI / Azure / Gemini / Ollama）。
  - `novel_generator/` 子包 — 核心生成逻辑：
    - `architecture.py`（202 行）— 雪花 4 步架构生成 + `partial_architecture.json` 断点恢复。
    - `blueprint.py`（179 行）— 章节蓝图分块生成 + 续传。
    - `chapter.py`（599 行）— 章节草稿生成（含摘要 / 检索 / 过滤 / 写作）。
    - `finalization.py`（143 行）— 定稿 + 扩写 + 向量库更新。
    - `common.py`（84 行）— `call_with_retry` / `invoke_with_cleaning` / `remove_think_tags`。
    - `knowledge.py`（90 行）— 知识库文件导入。
    - `vectorstore_utils.py`（245 行）— Chroma 向量库初始化 / 更新 / 检索 / 切分。
    - `text_utils.py`（36 行）— 中文句切分。
  - `ui/` 子包 — PyQt/customtkinter GUI 组件（LinYi 不需借鉴）。
- **维护状态**：作者在 `README_zh-CN.md:5-9` 明确表示当前版本无精力维护，重构版将在 dev 分支开发，截至 2026/03/25 仅有大体框架。

## 核心创新点

1. **雪花写作法 4 步流水线 + 断点恢复**（`novel_generator/architecture.py:49-202`，`prompt_definitions.py:160-264`）。四步对应雪花写作法第 1–4 层：核心种子（`core_seed_prompt`，单句公式 "当[主角]遭遇[核心事件]..."）→ 角色动力学（`character_dynamics_prompt`，含表面/深层/灵魂需求三角与角色弧线 5 阶段）→ 世界构建矩阵（`world_building_prompt`，物理/社会/隐喻三维交织）→ 三幕式情节（`plot_architecture_prompt`，含触发/对抗/解决三幕 + 每幕 3 个转折点 + 伏笔回收方案）。每步独立 LLM 调用并写入 `partial_architecture.json`，失败时下次自动从断点续传（`architecture.py:22-47, 90-105`）。
2. **章纲悬念密度 / 伏笔 / 认知颠覆结构化标注**（`prompt_definitions.py:266-309`，`chapter_directory_parser.py:14-21`）。每章固定 6 字段元数据：`chapter_role`（本章定位）、`chapter_purpose`（核心作用）、`suspense_level`（悬念密度：紧凑/渐进/爆发）、`foreshadowing`（伏笔操作：埋设→强化→回收）、`plot_twist_level`（认知颠覆强度，1–5 星）、`chapter_summary`（一句话简述）。`chapter_directory_parser.py` 还支持中英文别名、Box-drawing 前缀（`├──`/`└──`/`│`）、Markdown 标题、引号包裹等鲁棒解析。
3. **章节蓝图分块生成 + 续传**（`novel_generator/blueprint.py:20-35, 50-179`）。`compute_chunk_size()` 基于 `max_tokens / 200` 自适应分块；`limit_chapter_blueprint()` 仅保留最近 100 章目录避免 prompt 超长；检测已有 `Novel_directory.txt` 中的最大章号，自动从下一章续传；两套提示词 `chapter_blueprint_prompt`（一次性）与 `chunked_chapter_blueprint_prompt`（分块续传）配合使用。
4. **角色状态 5 维树 + 增量更新**（`prompt_definitions.py:379-488`，`novel_generator/finalization.py:87-91`）。角色状态用树形结构表示：物品 / 能力 / 状态（身体+心理）/ 主要角色间关系网 / 触发或加深的事件。`update_character_state_prompt` 在每章定稿时基于章节文本对已有状态做增量增删，淡出角色可删除。
5. **知识库三级过滤 + 历史章节相似度规则**（`prompt_definitions.py:112-158`，`novel_generator/chapter.py:176-216`）。`knowledge_filter_prompt` 三级流程：冲突检测（删除与已有摘要重复 >40% 的内容，`▲` 标记世界观矛盾）→ 价值评估（`❗` 关键价值点 / `·` 次级价值点）→ 结构重组（按"情节燃料/人物维度/世界碎片/叙事技法"分类）。`apply_content_rules` 按章节时间距离分级：≤2 章 `[SKIP]`、3–5 章 `[MOD40%]`、>5 章 `[OK]` 可引用核心。
6. **场景类型写作模板**（`prompt_definitions.py:513-531`）。4 类场景写作指导：对话场景（潜台词冲突 + 权力关系变化）/ 动作场景（3 个感官描写 + 短句加速+比喻减速）/ 心理场景（认知失调行为矛盾 + 隐喻系统 + 价值天平）/ 环境场景（宏观→微观→异常焦点 + 非常规感官组合 + 动态环境映射心理）。
7. **多 LLM 任务路由**（`config_manager.py:16-22, 112-118`）。5 种任务角色独立配置模型：`architecture_llm` / `chapter_outline_llm` / `prompt_draft_llm` / `final_chapter_llm` / `consistency_review_llm`。例如架构用 Gemini 3.5 Flash、定稿用 DeepSeek V4 Pro、审校用 DeepSeek V4 Flash——不同任务用不同模型性价比组合。

## 可直接复用的设计

1. **雪花写作法提示词组**（`prompt_definitions.py:161-264`）：4 个提示词 `core_seed_prompt` / `character_dynamics_prompt` / `world_building_prompt` / `plot_architecture_prompt` 可直接映射到 LinYi `Planner` 的雪花写作法模块。其"单句公式""角色弧光 5 阶段""三维交织世界""三幕伏笔回收"等模板成熟可用。
2. **章纲 6 字段元数据格式**（`prompt_definitions.py:266-309`）：直接成为 LinYi `PlanCompass` 的目标产物，每章一个 6 字段结构化对象，便于后续 Strand Weave 与 ContinuityAuditor 引用。
3. **`chapter_directory_parser.py`**（全文 159 行）：鲁棒解析中英文章节标题、字段别名、Markdown / Box-drawing 前缀、引号包裹——可作为 LinYi 解析任意 LLM 输出的章纲文本的通用工具。
4. **`partial_architecture.json` 断点恢复模式**（`architecture.py:22-47`）：阶段性 JSON 持久化 + 失败时跳过已完成步骤，可被 LinYi 任何多步生成流程（雪花 / Blueprint / 章节）借鉴。
5. **角色状态 5 维树 + 增量更新提示词**（`prompt_definitions.py:379-488`，`finalization.py:87-91`）：直接对应 LinYi 的 OC（人物投影）状态机。
6. **`knowledge_filter_prompt` 三级过滤**（`prompt_definitions.py:112-158`）：可直接成为 LinYi `ContinuityAuditor` 六维中的"重复检测"维与"价值评估"维。
7. **多 LLM 任务路由 config 模式**（`config_manager.py:112-118`）：5 种任务独立指定模型——直接映射 LinYi `LLMService` 的多模型路由表。
8. **4 类场景模板**（`prompt_definitions.py:513-531`）：对话 / 动作 / 心理 / 环境 4 类场景写作指导可作为 LinYi 章节生成器的可选预设。
9. **`apply_content_rules` 时间距离规则**（`chapter.py:176-216`）：距离驱动的引用强度策略——可被 LinYi 滚动规划器直接采用，避免近章重复。
10. **蓝图分块算法**（`blueprint.py:20-35, 50-179`）：`chunk_size` 自适应 + `limit_chapter_blueprint` 取最近 100 章 + 续传——可被 LinYi 滚动规划直接借鉴。
11. **`invoke_with_cleaning` 清洗重试**（`common.py:61-84`）：移除 `<think>...</think>` 标签与 ` ``` ` 标记 + 空内容重试机制，可被 LinYi LLMService 直接复用。
12. **`call_with_retry` 通用重试 + fallback_return**（`common.py:18-38`）：带 `fallback_return` 的重试封装，可被 LinYi 任何外部调用采用。

## 需要改造才能借鉴的部分

1. **PyQt/customtkinter GUI 不需借鉴**：`ui/` 整个目录（`chapters_tab.py`、`main_window.py`、`generation_handlers.py` 等）与 LinYi 架构无关，只用其 lib 层（`novel_generator/` 子包 + 顶层 `*.py`）。
2. **通俗网文提示词与林逸"严肃文学"张力**：`prompt_definitions.py` 部分提示词偏向通俗网文节奏（如"认知过山车""灵魂黑夜"等），与林逸"严肃文学"自我叙事存在张力（与 §14.3.7 警告一致）。需要在 `IdentityCore` 中保留自由发挥空间，提示词做混合使用而非全盘照搬。
3. **`consistency_checker.py` 仅单维 LLM 审校**：71 行单文件、单次 LLM 调用（`CONSISTENCY_PROMPT`），无六维分解。需要扩展为 LinYi `ContinuityAuditor` 六维（时间线 / 空间 / 角色 / 道具 / 关系 / 风格），可借用其 `plot_arcs`（未解决冲突）参数设计。
4. **向量库依赖 Chroma**（`vectorstore_utils.py` 全文）：LinYi 初期不引入 Chroma，建议改为基于 JSON + 轻量级 embedding 的检索，或先用 LinYi 现有 `MemoryService` 替代。
5. **状态全部存为散 txt 文件**：`character_state.txt` / `global_summary.txt` / `Novel_architecture.txt` / `Novel_directory.txt` / `chapter_X.txt` / `outline_X.txt` / `plot_arcs.txt` 散落在 `filepath` 下——LinYi 应收敛为单一真源（JSON 或 SQLite，参考 §14.3.5 AI Novel Factory 模式）。
6. **`invoke_with_cleaning` 与 LinYi LLMService 双层重试冲突**：YILING 在 `common.py` 已有 3 次重试，若 LinYi LLMService 也实现重试会导致双层重试。需要在适配层关闭其中一层。
7. **`scene_location` / `characters_involved` / `key_items` 等字段手工输入**：YILING GUI 让用户手工填写，LinYi 应由 Planner 自动从 Story Bible 生成而非手工填写。
8. **雪花法过度结构化风险**：雪花法结构化程度高（4 步 + 6 字段 + 5 维树 + 4 类场景），过度依赖会让小说过于工整——需要在 `IdentityCore` 保留随机种子与自由发挥空间。

## 潜在风险

1. **维护活跃度低**：作者明确表示无精力维护（`README_zh-CN.md:5-9`），重构版尚未发布，需自维护补丁。
2. **复杂度高**：3961 行核心代码 + 11 种 LLM 适配器，LinYi 只需核心提示词与雪花流程，可大幅裁剪。
3. **依赖 langchain-chroma**：引入向量库会增加部署复杂度，LinYi 应评估是否真需要。
4. **`config.example.json` 中模型名虚构**：示例配置中的 `deepseek-v4-flash`、`gemini-3.5-flash`、`gpt-5.5` 等模型名是面向未来版本的占位符，实际可用模型需用户自填。
5. **雪花法过度结构化**：见上文 §"需要改造才能借鉴的部分" 第 8 条。
6. **章节正文提示词较长**（`next_chapter_draft_prompt` 约 90 行，`prompt_definitions.py:540-624`）：注入字段多达 25 个，单次调用 token 成本高，LinYi 需评估是否裁剪。
7. **`logging` 全局 `basicConfig` 散落各文件**：每个 `novel_generator/*.py` 都重复调用 `logging.basicConfig(filename='app.log')`，存在配置覆盖风险，LinYi 应集中日志配置。

## 架构对照信息（供 architecture_compare.md 使用）

- **模块拆分方式**：lib/ui 分层。lib 层再分 `architecture` / `blueprint` / `chapter` / `finalization` / `knowledge` / `vectorstore` 子模块。适配器（`llm_adapters` / `embedding_adapters`）与配置（`config_manager`）独立顶层文件。提示词集中在 `prompt_definitions.py`。
- **事件/数据流**：架构雪花 4 步（`Novel_architecture_generate`）→ 章节蓝图分块（`Chapter_blueprint_generate`）→ 章节生成（`build_chapter_prompt` → `summarize_recent_chapters` → `knowledge_search` → 向量检索 → `knowledge_filter` → `next_chapter_draft_prompt` → `generate_chapter_draft`）→ 定稿（`finalize_chapter`：更新 `global_summary.txt` + `character_state.txt` + 向量库）→ 可选一致性审校（`consistency_checker.check_consistency`）。
- **状态管理**：txt 散文件（`Novel_architecture.txt` / `Novel_directory.txt` / `global_summary.txt` / `character_state.txt` / `chapter_X.txt` / `outline_X.txt` / `plot_arcs.txt`）+ `partial_architecture.json` 断点恢复 + Chroma 持久化向量库（`vectorstore/` 目录）。无内存态缓存，每次都从文件读取。
- **提示词组织**：`prompt_definitions.py` 集中管理，含 9 类提示词常量：雪花 4 步（`core_seed` / `character_dynamics` / `world_building` / `plot_architecture`）、章纲（`chapter_blueprint` + `chunked_chapter_blueprint`）、摘要（`summarize_recent_chapters` / `summary_prompt`）、角色状态（`create_character_state` / `update_character_state`）、章节正文（`first_chapter_draft` / `next_chapter_draft`）、知识库（`knowledge_search` / `knowledge_filter`）、扩写（`enrich`）、角色导入（`Character_Import_Prompt`）。另有 `prompt_definitions_en.py` 英文版本。
- **错误处理**：`call_with_retry` 通用重试 + `invoke_with_cleaning` LLM 清洗重试 + `partial_architecture.json` 阶段性断点恢复 + 多处 `try/except` 吞异常并返回空字符串/默认值。`log_llm_io` 默认只记录长度，避免泄露用户素材。
- **性能优化**：分块生成避免 prompt 超长 + LLM 任务路由（不同任务用不同模型）+ 限制摘要 2000 字 + 限制检索片段 2000 字 + `limit_chapter_blueprint` 取最近 100 章 + `apply_content_rules` 跳过近章内容。无并发调用。
- **扩展机制**：添加新 LLM 后端仅需扩展 `llm_adapters.py` 的 `create_llm_adapter` 工厂；添加新提示词在 `prompt_definitions.py` 中追加常量；添加新章节字段需同步修改 `chapter_directory_parser._FIELD_ALIASES`。

## 借鉴点映射（供 borrow_matrix.md 使用）

参考 §14.4 借鉴矩阵：

| §14.4 借鉴点 | 覆盖情况 | 来源位置 |
|---|---|---|
| 雪花写作法提示词 | ✅ 完整覆盖 4 步 | `prompt_definitions.py:160-264` |
| 显式叙事结构 | ✅ 三幕式情节 + 章节悬念密度 | `prompt_definitions.py:236-309` |
| 滚动规划 | ✅ `chapter_summaries` 滚动 + 蓝图分块续传 | `chapter.py:42-114`、`blueprint.py:50-179` |
| ContinuityAuditor 六维 | △ 部分覆盖（`consistency_checker` 单维 + `knowledge_filter_prompt` 重复检测） | `consistency_checker.py:7-25`、`prompt_definitions.py:112-158` |
| 去 AI 味规则 | △ 部分覆盖（4 类场景模板） | `prompt_definitions.py:513-531` |
| Story Bible 真源 | △ 部分覆盖（`Novel_architecture.txt` / `character_state.txt` / `global_summary.txt` 但分散为散文件） | `architecture.py:181-196`、`finalization.py:79-96` |
| 题材模板 | △ 部分覆盖（`genre` 字段贯穿全流程，无独立模板库） | `prompt_definitions.py:161-177` |
| Foreshadowing Tracker | △ 部分覆盖（`foreshadowing` 字段"埋设→强化→回收"标注） | `prompt_definitions.py:283, 299` |
| 多 Agent 流水线 | △ 部分覆盖（5 种 LLM 任务路由，但无显式 Agent 协作） | `config_manager.py:16-22, 112-118` |
| 单一真源（SQLite/JSON） | ❌ 散 txt 文件 | — |
| 文风指纹 | ❌ 无 | — |
| Director/Worker 协作 | ❌ 无 | — |
| 风格迁移（外部语料） | ❌ 无（向量化知识库 ≠ 风格迁移） | — |

**LinYi 最应优先借鉴的四项**：(1) 雪花 4 步提示词组；(2) 章纲 6 字段元数据（直接成为 PlanCompass 产物）；(3) `chapter_directory_parser.py` 鲁棒解析器；(4) 多 LLM 任务路由 config 模式。需重点改造的两项：(1) 散 txt 状态收敛为单一真源；(2) `consistency_checker` 单维扩展为六维 ContinuityAuditor。
