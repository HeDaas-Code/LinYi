# LinYi 小说家大脑系统重构 v1.0 Spec

> 本 Spec 严格对应 [docs/系统重构方案_v1.md](file:///workspace/docs/系统重构方案_v1.md)。在完整保留核心创意引擎的前提下，引入故事圣经、动态世界、OC 角色、章节化连载、COC 动态映射与质量审计闭环。

## Why

当前系统存在六大结构性缺陷（详见重构方案 §2.2）：

1. `sandbox.py` 硬编码 `WorldModel(name="default")`，每部小说复用同一世界。
2. `CharacterProjection` 只有 `name/archetype/source_trace_ids`，无法区分真人投影与 OC，设定可被 LLM 随意改写。
3. `trpg.py::_narrate()` 只输出简短判定描述，COC 推演与小说正文之间跳跃过大。
4. `creation_executive.py` 直接由 narrative line 生成段落，缺少 Hook、爽点、伏笔回收等网文节奏设计。
5. `eos.py` 只监控资源与 LLM，不检查 OOC、设定冲突、伏笔断裂。
6. `novel_output.py` 只追加扁平 paragraph，没有卷/章/版本/回溯能力。

本次重构通过引入"小说真源层 + 生成审计层 + 输出层"三层架构，让生成内容具备更强的小说性、连载连贯性与可扩展性。

## What Changes

### 前置阶段（强制门槛）
- 克隆 7 个参考项目（ainovel-cli、InkOS、NovelPilot、Webnovel Writer、AI Novel Factory、NovelDreamer、AI_NovelGenerator_YILING）至 `docs/refs/`。
- 产出架构对照表、技术笔记、借鉴矩阵、评审纪要。

### 阶段一：基础设施与真源层
- **新增** 数据模型：`StoryBible`、`WorldStateContract`、`WorldRule`、`OCCharacterSheet`、`Chapter`、`ChapterIntent`、`Paragraph`（增强）、`ForeshadowingEntry`、`ContinuityIssue`、`QualityReport`。
- **新增** `OCCharacterSystem` 模块：CRUD + immutable 锁定 + COC 属性生成。
- **MODIFIED** `MentalSandbox.init()`：接收 `story_bible` 与 `world_contract`，移除硬编码 default world。
- **新增** 事件 topic：`data.oc.created`、`data.oc.updated`、`data.sandbox.world.updated`、`control.oc.create`、`control.oc.update`。
- **新增** 配置项：`story_bible_dir`、`world_state_dir`、`chapter_dir`、`oc_registry_dir`、`novel_id`。
- **新增** 数据迁移脚本 `tools/migrate_state_v1_to_v2.py` 与 `--legacy-mode` 降级入口。

### 阶段二：连载与规划层
- **新增** `ChapterManager` 模块：替换 `NovelOutput` 扁平 paragraph 列表，支持卷/章/段 + 版本 + 回溯。
- **新增** `Planner` 模块：NarrativeLine → ChapterIntent，含四线编织（Quest/Fire/Constellation/Rest）。
- **MODIFIED** `CreationExecutive`：接收 `ChapterIntent + NarrativeLine + skill_checks + world_state`。
- **新增** 网文节奏提示词模板（Hook、爽点、伏笔、感情线、世界观线）。
- **新增** 事件 topic：`data.novel.chapter.intent`、`control.novel.chapter.write`、`event.novel.chapter.completed`、`event.novel.chapter.committed`、`control.novel.chapter.rollback`。

### 阶段三：COC 动态映射与推演
- **新增** `COCMappingEngine`：Story Bible → 定制 Rulebook + Campaign Arc Template + Chapter Scenario。
- **MODIFIED** `Rulebook`：支持动态加载技能/动作/规则（按题材分支）。
- **MODIFIED** `_DEPTH_THRESHOLDS`：新增 `hook_strength`、`foreshadowing_progress`、`scene_variety`。
- **MODIFIED** `_narrate()` 与 `CreationExecutive` 提示词：骰子结果文学化，新增 `build_scene_prose_prompt`。
- **MODIFIED** `CEN`：从无目标 `control.sandbox.simulate` 改为 `control.sandbox.scenario.load` → `control.sandbox.simulate`。

### 阶段四：审计与质量闭环
- **新增** `ContinuityAuditor` 模块：六维审计（OOC / 设定冲突 / 时间线 / 伏笔 / 文风 / 节奏）。
- **新增** `QualityEngine` 模块：自动修正 + 人工标记 + 评分。
- **新增** 事件 topic：`control.novel.audit`、`data.novel.quality.report`、`control.novel.revision.required`、`data.novel.revision.applied`。

### 阶段五：可视化与调试
- **新增** `WorldVisualDebugger` 数据接口（世界图谱 / 时间线 / 状态对比 / 推演回放）。
- **MODIFIED** 前端 `SocialView`：扩展为世界图谱视图。
- **新增** 事件 topic：`data.debug.world.snapshot`、`data.debug.world.diff`、`data.debug.narrative.replay`。

### 核心创意引擎优化（贯穿全程）
- **MODIFIED** `LLMService`：增加 `prompt_hash → response` 缓存（TTL=300s）。
- **MODIFIED** `control.sandbox.simulate`：增加幂等性 key。
- **MODIFIED** 状态序列化：写入快照先 `.tmp` 再原子重命名；启动校验 `.latest` 指向。
- **MODIFIED** `Module.init()`：可配置超时（默认 30s）。
- **MODIFIED** `module_registry.py`：增加 `register_agent(name, factory)` 插件式注册。

## Impact

- **Affected specs**:
  - [build-novelist-brain-prototype-v1](file:///workspace/.trae/specs/build-novelist-brain-prototype-v1/spec.md)（MentalSandbox、NovelOutput、CreationExecutive 行为变更）
  - [evolve-novelist-into-persistent-self-linyi](file:///workspace/.trae/specs/evolve-novelist-into-persistent-self-linyi/spec.md)（IdentityCore 字段扩展、记忆检索扩展）
  - [pixi-social-space-rendering](file:///workspace/.trae/specs/pixi-social-space-rendering/spec.md)（SocialView 扩展为世界图谱）
  - [Design.md](file:///workspace/Design.md)
- **Affected code**:
  - [src/novelist_brain/sandbox.py](file:///workspace/src/novelist_brain/sandbox.py)（移除硬编码 world）
  - [src/novelist_brain/models.py](file:///workspace/src/novelist_brain/models.py)（新增 dataclass）
  - [src/novelist_brain/novel_output.py](file:///workspace/src/novelist_brain/novel_output.py)（被 ChapterManager 替换）
  - [src/novelist_brain/creation_executive.py](file:///workspace/src/novelist_brain/creation_executive.py)（接收 ChapterIntent）
  - [src/novelist_brain/trpg.py](file:///workspace/src/novelist_brain/trpg.py)（动态 Rulebook + 文学化 _narrate）
  - [src/novelist_brain/trpg_rulebook.py](file:///workspace/src/novelist_brain/trpg_rulebook.py)（动态加载）
  - [src/novelist_brain/cen.py](file:///workspace/src/novelist_brain/cen.py)（scenario.load 流程）
  - [src/novelist_brain/eos.py](file:///workspace/src/novelist_brain/eos.py)（扩展审计）
  - [src/novelist_brain/llm.py](file:///workspace/src/novelist_brain/llm.py)（prompt 缓存）
  - [src/novelist_brain/persistence.py](file:///workspace/src/novelist_brain/persistence.py)（原子写入）
  - [src/novelist_brain/module.py](file:///workspace/src/novelist_brain/module.py)（init 超时）
  - [src/novelist_brain/module_registry.py](file:///workspace/src/novelist_brain/module_registry.py)（register_agent）
  - [src/novelist_brain/prompts.py](file:///workspace/src/novelist_brain/prompts.py)（网文节奏 + scene prose 模板）
  - [src/novelist_brain/identity.py](file:///workspace/src/novelist_brain/identity.py)（字段扩展）
  - [src/novelist_brain/memory.py](file:///workspace/src/novelist_brain/memory.py)（检索与召回扩展）
  - [src/webui/src/views/SocialView.vue](file:///workspace/src/webui/src/views/SocialView.vue)（世界图谱扩展）
  - [main.py](file:///workspace/main.py)（注册新模块 + legacy-mode）
  - [default.config.json](file:///workspace/default.config.json)（新增路径配置）
  - [tools/migrate_state_v1_to_v2.py](file:///workspace/tools/migrate_state_v1_to_v2.py)（新增）

## ADDED Requirements

### Requirement: 前置学习阶段强制门槛

系统 SHALL 在进入正式重构阶段前，完成 7 个参考项目的代码级研读，产出架构对照表、技术笔记、借鉴矩阵与评审纪要，并归档至 `docs/refs/`。

#### Scenario: 学习产出物齐全
- **WHEN** 重构实施人员提交阶段一 PR
- **THEN** PR 中附有 `docs/refs/architecture_compare.md`、`docs/refs/tech_notes/<project>.md`（7 份）、`docs/refs/borrow_matrix.md`、`docs/refs/review_notes.md`，且借鉴矩阵覆盖重构方案 §14 全部借鉴点

#### Scenario: 学习未完成不得进入实施
- **WHEN** 学习产出物缺失或未通过评审
- **THEN** 不得进入阶段一至阶段五任何任务

### Requirement: Story Bible 真源层

系统 SHALL 为每部小说提供唯一的 `StoryBible`，包含 `novel_id`、`title`、`genre`、`theme`、`premise`、`world_contract`、`character_registry`、`plot_compass`、`foreshadowing_ledger`、`chapter_blueprint`、`style_fingerprint`、`continuity_rules`，并持久化至 `story_bible/{novel_id}.json`。

#### Scenario: 多题材切换
- **WHEN** 用户为两部不同题材（如都市、克苏鲁）的小说创建 Story Bible
- **THEN** 两个 Story Bible 独立持久化，互不污染，且各自的 World Contract 与 OC Registry 独立

### Requirement: WorldStateContract 动态世界

系统 SHALL 通过 `WorldStateContract` 替代 `sandbox.py` 中的硬编码 default world，包含 `geography`、`factions`、`rules`、`history`、`forbidden`、`mysteries`、`current_state`、`version`，从林逸经验数据（Memory Trace、SocialInput、DMN 洞察、IdentityCore）动态映射生成，并随小说进程演化。

#### Scenario: 启动时无硬编码世界
- **WHEN** 系统启动并加载 Story Bible
- **THEN** 不再创建 `WorldModel(name="default")`，而是从 `WorldStateContract.to_ontology()` 构建世界模型

#### Scenario: 经验驱动世界演进
- **WHEN** 一段记忆 Trace 标记为"便利店"且 valence<0
- **THEN** 映射器在 `WorldStateContract.geography` 中生成"凌晨便利店"边缘空间节点

#### Scenario: 禁忌代价
- **WHEN** 任意角色在推演中打破 `forbidden` 规则
- **THEN** 系统触发 `consequences` 中至少一条后果事件

#### Scenario: 世界版本快照
- **WHEN** `data.sandbox.world.updated` 事件触发
- **THEN** 系统将当前 `WorldStateContract` 序列化至 `world_state/{novel_id}/v{N}.json`，并生成 `world_state.json` 人类可读投影

### Requirement: OCCharacterSystem 原创角色

系统 SHALL 通过 `OCCharacterSystem` 替换真人投影，所有角色为原创 OC，具备 `coc_attributes`（3d6 掷点）、`coc_skills`、`sanity`、`luck`、`immutable_facts` 等字段，`projection_ratio` 固定为 0。

#### Scenario: OC 创建流程
- **WHEN** 从记忆 trace / 社交输入 / DMN 洞察中提取到人物种子
- **THEN** 系统通过 LLM 选择 archetype，调用 `build_oc_sheet()` 掷 3d6 生成属性，分配技能点，并写入 `StoryBible.character_registry`

#### Scenario: immutable_facts 锁定
- **WHEN** LLM 在推演中尝试修改标记为 immutable 的核心设定
- **THEN** 系统拒绝修改并触发 `data.oc.update.rejected` 事件

#### Scenario: 世界适配检查
- **WHEN** 新建 OC 携带时代错位物品/技能
- **THEN** 系统通过与 `WorldStateContract` 比对，标记冲突并要求修正

### Requirement: ChapterManager 章节化管理

系统 SHALL 通过 `ChapterManager` 替换 `NovelOutput` 的扁平 paragraph 列表，支持"卷 → 章 → 段"三级结构，每个 `Chapter` 包含 `chapter_id`、`volume_id`、`index`、`title`、`intent`、`paragraphs`、`status`（draft/audited/revised/committed）、`versions`。

#### Scenario: 段落归属
- **WHEN** `data.novel.paragraph` 事件到达
- **THEN** ChapterManager 根据 `chapter_id` 将段落归属到对应 Chapter

#### Scenario: 章节完成触发
- **WHEN** 一章所有段落完成
- **THEN** 触发 `control.novel.chapter.completed`

#### Scenario: 版本回溯
- **WHEN** 收到 `control.novel.chapter.rollback {chapter_id, version_id}`
- **THEN** ChapterManager 将 Chapter 状态回退到指定版本，并广播 `event.novel.chapter.rollback`

### Requirement: Planner 创作规划

系统 SHALL 在 `CreationExecutive` 之前插入 `Planner`，订阅 `data.sandbox.narrative.ready`，输出 `data.novel.chapter.intent`，包含 `scene_type`、`narrative_beats`、`rhythm`（四线编织密度）、`foreshadowing_ops`、`required_characters`、`required_settings`、`emotional_arc`。

#### Scenario: 四线编织
- **WHEN** Planner 生成 ChapterIntent
- **THEN** Quest/Fire/Constellation/Rest 四线占比之和为 1，且任一线低于阈值时提示补全

#### Scenario: 节拍曲线
- **WHEN** Planner 生成单章 intent
- **THEN** intent 包含章首 Hook、主线推进、情感冲突、世界观揭示、爽点兑现、章末悬念六类节拍

### Requirement: ContinuityAuditor 六维审计

系统 SHALL 提供 `ContinuityAuditor`，订阅 `event.novel.paragraph.published`，从 OOC / 设定冲突 / 时间线 / 伏笔 / 文风 / 节奏六个维度审计，输出 `ContinuityIssue {category, severity, evidence, suggested_fix}`。

#### Scenario: OOC 检出
- **WHEN** 角色行为与 `OCCharacterSheet.traits` 冲突
- **THEN** 审计器输出 `category="ooc"`、`severity="warning"`、`evidence=<行为片段>`、`suggested_fix=<修正建议>`

#### Scenario: 伏笔断裂
- **WHEN** Story Bible 中标记为 `introduced` 的伏笔在回收计划章节未兑现
- **THEN** 审计器输出 `category="foreshadowing"`、`severity="critical"`

### Requirement: QualityEngine 质量闭环

系统 SHALL 提供 `QualityEngine`，基于审计结果对 low-risk issue 自动生成修订提示并调用 `CreationExecutive` 重写，对 critical issue 触发 `control.novel.revision.human_required`，并输出 `data.novel.quality.score`（0-1）。

#### Scenario: 自动修正
- **WHEN** ContinuityAuditor 输出 severity="warning" 的文风偏离
- **THEN** QualityEngine 生成修订提示，触发 `control.novel.revision.required`，CreationExecutive 重写后广播 `data.novel.revision.applied`

#### Scenario: 人工标记
- **WHEN** ContinuityAuditor 输出 severity="critical" 的设定冲突
- **THEN** QualityEngine 触发 `control.novel.revision.human_required`，不自动重写

### Requirement: COCMappingEngine 动态规则映射

系统 SHALL 提供 `COCMappingEngine`，接收 `StoryBible.premise/plot_compass/chapter_blueprint`、`WorldStateContract.rules`、`character_registry`，输出定制 Rulebook、Campaign Arc Template、章节级 Scenario。

#### Scenario: 题材驱动 Rulebook
- **WHEN** Story Bible genre="克苏鲁"
- **THEN** Rulebook 增加"神话知识"技能、启用 sanity 规则、注入"直视不可名状物 → SAN 检定"动作

#### Scenario: 章节级 Scenario
- **WHEN** PlotCompass 推进到第 N 章
- **THEN** COCMappingEngine 生成 ChapterScenario，包含目标、关键 NPC、地点、冲突、可能的检定

#### Scenario: 推演触发流程
- **WHEN** CEN 进入推演阶段
- **THEN** 依次触发 `control.sandbox.scenario.load {chapter_index, scenario_id}` → `control.sandbox.simulate {action, character_id}` → N-round contract → `data.sandbox.narrative.ready`

### Requirement: 数据迁移与降级

系统 SHALL 提供 `tools/migrate_state_v1_to_v2.py` 迁移脚本，将旧 `agent_state.json` 中的 `world_model`/`characters`/`paragraphs` 转换为 `WorldStateContract`/`OCCharacterSheet`/`Chapter` 与新 `StoryBible`，保留 `.v1.bak` 备份，并支持 `--legacy-mode` 降级启动。

#### Scenario: 迁移成功
- **WHEN** 迁移脚本读取旧 state 并校验通过
- **THEN** 写回新的 `agent_state.json` v2，备份至 `agent_state.json.v1.bak`，启动新系统

#### Scenario: 迁移失败降级
- **WHEN** 迁移校验失败
- **THEN** 系统支持 `--legacy-mode` 启动旧路径，不丢失旧状态

### Requirement: 核心引擎优化

系统 SHALL 对保留的核心创意引擎做以下优化，且不改变其对外接口：

- `LLMService` 增加 `prompt_hash → response` 缓存（TTL=300s）。
- `control.sandbox.simulate` 增加幂等性 key，避免同 tick 重复推演。
- 状态序列化采用 `.tmp` + 原子 rename；启动校验 `.latest` 指向存在性。
- `Module.init()` 支持可配置超时（默认 30s）。
- `module_registry.py` 增加 `register_agent(name, factory)`，使新增 Agent 无需改 `main.py`。

#### Scenario: LLM 缓存命中
- **WHEN** 相同 identity + world + narrative line 的请求在 300s 内重复到达
- **THEN** LLMService 直接返回缓存响应，不调用后端

#### Scenario: 模块加载超时
- **WHEN** 某模块 `init()` 超过 30s 未返回
- **THEN** 系统记录超时日志并跳过该模块，不阻塞整体启动

## MODIFIED Requirements

### Requirement: MentalSandbox 初始化

`MentalSandbox.init()` 不再接收 `world_data`，改为接收 `story_bible` 与 `world_contract` 上下文。`_create_default_scene()` 从 `WorldStateContract.geography` 按当前情节选择地点，并注入当前时间/天气/氛围、在场角色状态、未回收伏笔列表、当前冲突张力。

### Requirement: CreationExecutive 生成

`CreationExecutive` 不再只接收 `NarrativeLine`，改为接收 `ChapterIntent + NarrativeLine + skill_checks + world_state`，并使用新增的 `build_scene_prose_prompt` 提示词，将骰子结果转化为人物动作、环境反应、内心波动。

### Requirement: COC 推演深度阈值

`_DEPTH_THRESHOLDS` 扩展为包含 `conflict_depth`、`character_development`、`emotional_shift`、`coherence_score`、`hook_strength`（新增）、`foreshadowing_progress`（新增）、`scene_variety`（新增）七项。

### Requirement: IdentityCore 字段扩展

`IdentityCore` 扩展字段以支持 OC 注册与世界适配（不改核心结构），新增 `style_fingerprint` 引用与 `immutable_facts` 锚点。

### Requirement: MemorySystem 检索扩展

`MemorySystem` 扩展检索与召回能力，支持按 World Contract geography、OC archetype、ForeshadowingEntry 反向查询，并向 Story Bible 提供 trace 投影。

## REMOVED Requirements

### Requirement: 硬编码 default world

**Reason**: `sandbox.py:144-152` 的 `WorldModel(name="default", ontology={...})` 使每部小说复用同一世界，违反 Story Bible 真源原则。

**Migration**: 由 `WorldStateContract.to_ontology()` 替代；旧 state 通过 `migrate_state_v1_to_v2.py` 提取 ontology 与 rules 生成 WorldStateContract。

### Requirement: 扁平 paragraph 输出

**Reason**: `novel_output.py` 仅追加 paragraph，无章节/卷/版本/回溯，无法支持长篇连载工程化。

**Migration**: 由 `ChapterManager` 替代；旧 paragraphs 通过迁移脚本整理为单卷单章 Chapter 结构。

### Requirement: 真人投影 CharacterProjection

**Reason**: `models.py:140-155` 的 `CharacterProjection` 无法区分真人/原创，核心设定可被 LLM 随意改写。

**Migration**: 由 `OCCharacterSheet` 替换，`projection_ratio` 固定为 0；旧 characters 通过迁移脚本生成 OCCharacterSheet。
