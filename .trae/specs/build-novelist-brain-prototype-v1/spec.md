# 小说家大脑第一版原理模型 Spec

## Why

基于仓库内的 [Design.md](file:///workspace/Design.md) 设计，需要构建一个可运行的 Python 原理模型，验证“经验输入 → 突显网络切换 → DMN/CEN 协作 → 脑中世界推演 → 小说产出 → 记忆反馈”的核心闭环。第一版目标是最小可行实现（MVP），优先跑通时序与数据通路，而非追求 LLM 生成质量或持久化完备性。

## What Changes

- 创建 Python 项目骨架，实现 `Module` 抽象基类与三条总线（Event / Data / Control）。
- 实现全局时钟 `Clock` 与默认一天节律模板（deep_night → morning → creation → social → simulation → reflection → incubation）。
- 实现核心模块的最小版本：Metabolism、PersonalInput、SocialInput、SN、DMN、CEN、Memory、MentalSandbox、Dynamics、IdentityCore、CreationExecutive、NovelOutput。
- 实现 Fragment → Trace 的沉淀逻辑（简化 embedding 为标签相似度 / 随机向量）。
- 实现脑中世界 N 轮推演契约与叙事线就绪判定。
- 提供可插拔的 `LLMService` 接口，第一版内置模拟实现（规则模板 + 随机骰子），不依赖外部 LLM。
- 输出一个可运行的主入口 `main.py`，演示完整一天周期并打印小说段落。

## Impact

- Affected specs: 小说家大脑架构（Design.md）
- Affected code: 新增 Python 源码目录、入口脚本、可选测试。

## ADDED Requirements

### Requirement: 项目骨架与模块基座

The system SHALL provide a `Module` abstract base class that all functional modules inherit from, with lifecycle hooks `init`, `on_bus_message`, `emit`, `tick`, and `get_state`.

#### Scenario: 模块注册与总线通信
- **WHEN** 一个模块注册到总线并声明订阅的 topic 集合
- **THEN** 该模块能收到对应 topic 的广播消息，并可以通过总线向其他模块发送消息

### Requirement: 三条总线

The system SHALL provide three buses: `EventBus`, `DataBus`, and `ControlBus`, routed through a single `BusRouter` with TTL decay and priority handling.

#### Scenario: 控制总线覆盖事件/数据总线
- **WHEN** 控制总线发布 `control.network.switch`
- **THEN** 目标网络模块优先响应，且高优先级消息可中断当前阶段

### Requirement: 全局时钟与默认节律

The system SHALL provide a `Clock` that advances ticks, maps absolute time to a phase of day, and loads the default daily rhythm template.

#### Scenario: 默认一天运行
- **WHEN** 时钟从 `00:00` 推进到 `24:00`
- **THEN** 系统依次经历 deep_night、morning、creation、social、simulation、reflection、incubation 阶段，每个阶段触发对应模块行为

### Requirement: 代谢层

The system SHALL provide a `Metabolism` module that tracks `energy`, `compute_budget`, `time_currency`, and `social_capital`, and broadcasts budget warnings.

#### Scenario: 能量约束行为
- **WHEN** CEN 或 Sandbox 执行高能耗动作
- **THEN** 代谢层扣除能量，能量过低时抑制高能耗模块并切换至恢复/DMN 阶段

### Requirement: 人格性与社会性输入

The system SHALL provide `PersonalInput` and `SocialInput` modules that generate `Fragment`s according to the current phase and state.

#### Scenario: 晨间产生生活碎片
- **WHEN** 阶段为 morning
- **THEN** PersonalInput 产生“起床、洗漱、早餐”等生活 Fragment，SocialInput 在 social 阶段产生遭遇/对话 Fragment

### Requirement: 突显网络 SN

The system SHALL provide a `SalienceNetwork` that scores incoming triggers using B=MAT (motivation × ability × trigger) and emits `control.network.switch` to select DMN or CEN.

#### Scenario: 灵感碎片触发 CEN
- **WHEN** DMN 产生高显著性灵感 Fragment
- **THEN** SN 切换到 CEN，使 CEN 能够调度脑中世界建构

### Requirement: 默认模式网络 DMN

The system SHALL provide a `DefaultModeNetwork` that runs during DMN phases, generates dream/reflection/insight fragments, queries memory, and performs mental wandering.

#### Scenario: 睡眠期生成梦境
- **WHEN** 阶段为 deep_night 且 DMN 激活
- **THEN** DMN 查询近期记忆并生成 dream Fragment，将其注入灵感池

### Requirement: 中央执行网络 CEN

The system SHALL provide a `CentralExecutiveNetwork` that maintains a goal stack and working memory, and emits commands to build/simulate the sandbox.

#### Scenario: 创作阶段调度脑中世界
- **WHEN** CEN 激活且收到灵感 Fragment
- **THEN** CEN 发出 `control.sandbox.build` 与 `control.sandbox.simulate`，推动多轮推演

### Requirement: 记忆系统

The system SHALL provide a `MemorySystem` that stores fragments, consolidates them into traces using simplified clustering/scoring, answers queries, and supports narrative role assignment.

#### Scenario: 碎片巩固为痕迹
- **WHEN** MemorySystem 收到多个相关 Fragment
- **THEN** 每 tick 评估一次，得分超过阈值时创建或更新 `Trace`

### Requirement: 脑中世界 MentalSandbox

The system SHALL provide a `MentalSandbox` that holds `WorldModel`, `CharacterProjection`s, current scene, and narrative lines, and executes COC-style simulation rounds.

#### Scenario: N 轮推演后叙事线就绪
- **WHEN** Sandbox 收到 simulate 命令并运行至少 `min_rounds` 轮
- **THEN** 当任一深度指标（conflict/character/emotional/coherence）达标或达到 `max_rounds` 时，发布 `data.sandbox.narrative.ready`

### Requirement: 动力系统

The system SHALL provide a `Dynamics` module that computes reward/punishment prediction errors from event outcomes and updates habit strengths.

#### Scenario: 推演结果产生 RPE
- **WHEN** Sandbox 发布 `data.sandbox.event.resolved`
- **THEN** Dynamics 计算 RPE 并发布 `data.dynamics.rpe`

### Requirement: 人格内核

The system SHALL provide an `IdentityCore` that holds stable identity, values, traits, and self-narrative, and broadcasts constraints to DMN/CEN/Sandbox/Creation.

#### Scenario: 人格约束渗透
- **WHEN** 任意模块需要生成内容时
- **THEN** IdentityCore 的约束信息被注入，保证单一人格连续性

### Requirement: 创作执行与小说产出

The system SHALL provide `CreationExecutive` and `NovelOutput` modules that convert a ready narrative line into a paragraph and publish it.

#### Scenario: 小说段落产出
- **WHEN** Sandbox 发布 `data.sandbox.narrative.ready`
- **THEN** CreationExecutive 文学化重构并输出 `data.novel.paragraph`，NovelOutput 发布 `event.novel.paragraph.published`

### Requirement: 反馈回路

The system SHALL route published novel paragraphs back to Memory and DMN as new fragments.

#### Scenario: 小说反馈进入记忆
- **WHEN** NovelOutput 发布段落
- **THEN** MemorySystem 收到叙事 Fragment，DMN 收到触发以进入后续酝酿

### Requirement: LLM 服务抽象

The system SHALL define an `LLMService` interface with `complete` and `embed` methods, and provide a built-in mock implementation so the first prototype runs without external API keys.

#### Scenario: 无外部依赖运行
- **WHEN** 运行 `python main.py`
- **THEN** 系统不调用任何外部 LLM，仍输出可识别的日志与小说段落

## MODIFIED Requirements

无。

## REMOVED Requirements

### Requirement: 持久化与热迁移
**Reason**: 第一版原理模型聚焦运行时闭环验证，持久化、热迁移、向量/图/时序混合存储、容量管理等属于第二版工程化目标。
**Migration**: 所有状态保存在内存中；重启后状态重置。后续版本再引入快照 + 增量持久化。

### Requirement: 真实 LLM 生成
**Reason**: 第一版不绑定具体模型与 API，避免密钥依赖与成本。
**Migration**: LLMService 为可插拔接口，后续可替换为真实 LLM 客户端而不改动模块代码。
