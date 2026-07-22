# Checklist

> 验收检查点严格对齐 [docs/系统重构方案_v1.md](file:///workspace/docs/系统重构方案_v1.md) §9 各阶段验收标准、§11 测试计划、§13 验收标准。每完成一项实施后逐项打勾验证。

## 阶段 0：前置学习阶段验收

- [x] 7 个参考项目源码已克隆至 `docs/refs/<project>/`，目录结构完整（含 README 与许可证）
- [x] `docs/refs/architecture_compare.md` 已产出，覆盖 7 维度（模块拆分/事件数据流/状态管理/提示词组织/错误处理/性能优化/扩展机制）× 7 项目
- [x] `docs/refs/tech_notes/<project>.md` 共 7 份，每份 ≥ 800 字，含可借鉴/需改造/风险三段
- [x] `docs/refs/borrow_matrix.md` 已产出，覆盖重构方案 §14.4 全部 14 个借鉴点与具体参考项目/文件/行号
- [x] `docs/refs/review_notes.md` 已产出，含至少一次跨人评审会议纪要与确认签字
- [x] 学习阶段验收通过（5 类产出物齐全 + 借鉴矩阵覆盖 100% + 至少一次评审）

## 阶段一：基础设施与真源层验收

- [x] `src/novelist_brain/models.py` 新增 `StoryBible` dataclass，字段完整（novel_id/title/genre/theme/premise/world_contract/character_registry/plot_compass/foreshadowing_ledger/chapter_blueprint/style_fingerprint/continuity_rules）
- [x] `WorldStateContract` 与 `WorldRule`/`Mystery`/`HistoricalEvent`/`Faction` dataclass 已实现，提供 `to_ontology()` 方法
- [x] `OCCharacterSheet` dataclass 已实现，含 `coc_attributes`/`coc_skills`/`sanity`/`luck`/`immutable_facts`，`projection_ratio=0`
- [x] `Chapter`/`ChapterIntent`/`Paragraph`（增强）/`ChapterVersion` dataclass 已实现
- [x] `ForeshadowingEntry`/`ForeshadowingOp`/`ContinuityIssue`/`QualityReport`/`RhythmProfile`/`PlotCompass`/`StyleFingerprint`/`Relationship`/`SanitySystem`/`LuckPool`/`Condition`/`Desire`/`Fear`/`TraitVector` dataclass 已实现
- [x] 所有新 dataclass 实现 `to_dict()` / `from_dict()`，与 `dataclass_to_dict` / `reconstruct_dataclass` 兼容
- [x] `world_state/{novel_id}/v{N}.json` 版本快照写入功能正常
- [x] `world_state.json` 人类可读投影可生成
- [x] 经验数据 → 世界映射器可从 Memory Trace / SocialInput / DMN / IdentityCore 生成 geography/factions/rules/mysteries
- [x] 世界演进规则实现（稳定规则/禁忌代价/神秘感管理/地点活化/势力变化）
- [x] `OCCharacterSystem` 模块实现，订阅 `data.memory.trace.query.result`/`control.oc.create`/`control.oc.update`
- [x] `build_oc_sheet()` 实现 3d6 掷点 + 技能点分配 + sanity/luck/HP/MP 初始化
- [x] 世界适配检查可识别时代错位物品/技能
- [x] `immutable_facts` 锁定生效，违规修改触发 `data.oc.update.rejected`
- [x] `get_sheet(id)`/`query_by_archetype()`/`query_by_relationship()` 接口可用
- [x] OC 持久化至 `oc_registry/{novel_id}.json`
- [x] `sandbox.py:144-152` 的 `WorldModel(name="default")` 硬编码已移除
- [x] `MentalSandbox.init()` 接收 `story_bible` 与 `world_contract`，不再接收 `world_data`
- [x] `_create_default_scene()` 从 `WorldStateContract.geography` 按情节选择地点，注入时间/天气/氛围/在场角色/未回收伏笔/冲突张力
- [x] `_rebuild_character_sheets()` 从 `StoryBible.character_registry` 读取 OC 数据生成 `TRPGCharacterSheet`
- [x] 新增事件 topic 全部就位（`data.oc.created`/`data.oc.updated`/`data.oc.update.rejected`/`data.oc.evolved`/`data.sandbox.world.updated`/`control.oc.create`/`control.oc.update`/`control.sandbox.scenario.load`）
- [x] `default.config.json` 与 `novelist.config.example.json` 新增 `story_bible_dir`/`world_state_dir`/`chapter_dir`/`oc_registry_dir`/`novel_id`
- [x] `module_registry.py` 实现 `register_agent(name, factory)` 插件式注册
- [x] `main.py` 注册 `OCCharacterSystem` 无需修改启动流程
- [x] `LLMService` 实现 `prompt_hash → response` 缓存（TTL=300s）
- [x] `control.sandbox.simulate` 增加幂等性 key，同 tick 重复推演被拦截
- [x] `persistence.py` 状态序列化采用 `.tmp` + 原子 rename；启动校验 `.latest` 指向存在性
- [x] `Module.init()` 支持可配置超时（默认 30s），超时不阻塞整体启动
- [x] `tools/migrate_state_v1_to_v2.py` 迁移脚本实现，可读取旧 state 并生成新 StoryBible
- [x] 迁移脚本保留 `agent_state.json.v1.bak` 备份
- [x] `main.py` 支持 `--legacy-mode` 降级启动
- [x] `tests/test_world_state_contract.py` 通过（初始化/规则校验/版本快照/差异计算）
- [x] `tests/test_oc_character_system.py` 通过（创建/更新/immutable 锁定/COC 属性生成）
- [x] `tests/test_migration_v1_to_v2.py` 通过（迁移成功 + 失败降级）
- [x] 启动时不再创建 `WorldModel(name="default")` 已验证
- [x] OC 角色可创建并持久化
- [x] 可以从上下文加载自定义世界观

## 阶段二：连载与规划层验收

- [x] `ChapterManager` 模块实现，订阅 `data.novel.paragraph` 按 `chapter_id` 归属段落
- [x] "卷 → 章 → 段"三级数据结构与持久化（`chapters/{novel_id}/{volume_id}/{chapter_id}/`）正常
- [x] 章节完成触发 `event.novel.chapter.completed` / `event.novel.chapter.committed`
- [x] `control.novel.chapter.rollback` 版本回溯生效
- [x] `ChapterVersion` 历史与状态流转（draft → audited → revised → committed）正确
- [x] `Planner` 模块实现，订阅 `data.sandbox.narrative.ready` 输出 `data.novel.chapter.intent`
- [x] 四线编织（Quest 50-70% / Fire 10-30% / Constellation 10-30% / Rest 0-20%）占比计算与阈值检查正确
- [x] 节拍曲线生成（章首 Hook → 主线推进 → 情感冲突 → 世界观揭示 → 爽点兑现 → 章末悬念）
- [x] `ForeshadowingOp`（引入/回收/强化）操作生成
- [x] `emotional_arc` 起→终情感值计算
- [x] `CreationExecutive` 接收 `ChapterIntent + NarrativeLine + skill_checks + world_state`
- [x] 按 `scene_type`（dialogue/action/psychological/environment/transition）分支生成
- [x] 输出段落携带 `chapter_id` 与 audit metadata
- [x] `build_chapter_intent_prompt` 提示词模板实现
- [x] `build_scene_prose_prompt` 提示词模板实现（场景类型 + 骰子结果 + 节奏意图 → 文学化段落）
- [x] 四线编织检查提示词与去 AI 味规则实现
- [x] 新增事件 topic 全部就位（`data.novel.chapter.intent`/`control.novel.chapter.write`/`event.novel.chapter.completed`/`event.novel.chapter.committed`/`event.novel.chapter.rollback`/`control.novel.chapter.rollback`）
- [x] `main.py` 注册 `ChapterManager` 与 `Planner`
- [x] `tests/test_chapter_manager.py` 通过（段落归属/版本回溯/状态流转）
- [x] `tests/test_planner.py` 通过（NarrativeLine → ChapterIntent/四线编织占比/节拍曲线）
- [x] 支持"卷 → 章 → 段"结构
- [x] 每章有明确的 intent
- [x] 可回退到任意章节版本

## 阶段三：COC 动态映射与推演验收

- [x] `COCMappingEngine` 模块实现，接收 StoryBible/WorldStateContract/character_registry 输入
- [x] 题材驱动 Rulebook 定制生效（克苏鲁 → 神话知识 + sanity；都市 → 社交博弈）
- [x] Campaign Arc Template（引入 → 上升 → 转折 → 高潮 → 余韵）实现
- [x] 章节级 ChapterScenario 生成（目标/关键 NPC/地点/冲突/可能的检定）
- [x] `Rulebook` 支持动态加载 skills/actions/sanity 规则，保留默认 Rulebook 作为 fallback
- [x] `CEN` 推演触发流程改为 `control.sandbox.scenario.load` → `control.sandbox.simulate` → N-round contract → `data.sandbox.narrative.ready`
- [x] `_DEPTH_THRESHOLDS` 新增 `hook_strength=0.4`/`foreshadowing_progress=0.3`/`scene_variety=0.4`
- [x] `_DEFAULT_MIN_ROUNDS=3` 与 `_DEFAULT_MAX_ROUNDS=7` 保留
- [x] `_narrate()` 输出含骰子结果的情绪化描述
- [x] `CreationExecutive` 使用 `build_scene_prose_prompt` 将判定转化为人物动作/环境反应/内心波动
- [x] `tests/test_coc_mapping_engine.py` 通过（不同题材 → 不同 Rulebook）
- [x] `tests/test_scenario_driven_simulation.py` 通过（scenario.load → simulate → narrative.ready）
- [x] 不同题材的小说使用不同的 Rulebook
- [x] COC 推演基于当前章节 scenario
- [x] 推演结果能转化为自然的小说段落

## 阶段四：审计与质量闭环验收

- [x] `ContinuityAuditor` 模块实现，订阅 `event.novel.paragraph.published` 与 `control.novel.audit`
- [x] OOC 审计（行为 vs `OCCharacterSheet.traits`）生效
- [x] 设定冲突审计（vs `WorldStateContract.rules`/`forbidden`）生效
- [x] 时间线审计（事件顺序矛盾）生效
- [x] 伏笔审计（引入未回收/提前兑现/回收计划缺失）生效
- [x] 文风审计（vs `StyleFingerprint`）生效
- [x] 节奏审计（章内 Hook/高潮缺失）生效
- [x] `ContinuityIssue {category, severity, evidence, suggested_fix}` 输出格式正确
- [x] `QualityEngine` 模块实现，按 severity 分流
- [x] low-risk 自动修正：生成修订提示 → `control.novel.revision.required` → CreationExecutive 重写 → `data.novel.revision.applied`
- [x] critical 人工标记：`control.novel.revision.human_required` 触发，不自动重写
- [x] `data.novel.quality.report` 与 `data.novel.quality.score`（0-1）输出
- [x] 审计结果反馈到 Story Bible 与 OC Registry（`data.oc.evolved` / `data.sandbox.world.updated`）
- [x] 新增事件 topic 全部就位（`control.novel.audit`/`data.novel.quality.report`/`control.novel.revision.required`/`control.novel.revision.human_required`/`data.novel.revision.applied`）
- [x] `main.py` 注册 `ContinuityAuditor` 与 `QualityEngine`
- [x] `tests/test_continuity_auditor.py` 通过（六维审计 + issue 输出格式）
- [x] `tests/test_quality_engine.py` 通过（自动修正 + 人工标记 + 评分）
- [x] 人为注入 OOC/设定冲突检出率 > 80%
- [x] 能检测人物 OOC、设定冲突、伏笔断裂
- [x] 自动生成质量报告
- [x] 低风险问题可自动触发重写

## 阶段五：可视化与调试验收

- [x] `WorldVisualDebugger` 模块实现，发布 `data.debug.world.snapshot`
- [x] 发布 `data.debug.world.diff`（两个世界版本差异）
- [x] 发布 `data.debug.narrative.replay`（COC 推演回放，含骰子结果与叙事影响）
- [x] 前端 `SocialView` 扩展世界图谱组件（地点/势力/角色关系图）
- [x] 前端时间线组件（历史事件/伏笔引入回收/规则被打破记录）
- [x] 前端状态对比组件（两个世界版本差异）
- [x] 前端推演回放组件（回放最近一轮 COC 推演）
- [x] 后端 `web/app.py` 暴露调试数据接口
- [x] Web 端可查看世界地点/势力/角色关系图
- [x] 可回放最近一轮 COC 推演

## 集成与验收

- [x] 端到端测试：Story Bible → COC 推演 → 段落 → 审计 → 定稿 通路完整
- [x] 端到端测试：经验输入 → 世界演进 → 持久化 → 回放 通路完整
- [x] 端到端测试：多章生成 → 版本回退 → 状态一致
- [x] 端到端测试：并发读写 Story Bible 竞态条件无死锁/数据损坏
- [x] 3 章短篇生成验收：人物行为符合 OC 设定
- [x] 3 章短篇生成验收：无明显设定冲突
- [x] 3 章短篇生成验收：节奏符合 intent
- [x] 3 章短篇生成验收：伏笔有回收计划
- [x] 性能基准：单章生成（含审计）< 60s
- [x] 性能基准：世界状态序列化 < 500ms
- [x] 性能基准：启动加载 < 10s
- [x] 回归测试：所有现有单元测试通过
- [x] 核心引擎无回归（事件总线/模块生命周期/DMN/CEN/SN/代谢/EOS/LLMService 接口不变）

## 总体验收标准（§13.2）

- [x] 核心引擎无回归：所有现有单元测试通过
- [x] 世界观可配置：至少 2 部不同题材小说的 Story Bible 可切换
- [x] OC 完整性：每个主要角色有 COC 卡 + immutable facts
- [x] 章节管理：支持至少 10 章的版本控制与回溯
- [x] 审计有效性：对人为注入的 OOC/设定冲突检出率 > 80%
- [ ] 生成质量：人工评分小说性 > 7/10（相比当前提升）
- [x] 性能：单章生成（含审计）< 60s
- [x] 一部可配置世界观的小说：每部小说有独立的 Story Bible、WorldStateContract、OCRegistry
- [x] 动态世界：世界观随林逸经验和小说进程演化，不再写死
- [x] OC 角色库：所有角色为原创角色，有完整 COC 规则卡和不可变设定
- [x] 章节化连载：支持卷、章、段三级结构，版本可控，可回溯
- [x] COC 小说化联动：COC 推演为小说提供血肉，小说结构指导 COC 推演
- [x] 质量闭环：连续性审计与自动修正减少幻觉和崩坏
- [x] 可视化调试：世界状态、角色关系、推演过程可观测
