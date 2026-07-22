# Tasks

> 任务严格对齐 [docs/系统重构方案_v1.md](file:///workspace/docs/系统重构方案_v1.md) §9 的五阶段 + 强制前置学习阶段。阶段间存在依赖，阶段内任务尽量并行。

## 阶段 0：前置学习理解阶段（强制门槛）

- [x] Task 0.1: 克隆 7 个参考项目源码至 `docs/refs/`（保留完整历史 `--depth 0`）
  - [x] SubTask 0.1.1: 克隆 ainovel-cli 至 `docs/refs/ainovel-cli/`
  - [x] SubTask 0.1.2: 克隆 InkOS 至 `docs/refs/inkos/`
  - [x] SubTask 0.1.3: 克隆 NovelPilot 至 `docs/refs/novelpilot/`
  - [x] SubTask 0.1.4: 克隆 Webnovel Writer 至 `docs/refs/webnovel-writer/`
  - [x] SubTask 0.1.5: 克隆 AI Novel Factory 至 `docs/refs/ai-novel-factory/`
  - [x] SubTask 0.1.6: 克隆 NovelDreamer 至 `docs/refs/NovelDreamer/`
  - [x] SubTask 0.1.7: 克隆 AI_NovelGenerator_YILING 至 `docs/refs/AI_NovelGenerator_YILING/`
- [x] Task 0.2: 通读每个项目的核心模块（入口/构建脚本、模块拆分、数据模型、提示词模板、状态持久化、审计/质量模块、事件/消息流）
- [x] Task 0.3: 产出 `docs/refs/architecture_compare.md`（团队合稿，覆盖 7 维度 × 7 项目）
- [x] Task 0.4: 产出 `docs/refs/tech_notes/<project>.md`（7 份，每份 ≥ 800 字，含可借鉴/需改造/风险三段）
- [x] Task 0.5: 产出 `docs/refs/borrow_matrix.md`（借鉴点 → 参考项目/文件/行号映射，覆盖 §14.4 全部借鉴点）
- [x] Task 0.6: 产出 `docs/refs/review_notes.md`（学习评审会议纪要，含确认签字）
- [x] Task 0.7: 学习阶段验收（5 类产出物齐全 + 借鉴矩阵覆盖 100% + 至少一次评审）

## 阶段一：基础设施与真源层

- [x] Task 1.1: 设计并实现新增数据模型（`src/novelist_brain/models.py`）
  - [x] SubTask 1.1.1: 实现 `StoryBible` dataclass（含 `world_contract`、`character_registry`、`plot_compass`、`foreshadowing_ledger`、`chapter_blueprint`、`style_fingerprint`、`continuity_rules`）
  - [x] SubTask 1.1.2: 实现 `WorldStateContract` 与 `WorldRule`、`Mystery`、`HistoricalEvent`、`Faction` dataclass，提供 `to_ontology()` 方法
  - [x] SubTask 1.1.3: 实现 `OCCharacterSheet` dataclass（含 `coc_attributes`、`coc_skills`、`sanity`、`luck`、`immutable_facts`，`projection_ratio=0`）
  - [x] SubTask 1.1.4: 实现 `Chapter`、`ChapterIntent`、`Paragraph`（增强含 audit metadata）、`ChapterVersion` dataclass
  - [x] SubTask 1.1.5: 实现 `ForeshadowingEntry`、`ForeshadowingOp`、`ContinuityIssue`、`QualityReport`、`RhythmProfile`、`PlotCompass`、`StyleFingerprint`、`Relationship`、`SanitySystem`、`LuckPool`、`Condition`、`Desire`、`Fear`、`TraitVector` dataclass
  - [x] SubTask 1.1.6: 为所有新 dataclass 实现 `to_dict()` / `from_dict()` 与 `dataclass_to_dict` / `reconstruct_dataclass` 兼容
- [x] Task 1.2: 实现 `WorldStateContract` 持久化与版本化
  - [x] SubTask 1.2.1: 实现 `world_state/{novel_id}/v{N}.json` 版本快照写入
  - [x] SubTask 1.2.2: 实现 `world_state.json` 人类可读投影
  - [x] SubTask 1.2.3: 实现经验数据 → 世界映射器（Memory Trace / SocialInput / DMN / IdentityCore → geography/factions/rules/mysteries）
  - [x] SubTask 1.2.4: 实现世界演进规则（稳定规则、禁忌代价、神秘感管理、地点活化、势力变化）
- [x] Task 1.3: 实现 `OCCharacterSystem` 模块（`src/novelist_brain/oc_character_system.py`）
  - [x] SubTask 1.3.1: 实现订阅 `data.memory.trace.query.result`、`control.oc.create`、`control.oc.update`
  - [x] SubTask 1.3.2: 实现 `build_oc_sheet()`（3d6 掷点 + 技能点分配 + sanity/luck/HP/MP 初始化）
  - [x] SubTask 1.3.3: 实现世界适配检查（与 `WorldStateContract` 比对时代错位）
  - [x] SubTask 1.3.4: 实现 `immutable_facts` 锁定与 `data.oc.update.rejected` 事件
  - [x] SubTask 1.3.5: 实现 `get_sheet(id)`、`query_by_archetype()`、`query_by_relationship()` 接口
  - [x] SubTask 1.3.6: 持久化至 `oc_registry/{novel_id}.json`
- [x] Task 1.4: 改造 `MentalSandbox`（`src/novelist_brain/sandbox.py`）
  - [x] SubTask 1.4.1: 移除 `WorldModel(name="default", ontology={...})` 硬编码（sandbox.py:144-152）
  - [x] SubTask 1.4.2: `init()` 改为接收 `story_bible` 与 `world_contract`
  - [x] SubTask 1.4.3: `_create_default_scene()` 改为从 `WorldStateContract.geography` 按情节选择地点，注入时间/天气/氛围/在场角色/未回收伏笔/冲突张力
  - [x] SubTask 1.4.4: `_rebuild_character_sheets()` 改为从 `StoryBible.character_registry` 读取 OC 数据生成 `TRPGCharacterSheet`
- [x] Task 1.5: 扩展事件总线 topic 与配置
  - [x] SubTask 1.5.1: 新增 topic：`data.oc.created`、`data.oc.updated`、`data.oc.update.rejected`、`data.oc.evolved`、`data.sandbox.world.updated`、`control.oc.create`、`control.oc.update`、`control.sandbox.scenario.load`
  - [x] SubTask 1.5.2: `default.config.json` 与 `novelist.config.example.json` 新增 `story_bible_dir`、`world_state_dir`、`chapter_dir`、`oc_registry_dir`、`novel_id`
- [x] Task 1.6: 扩展 `module_registry.py` 与 `main.py`
  - [x] SubTask 1.6.1: 实现 `register_agent(name, factory)` 插件式注册接口
  - [x] SubTask 1.6.2: 在 `main.py` 注册 `OCCharacterSystem`，无需修改启动流程
- [x] Task 1.7: 核心引擎优化
  - [x] SubTask 1.7.1: `LLMService` 增加 `prompt_hash → response` 缓存（TTL=300s）
  - [x] SubTask 1.7.2: `control.sandbox.simulate` 增加幂等性 key
  - [x] SubTask 1.7.3: `persistence.py` 状态序列化改 `.tmp` + 原子 rename；启动校验 `.latest` 指向
  - [x] SubTask 1.7.4: `Module.init()` 支持可配置超时（默认 30s）
- [x] Task 1.8: 实现数据迁移脚本 `tools/migrate_state_v1_to_v2.py`
  - [x] SubTask 1.8.1: 备份旧 state 至 `agent_state.json.v1.bak`
  - [x] SubTask 1.8.2: 从旧 `world_model` 提取 ontology/rules 生成 `WorldStateContract`
  - [x] SubTask 1.8.3: 从旧 `characters` 生成 `OCCharacterSheet`（projection_ratio=0）
  - [x] SubTask 1.8.4: 将旧 `paragraphs` 整理为单卷单章 `Chapter`
  - [x] SubTask 1.8.5: 生成新 `StoryBible` 写入 `story_bible/{novel_id}.json`
  - [x] SubTask 1.8.6: 写回新 `agent_state.json` v2，校验失败保留备份
- [x] Task 1.9: 在 `main.py` 增加 `--legacy-mode` 降级入口
- [x] Task 1.10: 阶段一单元测试
  - [x] SubTask 1.10.1: `tests/test_world_state_contract.py`（初始化、规则校验、版本快照、差异计算）
  - [x] SubTask 1.10.2: `tests/test_oc_character_system.py`（创建、更新、immutable 锁定、COC 属性生成）
  - [x] SubTask 1.10.3: `tests/test_migration_v1_to_v2.py`（迁移成功 + 失败降级）
  - [x] SubTask 1.10.4: 验证启动时不再创建 `WorldModel(name="default")`

## 阶段二：连载与规划层

- [x] Task 2.1: 实现 `ChapterManager` 模块（`src/novelist_brain/chapter_manager.py`）
  - [x] SubTask 2.1.1: 实现"卷 → 章 → 段"三级数据结构与持久化（`chapters/{novel_id}/{volume_id}/{chapter_id}/`）
  - [x] SubTask 2.1.2: 订阅 `data.novel.paragraph`，按 `chapter_id` 归属段落
  - [x] SubTask 2.1.3: 章节完成触发 `event.novel.chapter.completed` / `event.novel.chapter.committed`
  - [x] SubTask 2.1.4: 实现 `control.novel.chapter.rollback` 版本回溯
  - [x] SubTask 2.1.5: 实现 `ChapterVersion` 历史与状态流转（draft → audited → revised → committed）
- [x] Task 2.2: 实现 `Planner` 模块（`src/novelist_brain/planner.py`）
  - [x] SubTask 2.2.1: 订阅 `data.sandbox.narrative.ready`，输出 `data.novel.chapter.intent`
  - [x] SubTask 2.2.2: 实现四线编织（Quest 50-70% / Fire 10-30% / Constellation 10-30% / Rest 0-20%）占比计算与阈值检查
  - [x] SubTask 2.2.3: 实现节拍曲线生成（章首 Hook → 主线推进 → 情感冲突 → 世界观揭示 → 爽点兑现 → 章末悬念）
  - [x] SubTask 2.2.4: 实现 `ForeshadowingOp`（引入/回收/强化）操作生成
  - [x] SubTask 2.2.5: 实现 `emotional_arc` 起→终情感值计算
- [x] Task 2.3: 扩展 `CreationExecutive`（`src/novelist_brain/creation_executive.py`）
  - [x] SubTask 2.3.1: 接收 `ChapterIntent + NarrativeLine + skill_checks + world_state`
  - [x] SubTask 2.3.2: 按 `scene_type`（dialogue/action/psychological/environment/transition）分支生成
  - [x] SubTask 2.3.3: 输出段落携带 `chapter_id` 与 audit metadata
- [x] Task 2.4: 新增网文节奏提示词模板（`src/novelist_brain/prompts.py`）
  - [x] SubTask 2.4.1: `build_chapter_intent_prompt`（NarrativeLine → ChapterIntent）
  - [x] SubTask 2.4.2: `build_scene_prose_prompt`（场景类型 + 骰子结果 + 节奏意图 → 文学化段落）
  - [x] SubTask 2.4.3: 四线编织检查提示词与去 AI 味规则
- [x] Task 2.5: 扩展事件总线 topic
  - [x] SubTask 2.5.1: 新增 topic：`data.novel.chapter.intent`、`control.novel.chapter.write`、`event.novel.chapter.completed`、`event.novel.chapter.committed`、`event.novel.chapter.rollback`、`control.novel.chapter.rollback`
- [x] Task 2.6: 在 `main.py` 注册 `ChapterManager` 与 `Planner`
- [x] Task 2.7: 阶段二单元测试
  - [x] SubTask 2.7.1: `tests/test_chapter_manager.py`（段落归属、版本回溯、状态流转）
  - [x] SubTask 2.7.2: `tests/test_planner.py`（NarrativeLine → ChapterIntent、四线编织占比、节拍曲线）
  - [x] SubTask 2.7.3: 验证可回退到任意章节版本

## 阶段三：COC 动态映射与推演

- [x] Task 3.1: 实现 `COCMappingEngine` 模块（`src/novelist_brain/coc_mapping_engine.py`）
  - [x] SubTask 3.1.1: 接收 `StoryBible.premise/plot_compass/chapter_blueprint`、`WorldStateContract.rules`、`character_registry`
  - [x] SubTask 3.1.2: 实现题材驱动 Rulebook 定制（克苏鲁 → 神话知识 + sanity；都市 → 社交博弈）
  - [x] SubTask 3.1.3: 实现 Campaign Arc Template（引入 → 上升 → 转折 → 高潮 → 余韵）
  - [x] SubTask 3.1.4: 实现章节级 ChapterScenario 生成（目标、关键 NPC、地点、冲突、可能的检定）
- [x] Task 3.2: 改造 `Rulebook` 支持动态加载（`src/novelist_brain/trpg_rulebook.py`）
  - [x] SubTask 3.2.1: 支持 `COCMappingEngine` 注入 skills / actions / sanity 规则
  - [x] SubTask 3.2.2: 保留默认 Rulebook 作为 fallback
- [x] Task 3.3: 改造 `CEN` 推演触发流程（`src/novelist_brain/cen.py`）
  - [x] SubTask 3.3.1: 从无目标 `control.sandbox.simulate` 改为 `control.sandbox.scenario.load {chapter_index, scenario_id}` → `control.sandbox.simulate {action, character_id}`
  - [x] SubTask 3.3.2: N-round contract 推进至 `data.sandbox.narrative.ready`
- [x] Task 3.4: 扩展 `_DEPTH_THRESHOLDS`（`src/novelist_brain/trpg.py`）
  - [x] SubTask 3.4.1: 新增 `hook_strength=0.4`、`foreshadowing_progress=0.3`、`scene_variety=0.4`
  - [x] SubTask 3.4.2: 保留 `_DEFAULT_MIN_ROUNDS=3`、`_DEFAULT_MAX_ROUNDS=7`
- [x] Task 3.5: 改造 `_narrate()` 与 `CreationExecutive` 文学化（`src/novelist_brain/trpg.py`）
  - [x] SubTask 3.5.1: `_narrate()` 输出含骰子结果的情绪化描述
  - [x] SubTask 3.5.2: `CreationExecutive` 使用 `build_scene_prose_prompt` 将判定转化为人物动作/环境反应/内心波动
- [x] Task 3.6: 阶段三单元测试
  - [x] SubTask 3.6.1: `tests/test_coc_mapping_engine.py`（不同题材 → 不同 Rulebook）
  - [x] SubTask 3.6.2: `tests/test_scenario_driven_simulation.py`（scenario.load → simulate → narrative.ready）
  - [x] SubTask 3.6.3: 验证推演结果能转化为自然的小说段落

## 阶段四：审计与质量闭环

- [x] Task 4.1: 实现 `ContinuityAuditor` 模块（`src/novelist_brain/continuity_auditor.py`）
  - [x] SubTask 4.1.1: 订阅 `event.novel.paragraph.published` 与 `control.novel.audit`
  - [x] SubTask 4.1.2: 实现 OOC 审计（行为 vs `OCCharacterSheet.traits`）
  - [x] SubTask 4.1.3: 实现设定冲突审计（vs `WorldStateContract.rules`/`forbidden`）
  - [x] SubTask 4.1.4: 实现时间线审计（事件顺序矛盾）
  - [x] SubTask 4.1.5: 实现伏笔审计（引入未回收 / 提前兑现 / 回收计划缺失）
  - [x] SubTask 4.1.6: 实现文风审计（vs `StyleFingerprint`）
  - [x] SubTask 4.1.7: 实现节奏审计（章内 Hook / 高潮缺失）
  - [x] SubTask 4.1.8: 输出 `ContinuityIssue {category, severity, evidence, suggested_fix}`
- [x] Task 4.2: 实现 `QualityEngine` 模块（`src/novelist_brain/quality_engine.py`）
  - [x] SubTask 4.2.1: 订阅审计 issues，按 severity 分流
  - [x] SubTask 4.2.2: 实现 low-risk 自动修正：生成修订提示 → `control.novel.revision.required` → CreationExecutive 重写 → `data.novel.revision.applied`
  - [x] SubTask 4.2.3: 实现 critical 人工标记：`control.novel.revision.human_required`
  - [x] SubTask 4.2.4: 输出 `data.novel.quality.report` 与 `data.novel.quality.score`（0-1）
  - [x] SubTask 4.2.5: 将审计结果反馈到 Story Bible 与 OC Registry（`data.oc.evolved` / `data.sandbox.world.updated`）
- [x] Task 4.3: 扩展事件总线 topic
  - [x] SubTask 4.3.1: 新增 topic：`control.novel.audit`、`data.novel.quality.report`、`control.novel.revision.required`、`control.novel.revision.human_required`、`data.novel.revision.applied`
- [x] Task 4.4: 在 `main.py` 注册 `ContinuityAuditor` 与 `QualityEngine`
- [x] Task 4.5: 阶段四单元测试
  - [x] SubTask 4.5.1: `tests/test_continuity_auditor.py`（六维审计 + issue 输出格式）
  - [x] SubTask 4.5.2: `tests/test_quality_engine.py`（自动修正 + 人工标记 + 评分）
  - [x] SubTask 4.5.3: 验证人为注入 OOC/设定冲突检出率 > 80%

## 阶段五：可视化与调试

- [x] Task 5.1: 实现 `WorldVisualDebugger` 数据接口（`src/novelist_brain/world_visual_debugger.py`）
  - [x] SubTask 5.1.1: 发布 `data.debug.world.snapshot`（地点/势力/角色关系图数据）
  - [x] SubTask 5.1.2: 发布 `data.debug.world.diff`（两个世界版本差异）
  - [x] SubTask 5.1.3: 发布 `data.debug.narrative.replay`（COC 推演回放，含骰子结果与叙事影响）
- [x] Task 5.2: 扩展前端 `SocialView` 为世界图谱视图（`src/webui/src/views/SocialView.vue`）
  - [x] SubTask 5.2.1: 新增世界图谱组件（地点/势力/角色关系图，基于现有 PixiJS SocialView 扩展）
  - [x] SubTask 5.2.2: 新增时间线组件（历史事件、伏笔引入/回收、规则被打破记录）
  - [x] SubTask 5.2.3: 新增状态对比组件（两个世界版本差异）
  - [x] SubTask 5.2.4: 新增推演回放组件（回放最近一轮 COC 推演）
- [x] Task 5.3: 后端 `web/app.py` 暴露调试数据接口
- [x] Task 5.4: 阶段五验收测试
  - [x] SubTask 5.4.1: Web 端可查看世界地点/势力/角色关系图
  - [x] SubTask 5.4.2: 可回放最近一轮 COC 推演

## 集成与验收

- [x] Task 6.1: 端到端集成测试
  - [x] SubTask 6.1.1: Story Bible → COC 推演 → 段落 → 审计 → 定稿
  - [x] SubTask 6.1.2: 经验输入 → 世界演进 → 持久化 → 回放
  - [x] SubTask 6.1.3: 多章生成 → 版本回退 → 状态一致
  - [x] SubTask 6.1.4: 并发读写 Story Bible 竞态条件
- [x] Task 6.2: 验收测试（生成 3 章短篇）
  - [x] SubTask 6.2.1: 人物行为符合 OC 设定
  - [x] SubTask 6.2.2: 无明显设定冲突
  - [x] SubTask 6.2.3: 节奏符合 intent
  - [x] SubTask 6.2.4: 伏笔有回收计划
- [x] Task 6.3: 性能基准测试
  - [x] SubTask 6.3.1: 单章生成（含审计）< 60s
  - [x] SubTask 6.3.2: 世界状态序列化 < 500ms
  - [x] SubTask 6.3.3: 启动加载 < 10s
- [x] Task 6.4: 回归测试（所有现有单元测试通过）

# Task Dependencies

- Task 0.7（学习阶段验收）阻塞 Task 1.1 - Task 6.4 全部
- Task 1.1（数据模型）阻塞 Task 1.2、1.3、1.4、1.8、2.1、2.2、3.1、4.1、4.2、5.1
- Task 1.2（WorldStateContract）阻塞 Task 1.3（OC 世界适配）、Task 1.4（MentalSandbox 改造）、Task 3.1（COCMappingEngine）
- Task 1.3（OCCharacterSystem）阻塞 Task 1.4.4（_rebuild_character_sheets）、Task 3.1（COCMappingEngine 角色输入）
- Task 1.4（MentalSandbox 改造）阻塞 Task 2.2（Planner 接收 narrative.ready）
- Task 1.6（register_agent）解锁 Task 2.6、4.4（新模块注册无需改 main.py）
- Task 2.1（ChapterManager）阻塞 Task 2.3（CreationExecutive 输出 chapter_id）、Task 4.1（审计订阅 paragraph.published）
- Task 2.2（Planner）阻塞 Task 2.3（CreationExecutive 接收 ChapterIntent）、Task 3.3（CEN scenario.load 依赖 chapter intent）
- Task 3.1（COCMappingEngine）阻塞 Task 3.2（Rulebook 动态加载）、Task 3.3（CEN scenario.load）
- Task 4.1（ContinuityAuditor）阻塞 Task 4.2（QualityEngine 接收 issues）
- Task 5.1（WorldVisualDebugger 数据接口）阻塞 Task 5.2（前端扩展）
- 阶段间强依赖：阶段 N+1 的所有 Task 依赖阶段 N 验收通过
