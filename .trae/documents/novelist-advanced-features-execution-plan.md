# 小说家大脑三大高级功能执行计划

## 摘要

继续完成 `/goal` 提出的三大高级功能：

1. **完整 TRPG 规则书**：让 `GameMaster` 与 `MentalSandbox` 强制消费数据驱动的 `Rulebook`，启用奖惩骰、推骰、Luck、物品栏、状态、技能成长、对抗检定、追逐、战斗轮、神话典籍与战役弧。
2. **脑中世界版本分叉 / A-B 推演**：让 `MentalSandbox` 能从当前状态 fork 出多个版本，独立运行 what-if 推演，比较结果后自动合并优胜版本、废弃劣势版本。
3. **全量 WebUI 仪表盘**：用 FastAPI + Jinja2 + 原生 JS 提供 Web 图形界面，覆盖记忆图、脑中世界地图、TRPG 角色卡、小说手稿、实时总线事件、EOS 指标与配置编辑。

用户已确认的决策：
- WebUI 引入 `jinja2` 依赖。
- A-B 版本分叉采用**全自动择优合并**（由 CEN 比较后自动 merge/discard）。
- WebUI 在 `main.py` 中以**后台线程**启动。
- 三大功能不限制完成次序，但实施仍按「TRPG 规则书 → A-B 分叉 → WebUI」推进，因为前两者是后者的数据基础。

## 当前状态分析

基于 Phase 1 探索结果：

- **TRPG 规则书框架已存在但尚未接入核心流程**：
  - `src/novelist_brain/trpg_rulebook.py` 已提供 `Rulebook` 与各类规则定义，支持 JSON/YAML 加载与校验。
  - `src/novelist_brain/trpg_state.py` 已提供 `LuckPool`、`Inventory`、`ActorState`、`SkillImprovement`。
  - `src/novelist_brain/trpg_extended.py` 已提供奖惩骰、推骰、对抗检定、追逐、战斗轮等扩展逻辑。
  - **问题**：`trpg_extended.py` 与 `trpg_state.py` 存在重复类定义（`LuckPool`、`Inventory`、`ActorState`、`SkillImprovement`），必须清理。
  - `src/novelist_brain/trpg.py` 中的 `GameMaster` 仍使用硬编码的 `_pick_skill`，尚未消费 `Rulebook`；`TRPGCharacterSheet` 也缺少 `Luck`/`HP`/`MP`/`inventory`/`conditions`/`improvement_marks`。
  - `src/novelist_brain/sandbox.py` 的 `_resolve_event` 只调用了基础技能检定，未使用奖惩骰、对抗、追逐、战斗等扩展机制。
  - 配置层 `TRPGConfig`（`src/novelist_brain/config.py`）尚未提供规则书加载入口；`default.config.json` 也未嵌入完整规则书。
  - 目前没有针对 TRPG 规则书的测试文件。

- **脑中世界版本分叉尚未实现**：
  - 不存在 `sandbox_versioning.py`。
  - `MentalSandbox` 没有版本树、`fork`/`merge`/`discard` 接口。
  - `CEN` 目前只在单一沙盒上推演，没有 A/B 对比与自动择优逻辑。

- **WebUI 尚未实现**：
  - 不存在 `src/novelist_brain/web/` 目录。
  - 当前环境已安装 `fastapi`、`starlette`、`uvicorn`，但缺少 `jinja2`。
  - 没有 `requirements.txt` 或 `pyproject.toml` 文件记录依赖。
  - `memory.py` 没有 `export_graph()` 接口用于前端记忆图可视化。

## 实施方案

### Phase A：完整 TRPG 规则书集成

#### A1. 清理 `trpg_extended.py` / `trpg_state.py` 重复定义
- **文件**：`src/novelist_brain/trpg_extended.py`
- **内容**：
  - 移除 `LuckPool`、`Inventory`、`ActorState`、`SkillImprovement` 四个类的定义。
  - 改为从 `src.novelist_brain.trpg_state` 导入上述类。
  - 保留 `_parse_die`、奖惩/推骰、`OpposedCheck`、`Chase`、`Combatant`、`CombatRound` 等扩展机制。
- **原因**：当前两个模块重复定义相同类，会导致维护混乱和潜在的运行时冲突；规则书状态类应只保留一份权威来源。

#### A2. 扩展 `TRPGCharacterSheet`
- **文件**：`src/novelist_brain/trpg.py`
- **内容**：
  - 在 `TRPGCharacterSheet` 中新增字段：`luck: LuckPool`、`hit_points: float`、`magic_points: float`、`inventory: Inventory`、`conditions: list[Condition]`、`improvement_marks: SkillImprovement`。
  - 更新 `to_dict` / `from_dict`（或依赖 `dataclass_to_dict` / `reconstruct_dataclass`）以序列化/反序列化新字段。
  - 在 `build_character_sheet` 中初始化这些字段：默认 HP/MP 12、Luck 50、空 inventory、空 conditions、空 improvement_marks。
  - 提供 `effective_skill_value(skill_name)`，返回 `skill_value + inventory.skill_bonus(skill_name) + improvement_marks.improvements.get(skill_name, 0)`。
- **原因**：完整角色卡需要承载规则书扩展机制所需的状态。

#### A3. 重构 `GameMaster` 为规则书驱动
- **文件**：`src/novelist_brain/trpg.py`
- **内容**：
  - `GameMaster.__init__` 增加必需参数 `rulebook: Rulebook`。
  - 删除 `_pick_skill` 的硬编码实现，改用 `self._rulebook.skill_for_action(action)`。
  - `resolve_round` 支持 `bonus_dice`、`penalty_dice`、`pushed` 参数，调用 `trpg_extended.resolve_skill_check_with_dice`。
  - 检定成功后根据 `ImprovementRule` 标记技能成长（调用 `SkillImprovement.mark_success`）。
  - 新增 `resolve_opposed(action, initiator_sheet, responder_sheet, **kwargs)`：解析动作到技能，调用 `trpg_extended.resolve_opposed_check`。
  - 新增 `resolve_chase(...)`：封装 `Chase.resolve_round`。
  - 新增 `resolve_combat_round(...)`：封装 `CombatRound.resolve`。
  - `GMResolution` 增加 `opposed`、`chase`、`combat_round` 等可选字段，用于承载扩展结果。
- **原因**：实现用户确认的「full replacement」集成策略，`GameMaster` 必须强制消费 `Rulebook`。

#### A4. 扩展配置层并嵌入默认规则书
- **文件**：`src/novelist_brain/config.py`、`default.config.json`
- **内容**：
  - `TRPGConfig` 新增字段：`rulebook_path: str | None = None`、`embedded_rulebook: dict[str, Any] = field(default_factory=dict)`。
  - `load_config` 在构建 `NovelistConfig` 后，若 `trpg.rulebook_path` 存在则加载外部规则书；否则使用 `embedded_rulebook`；若都为空则回退到 `Rulebook()` 的硬编码默认。
  - 在 `build_context` 中把构建好的 `Rulebook` 实例放入 `context["sandbox"]["rulebook"]`。
  - `default.config.json` 的 `trpg` 节点下补充完整的 COC 风格规则书数据，包括：
    - `skills`：观察、潜行、说服、图书馆使用、格斗、闪避、心理学、追踪等。
    - `actions`：常见动作到技能的映射与默认难度/修正。
    - `combat`：攻击技能、闪避技能、伤害公式 `1d6+db`。
    - `sanity`：理智规则参数。
    - `improvement`：技能成长规则。
    - `items`：示例武器/工具/消耗品。
    - `tomes`：示例神话典籍。
    - `campaign_arcs`：示例战役弧。
- **原因**：规则书可配置、可替换，满足 Design.md §17 的完整 TRPG 规则书需求。

#### A5. `MentalSandbox` 集成扩展 TRPG 机制
- **文件**：`src/novelist_brain/sandbox.py`
- **内容**：
  - `__init__` 新增 `_rulebook: Rulebook | None = None`、`_actor_states: dict[str, ActorState]`、`_current_chase: Chase | None`、`_current_combat: CombatRound | None`。
  - `init` 从 `context["sandbox"]` 读取 `rulebook`，重建 `GameMaster(rulebook=rulebook, ...)`。
  - `_rebuild_character_sheets` 同时创建/刷新 `_actor_states`。
  - `_resolve_event` 根据 `action` 关键词和当前 `scene.conflict_level` 决定：
    - 普通行动 → `gm.resolve_round`（基础检定，支持 bonus/penalty/pushed）。
    - 对抗关键词（如「对抗」「较量」「阻止」）或 `conflict_level >= 0.6` 且存在多名角色 → `gm.resolve_opposed`。
    - 追逐关键词（如「追」「逃」「追赶」）→ `gm.resolve_chase`。
    - 战斗关键词（如「战斗」「攻击」「保护」）或 `conflict_level >= 0.8` → `gm.resolve_combat_round`。
  - 检定结果更新 `_actor_states` 的 HP/MP/conditions/dead 标志。
  - 场景 narration 纳入对抗/追逐/战斗的描述。
  - `to_dict` / `from_dict` 序列化 `_actor_states`、`_current_chase`、`_current_combat`、`_rulebook`。
- **原因**：让脑中世界真正使用完整规则书进行裁定。

#### A6. TRPG 测试
- **文件**：
  - `tests/test_trpg_rulebook.py`：规则书加载、校验、`skill_for_action`、物品过滤。
  - `tests/test_trpg_extended.py`：奖惩骰、推骰、Luck、Inventory、`ActorState`、对抗检定、追逐、战斗轮。
  - `tests/test_trpg_integration.py`：`GameMaster` 规则书驱动、`MentalSandbox` 集成对抗/追逐/战斗、快照恢复。
- **原因**：保证重构不破坏现有 loop，并覆盖新机制。

### Phase B：脑中世界版本分叉 / A-B 推演

#### B1. 新建 `sandbox_versioning.py`
- **文件**：`src/novelist_brain/sandbox_versioning.py`
- **内容**：
  - `SandboxVersion`：
    - 字段：`id`、`parent_id`、`label`、`sandbox_dict`、`simulation_round`、`results: list[dict]`、`metrics: dict[str, float]`、`status`（`draft`/`committed`/`abandoned`/`merged`）、`created_at`。
    - 方法：`to_dict()`、`from_dict()`。
  - `VersionTree`：
    - 维护 `versions: dict[str, SandboxVersion]` 和父子关系。
    - 方法：`add_version`、`get_lineage`、`get_children`、`prune_abandoned`。
  - `SandboxVersionManager`：
    - 字段：`tree`、`current_version_id`、`max_versions`（从配置读取）。
    - 方法：
      - `fork(source_sandbox: MentalSandbox, label: str) -> SandboxVersion`：深拷贝 `source_sandbox.to_dict()` 创建新版本。
      - `simulate(version_id, rounds=1)`：在版本副本上运行若干轮 `simulate`，收集结果。
      - `compare(version_a_id, version_b_id) -> dict`：比较 depth_metrics、emotional_shift、coherence_score，返回优胜 ID 和差异。
      - `merge(target_sandbox: MentalSandbox, version_id) -> None`：把选中版本的 `sandbox_dict` 写回目标沙盒。
      - `discard(version_id)`：标记版本为 `abandoned`。
      - `prune()`：按 `persistence.retention.sandbox_versions.max_count` 清理旧版本。
- **原因**：提供独立的版本管理能力，与 `MentalSandbox` 解耦，便于测试和扩展。

#### B2. `MentalSandbox` 集成版本管理
- **文件**：`src/novelist_brain/sandbox.py`
- **内容**：
  - 新增 `_version_manager: SandboxVersionManager` 字段。
  - 订阅 `control.sandbox.fork`、`control.sandbox.version.merge`、`control.sandbox.version.discard`。
  - `init` 中根据配置创建 `SandboxVersionManager`。
  - 处理消息：
    - `control.sandbox.fork`：调用 `_version_manager.fork(self, label=...)` 并发布 `data.sandbox.version.forked`。
    - `control.sandbox.version.merge`：调用 `_version_manager.merge(self, version_id)` 并发布 `data.sandbox.world.updated`。
    - `control.sandbox.version.discard`：调用 `_version_manager.discard(version_id)`。
  - `to_dict` / `from_dict` 包含版本树状态。
- **原因**：让沙盒具备可被外部控制的分叉接口。

#### B3. `CEN` 全自动择优合并
- **文件**：`src/novelist_brain/cen.py`
- **内容**：
  - 在 `creation` / `simulation` 阶段，当 `sandbox_built` 为真且 `_awaiting_ready` 时，不再是简单触发一次 `control.sandbox.simulate`。
  - 新增 A/B 流程：
    1. 发布 `control.sandbox.fork` 创建版本 A（当前版本）和版本 B（分叉副本）。
    2. 对 A 和 B 各自运行 `max(2, min_rounds)` 轮 `control.sandbox.simulate`（通过向不同版本定向发送消息，或在 `SandboxVersionManager` 中批量运行）。
    3. 调用 `_version_manager.compare` 得到优胜版本。
    4. 发布 `control.sandbox.version.merge` 合并优胜版本；发布 `control.sandbox.version.discard` 废弃另一版本。
    5. 继续常规流程直到 narrative.ready。
  - 新增状态字段跟踪 A/B 进度：`_ab_in_progress`、`_ab_versions`、`_ab_rounds_remaining`。
  - 通过配置开关 `trpg.enable_ab_fork`（默认 `True`）控制是否启用。
- **原因**：实现用户确认的「全自动择优合并」。

#### B4. 版本分叉测试
- **文件**：
  - `tests/test_sandbox_versioning.py`：独立测试 `SandboxVersionManager` 的 fork/simulate/compare/merge/discard/prune。
  - `tests/test_sandbox_ab_fork.py`：测试 `MentalSandbox` 与 `CEN` 的集成 A/B 流程。
- **原因**：验证核心机制与主循环集成。

### Phase C：全量 WebUI 仪表盘

#### C1. 声明依赖
- **文件**：`requirements.txt`（新建）
- **内容**：
  ```text
  fastapi>=0.100
  uvicorn[standard]>=0.23
  jinja2>=3.1
  starlette>=0.27
  ```
  若后续测试需要 `httpx`/`pytest-asyncio`，也一并加入测试依赖区。
- **原因**：环境一致性，明确 WebUI 所需依赖。

#### C2. Web 模块结构
- **目录与文件**：
  - `src/novelist_brain/web/__init__.py`
  - `src/novelist_brain/web/app.py`：FastAPI 应用、路由注册、静态文件挂载、模板目录配置。
  - `src/novelist_brain/web/state_provider.py`：线程安全地读取 `modules`、`clock`、`router`、`config_registry` 的状态快照。
  - `src/novelist_brain/web/websocket.py`：WebSocket endpoint，订阅总线事件并推送给前端；维护客户端连接池。
  - `src/novelist_brain/web/templates/dashboard.html`：仪表盘主页面（Jinja2）。
  - `src/novelist_brain/web/static/style.css`：仪表盘样式。
  - `src/novelist_brain/web/static/dashboard.js`：前端逻辑：REST 轮询 + WebSocket 实时更新、图表渲染（记忆图、沙盒地图、EOS 指标、TRPG 角色卡、小说手稿、总线事件流）。
- **原因**：提供全量可视化界面。

#### C3. REST API 设计（`app.py`）
- `GET /`：渲染 `dashboard.html`。
- `GET /api/status`：Agent 运行状态（tick、phase、hour、运行时长）。
- `GET /api/modules`：所有模块状态快照。
- `GET /api/modules/{name}`：单个模块状态。
- `GET /api/memory/graph`：调用 `memory.export_graph()` 返回节点/边。
- `GET /api/sandbox/world`：沙盒世界模型、当前场景、角色表。
- `GET /api/sandbox/versions`：版本树。
- `GET /api/sandbox/character/{character_id}`：TRPG 角色卡详情。
- `GET /api/novel/manuscript`：小说手稿段落列表。
- `GET /api/eos/latest`：最新 EOS 报告。
- `GET /api/eos/metrics`：历史指标序列。
- `GET /api/bus/recent`：最近总线消息。
- `GET /api/config`：当前配置（只读展示）。
- `POST /api/control/simulate`：手动触发一次沙盒推演。
- `POST /api/control/fork`：手动触发一次 fork。
- `POST /api/config/reload`：触发配置热重载（如果已支持）。

#### C4. WebSocket 实时推送（`websocket.py`）
- endpoint：`/ws`。
- 维护 `ConnectionManager`。
- 在 Agent 主循环中，把重要总线消息（phase 变化、沙盒事件、novel 段落、EOS 报告）通过 `state_provider.broadcast` 推送到所有连接。
- 前端订阅后实时更新对应面板。

#### C5. 前端仪表盘（`dashboard.html` + `dashboard.js` + `style.css`）
- 布局（响应式网格）：
  - 顶部：Agent 状态条（tick / phase / hour / LLM 状态）。
  - 左列：记忆图（ cytoscape.js 或力导向 SVG）、总线事件流。
  - 中列：脑中世界地图（当前 scene / characters / narrative line）、TRPG 角色卡。
  - 右列：EOS 指标（折线图）、小说手稿、配置面板、控制按钮（手动 simulate/fork）。
- 使用原生 JS + 少量 CDN（如选择 Chart.js 或纯 CSS/SVG 做折线图）。
- 原因：用户要求「不止社会空间，而是全量的 WebUI」。

#### C6. `memory.py` 图导出
- **文件**：`src/novelist_brain/memory.py`
- **内容**：新增 `export_graph(self) -> dict[str, Any]`：
  - `nodes`：fragment 节点（id、type、content 摘要、tags、valence/arousal）和 trace 节点。
  - `edges`：`source_to_fragment` 边（来自 `_store` 或内部记录）、`fragment_to_trace` 边、以及基于 tag 重叠的 trace-to-trace 关联边。
- **原因**：WebUI 记忆图可视化需要结构化图数据。

#### C7. `main.py` 启动 WebUI 后台线程
- **文件**：`main.py`
- **内容**：
  - 新增 CLI 参数：`--webui`（默认启用）、`--no-webui`、`--webui-port`（默认 8000）、`--webui-host`（默认 127.0.0.1）。
  - 在 `create_modules` 之后启动 `threading.Thread(target=run_webui, daemon=True)`。
  - `run_webui` 创建 `WebStateProvider(modules, clock, router, config_registry)` 并运行 `uvicorn.run(app, host=host, port=port, log_level="warning")`。
  - 在 Agent 主循环的每次 tick 后，调用 `state_provider.set_latest_state(...)` 或让 `state_provider` 主动从模块读取。
  - 确保 `WebStateProvider` 对模块状态的访问加锁，避免与主线程并发修改冲突。
- **原因**：用户要求 main.py 后台线程启动 WebUI。

#### C8. WebUI 测试
- **文件**：`tests/test_webui.py`
- **内容**：
  - 使用 `TestClient` 测试 `/`、`/api/status`、`/api/modules`、`/api/memory/graph` 返回正确 JSON/HTML。
  - 测试 `WebStateProvider` 线程安全快照。
  - 测试 WebSocket `/ws` 能连接并收到至少一条消息。
- **原因**：保证 WebUI 模块可独立测试。

### Phase D：全量回归与真实 LLM 验证

1. **单元测试**：`python -m pytest tests/ -v`，目标全部通过。
2. **Mock 压缩测试**：`python main.py --fast-forward --days 1 --use-mock`，目标 48 tick 正常完成，生成快照与小说段落。
3. **真实 LLM 回归**（可选，需要 API 配置）：`python main.py --fast-forward --days 1 --llm-base-url ... --llm-api-key ... --llm-model ...`，目标运行稳定、生成中文小说、EOS 报告正常。
4. **WebUI 验证**：打开 `http://127.0.0.1:8000/`，确认 dashboard 能加载，实时总线事件与 EOS 指标能更新。

## 假设与决策

- **依赖**：用户确认引入 `jinja2`；WebUI 以 FastAPI + Jinja2 + 原生 JS 实现。
- **A-B 分叉**：全自动择优合并；比较指标以 `depth_metrics`（conflict_depth、character_development、emotional_shift、coherence_score）为主。
- **WebUI 启动**：`main.py` 后台线程启动，默认端口 8000，可通过 CLI 关闭或改端口。
- **TRPG 集成**：采用用户此前确认的「full replacement」策略，`GameMaster` 必须传入 `Rulebook`。
- **向后兼容**：旧的 `default.config.json` 和 snapshot 在无规则书字段时仍能加载，回退到默认 COC 规则书。
- **顺序**：虽然用户说「不限制完成次序」，但实施仍按 TRPG → A-B 分叉 → WebUI 顺序推进，以减少 WebUI 需要的数据接口返工。

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| `trpg.py` 重构破坏现有 smoke test | 高 | 每次修改后运行 `pytest tests/ -v` 和 `main.py --fast-forward --days 1 --use-mock` |
| A-B 分叉导致 narrative.ready 延迟或循环 | 中 | 设置最大 fork 轮次和超时；提供 `enable_ab_fork` 配置开关 |
| WebUI 后台线程与主线程竞争模块状态 | 中 | `WebStateProvider` 所有读取都加锁；不直接修改模块状态 |
| jinja2 未安装导致 import 失败 | 中 | WebUI 作为可选模块导入，缺依赖时打印警告并禁用 |
| 配置文件中嵌入规则书体积过大 | 低 | 规则书保持精简但覆盖全部机制类型；支持外部 `rulebook_path` 覆盖 |
