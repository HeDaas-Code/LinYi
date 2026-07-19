# 小说家大脑演进：持续运行、现实同步与林逸人格 Spec

## Why

当前原型虽然跑通了 48-tick 的一天流程，但本质是一次性演示脚本：启动 → 加速跑完 24 小时 → 退出。而 [Design.md](file:///workspace/Design.md) 设计的是一个**长期持续运行的小说家主体**——他应与真实世界时间同频生活、工作、睡眠，并在生活中积累记忆，在创作时段产出小说。同时，现有系统的人格内核过于抽象， prompt 中只有通用身份块，缺乏稳定的名字、价值观、生活节律和自我叙事，导致生成的小说段落像“无人称的文学练习”。本变更把小说家命名为**林逸**，并为他建立可成长、可偏移、可反思的人格模型，使其真正成为系统的唯一主体。

## What Changes

- 引入**真实时间时钟**（RealTimeClock）：tick 默认与现实分钟/小时同步，支持测试模式加速；系统启动后持续运行，不随一天结束而退出。
- 重构主入口为**常驻 Agent 循环**：加载上次状态 → 进入事件循环 → 按真实时间推进 tick → 夜间写作时段产出小说 → 睡眠时段低功耗运行 → 自动持久化。
- 建立**林逸人格内核 v1**：固定姓名、身份宣言、核心价值观、性格向量、生活节律偏好、当前自我叙事；人格可被反思和小说产出更新。
- 将林逸人格注入所有 prompt、世界模型、脑中世界角色投射与创作执行；默认主角不再是抽象的“作家”，而是林逸自身的投射。
- 调整默认节律与真实时间对齐：白天（06:00-18:00）以 DMN/CEN 交替进行生活输入、社会遭遇与灵感酝酿；晚间（19:00-23:00）为创作时段；深夜至凌晨为睡眠/梦境。
- 增加**每日调度器（DailyScheduler）最小实现**：基于能量、灵感压力、社交成本、待处理痕迹动态生成当天阶段计划，而非硬编码时间表。
- 状态持久化从“可选导出”升级为**自动增量保存**：每个 tick/阶段结束写增量，关键事件（小说段落产出、人格演化）实时落盘。
- 小说产出与记忆反馈：白天产生的经验碎片、晚上写出的段落都进入记忆，第二天继续影响梦境与创作。

## Impact

- Affected specs: [build-novelist-brain-prototype-v1](file:///workspace/.trae/specs/build-novelist-brain-prototype-v1/spec.md)、[Design.md](file:///workspace/Design.md) 第 9、14、16 节
- Affected code: [main.py](file:///workspace/main.py)、[src/novelist_brain/clock.py](file:///workspace/src/novelist_brain/clock.py)、[src/novelist_brain/identity.py](file:///workspace/src/novelist_brain/identity.py)、[src/novelist_brain/dmn.py](file:///workspace/src/novelist_brain/dmn.py)、[src/novelist_brain/cen.py](file:///workspace/src/novelist_brain/cen.py)、[src/novelist_brain/prompts.py](file:///workspace/src/novelist_brain/prompts.py)、[src/novelist_brain/persistence.py](file:///workspace/src/novelist_brain/persistence.py)

## ADDED Requirements

### Requirement: 真实时间时钟与持续运行

The system SHALL provide a `RealTimeClock` that advances ticks based on wall-clock time, with configurable tick interval (e.g. 1 real minute = 1 tick, or 1 real second = 1 tick for testing), and never terminates after a single day.

#### Scenario: 启动后常驻运行
- **WHEN** Agent 启动并加载持久化状态
- **THEN** 它根据当前真实时间定位到今日节律的对应阶段，并在后台持续运行，而不是加速跑完 24 小时就退出

#### Scenario: 测试模式加速
- **WHEN** 用户传入 `--fast-forward` 或 `--tick-interval-seconds`
- **THEN** 系统仍按 tick 推进，但 tick 间隔缩短，便于测试多日行为

### Requirement: 每日调度器

The system SHALL provide a `DailyScheduler` that generates each day's phase plan from metabolism, motivation, pending traces, inspiration pressure, and habit strength, with min/max duration bounds.

#### Scenario: 高灵感日延长创作
- **WHEN** 灵感压力高且能量充足
- **THEN** 调度器延长晚间 creation 阶段，压缩非关键阶段

#### Scenario: 社交透支日降级
- **WHEN** 社交成本高且能量低
- **THEN** 调度器减少社交/创作，增加 recovery 与 sleep

### Requirement: 林逸人格内核

The system SHALL establish a persistent novelist identity named **林逸** with stable name, values, traits, life rhythm preferences, self-narrative, and an `integrityScore`; the identity SHALL be injectable into every module and prompt.

#### Scenario: 人格一致性注入
- **WHEN** DMN、CEN、Sandbox 或 CreationExecutive 调用 LLM
- **THEN** prompt 的 identity 块包含林逸的名字、核心价值观、性格特质和自我叙事

#### Scenario: 人格可演化
- **WHEN** 每日反思或小说产出触发人格更新
- **THEN** IdentityCore 允许自我叙事和 trait 微调，并广播 `data.identity.updated`

### Requirement: 林逸作为脑中世界的投射源

The system SHALL use 林逸的人格 and memory traces as the primary source for sandbox character projections; the default protagonist SHALL be a projection of 林逸 rather than an anonymous writer.

#### Scenario: 角色生成
- **WHEN** Sandbox creates a protagonist projection
- **THEN** the protagonist's traits blend 林逸's traits with activated traces, and the character carries sourceTraceIds linking back to real memories

### Requirement: 夜间创作节律

The system SHALL align major novel-writing with evening/night hours (by default 19:00-23:00), matching the design that "the novelist writes after truly living through the day".

#### Scenario: 晚上产出段落
- **WHEN** the clock enters the evening creation phase
- **THEN** CEN activates, Sandbox consumes the day's traces, and CreationExecutive produces one or more paragraphs

### Requirement: 自动增量持久化

The system SHALL persist state automatically at phase boundaries and after critical events (paragraph published, identity updated, sandbox narrative committed), using a snapshot+delta strategy.

#### Scenario: 崩溃后恢复
- **WHEN** the process restarts
- **THEN** it loads the latest snapshot and replays deltas, resuming at the correct real-world phase

### Requirement: 生活-创作-睡眠循环

The system SHALL produce experience fragments during daytime, consolidate them into traces, and feed them into evening creation; nighttime DMN then recombines the day's residues into dreams.

#### Scenario: 一天的经验晚上变成小说
- **WHEN** PersonalInput/SocialInput produce fragments during the day
- **THEN** those fragments consolidate into traces and appear in the evening novel paragraph prompts

## MODIFIED Requirements

### Requirement: 原型 v1 的一天 48-tick 加速演示

**Complete modified requirement:**

The system SHALL retain the ability to run a compressed day for testing, but the default runtime mode SHALL be continuous real-time operation. The hard-coded 48-tick, 30-minute-per-tick, run-once-and-exit behavior in [main.py](file:///workspace/main.py) SHALL be replaced by a configurable loop driven by `RealTimeClock`.

#### Scenario: 默认持续运行
- **WHEN** `python main.py` is invoked without `--fast-forward`
- **THEN** Agent runs indefinitely and only writes one or more paragraphs during the scheduled evening creation window

#### Scenario: 快速测试模式
- **WHEN** `--fast-forward --days 2` is passed
- **THEN** the system still runs the full multi-day loop, but with shortened tick intervals

### Requirement: IdentityCore 通用身份块

**Complete modified requirement:**

`IdentityCore` SHALL now hold the concrete identity of 林逸 (name, pen name, values, traits, self-narrative, life goals) and expose it to all modules. The generic identity profile in [main.py](file:///workspace/main.py) `build_context()` SHALL be replaced by a structured `LinYiProfile` loaded from a dedicated identity file or module.

#### Scenario: 人格约束广播
- **WHEN** `IdentityCore` initializes
- **THEN** it broadcasts `data.identity.constraint` containing 林逸's full profile, and all prompt builders consume it

## REMOVED Requirements

### Requirement: 每次运行结束后必须输出小说段落

**Reason**: 持续运行的 Agent 只在真实的创作时段产出段落；白天运行不应强制生成小说。
**Migration**: 运行脚本改为按每日调度器的 evening creation 阶段触发创作；测试模式可通过 `--force-write` 手动触发。

### Requirement: 固定 24 小时结束后退出的主循环

**Reason**: 与持续运行目标冲突。
**Migration**: 保留 `run_day()` 作为历史函数或测试辅助，主入口改为 `run_agent()` 常驻循环。
