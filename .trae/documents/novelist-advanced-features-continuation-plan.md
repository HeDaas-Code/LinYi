# 小说家大脑三大高级功能延续实施计划

## 摘要

继续完成用户 `/goal` 提出的三大高级功能，顺序不限、只看结果：

1. **完整 TRPG 规则书**：当前代码层面已完成 `Rulebook` → `GameMaster` → `MentalSandbox` 的规则书驱动集成，仅剩一个测试文件的语法错误需要修复并回归验证。
2. **脑中世界版本分叉 / A-B 推演**：尚未实现。需要新增 `sandbox_versioning.py`，在 `MentalSandbox` 中暴露 fork/merge/discard 接口，并让 `CEN` 在 `creation/simulation` 阶段自动触发 A/B 择优合并。
3. **全量 WebUI 仪表盘**：尚未实现。需要新建 `src/novelist_brain/web/` 模块，基于 FastAPI + Jinja2 + 原生 JS 提供覆盖记忆图、脑中世界、TRPG 角色卡、小说手稿、实时总线事件、EOS 指标与配置编辑的 Web 界面；`main.py` 以独立后台线程启动 WebUI。

本计划按「先收尾 TRPG → 再 A/B 分叉 → 最后 WebUI」推进，因为前两者是 WebUI 的数据基础，可减少接口返工。

## 当前状态分析

### TRPG 规则书（接近完成，剩一个阻塞测试）

- ✅ `src/novelist_brain/trpg_rulebook.py`：已提供 `Rulebook`、`SkillDef`、`ActionDef`、`CombatRule`、`SanityRule`、`ImprovementRule`、`ItemDef`、`MythosTome`、`CampaignArcTemplate`，支持 JSON/YAML 加载、校验、`skill_for_action`、物品过滤、序列化/反序列化。
- ✅ `src/novelist_brain/trpg_state.py`：已提供 `SkillCheck`、`SkillCheckOutcome`、`resolve_skill_check`、`emotional_shift_for_outcome`、`LuckPool`、`Inventory`、`ActorState`、`SkillImprovement`，是权威单一来源。
- ✅ `src/novelist_brain/trpg_extended.py`：已提供 bonus/penalty dice、`PushedRoll`、对抗检定 `OpposedCheck`、追逐 `Chase`、战斗轮 `CombatRound`/`CombatResolver`，并从 `trpg_state` 导入共享类，无重复定义。
- ✅ `src/novelist_brain/trpg.py`：
  - `TRPGCharacterSheet` 已新增 `luck`、`hit_points`、`magic_points`、`inventory`、`conditions`、`improvement_marks`。
  - `GameMaster` 已要求 `rulebook` 参数并使用 `self._rulebook.skill_for_action(action)`。
  - `resolve_round` 已支持 `bonus_dice`/`penalty_dice`/`pushed`。
  - 已实现 `resolve_opposed`、`resolve_chase`、`resolve_combat_round`。
- ✅ `src/novelist_brain/sandbox.py`：
  - `init` 从 `context["sandbox"]` 读取 `rulebook` 并重建 `GameMaster(rulebook=..., world_rules=..., rng=...)`。
  - `_rebuild_character_sheets` 同时创建/刷新 `_actor_states`。
  - `_resolve_event` 已根据动作关键词和 `scene.conflict_level` 触发普通检定、对抗检定、追逐、战斗轮。
  - `to_dict` / `from_dict` 已序列化 `_actor_states`、`_current_chase`、`_current_combat`、`_rulebook`。
- ✅ 配置层：
  - `src/novelist_brain/config.py` 的 `TRPGConfig` 已包含 `rulebook_path`、`embedded_rulebook`、`enable_ab_fork`。
  - `main.py` 的 `build_context` 已构建 `Rulebook` 并放入 `context["sandbox"]["rulebook"]`。
  - `default.config.json` 的 `trpg` 节点已嵌入完整 COC 风格规则书数据。
- ❌ `tests/test_trpg_extended.py` 第 170 行列表推导式未闭合，存在 `SyntaxError`：
  ```python
  assert any(d.hit_points <= 0 for r in rounds for d in [def
  ```
  这是当前 TRPG 阶段唯一阻塞点。

### 脑中世界版本分叉（尚未实现）

- ❌ 不存在 `src/novelist_brain/sandbox_versioning.py`。
- ❌ `MentalSandbox` 没有版本树、`fork`/`merge`/`discard` 接口。
- ❌ `CEN.tick` 中 `_sandbox_built and _awaiting_ready` 时只触发一次 `control.sandbox.simulate`，没有 A/B 对比与自动择优逻辑。
- ✅ `default.config.json` 的 `trpg.enable_ab_fork` 已预留开关。

### 全量 WebUI 仪表盘（尚未实现）

- ❌ 不存在 `src/novelist_brain/web/` 目录。
- ❌ 不存在 `requirements.txt`。
- ❌ `src/novelist_brain/memory.py` 没有 `export_graph()` 接口。
- ❌ `main.py` 没有启动 WebUI 的逻辑。
- ✅ 当前环境已安装 `fastapi 0.139.2`、`starlette`、`uvicorn`。
- ❌ `jinja2` 未安装，WebUI 若使用模板渲染需要先安装。

## 实施方案

### Phase A：TRPG 规则书收尾与回归

#### A1. 修复测试语法错误
- **文件**：`tests/test_trpg_extended.py`
- **内容**：将第 170 行未闭合的列表推导式补全。由于 `CombatResolver.resolve_multi_round` 会就地修改 `defender` 的 `hit_points`，最简修复为：
  ```python
  assert defender.hit_points <= 0
  ```
- **原因**：该语法错误导致整个测试文件无法被 pytest 收集，阻塞 TRPG 扩展验证。

#### A2. 运行 TRPG 单元测试并修复暴露的问题
- **命令**：`python -m pytest tests/test_trpg_rulebook.py tests/test_trpg_extended.py tests/test_trpg_integration.py -v`
- **内容**：
  - 确认 `test_trpg_rulebook.py` 中规则书加载、校验、`skill_for_action`、物品过滤通过。
  - 确认 `test_trpg_extended.py` 中 bonus/penalty dice、推骰、Luck、Inventory、`ActorState`、对抗检定、追逐、战斗轮通过。
  - 确认 `test_trpg_integration.py` 中 `GameMaster` 规则书驱动、`MentalSandbox` 集成对抗/追逐/战斗、快照恢复通过。
- **原因**：保证规则书集成在代码层面真正可用。

#### A3. Mock 冒烟回归
- **命令**：`python main.py --fast-forward --days 1 --use-mock`
- **目标**：48 ticks 正常完成，生成快照与小说段落，无未处理异常。
- **原因**：确保 TRPG 改动没有破坏主循环。

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
    - 字段：`tree`、`current_version_id`、`max_versions`（从配置读取，默认 8）。
    - 方法：
      - `fork(source_sandbox: MentalSandbox, label: str) -> SandboxVersion`：深拷贝 `source_sandbox.to_dict()` 创建新版本。
      - `simulate(version_id, rounds=1)`：基于版本副本创建临时 `MentalSandbox`，运行若干轮 `control.sandbox.simulate` 等价逻辑，收集每轮结果与最终 `depth_metrics`。
      - `compare(version_a_id, version_b_id) -> dict`：比较 `depth_metrics`（`coherence_score`、`character_development`、`conflict_depth`）与 `emotional_shift` 绝对值、预测误差下降趋势，返回优胜 ID 和差异。
      - `merge(target_sandbox: MentalSandbox, version_id) -> None`：把选中版本的 `sandbox_dict` 写回目标沙盒（调用 `target_sandbox.from_dict`）。
      - `discard(version_id)`：标记版本为 `abandoned`。
      - `prune()`：按 `max_versions` 清理最旧的 `abandoned`/`draft` 版本，保留当前版本及最近 2 个已合并版本。
- **原因**：提供独立的版本管理能力，与 `MentalSandbox` 解耦，便于测试和扩展。

#### B2. `MentalSandbox` 集成版本管理
- **文件**：`src/novelist_brain/sandbox.py`
- **内容**：
  - 新增 `_version_manager: SandboxVersionManager` 字段。
  - 订阅 `control.sandbox.fork`、`control.sandbox.version.merge`、`control.sandbox.version.discard`。
  - `init` 中根据 `context["sandbox"].get("enable_ab_fork", True)` 创建 `SandboxVersionManager`。
  - 处理消息：
    - `control.sandbox.fork`：调用 `_version_manager.fork(self, label=payload.get("label", "fork"))` 并发布 `data.sandbox.version.forked`。
    - `control.sandbox.version.merge`：调用 `_version_manager.merge(self, payload["version_id"])` 并发布 `data.sandbox.world.updated`。
    - `control.sandbox.version.discard`：调用 `_version_manager.discard(payload["version_id"])`。
  - `to_dict` / `from_dict` 包含版本树状态（通过 `_version_manager.tree.to_dict()`）。
- **原因**：让沙盒具备可被外部控制和 CEN 调用的分叉接口。

#### B3. `CEN` 全自动择优合并
- **文件**：`src/novelist_brain/cen.py`
- **内容**：
  - 在 `tick` 中，当 `self._sandbox_built and self._awaiting_ready and not self._narrative_ready` 时：
    - 若 `trpg.enable_ab_fork` 为真且当前不在 A/B 流程中，启动 A/B：
      1. 发布 `control.sandbox.fork` 创建版本 A（当前版本），标签 `"baseline"`。
      2. 再次发布 `control.sandbox.fork` 创建版本 B，标签 `"alternative"`。
      3. 设置 `_ab_in_progress = True`、`_ab_versions = (a_id, b_id)`、`_ab_rounds_remaining = max(2, min_rounds)`。
    - 若 A/B 进行中：
      - 每 tick 对 A、B 各运行一轮 `SandboxVersionManager.simulate`（使用 `simulate(version_id, rounds=1)`）。
      - `_ab_rounds_remaining -= 1`。
      - 当剩余轮数为 0 时：
        - 调用 `_version_manager.compare(a_id, b_id)` 得到优胜 ID。
        - 发布 `control.sandbox.version.merge` 合并优胜版本。
        - 发布 `control.sandbox.version.discard` 废弃失败版本。
        - 重置 `_ab_in_progress = False`、`_ab_versions = ()`、`_ab_rounds_remaining = 0`。
        - 继续常规流程，后续 tick 继续触发 `control.sandbox.simulate` 直到 `data.sandbox.narrative.ready`。
  - 新增状态字段与序列化：`_ab_in_progress`、`_ab_versions`、`_ab_rounds_remaining`。
  - 获取 `SandboxVersionManager` 引用：通过 `context["sandbox"].get("version_manager")` 或从已注册的模块列表中查找 `MentalSandbox` 实例的 `_version_manager`。
- **原因**：实现用户确认的「全自动择优合并」。

#### B4. 版本分叉测试
- **文件**：
  - `tests/test_sandbox_versioning.py`：独立测试 `SandboxVersionManager` 的 fork/simulate/compare/merge/discard/prune。
  - `tests/test_sandbox_ab_fork.py`：测试 `MentalSandbox` 消息接口与 `CEN` 集成 A/B 流程。
- **原因**：验证核心机制与主循环集成。

### Phase C：全量 WebUI 仪表盘

#### C1. 声明依赖
- **文件**：`requirements.txt`（新建）
- **内容**：
  ```text
  # WebUI
  fastapi>=0.100
  uvicorn[standard]>=0.23
  jinja2>=3.1
  starlette>=0.27

  # Optional: YAML rulebook support
  pyyaml>=6.0

  # Testing
  httpx>=0.24
  pytest-asyncio>=0.21
  ```
- **原因**：环境一致性，明确 WebUI 所需依赖；安装 `jinja2` 解决当前缺失问题。

#### C2. Web 模块结构
- **目录与文件**：
  - `src/novelist_brain/web/__init__.py`
  - `src/novelist_brain/web/app.py`：FastAPI 应用、路由注册、静态文件挂载、模板目录配置；若 `jinja2` 未安装则降级为纯静态 JSON API + 内联 HTML。
  - `src/novelist_brain/web/state_provider.py`：线程安全地读取 `modules`、`clock`、`router`、`config_registry` 的状态快照；提供 `get_state()`、`get_module(name)`、`broadcast(message)` 等方法。
  - `src/novelist_brain/web/websocket.py`：WebSocket endpoint `/ws`，维护 `ConnectionManager`，将总线事件推送给前端。
  - `src/novelist_brain/web/static/style.css`：仪表盘样式。
  - `src/novelist_brain/web/static/dashboard.js`：前端逻辑：REST 轮询 + WebSocket 实时更新、图表渲染。
  - `src/novelist_brain/web/templates/dashboard.html`：Jinja2 主页面。
- **原因**：模块化 Web 层，便于后续扩展主题/插件。

#### C3. REST 端点
- **文件**：`src/novelist_brain/web/app.py`
- **端点规划**：
  - `GET /`：渲染仪表盘首页（若 jinja2 不可用则返回内联 HTML）。
  - `GET /api/status`：Agent 运行状态（tick、phase、hour、运行时长）。
  - `GET /api/modules`：所有模块状态快照。
  - `GET /api/modules/{name}`：单个模块状态。
  - `GET /api/memory/graph`：调用 `memory.export_graph()` 返回节点/边。
  - `GET /api/sandbox/world`：沙盒世界模型、当前场景、角色表、版本树。
  - `GET /api/sandbox/versions`：版本树列表。
  - `GET /api/trpg/characters`：返回所有角色卡与 actor states。
  - `GET /api/trpg/rulebook`：返回当前 `Rulebook` 的 `to_dict()`。
  - `GET /api/novel/manuscript`：返回小说段落列表与元数据。
  - `GET /api/eos/latest`：最新 EOS 报告。
  - `GET /api/eos/metrics`：历史指标序列。
  - `GET /api/bus/recent`：最近总线消息（由 `state_provider` 维护最近 100 条）。
  - `GET /api/config`：当前配置（脱敏，隐藏 API key）。
  - `POST /api/control/simulate`：手动触发一次 `control.sandbox.simulate`。
  - `POST /api/control/fork`：手动触发一次 `control.sandbox.fork`。
  - `POST /api/control/merge`：手动触发一次 `control.sandbox.version.merge`。
  - `POST /api/config/reload`：触发 `control.config.reload`（由配置模块消费）。
- **原因**：为前端可视化提供数据接口。

#### C4. 实时总线事件推送
- **文件**：`src/novelist_brain/web/websocket.py` 与 `src/novelist_brain/web/state_provider.py`
- **内容**：
  - WebSocket 端点 `/ws`。
  - `ConnectionManager` 维护连接集合，使用 `asyncio.Queue` 缓冲消息。
  - `state_provider.broadcast(jsonable_message)` 将消息推入所有连接的队列。
  - 在 `main.py` 主循环每次 tick 后，调用 `state_provider.capture_bus_messages(delivered)` 把 `IMPORTANT_TOPICS` 中的事件序列化并广播。
- **原因**：让仪表盘能看到实时事件流。

#### C5. 前端页面与可视化
- **文件**：`src/novelist_brain/web/templates/dashboard.html`、`src/novelist_brain/web/static/dashboard.js`、`src/novelist_brain/web/static/style.css`
- **页面布局**（响应式网格）：
  - 顶部：Agent 状态条（tick / phase / hour / energy / LLM 状态）。
  - 左列：记忆图（D3.js 力导向图）、总线事件流。
  - 中列：脑中世界地图（当前 scene / characters / narrative line / prediction errors）、TRPG 角色卡。
  - 右列：EOS 指标（折线图）、小说手稿、配置面板、控制按钮（手动 simulate / fork / merge）。
- **原因**：提供用户要求的「不止社会空间，而是全量的 WebUI」。

#### C6. `MemorySystem.export_graph()`
- **文件**：`src/novelist_brain/memory.py`
- **内容**：新增 `export_graph(self) -> dict[str, Any]`，返回：
  - `nodes`：fragment 节点（id、type、content 摘要、tags、valence/arousal/timestamp）和 trace 节点（id、type、content 摘要、tags、importance、narrative_role）。
  - `edges`：`source_to_fragment` 边、`fragment_to_trace` 边、以及基于 tag 重叠的 trace-to-trace 关联边（shared_tags、weight）。
- **原因**：为前端记忆图提供结构化数据。

#### C7. `main.py` 启动 WebUI 后台线程
- **文件**：`main.py`
- **内容**：
  - 新增 CLI 参数：`--webui`（默认启用）、`--no-webui`、`--webui-port`（默认 8000）、`--webui-host`（默认 127.0.0.1）。
  - 在 `create_modules` 之后、主循环之前，若启用 WebUI：
    - 创建 `WebStateProvider(modules, clock, router, config_registry)`。
    - 在独立守护线程中运行 `uvicorn.run(app, host=host, port=port, log_level="warning")`。
    - 将 `state_provider` 注入 Web 模块的 `app.state.state_provider`。
  - 在主循环每次 tick 的 `transaction_manager.commit()` 之后，调用 `state_provider.capture_bus_messages(delivered)` 捕获并广播重要事件。
- **原因**：用户要求 `main.py` 后台线程启动 WebUI，且不阻塞核心 Agent 循环。

#### C8. WebUI 测试
- **文件**：
  - `tests/test_webui.py`：使用 `TestClient` 测试 `/`、`/api/status`、`/api/modules`、`/api/memory/graph`、WebSocket `/ws` 连接与事件推送。
- **原因**：保证 WebUI 模块可独立测试。

### Phase D：全量回归与真实 LLM 验证

1. **单元测试**：`python -m pytest tests/ -v`，目标全部通过。
2. **Mock 压缩测试**：`python main.py --fast-forward --days 1 --use-mock`，目标 48 tick 正常完成，生成快照与小说段落。
3. **真实 LLM 回归**（可选，需要 API 配置）：`python main.py --fast-forward --days 1 --llm-base-url ... --llm-api-key ... --llm-model ...`，目标运行稳定、生成中文小说、EOS 报告正常。
4. **WebUI 验证**：打开 `http://127.0.0.1:8000/`，确认 dashboard 能加载，实时总线事件与 EOS 指标能更新，记忆图、沙盒世界、TRPG 角色卡、小说手稿页面数据正确。

## 关键假设与决策

- **TRPG 规则书集成策略**：采用「full replacement」。`GameMaster` 必须接收 `Rulebook`；当前实现已满足，本计划只收尾测试。
- **A/B 分叉择优指标**：比较 `depth_metrics` 中的 `coherence_score`、`character_development`、`conflict_depth`，以及 `emotional_shift` 绝对值与预测误差下降趋势；综合得分高者胜。
- **WebUI 技术栈**：FastAPI + Starlette + Jinja2 + 原生 JS + D3.js。不引入 React/Vue，以降低依赖复杂度。
- **WebUI 状态访问**：通过 `state_provider` 暴露只读快照；配置修改/控制按钮通过 POST API 触发总线事件，由模块自己消费，不直接修改模块内部状态。
- **依赖管理**：新建 `requirements.txt` 明确列出运行时与测试依赖；`jinja2` 为必需，PyYAML 为可选（仅当使用 YAML 规则书时）。
- **错误降级**：若 `jinja2` 未安装，WebUI 仍启动为纯 JSON API + 内联 HTML，不阻塞主循环。

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| A-B 分叉导致 narrative.ready 延迟或循环 | 中 | 设置最大 fork 轮次和超时；提供 `enable_ab_fork` 配置开关 |
| WebUI 后台线程与主线程竞争模块状态 | 中 | `WebStateProvider` 所有读取都加锁；不直接修改模块状态 |
| jinja2 未安装导致 import 失败 | 中 | WebUI 作为可选模块导入，缺依赖时打印警告并降级为静态 HTML |
| A/B 模拟在真实 LLM 模式下开销过大 | 中 | 默认 A/B 轮数为 2；真实 LLM 下用户