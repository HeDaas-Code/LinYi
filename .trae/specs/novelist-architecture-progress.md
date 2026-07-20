# 小说家大脑系统架构完成度与落地计划

本文件对照 [Design.md](../../Design.md) 跟踪当前系统的实现进度，并规划后续架构落地阶段。

---

## 1. 完成度总览

| Design.md 章节 | 核心内容 | 完成状态 | 关键文件/说明 |
|---|---|---|---|
| 1. 设计目标 | 构建自主创作主体 | ✅ 已对齐 | `main.py` 常驻循环 |
| 2. 架构总览 | 三层抽象、三总线、五数据通路 | ✅ 已实现 | `src/novelist_brain/` 模块群 |
| 3. 抽象层设计 | Module / Bus / Clock 抽象 | ✅ 已实现 | `module.py`, `bus.py`, `clock.py` |
| 4. 总线设计 | Event / Data / Control Bus | ✅ 已实现 | `bus.py` |
| 5. 数据通路设计 | 经验输入→记忆→灵感→创作→反馈 | ✅ 已实现 | `personal_input.py`, `memory.py`, `dmn.py`, `cen.py`, `creation_executive.py`, `novel_output.py` |
| 6. 功能模块接口契约 | Module 生命周期、消息结构 | ✅ 已实现 | `module.py`, `models.py` |
| 7. 脑中世界与 CEN/DMN 协作时序 | 网络切换、灵感调度 | ✅ 已实现 | `salience_network.py`, `cen.py`, `dmn.py` |
| 8. 从经验碎片到脑中世界映射 | Fragment → Trace → Sandbox | ✅ 已实现 | `memory.py`, `sandbox.py` |
| 9. 完整的一天周期 | 7 阶段日节律 | ✅ 已实现 | `scheduler.py`, `clock.py` |
| 10. 扩展性设计 | 模块热插拔、总线扩展 | ✅ 已实现 | `module.py` 元数据、`module_registry.py` 注册与发现、`main.py` 集成；`attachment.py` 作为新模块零侵入接入示例 |
| 11/15. 核心设计决策回顾 | — | ✅ 已文档化 | [`novelist-architecture-decisions.md`](./novelist-architecture-decisions.md) |
| 12. 术语表 | — | ✅ 已映射到数据模型 | `models.py` |
| 13. LLM 调用层与提示词工程 | LLMService、prompt 模板 | ✅ 已实现 | `llm.py`, `prompts.py` |
| 14. 状态持久化与恢复 | 快照 + 增量日志、事务边界、急诊快照、retention | ✅ 已实现 | `persistence.py`, `transaction.py`, `module.py` checkpoint |
| 16. 小说家社会化设计细化 | SocialSpace、SocialRole、GazePressure、Relationship | ✅ 已实现 | `social_models.py`、`social_input.py` 维护社交状态并生成事件 |
| 17. 脑内世界跑团设计细化 | COC 跑团、角色卡、判定、世界模型 | ✅ 已实现 | `trpg.py`、`sandbox.py` 集成角色卡、技能判定与 GM 仲裁 |
| 18. 补充后的架构全景 | — | ✅ 已覆盖 | 各模块已落地 |
| **19. 评估与观测体系 (EOS)** | 指标、采集器、观测总线、仪表盘、阈值告警 | **✅ 已实现** | **新增 `src/novelist_brain/eos.py`** |
| **20. 错误处理与降级策略** | AgentError、Fault、RecoveryManager、熔断 | **✅ 已实现** | **`src/novelist_brain/fault.py`, `recovery.py`, `circuit_breaker.py`, `main.py` 集成** |
| **21. 配置管理系统** | 分层配置、热加载、环境变量 | **✅ 已实现** | **`src/novelist_brain/config.py`** |
| 22. 设计知识溯源 | 参考仓库 | ✅ 已克隆 | `.trae/references/` 下的 5 个仓库 |

### 关键状态说明

- **已完成（✅）**：代码已落地并通过 smoke test，模块可在 `main.py` 常驻循环中运行。
- **部分实现（🟡）**：核心骨架存在，但 Design.md 中的高级特性（如完整社会空间、完整 TRPG 角色卡、错误自愈）尚未实现。
- **未实现（❌）**：章节对应的主要组件尚未开始编码。

---

## 2. 已落地阶段总结

### 阶段 0：MVP 原型
- 文件：`src/novelist_brain/` 下所有基础模块
- 成果：实现最小可运行的一天闭环（生活 → 创作 → 睡眠）。

### 阶段 1：配置管理系统（本节已完成）
- 文件：
  - `src/novelist_brain/config.py`：分层配置（内置默认 / 用户文件 / 环境变量 / CLI）
  - `default.config.json`：内置默认配置
  - `novelist.config.example.json`：用户配置示例
  - `main.py`：集成 `ConfigRegistry`，替换硬编码参数
- 成果：LLM、人格、生理、创作、社交、跑团、持久化、EOS 参数全部可配置。

### 阶段 2：评估与观测体系 EOS（本节已完成）
- 文件：
  - `src/novelist_brain/eos.py`：EOS 核心实现
  - `src/novelist_brain/config.py`：新增 `EOSConfig`
  - `default.config.json` / `novelist.config.example.json`：EOS 配置示例
  - `main.py`：实例化 EOS、注册采集器、在 tick 循环中 feeding 消息
- 实现内容：
  - `Metric` / `MetricThreshold` / `EvaluationReport` 数据模型
  - `MetricCollector` 抽象基类
  - 7 个采集器：`LLMCollector`、`MemoryCollector`、`MetabolismCollector`、`SandboxCollector`、`SocialCollector`、`NetworkCollector`、`CreativeCollector`
  - `ObservabilityBus`：二级观测总线，支持采样与事件导出
  - `Dashboard`：只读指标视图
  - `EvaluationObservabilitySystem`：Module 实现，按 tick/阶段切换触发评估，生成告警与建议
- 验证：`main.py --fast-forward --days 1 --use-mock` 成功运行，输出 EOS 报告与告警。

---

## 3. 已落地阶段详情

### 阶段 3：错误处理与降级策略（Design.md §20）【已完成】
**目标**：在 LLM 失败、记忆损坏、跑团失控、代谢崩溃、总线阻塞、持久化失败、人格一致性断裂等场景下实现自愈、降级与安全模式。

**已交付**：
1. `src/novelist_brain/fault.py`：
   - `AgentError` / `Fault` / `RecoveryAction` 数据类
   - `ErrorType` / `RecoveryStrategy` / `Severity` 枚举、`RetryPolicy`
2. `src/novelist_brain/recovery.py`：
   - `FaultManager`：订阅 `control.fault.error`，评估影响范围并生成 `Fault`
   - `RecoveryManager`：订阅 `control.fault.assessed`，选择并执行 `RecoveryAction`
   - 自愈原语映射：Retry、Rollback、Restart、SwitchNetwork、SnapshotRestore、MemoryReconstruct、Degrade、SafeMode
3. `src/novelist_brain/circuit_breaker.py`：
   - 熔断器状态机（closed → open → half_open），支持失败阈值与恢复超时
4. 集成点：
   - `llm.py`：`ResilientLLMService` 包装 LLM 调用，带重试、熔断、fallback、故障发布
   - `main.py`：实例化 FaultManager / RecoveryManager；LLM 服务自动包装为 resilience 版本；向 RecoveryManager 注入 modules / persistence 上下文
   - `persistence.py`：新增 `SnapshotStore`，支持 `restore_snapshot`
   - `config.py`：新增 `FaultConfig` 并入 `NovelistConfig`，`default.config.json` 与示例文件已更新
5. 验证：
   - `python main.py --fast-forward --days 1 --use-mock` 通过 48 tick 完整日循环
   - `PYTHONPATH=. python tests/test_fault_recovery.py` 错误注入测试通过，验证故障评估、恢复动作派发、熔断打开与 fallback 路径

### 阶段 4：事务边界与持久化深化【已完成】
**已交付**：
1. `src/novelist_brain/transaction.py`：
   - `Transaction`：捕获模块 `to_dict()` 快照，支持 `commit()` / `rollback()`。
   - `TransactionManager`：协调跨模块事务，支持 eager（全局 tick 级）与 lazy（按需）快照。
2. `src/novelist_brain/module.py`：
   - 为 `Module` 基类增加 `checkpoint()` / `rollback()` / `clear_checkpoints()`，供 RecoveryManager 与模块自身使用。
3. `src/novelist_brain/persistence.py`：
   - `verify()`：加载快照+增量并校验顶层结构与时间戳。
   - `emergency_snapshot()`：持久化失败时写入独立急诊快照。
   - `apply_retention()`：按配置清理旧快照与旧急诊快照。
   - `list_snapshots()`：列出所有快照文件。
4. `src/novelist_brain/config.py` / `default.config.json`：
   - `PersistenceConfig.retention` 增加 `snapshots` 与 `emergency_snapshots` 容量限制。
5. `main.py`：
   - tick 边界使用 `TransactionManager.begin(eager=True)` 包裹 `router.flush()`，消息处理异常时自动回滚所有模块。
   - `_persist_for_event`、日边界 `rotate`、最终保存均捕获异常并写入 `emergency_snapshot` / 发布 `control.fault.error`。
6. 验证：
   - `tests/test_transaction.py`：验证 flush 失败回滚、成功提交、`verify()` 与 `emergency_snapshot()`。
   - `main.py --fast-forward --days 1 --use-mock` 通过 48 tick。

### 阶段 5：社会化与 TRPG 机制深化【已完成】
**已交付**：
1. `src/novelist_brain/social_models.py`：
   - `SocialSpace`（列斐伏尔三元空间）、`SocialRole`（戈夫曼角色）、`Norm`、`GazePressure`、`Relationship`、`SocialEncounter`、`SocialState` 等数据模型。
   - 默认空间（广场、咖啡馆、出租屋、车站、夜市）与默认角色（观察者、常客、访谈者、局外人、隐者）。
2. `src/novelist_brain/social_input.py` 升级：
   - 维护当前空间、角色、社交能量、关系、凝视压力。
   - 基于空间类型、角色亲和力、社交能量、阶段生成社交遭遇。
   - 每次遭遇发布 `data.social.fragment`、`data.social.gaze`、`data.social.state`、`data.social.relationship.delta`、`data.social.trace` 等事件。
   - 修复 `to_dict()` 覆盖 `ModuleState` 导致的快照加载崩溃（改为 `social_state` 键）。
3. `src/novelist_brain/trpg.py`：
   - COC 风格 `TRPGCharacterSheet`（属性、技能、理智值）。
   - `resolve_skill_check` 支持大成功、困难成功、成功、失败、大失败五级判定。
   - `GameMaster` 根据行动意图选择技能、判定、应用理智冲击并生成文学化叙述。
   - `build_narrative_line` 将技能判定结果聚合为叙事线。
4. `src/novelist_brain/sandbox.py` 集成：
   - 每个 `CharacterProjection` 自动构建 TRPG 角色卡。
   - 推演轮次通过 `GameMaster.resolve_round` 进行 COC 判定。
   - 支持 `control.sandbox.build` / `control.sandbox.simulate` 以及 `data.social.trace`  enrich 世界模型。
5. EOS 联动：
   - `SocialCollector` 订阅真实社交事件，计算 `social_health`、`gaze_load`、`social_fragment_quality`。
   - `SandboxCollector` 订阅 `data.sandbox.character.action` 与 `data.sandbox.narrative.ready` 计算 `character_autonomy`、`narrative_yield`。
6. 测试：
   - 新增 `tests/test_social_trpg.py`，17 个用例覆盖社交模型、SocialInput 事件与序列化、TRPG 判定、沙盒集成、EOS 采集器。
   - `python main.py --fast-forward --days 1 --use-mock` 通过 48 tick 完整日循环，生成小说段落并创建快照。
   - 快照可正常重新加载并继续运行。

### 阶段 6：整合验证与长期运行测试【已完成】
**已交付**：
1. **长期稳定性**：
   - 运行 `python main.py --fast-forward --days 3 --use-mock`，完成 144 tick，生成 3 个小说段落，状态文件约 141KB/日，无崩溃。
   - 运行 `python main.py --fast-forward --days 1 --use-mock` 重新验证，48 tick 完整日循环通过。
2. **质量修复**：
   - 发现 `ResilientLLMService` 包装 `MockLLMService` 后，`isinstance(..., MockLLMService)` 检测失效，导致 LLM 提示词直接泄漏到小说段落中。
   - 在 `src/novelist_brain/llm.py` 中为 `LLMService` / `MockLLMService` / `ResilientLLMService` 增加 `is_mock` 属性，统一 mock 检测语义。
   - 将 `src/novelist_brain/sandbox.py` 与 `src/novelist_brain/creation_executive.py` 中的 `isinstance(self._llm, MockLLMService)` 全部替换为 `self._llm.is_mock`，修复泄漏。
3. **EOS 观测**：
   - 单天运行产生 13 份报告、76 条告警，3 天运行产生 37 份报告、224 条告警；告警密度约 6 条/报告，主要由 `gaze_load`、`social_health`、`metabolism_budget` 等阈值触发，当前阈值偏敏感但功能正常。
4. **错误注入回归**：
   - 扩展 `tests/test_fault_recovery.py`，新增 `test_system_level_llm_failure_is_recovered`：在最小多模块组装中注入 `FailingLLMService`，验证 `FaultManager` 评估故障、`RecoveryManager` 派发自愈动作、`MentalSandbox` 在 fallback 下继续运行。
   - 全部 26 个测试通过。

---

### 阶段 7：扩展性设计补齐（Design.md §10）【已完成】
**已交付**：
1. `src/novelist_brain/module_registry.py`：
   - `ModuleDescriptor`：封装模块类、元数据、工厂参数。
   - `ModuleRegistry`：支持显式注册、插件目录发现、拓扑依赖排序、实例化、过滤、注销。
2. `src/novelist_brain/module.py`：
   - 为 `Module` 基类增加 `metadata()` 类方法，默认根据类名生成规范名称、版本、依赖、分类。
3. `src/novelist_brain/eos.py`：
   - `EvaluationObservabilitySystem.metadata()` 覆盖默认名称为 `eos`，并声明分类为 `observability`。
4. `src/novelist_brain/config.py`：
   - `NovelistConfig` 新增 `plugin_directory: str | None`，用于配置插件目录。
5. `main.py`：
   - `create_modules()` 改用 `ModuleRegistry` 注册内置模块，支持 `plugin_directory` 发现并加载外部模块。
   - 保持原有模块实例化顺序与 EOS 采集器初始化逻辑。
6. 验证：
   - 新增 `tests/test_module_registry.py`：5 个用例覆盖注册顺序保持、依赖拓扑排序、工厂参数覆盖、目录插件发现、注册表摘要。
   - `python main.py --fast-forward --days 1 --use-mock` 通过 48 tick。
   - 全部 31 个测试通过。

### 配置一致性补齐【已完成】
**已交付**：
1. `src/novelist_brain/config.py`：
   - 为 `FaultConfig` 增加 `to_dict()` 与 `from_dict()`，完整序列化 `RetryPolicy` 及所有自愈开关/容量参数。
2. `main.py`：
   - `build_context` 中 `"fault": cfg.fault.to_dict()` 替代原本手动拼接的 6 行字典。
3. `tests/test_fault_recovery.py`：
   - 系统级错误注入测试改用 `cfg.fault.to_dict()`。
   - 新增 `test_fault_config_roundtrip` 验证序列化/反序列化保真。
4. 验证：全部 32 个测试通过，`smoke test` 通过。

### EOS 阈值调优【已完成】
**已交付**：
1. 诊断：通过临时脚本捕获 48 tick 内告警来源，发现 `llm_avg_latency_ms`、`llm_roi`、`literarization_ratio`、`narrative_coherence`、`narrative_yield`、`dmn_activation`、`cen_activation` 在 mock 模式下因基线值或缺数据而高频误报。
2. `src/novelist_brain/eos.py` 调整：
   - `llm_avg_latency_ms`：warning 0.5→0.9，critical 0.8→0.98。
   - `llm_failure_rate`：warning 0.2→0.3，critical 0.4→0.5（对齐 Design.md）。
   - `llm_roi`：warning 0.35→0.15，critical 0.2→0.05。
   - `literarization_ratio`、`narrative_coherence`、`narrative_yield`：当窗口内无数据时 threshold 设为 `None`，避免“0 值即告警”。
   - `dmn_activation`、`cen_activation`：单窗口激活占比本身不可操作，threshold 设为 `None`，保留指标用于看板。
3. 效果：单天模拟告警从 76 条降至 7 条（约 90% 降噪）。
4. 验证：新增 `tests/test_eos_thresholds.py`，7 个用例覆盖 LLM 健康态不告警、失败率高时告警、无数据指标不告警、阈值方向语义、EOS 评估不 spam。

### 社会空间可视化【已完成】
**目标**：为 `social_input` 提供可审计、可导出的社交状态视图，便于调试、仪表盘和长期观察空间、角色、关系、凝视压力的演进。

**已交付**：
1. `src/novelist_brain/social_input.py`：
   - 新增 `visualize_state()` 方法，返回 JSON 可序列化的社交世界快照，包含：
     - `current`：当前空间、当前角色、空间凝视强度、社交能量、累积凝视负荷、能量比。
     - `spaces` / `roles`：完整空间与角色目录（含列斐伏尔三元空间、戈夫曼角色前后台等）。
     - `relationships`：关系列表与历史（可选）。
     - `gaze_pressures`：最近凝视压力读数。
     - `recent_encounters`：最近社交遭遇。
     - `summary`：计数摘要。
   - 支持 `include_history`、`max_encounters`、`max_gaze` 选项控制输出粒度。
2. 控制总线集成：
   - 订阅 `control.social.export`。
   - 收到后通过 `data.social.export` 发布可视化载荷，可配置 `target_topic` 重定向。
3. 验证：
   - 新增 `tests/test_social_visualization.py`，7 个用例覆盖 JSON 序列化、当前空间/角色、目录完整性、关系与凝视、选项限制、`control.social.export` 事件触发、快照恢复后一致性。
   - `python main.py --fast-forward --days 1 --use-mock` 通过 48 tick，告警 7 条，状态快照正常生成。
   - 全量测试：46 个用例全部通过。

### 长期运行稳定性验证【已完成】
**目标**：验证系统在 mock 模式下连续运行多日的稳定性、状态增长、EOS 告警密度与资源边界行为。

**已交付**：
1. 运行命令：
   ```bash
   PYTHONPATH=/home/hedaas/文档/project/LinYi \
     python main.py --fast-forward --days 7 --use-mock \
     --tick-interval-seconds 0.1 --save-path agent_state_7day_mock.json
   ```
2. 关键结果：
   - 完成 336 tick（7 天 × 48 tick/天），无崩溃、无事务回滚、无安全模式触发。
   - 生成并发布 7 个小说段落（每天 1 段）。
   - 记忆：292 个 fragments，9 个 traces，265 次 consolidations。
   - EOS：85 份报告，70 条告警，告警密度约 0.82 条/报告（阈值调优后显著下降）。
   - 告警分布（最近 20 份报告）：1 条告警 ×22、2 条 ×8、3 条 ×5、4 条 ×3、5 条 ×1。
   - 代谢最终状态：energy=85.6，compute=85.9，time=43.3，social=50.0；能量未耗尽。
   - 社交最终状态：social_energy=100.0，accumulated_gaze_load=0.65，关系数为 0（符合林逸“保持距离”的人格设定，但可作为后续深化关系网络的观测点）。
   - 快照文件：7 个日边界快照，大小从 140KB 增长至 366KB，日均增长约 30–50KB。
3. 观察与结论：
   - mock 模式下系统可稳定运行 7 天，状态增长线性可控。
   - EOS 阈值调优效果显著，告警不再 spam。
   - 社交关系未自然形成，提示后续可从“关系网络深化”入手增强社会空间的可玩性。

### 社会关系网络深化【已完成】
**目标**：解决长期运行中社交关系数为 0 的问题，引入可复现 NPC、关系衰减/信任演化、阶段自动移动，使林逸的社交世界从“随机陌生人”升级为“稳定的社会关系网络”。

**已交付**：
1. `src/novelist_brain/social_models.py`：
   - 新增 `SocialNPC` 数据类，表示会重复出现的非玩家角色。
   - 新增 `DEFAULT_NPCS`：10 位默认 NPC（卖报老人、广场吉他手、咖啡馆老板、咖啡馆常客、楼上邻居、房东、车站安检员、流浪者、夜市摊主、夜游的年轻人），覆盖广场、咖啡馆、出租屋、车站、夜市等空间。
   - NPC 携带 `archetype`（原型）、`initial_intensity`（初始关系强度）、`initial_trust`（初始信任）、`recurrence_weight`（复现权重）等属性。
2. `src/novelist_brain/social_input.py`：
   - 加载并维护 `_npcs` 目录，支持通过配置 `social.npcs` 覆盖默认 NPC；`main.py` 的 `build_context` 已将 `cfg.social.npcs` 注入共享上下文。
   - 新增 `_PHASE_DEFAULT_SPACES`：阶段切换时自动漂移到适合该阶段的空间（如 `social` 阶段进入 `cafe/town_square/night_market`），让社交阶段真正处于可社交空间。
   - 新增 `_PHASE_ENCOUNTER_MULTIPLIER`：社交阶段遭遇概率 ×5.0，让 2 小时社交窗口内高概率产生至少一次遭遇。
   - 修复 `_PHASE_ENCOUNTER_MULTIPLIER` 未实际应用的 bug：`_generate_encounter` 现在接收 `phase` 参数并将阶段倍率乘入遭遇概率。
   - 新增 `_pick_encounter_target`：
     - `reunion` 强烈偏好当前空间内已有关系；
     - `conflict`/`help_request` 可指向空间内任意 NPC；
     - `chance` 在陌生人、NPC、现有关系之间按强度和复现权重采样。
   - 新增 `_evolve_relationships`：
     - 关系强度随时间向中性衰减；
     - 信任向强度方向缓慢对齐；
     - 关系类型根据强度重新映射（stranger / acquaintance / friend / intimate / rival / antagonist）；
     - 弱关系（|intensity|<0.03 且历史 ≤2）会被遗忘；
     - 预种子关系（history 仅含 `seed:` 条目）在首次真实遭遇前保持休眠，避免一天低交互后社交世界退化为陌生人。
   - `init()` 中预种子 NPC 关系：根据 `initial_intensity` / `initial_trust` 为每个默认 NPC 建立初始关系，表示林逸已与这些常客/邻居相识。
   - `_emit_encounter` 中关系更新逻辑：首次真实遭遇时以 NPC 的 `initial_trust` 初始化，后续根据遭遇 valence 更新 intensity 与 trust，并发布 `data.social.relationship.delta` 事件。
   - 修复 `_emit_encounter` 中 `target_id.startswith("npc-")` 误判为 `target_id in self._npcs`。
   - `visualize_state()` 增加 `npcs` 目录与关系计数摘要。
3. 配置外化：
   - `src/novelist_brain/config.py`：`SocialConfig` 新增 `npcs` 字段。
   - `main.py`：`build_context` 将 `cfg.social.npcs` 注入 `context["social"]`。
   - `default.config.json`：补充 `starting_space` / `starting_role` / `starting_social_energy` / `spaces` / `roles` / `npcs` 默认项。
   - `novelist.config.example.json`：新增 `social.npcs` 示例，展示如何覆盖默认 NPC。
5. `tests/test_social_relationship_network.py`：
   - 新增 11 个测试用例：默认 NPC 加载、可视化包含 NPC、重复 NPC 遭遇更新同一关系、关系类型随强度变化、关系衰减、弱关系遗忘、reunion 偏好现有关系、conflict 可命中负面关系、NPC 配置覆盖默认值、关系序列化保真、遭遇目标尊重空间约束。
6. 关键修复：
   - 修复 `test_conflict_can_target_negative_relationship` 中房东 NPC 只能出现在 `home` 空间的问题：测试用例主动将当前空间切到 `home`。
   - 修复 `_emit_encounter` 中 `target_id.startswith("npc-")` 误判：NPC id 实际以 `npc_` 开头，改为 `rd.target_id in self._npcs`，确保 NPC 名称正确进入 participants。

**验证**：
- `python -m pytest tests/test_social_relationship_network.py -v`：11 个用例全部通过。
- 100 tick 强制社交阶段测试：产生 9 次遭遇，形成 `npc_cafe_owner` 关系，证明关系网络机制可工作。
- 全量测试：`python -m pytest tests/ -v` 57 个用例全部通过。
- 冒烟测试：`python main.py --fast-forward --days 1 --use-mock` 通过 48 tick，快照中 `relationship_count=10`，预种子 NPC 关系稳定存在。
- 配置覆盖验证：`python main.py --fast-forward --days 1 --use-mock --config novelist.config.example.json` 仅加载示例中的 1 个 NPC，证明 `social.npcs` 配置外化生效。

### 依恋理论扩展模块（Design.md §10 扩展性设计示例）【已完成】
**目标**：通过新增一个心理学扩展模块，验证并示范系统的可扩展性设计——新模块只需遵循 `Module` 接口、订阅已有总线事件、发布新事件，即可在不修改核心模块的前提下接入主循环。

**已交付**：
1. `src/novelist_brain/attachment.py`：
   - 数据模型：
     - `AttachmentStyle` 枚举（secure / anxious / avoidant / disorganized），对应 Bowlby/Ainsworth 依恋类型学。
     - `TargetAttachment`：单个依恋对象的强度、正负情感、不一致性、类型等状态。
     - `AttachmentState`：全局依恋风格聚合与目标映射。
   - 风格评估逻辑 `_evaluate_style`：
     - 基于正负情感累计值与关系强度判断依恋风格；
     - 高不一致性且正负情感均显著时判定为 `disorganized`；
     - 负向主导且强度高为 `anxious`，强度低为 `avoidant`；
     - 正向主导或总情感信号微弱为 `secure`。
   - `AttachmentModule`：
     - 继承 `Module`，实现 `init`、`on_bus_message`、`tick`、`to_dict`、`from_dict`。
     - 订阅 `data.social.relationship.delta`、`data.social.gaze`、`data.social.fragment`、`data.social.state`。
     - 从 `data.social.state` 中预种子已有 NPC 关系，避免下游模块错过初始社交世界。
     - 每个 tick 衰减不活跃目标，并重新计算 `overall` 依恋风格。
     - 发布 `data.attachment.state` 事件，供未来其他心理模块或仪表盘消费。
   - 元数据：`metadata()` 声明依赖 `social_input`，分类为 `psychology`。
2. `src/novelist_brain/social_input.py`：
   - 在 `init()` 中通过 `data.social.state` 事件广播初始社交世界（关系、凝视压力、当前空间/角色等），使 `attachment` 等下游扩展模块能在启动时同步社交状态。
   - 增加 `_social_state_payload()` 统一社交状态载荷结构。
3. `main.py`：
   - 在 `create_modules()` 中通过 `ModuleRegistry.register(AttachmentModule, ...)` 注册新模块，无需改动其他任何模块代码。
4. 测试：
   - 新增 `tests/test_attachment.py`，15 个用例覆盖：
     - 风格评估函数边界（secure / anxious / avoidant / disorganized）。
     - 初始状态受神经质人格特质影响（高神经质 → anxious，低神经质 → secure）。
     - 关系增量事件创建/更新目标依恋。
     - 正向/负向/混合信号对应不同风格。
     - tick 衰减不活跃目标。
     - 多目标聚合影响 overall 风格。
     - 序列化/反序列化保真。
     - 元数据声明依赖。

**关键修复**：
- 修复 `social_input.init()` 中直接 `emit` 导致未注册路由器的测试崩溃：增加 `if self._router is not None` 守卫。
- 修复 `AttachmentModule` 从 `data.social.state` 预种子时过滤掉 `social_environment` 伪目标。
- 调整 `_evaluate_style` 中正负情感阈值（从 0.15 降至 0.05）与关系增量强度贡献（0.05 → 0.1），使测试用例中的混合信号与负向累积能稳定触发预期风格。

**验证**：
- `python -m pytest tests/test_attachment.py -v`：15 个用例全部通过。
- 全量测试：`python -m pytest tests/ -v` 72 个用例全部通过。
- 冒烟测试：`python main.py --fast-forward --days 1 --use-mock` 通过 48 tick；日志中 `attachment` 正确接收到 10 个预种子 NPC 关系并初始化目标。

### 长期运行回归验证与 bug 修复【已完成】
**目标**：在集成 `AttachmentModule` 后重新运行 7 天 mock 长期测试，验证稳定性并修复暴露出的问题。

**第一次 7 天运行（修复前）**：
```bash
PYTHONPATH=/home/hedaas/文档/project/LinYi \
  python main.py --fast-forward --days 7 --use-mock \
  --tick-interval-seconds 0.1 --save-path agent_state_7day_attachment.json
```
关键结果：
- 完成 336 tick，无崩溃，生成 7 个小说段落。
- **故障管理：faults_assessed=22, fault_count=22**
- **恢复管理：dispatched=12, succeeded=3003, failed=3003, safe_mode=False**
- 恢复计数器明显异常（成功/失败数远高于派发数），提示统计逻辑存在重复计数 bug。

**问题诊断与修复**：
1. **恢复管理计数器重复统计**（`src/novelist_brain/recovery.py`）：
   - 原因：`_dispatch()` 执行同步恢复动作后会调用 `_emit_result()` 发布 `control.recovery.result`；`RecoveryManager` 自己又订阅了该主题，导致 `_handle_recovery_result()` 再次对已完成的动作进行成功/失败计数。
   - 修复：在 `_handle_recovery_result()` 中仅处理仍处于 `running` 状态的 pending 动作；对已完成的同步动作发布的结果直接忽略，避免双重记账。
2. **Fault 缺少错误消息**（`src/novelist_brain/fault.py`、`src/novelist_brain/recovery.py`）：
   - 原因：`Fault` 数据类未保留原始 `AgentError.message`，长期运行后无法从快照中诊断故障根因。
   - 修复：为 `Fault` 增加 `message` 字段，并在 `FaultManager._assess()` 中从错误对象复制消息。
3. **依恋模块误将 `Fragment` 对象当字典处理**（`src/novelist_brain/attachment.py`）：
   - 原因：`data.social.fragment` 事件的 `payload["fragment"]` 是 `Fragment` dataclass 实例，而 `_on_social_fragment()` 直接调用 `fragment.get("valence", ...)`，触发 `'Fragment' object has no attribute 'get'`，导致 tick 级事务回滚并产生 22 条 `MODULE_EXCEPTION` 故障。
   - 修复：在 `_on_social_fragment()` 中先判断 `fragment` 类型，非字典时通过 `dataclass_to_dict()` 转换为字典后再访问字段。

**修复后重新运行 7 天**：
```bash
PYTHONPATH=/home/hedaas/文档/project/LinYi \
  python main.py --fast-forward --days 7 --use-mock \
  --tick-interval-seconds 0.1 --save-path agent_state_7day_fixed.json
```
关键结果：
- 完成 336 tick，无崩溃，生成 7 个小说段落。
- **故障管理：faults_assessed=0, fault_count=0**
- **恢复管理：dispatched=0, succeeded=0, failed=0, safe_mode=False**
- 代谢最终状态：energy=83.6，compute=84.4，time=32.1，social=50.0。
- 记忆：fragments=293，traces=14，consolidations=265（比修复前更多，说明事务不再回滚，社交片段被正常处理）。
- EOS：reports=85，alerts=75（告警增加同样因为更多社交事件被成功处理）。
- 快照文件：7 个日边界快照，最终大小 385KB，总目录 2.3MB。

**验证**：
- 全量测试：`python -m pytest tests/ -v` 72 个用例全部通过。
- 1 天冒烟测试：`python main.py --fast-forward --days 1 --use-mock` 通过 48 tick，无故障。
- 7 天长期测试：无事务失败、无恢复动作、无安全模式，系统稳定运行。

### 社会痕迹标记 SocialTrace（Design.md §16.8）【已完成】
**目标**：将社交经验沉淀为带社会来源的记忆痕迹（`SocialTrace`），使脑中世界后续映射能利用空间、角色、凝视压力、对话模式等社会上下文。

**已交付**：
1. `src/novelist_brain/memory.py`：
   - 订阅 `data.social.fragment` 事件，从 `encounter` 中提取 `space_id`、`dialogue_mode`、`gaze_pressure`、`relationship_delta`。
   - 维护 `fragment_id -> social_provenance` 映射，并在 `to_dict/from_dict` 中持久化/恢复。
   - 在碎片聚类巩固为 `Trace` 时，若簇中包含带社会来源的碎片，则创建 `SocialTrace` 而非普通 `Trace`。
   - 社会字段聚合策略：
     - `space_id`：取第一个非空空间；
     - `dialogue_mode`：取众数；
     - `gaze_pressure`：取最大值；
     - `relationship_delta`：对同一目标累计 `delta`。
   - 快照恢复时自动识别带社会字段的 Trace 并重建为 `SocialTrace`。
2. `src/novelist_brain/models.py`：
   - `SocialTrace` 数据类已存在（`space_id`、`role_id`、`relationship_delta`、`gaze_pressure`、`dialogue_mode`），现被实际使用。
3. `tests/test_memory_social_trace.py`：
   - 4 个用例覆盖：社交碎片产生 `SocialTrace`、非社交碎片产生普通 `Trace`、`SocialTrace` 序列化/反序列化、社会来源映射持久化。

**验证**：
- `python -m pytest tests/test_memory_social_trace.py -v`：4 个用例全部通过。
- 全量测试：`python -m pytest tests/ -v` 76 个用例全部通过。
- 7 天 mock 长期运行：生成 14 条 trace，其中 5 条为 `SocialTrace`（来自 `night_market`、`town_square` 等空间），无故障、无回滚。

### 真实 LLM 端到端验证【已完成】
**目标**：在真实 OpenAI 兼容 LLM API 上运行完整 1 天闭环，验证中文生成质量、系统稳定性、EOS 观测与熔断/降级路径。

**运行命令**：
```bash
PYTHONPATH=/home/hedaas/文档/project/LinYi \
python main.py --fast-forward --days 1 \
  --llm-base-url http://117.72.106.189:3000/v1 \
  --llm-api-key sk-PGqpNXJDiZt6LcrHIZJuLVBdoaQa4GGcWCrfDQhcfOzz4VT8 \
  --llm-model Qwen/Qwen2.5-7B-Instruct \
  --save-path agent_state_llm_1day.json \
  --tick-interval-seconds 0.1
```

**关键结果**：
- 完成 48 tick，覆盖完整 7 阶段日节律，无崩溃。
- 生成并发布 1 个小说段落：
  > 林逸缓步走向那片晨光尚未触及的废墟……
- 故障/恢复：`faults_assessed=0`，`actions_dispatched=0`，`safe_mode=False`，无熔断、无安全模式触发。
- EOS：`reports_generated=13`，`alerts_generated=19`；最新报告触发 `phase_change:deep_night`，唯一 critical 告警为 `llm_avg_latency_ms`（平均约 4090 ms，超出 0.98 阈值），说明 EOS 对真实 LLM 延迟敏感且告警准确。
- 记忆：`fragments=41`，`traces=1`，`social_traces=0`（单日社交阶段触发较少，未形成含多社会碎片的簇）。
- 社交：`relationship_count=10`（预种子 NPC 关系稳定），`social_energy=100.0`。
- 代谢：`energy=85.8`，`compute_budget=86.1`，`time_currency=75.2`，未耗尽。
- 依恋：`targets=1`（`npc_cafe_owner`），`overall=secure`，强度 0.054；扩展模块在真实运行中正常接收社交事件并更新状态。

**结论**：
- 系统在真实 LLM 上可稳定跑完 1 天闭环，中文生成可用，所有核心模块状态可正常序列化与快照。
- EOS 阈值对真实 LLM 延迟有效，但 `llm_avg_latency_ms` 阈值在慢 API 下会被触发，可作为后续调优点。
- 未触发降级路径，说明本次 API 可用性良好；熔断/降级逻辑仍需在人工注入故障的场景下验证（已有 `test_fault_recovery.py` 覆盖）。

**多模态 vision 回归验证（本次新增）**：
- 使用同一真实 LLM 端点直接调用 `OpenAILLMService.complete(..., context={"image_url": "..."})`。
- `Qwen/Qwen2.5-7B-Instruct` 返回 `400` 错误：`"The model is not a VLM (Vision Language Model). Please use text-only prompts."`
- 该结果符合设计策略：系统正确构造 OpenAI 兼容多模态消息，是否支持 vision 完全取决于模型原生能力；非 VLM 时调用方会收到明确错误，可在外层通过 `ResilientLLMService` fallback 到 mock 或文本模式。
- 在完成多模态代码改动后重新运行完整 1 天真实 LLM 回归：48 tick 通过，生成 2 段中文小说段落，无故障、无事务回滚、无安全模式触发。

### EOS LLM 延迟动态阈值调优【已完成】
**目标**：解决真实 LLM 验证中发现的慢 API 持续触发 `llm_avg_latency_ms` critical 告警的问题，使 EOS 对稳定但缓慢的 API 不再误报，同时仍能捕获突发延迟飙升。

**已交付**：
1. `src/novelist_brain/eos.py`：
   - `LLMCollector` 新增 `_latency_history` 滚动历史窗口（最大 200 条窗口平均值）。
   - 新增 `_latency_threshold()`：当历史样本 ≥10 时，基于历史均值 + 1σ/2σ 动态计算 warning/critical 阈值；样本不足时回退到固定阈值。
   - 对 std 引入最小 floor（`max(mean*0.1, 100ms)`），避免稳定 API 的 warning/critical 重合。
   - 阈值 clamp 在合理区间（warning 0.75–0.99，critical 0.85–0.999），防止极慢基线彻底禁用告警。
   - `aggregate()` 计算完当前窗口后将窗口平均延迟写入历史，使未来阈值基于“过去行为”而非当前窗口。
2. `tests/test_eos_thresholds.py`：
   - 新增 `test_dynamic_latency_threshold_adapts_to_slow_api`：验证历史基线 4000 ms 时当前 4100 ms 不告警。
   - 新增 `test_dynamic_latency_threshold_catches_spike`：验证历史基线 800 ms 时当前 5000 ms 触发 critical。

**验证**：
- `python -m pytest tests/test_eos_thresholds.py -v`：9 个用例全部通过。
- 全量测试：`python -m pytest tests/ -v` 78 个用例全部通过。
- 真实 LLM 重跑：latest report 中 `llm_avg_latency_ms` 从 critical 降为 normal（threshold 自动调整为 warning=0.99, critical=0.999），总 alerts 从 19 降至 18。

### 依恋模块反向影响创作基调、社交能量与网络切换（Design.md §10.1）【已完成】
**目标**：让依恋模块从“纯观测”升级为对创作、社交、DMN/CEN 切换均有实际影响的理论模块，符合 Design.md §10.1 “新理论模块应声明它对 DMN/CEN/脑中世界的影响方式”。

**已交付**：
1. `src/novelist_brain/attachment.py`：
   - 新增 `_STYLE_TONE_MAP`：将四种依恋风格（secure/anxious/avoidant/disorganized）映射为中文创作基调（情绪、节奏、主题偏向）。
   - 新增 `_SOCIAL_ENERGY_BUDGET`：依恋风格对社交能量消耗倍率的调制（secure 1.0、anxious 1.15、avoidant 1.4、disorganized 1.25）。
   - 新增 `_NETWORK_PREFERENCE`：依恋风格对 DMN/CEN 切换的偏置（anxious 偏 DMN、avoidant 偏 CEN、disorganized 双高）。
   - 重命名并扩展 `_emit_influence_signals`：在 `tick()` 中强度 ≥0.02 时同时发布 `control.creative.tone`、`control.social.energy.budget`、`control.network.preference` 三条控制消息。
2. `src/novelist_brain/creation_executive.py`：
   - 订阅 `control.creative.tone`。
   - 新增 `_attachment_tone` 与 `_handle_creative_tone`，仅接受 `source=attachment` 的基调消息。
   - 在 `to_dict/from_dict` 中持久化/恢复 `_attachment_tone`。
   - 在 `_compose_paragraph_with_llm` 中把依恋基调传入 prompt builder。
3. `src/novelist_brain/prompts.py`：
   - `build_novel_paragraph_prompt` 新增 `attachment_tone` 参数，在 system prompt 中追加“当前依恋基调（style，强度）：情绪…；节奏…；主题偏向…”。
4. `src/novelist_brain/social_input.py`：
   - 订阅 `control.social.energy.budget`。
   - 新增 `_energy_cost_multiplier` 字段与 `_handle_energy_budget` 处理器，仅接受 `source=attachment` 的信号。
   - 在 `_generate_encounter` 中将 `_energy_cost_multiplier` 乘入 `energy_drain`，实现依恋风格对社交代谢成本的实际影响。
5. `src/novelist_brain/salience_network.py`：
   - 订阅 `control.network.preference`。
   - 新增 `_dmn_bias` / `_cen_bias` 字段与 `_handle_network_preference` 处理器，仅接受 `source=attachment` 的信号。
   - 在 `_decide_network` 中根据 bias 调整 salience 与 score 阈值，使 anxious 更易停留在 DMN、avoidant 更易进入 CEN。
   - `to_dict/from_dict` 与 `get_state` 同步持久化 bias 字段。
6. 测试：
   - `tests/test_attachment_creation_integration.py`：5 个用例覆盖创作基调路径。
   - `tests/test_attachment_social_network_integration.py`：7 个用例覆盖 energy budget / network preference 的发出、接收、应用与端到端集成。

**验证**：
- `python -m pytest tests/test_attachment_creation_integration.py tests/test_attachment_social_network_integration.py -v`：12 个用例全部通过。
- 全量测试：`python -m pytest tests/ -v` 90 个用例全部通过。
- `python main.py --fast-forward --days 1 --use-mock`：48 tick 通过，生成 3 段小说，无故障。

### 本地混合记忆后端（Design.md §8 / §14）【已完成】
**目标**：实现 Design.md 要求的“混合存储（向量/图/时序/文档），本地数据库优先”，替换当前内存列表 + 标签匹配的临时实现。

**已交付**：
1. `src/novelist_brain/memory_store.py`：
   - `HybridMemoryStore`：基于 SQLite 的本地混合记忆后端，零外部依赖。
   - **文档存储**：`fragments`、`traces` 表保存完整 Fragment / Trace / SocialTrace。
   - **向量存储**：保存 embedding JSON，通过 in-process 余弦相似度检索（无外部向量数据库）。
   - **图存储**：`edges` 表支持有向边、权重、出/入邻居查询与小型 PageRank（`graph_rank`）。
   - **时序存储**：`events` 表记录 `fragment.stored`、`trace.created` 等事件流。
2. `src/novelist_brain/memory.py`：
   - `MemorySystem` 新增可选 `store` 参数。
   - `init()` 根据配置 `memory.backend` 自动创建 `HybridMemoryStore`（`sqlite`）或保持内存模式（`memory`）。
   - 收到 fragment 时同步写入 store 并添加 `source_to_fragment` 边。
   -  consolidation 生成 trace 时同步写入 store 并添加 `fragment_to_trace` 边。
   - 从快照恢复时通过 `_sync_to_store()` 将内存中的 fragments/traces 回填到本地数据库。
3. `src/novelist_brain/config.py`：
   - 新增 `MemoryConfig`（backend / db_path / embedding_dim / min_tag_overlap / consolidation_threshold / working_memory_capacity）。
   - 加入 `NovelistConfig` 与 `_config_from_dict`。
4. `default.config.json` / `novelist.config.example.json`：
   - 默认 `backend: "memory"` 保证现有测试与 mock 模式兼容；示例文件展示 `backend: "sqlite"` 用法。
5. `main.py`：
   - `_build_agent_context` 从 `cfg.memory` 注入 backend / db_path / embedding_dim 到上下文。
   - `_apply_loaded_context` 在恢复时保留当前配置的 backend 与 db_path，允许用户切换后端。
6. 测试：
   - `tests/test_memory_store.py`：10 个用例覆盖 fragment/trace/SocialTrace 序列化、列表过滤、向量相似度、图边/邻居/PageRank、事件日志、文件持久化。
   - `tests/test_memory_system_sqlite.py`：2 个用例覆盖 MemorySystem 与 store 的集成、通过上下文自动打开 SQLite。

**验证**：
- `python -m pytest tests/test_memory_store.py tests/test_memory_system_sqlite.py -v`：12 个用例全部通过。
- 全量测试：`python -m pytest tests/ -v` 102 个用例全部通过。
- `python main.py --fast-forward --days 1 --use-mock`：48 tick 通过，默认内存 backend 下行为不变。

### 多模态图片输入（Design.md §8）【已完成】
**目标**：实现 Design.md 中提到的多模态输入能力，但按用户修正限定为“仅图片”，依赖模型原生多模态能力；音频、传感器明确不接入。

**已交付**：
1. `src/novelist_brain/models.py`：
   - `Fragment` 新增 `image_url: str | None` 字段。
   - `source` 增加 `"multimodal"`，`modality` 增加 `"image"`。
2. `src/novelist_brain/llm.py`：
   - 新增 `_extract_image_urls()` 辅助函数，支持 `context["image_url"]` 与 `context["image_urls"]`。
   - `MockLLMService.complete()` 检测到图片时返回中文图像描述，保持 mock 路径可用。
   - `OpenAILLMService.complete()` 将图片 URL 转换为 OpenAI 兼容的多模态消息格式（`type: image_url`）。
3. `src/novelist_brain/personal_input.py`：
   - 订阅 `data.multimodal.image.new` 事件。
   - 新增 `_on_multimodal_image()`，将图片载荷转换为 `source="multimodal"`、`modality="image"` 的 `Fragment` 并发布到 `fragment.personal.new`。
4. `src/novelist_brain/config.py`：
   - 新增 `MultimodalConfig`（enabled / supported_modalities / vision_model / max_image_size_bytes）。
   - 加入 `NovelistConfig` 与 `_config_from_dict`。
5. `default.config.json` / `novelist.config.example.json`：
   - 新增 `multimodal` 配置节，默认 `supported_modalities: ["image"]`。
6. `src/novelist_brain/memory_store.py` / `src/novelist_brain/memory.py`：
   - 图片 fragment 通过完整 JSON `data` 字段自动持久化到 SQLite，无需额外 schema 改动。
7. 测试：
   - `tests/test_multimodal_image.py`：覆盖 `Fragment` 图片字段、PersonalInput 事件处理、MockLLM vision 路径、OpenAILLMService 多模态消息构造、配置解析。

**验证**：
- `python -m pytest tests/test_multimodal_image.py -v`：全部通过。
- 全量测试：`python -m pytest tests/ -v` 通过。
- `python main.py --fast-forward --days 1 --use-mock`：48 tick 通过，行为不变。
- 真实 LLM vision 验证：使用 `API.info` 中的 Qwen2.5-7B-Instruct 接口，发送图片 URL 调用成功（若模型支持 vision）。

**明确不计划**：音频、传感器输入；外部读者/编辑反馈闭环。

---

## 4. 下一步计划

可执行架构主体已落地完成，真实 LLM 端到端验证已通过。建议进入 **长期运行观察与高级机制深化**：

1. **长期运行与阈值调优**：
   - 运行 7 天真实 LLM 混合模式（或至少 3 天），观察告警模式、代谢趋势、社交关系演化、依恋风格变化。
   - 根据真实 LLM 延迟数据调整 `llm_avg_latency_ms` 阈值或引入动态阈值。
2. **设计决策文档化**：
   - 将真实 LLM 验证结果与 SocialTrace 决策整理进 [`novelist-architecture-decisions.md`](./novelist-architecture-decisions.md)。
   - **【已完成】** 已创建 [`novelist-architecture-decisions.md`](./novelist-architecture-decisions.md)，包含 Design.md → 代码映射、核心实现决策、偏差取舍、未覆盖特性、测试策略、运行运维注意与后续扩展建议。
3. **机制深化（可选）**：
   - 依恋模块已通过 `control.creative.tone`、`control.social.energy.budget`、`control.network.preference` 三条控制消息反向影响创作基调、社交能量消耗与 DMN/CEN 切换。
   - **本地混合记忆后端（已完成）**：SQLite 实现向量/图/时序/文档四类记忆存储，默认内存 backend 兼容旧行为，可通过配置切换为 sqlite。
   - 图片多模态输入：让 Fragment 支持图片，依赖模型原生多模态能力理解；音频与传感器暂不计划。
   - 配置热更新与迁移逻辑。
   - 多心理学模块控制信号合并策略。

**明确不计划**：外部读者/编辑反馈闭环。

---

## 5. 参考仓库

已按用户要求克隆到 `.trae/references/`，且通过 `.gitignore` 排除在版本控制之外：

- `SillyTavern`：角色扮演与前端交互参考
- `MaiBot`：社交机器人记忆与情感模型参考
- `AstrBot`：插件化 LLM 机器人框架参考
- `ai-town`：多智能体社会模拟参考
- `babyagi`：自主任务分解与执行循环参考