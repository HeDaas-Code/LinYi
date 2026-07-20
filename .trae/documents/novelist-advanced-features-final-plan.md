# 小说家大脑三大高级功能实施计划

## 摘要

继续完成用户 `/goal` 提出的三大高级功能：

1. **完整 TRPG 规则书**：修复当前 TRPG 扩展模块的语法错误，让 `GameMaster`/`MentalSandbox` 强制消费数据驱动的 `Rulebook`，启用奖惩骰、推骰、Luck、物品栏、状态、技能成长、对抗检定、追逐、战斗轮、神话典籍与战役弧。
2. **脑中世界版本分叉 / A-B 推演**：让 `MentalSandbox` 能从当前状态 fork 出多个版本，独立运行 what-if 推演，比较结果后自动合并优胜版本、废弃劣势版本。
3. **全量 WebUI 仪表盘**：用 FastAPI + Jinja2 + 原生 JS 提供 Web 图形界面，覆盖记忆图、脑中世界地图、TRPG 角色卡、小说手稿、实时总线事件、EOS 指标与配置编辑。

用户已确认的决策：
- WebUI 引入 `jinja2` 依赖。
- A-B 版本分叉采用**全自动择优合并**（由 CEN 比较后自动 merge/discard）。
- WebUI 在 `main.py` 中以**后台线程**启动。
- 三大功能不限制完成次序，但实施仍按「TRPG 规则书 → A-B 分叉 → WebUI」推进，因为前两者是后者的数据基础。

## 当前状态分析

### TRPG 规则书（部分完成，存在阻塞缺陷）

- ✅ `src/novelist_brain/trpg_rulebook.py`：已提供 `Rulebook`、各类规则定义、`from_file`、`validate`、`skill_for_action`、`items_for_category`。
- ✅ `src/novelist_brain/trpg_state.py`：已提供 `LuckPool`、`Inventory`、`ActorState`、`SkillImprovement`，是单一权威来源。
- ✅ `src/novelist_brain/trpg.py`：
  - `TRPGCharacterSheet` 已新增 `luck`、`hit_points`、`magic_points`、`inventory`、`conditions`、`improvement_marks`。
  - `GameMaster` 已要求 `rulebook` 参数并使用 `self._rulebook.skill_for_action(action)`。
  - `resolve_round` 已支持 `bonus_dice`/`penalty_dice`/`pushed`。
  - 已实现 `resolve_opposed`、`resolve_chase`、`resolve_combat_round`。
- ❌ `src/novelist_brain/trpg_extended.py`：第 477 行 `return {` 未闭合，存在 `SyntaxError`，模块无法导入，是当前最大阻塞。
- ❌ `src/novelist_brain/sandbox.py`：
  - `init` 与 `from_dict` 中创建 `GameMaster` 时未传入 `rulebook`（仅传入 `world_rules` 和 `rng`）。
  - `_resolve_event` 目前只调用基础 `gm.resolve_round`，未根据动作关键词或 `conflict_level` 触发对抗、追逐、战斗等扩展机制。
  - 未维护 `_actor_states`、`_current_chase`、`_current_combat`。
- ❌ 配置层：
  - `src/novelist_brain/config.py` 的 `TRPGConfig` 只有 `rule_system` 等字段，缺少 `rulebook_path` 和 `embedded_rulebook`。
  - `main.py` 的 `build_context` 未把构建好的 `Rulebook` 放入 `context["sandbox"]["rulebook"]`。
  - `default.config.json` 的 `trpg` 节点未嵌入完整规则书数据。
- ❌ 测试：不存在 `tests/test_trpg_rulebook.py`、`tests/test_trpg_extended.py`、`tests/test_trpg_integration.py`。

### 脑中世界版本分叉（尚未实现）

- ❌ 不存在 `src/novelist_brain/sandbox_versioning.py`。
- ❌ `MentalSandbox` 没有版本树、`fork`/`merge`/`discard` 接口。
- ❌ `CEN` 目前只在单一沙盒上推演，没有 A/B 对比与自动择优逻辑。
- ✅ `default.config.json` 的 `persistence.retention.sandbox_versions` 已预留配置入口。

### 全量 WebUI 仪表盘（尚未实现）

- ❌ 不存在 `src/novelist_brain/web/` 目录。
- ❌ 不存在 `requirements.txt`。
- ❌ `src/novelist_brain/memory.py` 没有 `export_graph()` 接口。
- ❌ `main.py` 没有启动 WebUI 的逻辑。
- ✅ 当前环境已安装 `fastapi`、`starlette`、`uvicorn`，但缺少 `jinja2`。

## 实施方案

### Phase A：完整 TRPG 规则书集成

#### A1. 修复 `trpg_extended.py` 语法错误
- **文件**：`src/novelist_brain/trpg_extended.py`
- **内容**：补全 `CombatRound.to_dict()` 方法未闭合的字典（添加 `"round_index"` 和 `"narration"` 字段并关闭 `}`）。
- **原因**：当前模块无法导入，会阻塞所有后续 TRPG 功能与测试。

#### A2. 扩展配置层并嵌入默认规则书
- **文件**：`src/novelist_brain/config.py`、`default.config.json`、`main.py`
- **内容**：
  - `TRPGConfig` 新增字段：`rulebook_path: str | None = None`、`embedded_rulebook: dict[str, Any] = field(default_factory=dict)`。
  - `load_config` 在构建 `NovelistConfig` 后，若 `trpg.rulebook_path` 存在则加载外部规则书；否则使用 `embedded_rulebook`；若都为空则回退到 `Rulebook()` 的硬编码默认。
  - `build_context` 中把构建好的 `Rulebook` 实例放入 `context["sandbox"]["rulebook"]`。
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

#### A3. `MentalSandbox` 强制消费 `Rulebook`
- **文件**：`src/novelist_brain/sandbox.py`
- **内容**：
  - `__init__` 新增 `_rulebook: Rulebook | None = None`、`_actor_states: dict[str, ActorState]`、`_current_chase: Chase | None`、`_current_combat: CombatRound | None`。
  - `init` 从 `context["sandbox"]` 读取 `rulebook`，重建 `GameMaster(rulebook=rulebook, world_rules=..., rng=...)`。
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

#### A4. TRPG 测试
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
  - `src/novelist_brain/web/state_provider.py`：线程安全地读取 `modules`、`clock`、`config_registry` 的状态快照。
  - `src/novelist_brain/web/websocket.py`：WebSocket endpoint，订阅总线事件并推送给前端；维护连接集合。
  - `src/novelist_brain/web/static/`：CSS、JS、图标等前端资源。
  - `src/novelist_brain/web/templates/`：Jinja2 页面模板（index、memory、trpg、sandbox、novel、config）。
- **原因**：模块化 Web 层，便于后续扩展主题/插件。

#### C3. REST 端点
- **文件**：`src/novelist_brain/web/app.py` 及路由子模块
- **端点规划**：
  - `GET /`：仪表盘首页，展示系统概览。
  - `GET /api/state`：返回各模块状态快照（metabolism、memory、social、sandbox、cen、eos）。
  - `GET /api/memory/graph`：调用 `memory.export_graph()` 返回节点/边数据。
  - `GET /api/sandbox/world`：返回当前 world_model、scene、character_sheets。
  - `GET /api/trpg/characters`：返回所有角色卡与 actor states。
  - `GET /api/trpg/rulebook`：返回当前 `Rulebook` 的 `to_dict()`。
  - `GET /api/novel/manuscript`：返回小说段落列表与元数据。
  - `GET /api/eos/metrics`：返回 EOS 聚合指标。
  - `GET /api/config`：返回当前配置（脱敏）。
  - `POST /api/config`：接收配置 JSON，调用 `config_registry.update` 并触发 `control.config.reload`。
  - `POST /api/sandbox/fork`：手动触发沙盒分叉。
  - `POST /api/sandbox/merge`：手动合并指定版本。
- **原因**：为前端可视化提供数据接口。

#### C4. 实时总线事件推送
- **文件**：`src/novelist_brain/web/websocket.py`
- **内容**：
  - WebSocket 端点 `/ws`。
  - 启动后台任务订阅 `BusRouter`，将 `IMPORTANT_TOPICS` 中的事件序列化后推送给所有连接。
  - 前端连接/断开时维护连接集合；使用 `asyncio.Queue` 避免阻塞主循环。
- **原因**：让仪表盘能看到实时事件流。

#### C5. 前端页面与可视化
- **文件**：`src/novelist_brain/web/templates/*.html`、`src/novelist_brain/web/static/dashboard.js`、`src/novelist_brain/web/static/style.css`
- **页面**：
  - 首页：系统状态卡片、当前阶段、能量、CEN 目标栈。
  - 记忆图页：使用 D3.js / Cytoscape.js 渲染记忆片段节点与关系边。
  - 脑中世界页：展示 world_model、当前 scene、角色列表、预测误差曲线。
  - TRPG 页：角色卡表格、技能值、HP/MP、物品栏、条件、规则书 JSON 查看。
  - 小说手稿页：已生成段落列表与搜索。
  - EOS 页：指标图表、告警列表。
  - 配置页：JSON 编辑器与保存。
- **原因**：提供用户要求的「不止社会空间，而是全量的 WebUI」。

#### C6. `main.py` 集成 WebUI
- **文件**：`main.py`
- **内容**：
  - 新增 CLI 参数 `--webui`/`--no-webui`、`--webui-host`、`--webui-port`。
  - 在 `create_modules` 后，若启用 WebUI，则在后台线程启动 `uvicorn.run(app, host=..., port=...)`。
  - 将 `modules`、`clock`、`router`、`config_registry` 通过 `state_provider.set_state(...)` 注入 Web 层。
- **原因**：让 WebUI 与主 Agent 循环共存，不阻塞核心流程。

#### C7. `MemorySystem.export_graph()`
- **文件**：`src/novelist_brain/memory.py`
- **内容**：新增 `export_graph(self) -> dict[str, Any]`，返回：
  - `nodes`：片段/痕迹节点，含 id、type、content、tags、importance、timestamp。
  - `edges`：基于共享 tag 的关联边，含 source、target、weight、shared_tags。
- **原因**：为前端记忆图提供结构化数据。

#### C8. WebUI 测试
- **文件**：
  - `tests/test_webui_state.py`：测试 `state_provider` 和 REST API 状态快照。
  - `tests/test_webui_websocket.py`：测试 WebSocket 连接与事件推送。
- **原因**：验证 Web 层基本功能。

### Phase D：全量回归测试与真实 LLM 验证

1. 单元测试：`python -m pytest tests/ -v`，目标全部通过。
2. Mock 冒烟测试：`python main.py --fast-forward --days 1 --use-mock`，目标 48 ticks 完成并生成快照与小说段落。
3. 真实 LLM 回归测试（用户配置 API 后）：`python main.py --fast-forward --days 1`，目标正常运行并生成中文小说。
4. WebUI 可用性测试：启动后访问 `http://localhost:8000/`，确认各页面能加载、WebSocket 有事件推送。

## 关键假设与决策

- **TRPG 规则书集成策略**：采用「full replacement」。`GameMaster` 必须接收 `Rulebook`；无规则书时回退到内置默认规则，不再保留硬编码 `_pick_skill` 行为。
- **A/B 分叉择优指标**：比较 `depth_metrics` 中的 `coherence_score`、`emotional_shift` 绝对值、以及 `prediction_error` 的下降趋势；综合得分高者胜。
- **WebUI 技术栈**：FastAPI + Starlette + Jinja2 + 原生 JS + D3.js/Cytoscape.js。不引入 React/Vue，以降低依赖复杂度。
- **WebUI 状态访问**：通过 `state_provider` 暴露只读快照；配置修改通过 POST API 触发总线事件，由模块自己消费，不直接修改模块内部状态。
- **依赖管理**：新建 `requirements.txt` 明确列出运行时与测试依赖；`jinja2` 为必需，PyYAML 为可选（仅当使用 YAML 规则书时）。

## 风险与缓解

- **风险**：`trpg_extended.py` 修复后可能与 `trpg_state.py` 存在重复定义。
  - **缓解**：修复前再次检查，确保 `LuckPool`/`Inventory`/`ActorState`/`SkillImprovement` 只在 `trpg_state.py` 中定义。
- **风险**：A/B 分叉会显著增加模拟轮数，可能拖慢真实 LLM 模式。
  - **缓解**：`trpg.enable_ab_fork` 默认开启；在真实 LLM 模式下若延迟过高，用户可通过配置关闭，或限制每版本模拟轮数为 2。
- **风险**：WebUI 后台线程异常可能导致主进程崩溃。
  - **缓解**：`uvicorn.run` 放在独立守护线程；添加 try/except 捕获启动异常，失败时仅记录 ERROR 日志，不影响