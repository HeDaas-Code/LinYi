# 小说家大脑架构实现决策记录

本文件记录从 [Design.md](../../Design.md) 到当前代码实现的关键映射、取舍、以及尚未覆盖的高级特性。它面向后续维护者、扩展模块的开发者，以及需要理解“为什么这样实现”的审计人员。

---

## 1. 设计意图到代码的映射

| Design.md 章节 | 设计意图 | 实现文件 | 关键类/函数 |
|---|---|---|---|
| §3 抽象层 | Module / Bus / Clock 抽象 | [`src/novelist_brain/module.py`](../../src/novelist_brain/module.py) | `Module` |
| §4 总线设计 | 事件/数据/控制三总线 | [`src/novelist_brain/bus.py`](../../src/novelist_brain/bus.py) | `BusRouter`, `EventBus`, `DataBus`, `ControlBus` |
| §5 数据通路 | 经验→记忆→灵感→创作→反馈 | 多个模块 | `PersonalInput`, `MemorySystem`, `DMN`, `CEN`, `MentalSandbox`, `CreationExecutive`, `NovelOutput` |
| §6 模块契约 | 生命周期与消息结构 | [`src/novelist_brain/module.py`](../../src/novelist_brain/module.py) | `init`, `tick`, `on_bus_message`, `emit` |
| §7 网络协作 | DMN/CEN/SN 动态切换 | [`src/novelist_brain/salience_network.py`](../../src/novelist_brain/salience_network.py) | `SalienceNetwork` |
| §8 映射机制 | Fragment → Trace → Sandbox | [`src/novelist_brain/memory.py`](../../src/novelist_brain/memory.py), [`src/novelist_brain/sandbox.py`](../../src/novelist_brain/sandbox.py) | `MemorySystem`, `MentalSandbox` |
| §9 一天周期 | 7 阶段日节律 | [`src/novelist_brain/scheduler.py`](../../src/novelist_brain/scheduler.py), [`src/novelist_brain/clock.py`](../../src/novelist_brain/clock.py) | `DailyScheduler`, `RealTimeClock` |
| §10 扩展性 | 模块热插拔 | [`src/novelist_brain/module_registry.py`](../../src/novelist_brain/module_registry.py) | `ModuleRegistry`, `Module.metadata` |
| §10 扩展性示例 | 依恋理论扩展模块 | [`src/novelist_brain/attachment.py`](../../src/novelist_brain/attachment.py) | `AttachmentModule`, `AttachmentStyle` |
| §13 LLM 调用 | 统一 LLM 抽象与提示词工程 | [`src/novelist_brain/llm.py`](../../src/novelist_brain/llm.py), [`src/novelist_brain/prompts.py`](../../src/novelist_brain/prompts.py) | `LLMService`, `ResilientLLMService`, `MockLLMService` |
| §14 持久化 | 快照 + 增量 + 急诊快照 | [`src/novelist_brain/persistence.py`](../../src/novelist_brain/persistence.py) | `PersistenceManager`, `SnapshotStore` |
| §16 社会化 | SocialSpace / SocialRole / GazePressure | [`src/novelist_brain/social_models.py`](../../src/novelist_brain/social_models.py), [`src/novelist_brain/social_input.py`](../../src/novelist_brain/social_input.py) | `SocialSpace`, `SocialRole`, `SocialInput` |
| §17 TRPG | COC 跑团判定与角色卡 | [`src/novelist_brain/trpg.py`](../../src/novelist_brain/trpg.py) | `TRPGCharacterSheet`, `GameMaster` |
| §19 EOS | 非侵入式观测与告警 | [`src/novelist_brain/eos.py`](../../src/novelist_brain/eos.py) | `EvaluationObservabilitySystem`, `MetricCollector` |
| §20 错误处理 | 自愈、降级、熔断 | [`src/novelist_brain/fault.py`](../../src/novelist_brain/fault.py), [`src/novelist_brain/recovery.py`](../../src/novelist_brain/recovery.py), [`src/novelist_brain/circuit_breaker.py`](../../src/novelist_brain/circuit_breaker.py) | `FaultManager`, `RecoveryManager`, `CircuitBreaker` |
| §21 配置管理 | 分层配置 | [`src/novelist_brain/config.py`](../../src/novelist_brain/config.py) | `NovelistConfig`, `ConfigRegistry` |

---

## 2. 核心实现决策

### 2.1 单进程、单线程、tick 驱动的运行时模型
**选择**：所有模块在同一个 Python 进程中运行，由 `RealTimeClock` 按固定间隔调用 `module.tick(delta)`，模块之间不直接调用，只通过 `BusRouter` 发消息。

**理由**：
- 降低分布式系统的调试与序列化成本，使“脑中世界”能在单台机器上完整运行。
- tick 驱动天然支持 fast-forward 测试模式（每 tick 推进 30 分钟模拟时间），便于验证多日行为。
- 所有状态都在内存中，快照恢复只需序列化模块状态，无需处理跨进程一致性。

**代价**：
- 无法水平扩展；CPU 密集型模块会互相阻塞。
- 单模块崩溃可能拖垮整个进程（已通过事务边界和急诊快照部分缓解）。

### 2.2 三条逻辑总线复用同一个路由队列
**选择**：`BusRouter` 内部只有一个 `_inbox` 队列，消息通过 `channel` 字段区分事件/数据/控制，而非三条物理队列。

**理由**：
- 简化优先级与 TTL 的实现：所有消息按 `priority` 降序、时间升序统一排序。
- 控制总线消息可通过 `candidates.update(self._modules.keys())` 广播给所有模块，实现“覆盖语义”。

**代价**：
- 控制总线的高优先级消息不会真正抢占已处于 `route()` 中的消息，只是优先出队。

### 2.3 Module 状态统一使用 `ModuleState` + dataclass
**选择**：每个模块内部维护 `self._state: ModuleState`（含 `active`, `energy_cost`, `custom`），并通过 `to_dict()` / `from_dict()` 进行快照和恢复。复杂子状态（如 `SocialState`、`TRPGCharacterSheet`）单独用 dataclass 管理，但序列化时统一压平到字典。

**理由**：
- `ModuleState` 为事务管理器提供统一接口：`TransactionManager` 只需调用 `module.to_dict()` 即可捕获快照。
- dataclass 保证字段可预测，便于配置迁移和快照验证。

**代价**：
- 子状态的序列化/反序列化需要模块自己维护，容易出错（如 `social_input.py` 早期用 `"state"` 键覆盖了 `ModuleState`，后修复为 `"social_state"`）。

### 2.4 LLM 服务统一包装为 resilience 版本
**选择**：`main.py` 中所有模块拿到的 `llm_service` 都是 `ResilientLLMService`，它内部再持有真实服务或 `MockLLMService`。`ResilientLLMService` 负责重试、熔断、fallback、故障发布。

**理由**：
- 模块无需关心 LLM 是否可用、是否需要降级，只需调用 `complete()`。
- `ResilientLLMService` 继承 `LLMService` 并暴露 `is_mock` 属性，解决了 `isinstance(..., MockLLMService)` 在包装后失效的问题。

**代价**：
- 真实 LLM 错误被吞掉并转为 fallback，模块无法感知原始异常（但可通过控制总线 `control.fault.error` 订阅）。

### 2.5 配置分层：内置默认 → 用户文件 → 环境变量 → CLI
**选择**：`ConfigRegistry` 按四层优先级合并配置，版本号 `CONFIG_VERSION = "2.1.0"` 用于未来迁移。`SocialConfig` 已将 `spaces` / `roles` / `npcs` 外化为可配置项，用户可在 `novelist.config.json` 中覆盖默认社交世界。

**理由**：
- 保证系统在无配置文件、无环境变量时也能用内置默认值启动。
- CLI 参数（如 `--llm-model`）可临时覆盖配置，方便测试。
- 社交世界（NPC、空间、角色）外化后，无需改代码即可让林逸生活在不同城市或拥有不同社交圈。

**代价**：
- 配置字段分散在多个 dataclass 中，新增字段需要同时修改 `config.py`、`default.config.json`、`novelist.config.example.json`。

### 2.6 EOS 作为非侵入式镜像
**选择**：`EvaluationObservabilitySystem` 是一个普通 `Module`，订阅主总线并聚合事件为指标。它不直接修改任何模块状态，只发布 `control.eos.recommendation`。

**理由**：
- 符合 Design.md §19“观测体系不应改变被观测系统”的要求。
- 可随时禁用（`eos.enabled = false`）而不影响核心循环。

**代价**：
- 指标定义与阈值需要随系统演化持续调优（已进行一轮阈值降噪）。

### 2.7 事务边界放在 tick 级 flush
**选择**：`main.py` 在每个 tick 调用 `router.flush()` 前调用 `transaction_manager.begin(eager=True)`，flush 失败时回滚所有模块状态。

**理由**：
- 一条消息可能触发多个模块的级联反应（如 `control.sandbox.simulate` → `MentalSandbox` → `data.sandbox.narrative.ready` → `CEN`），tick 级事务能一次性回滚整个级联。
- 与 Design.md §14“关键操作事务化”一致。

**代价**：
- 快照频率等于 tick 频率，内存中保留每个模块的最新检查点；长运行可通过 `clear_checkpoints()` 清理。

### 2.8 社会空间与 TRPG 采用简化规则
**选择**：
- 社会关系用一维 `intensity` + `type` 表示，而非复杂情感图谱。
- TRPG 判定采用 COC 五级结果（大成功/困难成功/成功/失败/大失败），但角色卡属性由人格特质推导，不依赖外部规则书。
- 脑中世界由 `CharacterProjection` + `WorldModel` + `NarrativeLine` 组成，没有实现完整的场景图或时间线版本控制。

**理由**：
- 先验证“社会经验 → 记忆 → 沙盘 → 创作”的完整数据通路，再逐步加深规则复杂度。
- 简化规则使 mock LLM 下也能产出可理解的叙事。

**代价**：
- 社会关系演进较浅，难以支撑长篇小说中多人物弧光。
- TRPG 判定目前更像“叙事调味”，对创作选择的实际约束有限。

### 2.9 扩展模块示例：依恋理论模块
**选择**：
- 新增 `AttachmentModule` 作为 Design.md §10 扩展性的具体示例，从社会事件流中推断依恋风格，不修改任何核心模块。
- 依恋风格基于 Bowlby/Ainsworth 四分法（secure / anxious / avoidant / disorganized），由正负情感累计、关系强度和不一致性推导。
- 模块通过订阅 `data.social.state` 在初始化时同步已有 NPC 关系，避免错过预种子社交世界。

**理由**：
- 验证模块热插拔机制：新模块仅需实现 `Module` 接口、声明元数据依赖、通过 `ModuleRegistry` 注册即可接入主循环。
- 依恋理论为社会关系网络提供心理学解释层，未来可影响创作主题选择或角色行为倾向。
- `data.social.state` 广播使下游扩展模块无需关心 `SocialInput` 内部数据结构，降低耦合。

**代价**：
- 依恋风格计算采用简化启发式，未引入完整的发展心理学模型。
- 当前 `AttachmentModule` 主要作为观测/标注模块，尚未反向影响社交行为或创作决策。

### 2.10 恢复动作结果的去重消费
**选择**：
- `RecoveryManager` 订阅 `control.recovery.result` 以支持外部异步恢复动作（如 RETRY）的结果上报。
- 同步动作（RESTART_MODULE、DEGRADE、SWITCH_NETWORK 等）执行后会自行发布结果广播；`_handle_recovery_result` 仅处理仍处于 `running` 状态的 pending 动作，忽略已完成的同步动作结果，避免成功/失败计数被重复累加。

**理由**：
- 7 天 mock 运行中曾出现 `succeeded=3003, failed=3003` 的荒谬计数，暴露出自发布结果被自身再次消费的问题。
- 保留异步结果通道，使未来真正需要外部确认的重试机制仍能正确记账。

**代价**：
- 如果外部系统错误地发布了一个已完成动作的结果，该结果会被静默忽略；需要在日志或 EOS 中额外观测此类异常。

### 2.11 事件载荷保持 dataclass / dict 兼容性
**选择**：
- 总线消息 `payload` 允许传递 dataclass 实例（如 `Fragment`）或纯字典；消费端在访问前先做类型适配。
- `AttachmentModule._on_social_fragment` 使用 `dataclass_to_dict()` 将可能的 `Fragment` 实例转为字典后再访问字段。

**理由**：
- 发布端为了保留类型信息常直接 emit dataclass 对象；强制所有事件都序列化为字典会增加发布端负担并可能丢失类型辅助。
- 消费端做防御性类型转换可以在不修改发布端的情况下兼容多种 payload 形式。

**代价**：
- 每个消费端都需要重复类型检查；长期来看应约定统一序列化边界（如在 emit 时自动 to_dict），或引入强类型消息契约。

### 2.12 社会来源痕迹 `SocialTrace`
**选择**：
- `MemorySystem` 在巩固碎片为 `Trace` 时，若簇中包含通过 `data.social.fragment` 事件标记了社会来源的碎片，则生成 `SocialTrace`，保留 `space_id`、`dialogue_mode`、`gaze_pressure`、`relationship_delta`。
- 社会来源信息以 `fragment_id -> social_provenance` 映射的形式在 `MemorySystem` 内部暂存，随模块状态一起序列化/反序列化。
- 多个社会字段聚合时采用保守启发式：`space_id` 取首个非空、`dialogue_mode` 取众数、`gaze_pressure` 取最大、`relationship_delta` 按目标累计 delta。

**理由**：
- 实现 Design.md §16.8 “社交经验应携带空间、角色、凝视压力等上下文进入记忆沉淀”的要求。
- 不改变现有 `Trace` 数据结构和普通碎片巩固路径，仅在存在社会上下文时生成子类型，降低回归风险。
- `SocialTrace` 作为 `Trace` 子类，可继续被 `MentalSandbox`、`CEN` 等下游模块无差别消费；未来若需按空间/关系检索，可基于子类型字段过滤。

**代价**：
- 社会来源映射需要在 `MemorySystem` 中单独维护，增加了序列化负担和内存占用。
- 聚合策略较简单，无法完整保留一次多人对话中每个参与者的独立关系变化；更精细的社会语义需要后续扩展。

### 2.13 真实 LLM 端到端验证
**选择**：
- 使用项目根目录下的 `API.info` 中配置的 OpenAI 兼容接口（`Qwen/Qwen2.5-7B-Instruct`）运行完整 1 天 fast-forward 闭环，验证真实 LLM 下的中文生成、系统稳定性、EOS 观测与模块状态持久化。
- 不将 `API.info` 纳入版本控制（已在 `.gitignore` 中排除），避免密钥泄漏。

**理由**：
- mock 模式只能验证控制流与数据通路，无法确认提示词工程、LLM 输出解析、中文叙事质量在真实模型上的表现。
- 1 天 48 tick 的验证成本可控（约 4 分钟 wall-clock），但能覆盖所有日阶段与核心创作触发路径。
- 验证结果显示系统可稳定跑完一天，生成中文段落，EOS 正确上报 `llm_avg_latency_ms` critical 告警，依恋、社交、代谢等扩展模块状态正常序列化。

**代价**：
- 真实 LLM 延迟（本例约 4 s/调用）使 fast-forward 仍然比 mock 慢两个数量级，7 天真实 LLM 长期运行需要更长时间与 API 费用。
- 单次验证未触发熔断/降级路径，故障恢复逻辑仍需依赖 `test_fault_recovery.py` 中的注入测试。

### 2.14 EOS LLM 延迟动态阈值
**选择**：
- `LLMCollector` 维护跨评估窗口的滚动延迟历史，基于历史均值与标准差动态调整 `llm_avg_latency_ms` 的 warning/critical 阈值。
- 当前窗口的延迟仅用于计算 metric value，不混入历史基线；aggregate 结束后才将当前窗口平均值写入历史。

**理由**：
- 真实 LLM 验证中，固定 0.98 critical 阈值在 4 s 平均延迟的慢 API 下持续触发 critical，形成误报。
- 动态阈值让 EOS 学会“这台 API 本来就这么慢”，只报告相对于基线的异常波动，而不是绝对延迟。
- 保留固定阈值作为历史样本不足时的fallback，保证冷启动阶段仍有合理告警。

**代价**：
- 需要至少 10 个窗口样本才能切换到动态阈值，冷启动阶段仍可能误报。
- 历史窗口平均值会跨快照持久化（随 EOS 模块状态一起保存），恢复后阈值会继承之前的学习结果。

### 2.15 依恋模块反向影响创作基调、社交能量与网络切换
**选择**：
- `AttachmentModule` 在 `tick()` 中根据当前 overall 依恋风格通过三条控制总线消息发布下游影响：
  - `control.creative.tone`：创作基调（情绪、节奏、主题偏向）。
  - `control.social.energy.budget`：社交能量消耗倍率（secure 1.0、anxious 1.15、avoidant 1.4、disorganized 1.25）。
  - `control.network.preference`：DMN/CEN 切换偏置（anxious 偏 DMN、avoidant 偏 CEN、disorganized 双高）。
- `CreationExecutive` 订阅 `control.creative.tone`，仅接受 `source=attachment` 的 tone，并将其追加到小说段落生成的 system prompt 中。
- `SocialInput` 订阅 `control.social.energy.budget`，将倍率乘入每次社交遭遇的 `energy_drain`。
- `SalienceNetwork` 订阅 `control.network.preference`，用 bias 调整 salience 阈值与 fallback score 阈值，影响网络切换决策。
- 依恋风格映射保持简单：secure→温暖克制、anxious→紧张渴望、avoidant→疏离观察、disorganized→断裂矛盾。

**理由**：
- 实现 Design.md §10.1 “添加新理论模块时应声明它对 DMN/CEN/脑中世界的影响方式”的要求。
- 通过控制总线而非直接函数调用实现影响，保持模块解耦与热插拔能力。
- 创作基调作为 system prompt 的一部分，对真实 LLM 有实际语义约束；社交能量与网络切换偏置在 mock 与真实模式下均有实际数值影响。
- 能量倍率符合心理学直觉：avoidant 视社交接触为高成本，anxious 因过度警觉而更快耗竭。
- 网络偏置与创作风格一致：anxious 倾向 DMN 反刍与等待，avoidant 倾向 CEN 控制与隔离。

**代价**：
- 依恋风格→下游影响的映射是手动设计的，可能过于简化；未来可让 LLM 根据更细粒度的人格参数自动推导。
- 三条控制消息目前仅由 `AttachmentModule` 发布，若未来多个心理学模块同时发布 `control.network.preference`，需要合并策略而非简单覆盖。
- `SalienceNetwork` 的 bias 只调整阈值，不覆盖由阶段（DMN/CEN phases）和能量强制规则决定的硬约束。

### 2.16 本地 SQLite 混合记忆后端
**选择**：
- 使用 Python 标准库 `sqlite3` 实现 `HybridMemoryStore`，支持文档（fragments/traces）、向量（embedding JSON + in-process 余弦相似度）、图（edges + PageRank）、时序（events）四类存储，零外部依赖。
- `MemorySystem` 通过可选 `store` 参数与 `memory.backend` 配置集成：默认 `memory` 保持纯内存行为，`sqlite` 则自动创建/打开本地数据库并同步写入 fragment/trace 与图边。
- 向量检索不依赖 FAISS/Neo4j 等外部服务，仅在 embedding 存在时计算余弦相似度；标签匹配仍是主要检索路径。
- 快照恢复时通过 `_sync_to_store()` 将内存中的 fragments/traces 回填到 SQLite，保证从旧快照切换 backend 不丢失数据。

**理由**：
- 贯彻 Design.md “本地数据库优先”的混合存储要求，避免引入需要额外部署的外部向量/图数据库。
- SQLite 是标准库，与现有原型零依赖理念一致，可在任何运行 Python 的环境中直接使用。
- 默认 `memory` backend 保证现有测试、mock 模式、CI 不受文件路径与数据库状态影响；`sqlite` 作为显式 opt-in 供生产使用。
- 图边设计为后续社会网络、记忆关联、叙事线索追踪提供扩展点，而无需立即替换核心检索逻辑。

**代价**：
- 向量检索是全表扫描 + Python 计算，数据量大时性能不如专用向量数据库；当前原型规模下可接受。
- `MemorySystem` 同时维护内存索引与数据库存储，代码路径稍复杂；测试需要覆盖两种 backend。
- embedding 目前由调用方提供（如 LLM 服务），若未提供则退化为标签匹配，语义检索能力取决于调用方。

### 2.17 多模态图片输入（音频/传感器明确不接入）
**选择**：
- 仅实现图片输入，通过 `data.multimodal.image.new` 事件进入 `PersonalInput`，转换为 `source="multimodal"`、`modality="image"` 的 `Fragment`，并附带 `image_url`。
- LLM 层通过 `context["image_url"]` / `context["image_urls"]` 传递 vision 输入，`OpenAILLMService` 将其转换为 OpenAI 兼容的 `image_url` 消息格式；模型原生不支持 vision 时由 `MockLLMService` 或 fallback 返回固定中文图像描述。
- 音频、传感器等其他模态明确不接入；`MultimodalConfig.supported_modalities` 默认仅包含 `["image"]`，作为范围声明。

**理由**：
- 用户明确：多模态输入的图像、音频、传感器“依赖模型原生多模态能力即可，暂时只支持图片就行”。
- OpenAI 兼容接口的图片 URL 格式是事实标准，可直接复用现有 `OpenAILLMService`，无需新增依赖。
- 将图片视为一种经验 fragment，可自然参与记忆沉淀、trace 巩固与脑中世界映射，保持数据通路统一。

**代价**：
- 不支持本地文件上传，只能使用可公开访问的 URL 或 base64 data URI（受 provider 支持程度限制）。
- 图片模态不参与 embedding 生成，检索仍依赖文本描述与标签。
- 未实现图片大小校验与预处理，仅通过配置 `max_image_size_bytes` 记录限制意图。

---

## 3. 与 Design.md 的偏差与取舍

| Design.md 描述 | 当前实现 | 偏差说明 |
|---|---|---|
| “记忆存储：混合存储（向量/图/时序/文档），本地数据库优先” | 内存列表（默认）+ SQLite 混合存储（可选） | `HybridMemoryStore` 已实现 SQLite 本地后端，支持文档/向量/图/时序四类存储；默认 `memory` backend 保持向后兼容，可通过配置切换为 `sqlite`。检索仍以标签匹配为主，向量相似度在 embedding 存在时补充。 |
| “多模态输入（图像/音频/传感器）” | 仅支持图片输入 | 通过 `data.multimodal.image.new` 与 OpenAI 兼容 `image_url` 接入；音频、传感器明确不计划。 |
| “外部读者/编辑反馈闭环” | 不计划实现 | Design.md 中提到的反馈回路不在当前路线图中，创作风格在线学习相应未实现。 |
| “脑中世界版本：版本化 + 可回滚” | 无版本控制 | 沙盘状态随模块状态一起快照，不支持显式分叉/回滚到某次推演。 |
| “上下文管理：分层窗口 + 相关性截断” | prompt 直接拼接历史文本 | 未实现 token 预算动态截断，依赖 `max_tokens` 和固定上下文。 |
| “PFC 人格一致性审查” | `IdentityCore` 提供约束，但未主动拦截创作 | 人格更多作为 prompt 上下文，而非运行时审查器。 |
| “配置热更新” | 启动时加载一次 | 运行期不支持重新加载 `novelist.config.json`。 |
| “真实 LLM 端到端验证” | 已通过 `Qwen/Qwen2.5-7B-Instruct` 完成 1 天闭环验证 | 中文生成可用、系统稳定、EOS 告警准确；7 天真实 LLM 长期运行尚未执行。 |

---

## 4. 未覆盖的高级特性

以下特性在 Design.md 中有描述或暗示，但当前代码尚未实现或仅实现骨架：

1. **多模态输入（图片）**：✅ 已实现。`Fragment` 支持 `image_url` 与 `modality="image"`，`PersonalInput` 可接收 `data.multimodal.image.new`，`OpenAILLMService` 支持 OpenAI 兼容 `image_url` 消息。音频、传感器明确不接入。
2. **本地混合记忆后端**：✅ 已实现 `HybridMemoryStore`（SQLite），但默认 backend 仍为 `memory`，未在生产配置中默认启用。
3. **长期关系网络演化**：关系只有一维 intensity，缺少信任衰减、背叛修复、群体关系等。
4. **完整 TRPG 规则书支持**：仅实现了 COC 简化判定，未覆盖技能成长、理智崩溃、战役剧情。
5. **创作风格的在线学习**：创作执行模块使用固定 `style_profile`，未根据读者/编辑反馈调整。
6. **多世界分叉与 A/B 推演**：脑中世界没有版本分支，无法对比不同情节走向。
7. **真实睡眠与梦境生成**：DMN 在 deep_night 阶段有活动，但未模拟真实梦境叙事。
8. **配置热更新与迁移**：`CONFIG_VERSION` 存在，但迁移逻辑未实现；运行期不能重载配置。
9. **社会空间可视化 UI**：已实现 JSON 导出，但缺少图形化仪表盘或 Web 前端。

**明确不计划**：外部读者/编辑反馈闭环不在当前路线图中。

---

## 5. 测试与验证策略

| 测试类型 | 文件/命令 | 覆盖目标 |
|---|---|---|
| 单元测试 | `tests/test_social_trpg.py` | 社交模型、TRPG 判定、沙盒集成 |
| 单元测试 | `tests/test_social_visualization.py` | 社交状态 JSON 导出、控制总线触发 |
| 单元测试 | `tests/test_transaction.py` | 事务提交/回滚、急诊快照 |
| 单元测试 | `tests/test_fault_recovery.py` | 故障评估、恢复动作、熔断 fallback |
| 单元测试 | `tests/test_module_registry.py` | 模块注册、拓扑排序、插件发现 |
| 单元测试 | `tests/test_attachment.py` | 依恋风格评估、扩展模块事件订阅与状态序列化 |
| 单元测试 | `tests/test_memory_social_trace.py` | 社交碎片固化为 `SocialTrace` 并持久化 |
| 单元测试 | `tests/test_eos_thresholds.py` | EOS 阈值降噪 |
| 冒烟测试 | `python main.py --fast-forward --days 1 --use-mock` | 完整日循环、快照、小说段落生成 |
| 真实 LLM 验证 | `python main.py --fast-forward --days 1 --llm-base-url <URL> --llm-api-key <KEY> --llm-model Qwen/Qwen2.5-7B-Instruct` | 真实 API 中文生成、EOS 观测、模块状态持久化 |
| 长期稳定性 | `python main.py --fast-forward --days 7 --use-mock` | 7 日无崩溃、无事务回滚、无恢复动作 |

**验证入口**：
```bash
PYTHONPATH=/home/hedaas/文档/project/LinYi python -m pytest tests/ -v
PYTHONPATH=/home/hedaas/文档/project/LinYi python main.py --fast-forward --days 1 --use-mock
```

---

## 6. 运行与运维注意

### 6.1 启动方式
- **常驻模式**：`python main.py`（tick 间隔 60 秒，与现实时间同步）。
- **测试模式**：`python main.py --fast-forward --days 1 --use-mock`（48 tick 跑完一天）。
- **真实 LLM**：设置环境变量 `OPENAI_BASE_URL` 和 `OPENAI_API_KEY`，或使用 CLI 参数 `--llm-base-url` / `--llm-api-key`。

### 6.2 配置文件
- [`default.config.json`](../../default.config.json)：内置默认值，不应修改。
- `novelist.config.json`：用户级配置，覆盖默认值。
- [`novelist.config.example.json`](../../novelist.config.example.json)：配置模板。

### 6.3 状态文件
- 默认保存为 `agent_state.json.latest` + `agent_state.json.deltas.jsonl`。
- 日边界会自动创建快照到 `agent_state.json.snapshots/snapshot_YYYYMMDDTHHMMSS.json`。
- 持久化失败时会写入 `agent_state.json.emergency_*.json`。

### 6.4 观测与调试
- EOS 报告通过 `control.eos.recommendation` 发布，可在主循环日志中查看告警数与建议。
- 社交状态可通过向总线发送 `control.social.export` 触发 `data.social.export` 事件获取完整 JSON 视图。
- 故障与恢复统计在退出时打印：`faults_assessed`、`actions_dispatched`、`actions_succeeded`、`actions_failed`、`safe_mode`。
- 长期运行后应检查 `faults_assessed` 是否为 0；非 0 时可通过快照中 `modules.fault_manager.faults[].message` 查看具体错误消息。

---

## 7. 后续扩展建议

1. **长期真实 LLM 运行**：在 1 天验证通过的基础上，运行 3–7 天真实 LLM，观察长期告警模式、代谢趋势、依恋风格演化与社交关系形成。
2. **多心理学模块控制信号合并策略**：当 `control.network.preference` 或 `control.social.energy.budget` 存在多个发布者时，设计加权合并或优先级规则，避免后到达的消息简单覆盖前者。
3. **本地混合记忆后端**：优先使用 SQLite/DuckDB 等本地数据库存储向量、图、时序、文档四类记忆，替换当前内存列表 + 标签匹配。
4. **配置热更新**：在 `ConfigRegistry` 中监听文件变化，向所有模块广播 `control.config.updated`。
5. **关系网络深化**：为 `Relationship` 增加情感维度（信任、亲密、义务、怨恨）和群体关系。
6. **图片多模态输入**：让 Fragment 支持 `image_url`/`image_base64`，并依赖模型原生多模态能力进行理解与沉淀；音频与传感器暂不计划。
7. **Web 仪表盘**：将 `data.social.export` 与 EOS 报告接入小型 Web UI，实时展示社交空间、关系网络、代谢资源与告警趋势。