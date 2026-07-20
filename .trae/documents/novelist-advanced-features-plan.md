# 小说家大脑高级功能实施计划（/goal 继续版）

## 摘要

继续完成 `/goal` 的三大高级功能，顺序保持此前决策：

1. **完整 TRPG 规则书**：让 `GameMaster` 与 `MentalSandbox` 强制消费数据驱动的 `Rulebook`，启用奖惩骰、推骰、Luck、物品栏、状态、技能成长、对抗检定、追逐、战斗轮、神话典籍与战役弧。
2. **脑中世界版本分叉 / A-B 推演**：让 `MentalSandbox` 能从当前状态 fork 出多个版本，独立运行 what-if 推演，比较结果后合并或废弃。
3. **全量 WebUI 仪表盘**：提供 Web 图形界面，覆盖记忆图、脑中世界地图、TRPG 角色卡、小说手稿、实时总线、EOS 指标与配置编辑。

本计划基于 2026-07-19 18:03 与后续会话的已落地代码，要求每一步都保持 mock smoke test 与 pytest 回归通过。

## 当前状态（Phase 1 确认）

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/novelist_brain/trpg_rulebook.py` | 已创建 | 含 `Rulebook`、`SkillDef`、`ActionDef`、`CombatRule`、`SanityRule`、`ImprovementRule`、`ItemDef`、`MythosTome`、`CampaignArcTemplate`，但缺少文件加载与校验方法。 |
| `src/novelist_brain/trpg_extended.py` | 已创建 | 含奖惩骰、推骰、`LuckPool`、`Inventory`、`ActorState`、`SkillImprovement`、`OpposedCheck`、`Chase`、`CombatRound`/`Combatant`，但 `ActorState` 缺理智/死亡判定，`Inventory` 缺使用消耗，`Chase`/`CombatRound` 缺高阶入口。 |
| `src/novelist_brain/models.py` | 已扩展 | 已有 `Condition`、`Item`，`SanitySystem` 有 `cthulhu_mythos`，`WorldModel` 有 `campaign_arc`。 |
| `src/novelist_brain/trpg.py` | 硬编码 | `GameMaster` 用 `_pick_skill` 做关键词映射；`TRPGCharacterSheet` 无 Luck/HP/MP/物品栏/状态/成长标记；未消费 `Rulebook`。 |
| `src/novelist_brain/sandbox.py` | 基础 TRPG | `_resolve_event` 只跑单角色简单检定；未使用对抗/战斗/追逐/物品/状态。 |
| `src/novelist_brain/config.py` | 基础 | `TRPGConfig` 缺少 `rulebook_path`、`enable_*` 开关、`rulebook_data` 与版本分叉字段；无 `WebConfig`。 |
| `default.config.json` | 基础 | `trpg` 区块只有简单规则，无完整规则书。 |
| `main.py` | 无 Web | 已注入 `agent_context`、`transaction_manager`，未接入 Web 服务。 |
| 依赖 | 部分就绪 | `starlette==1.3.1`、`uvicorn==0.51.0`、`httpx==0.28.1` 已安装；`jinja2` 未安装。 |
| Web 子系统 | 不存在 | 无 `src/novelist_brain/web/` 目录。 |

## 决策与约束

- **推进顺序**：TRPG 规则书 → 脑中世界 A/B 分叉 → WebUI（用户已确认）。
- **TRPG 集成方式**：**完整替换**，`GameMaster.__init__` 强制接收 `rulebook: Rulebook`，`Sandbox` 全面使用扩展 TRPG 机制。
- **版本隔离**：通过 `to_dict()` / `from_dict()` 深拷贝实现，不依赖外部数据库。
- **WebUI 技术栈**：FastAPI/Starlette + 原生 JS；Web 服务跑在独立线程，主循环不被阻塞。
- **循环导入处理**：`trpg_extended.py` 已导入 `trpg.py` 中的 `SkillCheck`/`resolve_skill_check`。为避免 `trpg.py` 回头导入 `trpg_extended.py` 产生循环依赖，将 `LuckPool`、`Inventory`、`ActorState`、`SkillImprovement` 迁移到新的 `src/novelist_brain/trpg_state.py`，`trpg.py` 与 `trpg_extended.py` 都从此模块导入。
- **向后兼容**：所有 `to_dict`/`from_dict` 必须对缺失的新字段使用默认值；旧快照加载后自动重建 `GameMaster`/`Rulebook`/`ActorState`。
- **可选依赖**：WebUI 依赖 `jinja2`，未安装时给出安装提示并禁用；其余 Web 依赖已存在。

---

## Phase A：完整 TRPG 规则书（完整替换）

### A1 扩展规则书模块

文件：`src/novelist_brain/trpg_rulebook.py`

- 新增类方法 `Rulebook.from_file(path: str) -> Rulebook`：
  - 支持 `.json` 与 `.yaml/.yml`。
  - YAML 缺失时抛出清晰 `ImportError`。
- 新增 `Rulebook.validate() -> list[str]`：
  - 检查 `skills` 非空、`actions` 非空、`combat.damage_formula` 可解析。
  - 返回错误列表；空列表表示通过。
- 新增 `Rulebook.__contains__(name: str) -> bool`：判断 `name` 是否为技能名或动作名。
- 新增 `Rulebook.items_for_category(category: str) -> list[ItemDef]`。
- 保持 `to_dict()` JSON 可序列化。

### A2 扩展 TRPG 机制模块

文件：`src/novelist_brain/trpg_extended.py`

- 将 `LuckPool`、`Inventory`、`ActorState`、`SkillImprovement` 迁移到新建 `src/novelist_brain/trpg_state.py`，并调整导入。
- `ActorState`：
  - 新增 `apply_sanity_shock(amount: float) -> dict[str, Any]`。
  - 新增 `apply_magic_cost(amount: float) -> dict[str, Any]`。
  - 新增 `check_death_and_insanity(sanity_rule: SanityRule | None) -> dict[str, bool]`，设置 `dead`、`permanently_insane`。
- `Inventory`：
  - 新增 `use_item(item_id: str) -> tuple[Item | None, dict[str, Any])`，处理 `uses` 扣减与 `effects` 触发。
- `Combatant`：
  - 新增类方法 `from_character_sheet(sheet: TRPGCharacterSheet, side: str = "ally") -> Combatant`，从 sheet 的 `hit_points`/`max_hit_points`/技能值初始化。
- `CombatRound`：
  - 新增 `resolve_multi_round(attackers, defenders, rule, max_rounds=3, rng) -> list[CombatRound]`，运行到一方全倒或达到最大轮数。
- `Chase`：
  - 新增 `resolve(quarry_skill, hunter_skill, rulebook, max_rounds=5, rng) -> dict[str, Any]`，运行到 `resolved` 或最大轮数。

### A3 重构核心 TRPG 模块

文件：`src/novelist_brain/trpg.py`

- `TRPGCharacterSheet`：
  - 新增字段：`luck: LuckPool`、`hit_points: float`、`magic_points: float`、`inventory: Inventory`、`conditions: list[Condition]`、`improvement_marks: SkillImprovement`。
  - `set_default_attributes` 后按 COC 标准计算默认 HP/MP：`HP = (CON + SIZ) / 10`，`MP = POW / 5`。
  - `skill_value(skill_name)` 改为：
    1. 取规则书 `base_value_for_skill`。
    2. 叠加 `self.skills` 中该技能的值。
    3. 叠加 `inventory.skill_bonus(skill_name)`。
    4. 叠加 `conditions` 中对该技能的加成。
    5. 仍保留属性派生作为最终回退。
- `build_character_sheet`：初始化上述新增字段； protagonist 默认携带 `旧台灯`/`磨破边的笔记本` 等 clue/tool 物品示例。
- `GameMaster`：
  - `__init__(self, rulebook: Rulebook, world_rules=None, rng=None)`，移除 `_pick_skill`。
  - `resolve_round` 增加参数 `bonus_dice=0`、`penalty_dice=0`、`pushed=False`。
  - 使用 `trpg_extended.resolve_skill_check_with_dice` 进行检定。
  - 失败/大失败时通过 `sheet.conditions`/`actor_state` 更新状态。
  - 新增 `resolve_opposed(action, initiator, responder) -> OpposedCheck`。
  - 新增 `resolve_chase(quarry, hunter) -> Chase`。
  - 新增 `resolve_combat_round(attackers, defenders) -> CombatRound`。
- `GMResolution`：新增 `actor_state_delta`、`loot`、`conditions_applied` 字段。
- 所有 `to_dict`/`from_dict` 兼容新增字段；缺失字段使用默认值。

### A4 沙盒集成扩展机制

文件：`src/novelist_brain/sandbox.py`

- `__init__` 增加：`_rulebook: Rulebook`、`_actor_states: dict[str, ActorState]`、`_current_chase: Chase | None`、`_current_combat: CombatRound | None`。
- `init`：
  - 从 `context["config"].trpg` 读取 `rulebook_path`；若为空则使用 `context["sandbox"].get("rulebook_data")` 或内存默认规则书。
  - 构造 `GameMaster(rulebook=rulebook, world_rules=..., rng=self._rng)`。
- `_rebuild_character_sheets`：为每个 sheet 创建 `ActorState` 并同步 HP/MP/Inventory/Conditions。
- `_resolve_event` 重构：
  - 单角色普通行动继续走 `GameMaster.resolve_round`。
  - 当 `current_scene.conflict_level >= 0.5` 且场上存在两名以上角色时，触发 `GameMaster.resolve_opposed`。
  - 当 `conflict_level >= 0.7` 或动作含“追/逃/跑”时触发 `Chase`。
  - 当动作含“打/斗/攻击”或 `conflict_level >= 0.8` 时触发 `CombatRound`。
  - 失败/大失败对 `ActorState` 添加 `Condition`（压力、轻伤等），并可能降低社交能量。
- `_handle_build`：重置 `_actor_states`、`_current_chase`、`_current_combat`。
- `to_dict`/`from_dict`：序列化 `_rulebook`、`_actor_states`、当前追逐/战斗状态；`from_dict` 后重建 `GameMaster`。
- `_update_scene_and_characters`：读取 `ActorState` 的 condition 变化写入 `CharacterProjection`。

### A5 配置层扩展

文件：`src/novelist_brain/config.py`

- `TRPGConfig` 增加字段：
  - `rulebook_path: str = ""`
  - `enable_sanity: bool = True`
  - `enable_skill_improvement: bool = True`
  - `enable_extended_combat: bool = True`
  - `enable_chase: bool = True`
  - `enable_opposed_checks: bool = True`
  - `rulebook_data: dict[str, Any] = field(default_factory=dict)`
  - `max_combat_rounds_per_scene: int = 3`
  - `max_chase_rounds: int = 5`
  - `max_branch_versions: int = 10`
  - `branch_max_rounds: int = 5`
  - `auto_abandon_threshold: float = 0.2`
  - `cen_auto_fork: bool = False`
- `HOT_RELOADABLE_PATHS` 增加：
  - `trpg.rulebook_path`
  - `trpg.enable_*` 开关
  - `trpg.max_combat_rounds_per_scene`、`trpg.max_chase_rounds`
  - `trpg.max_branch_versions`、`trpg.branch_max_rounds`、`trpg.auto_abandon_threshold`、`trpg.cen_auto_fork`
- 新增 `WebConfig` dataclass（见 Phase C）。
- `NovelistConfig` 增加 `web: WebConfig`。

### A6 默认配置扩展

文件：`default.config.json`、`novelist.config.example.json`

- `trpg` 区块扩展为完整规则书示例：
  - `rulebook_path` 默认空。
  - `rulebook_data` 包含 COC 风格技能（观察、潜行、说服、图书馆使用、格斗、闪避、心理学、追踪等）、动作映射、`combat`、`sanity`、`improvement`、示例 `items`/`tomes`/`campaign_arcs`。
- 同步补充 `max_combat_rounds_per_scene`、`max_chase_rounds`、`max_branch_versions`、`branch_max_rounds`、`auto_abandon_threshold`、`cen_auto_fork`。

### A7 主流程上下文扩展

文件：`main.py`

- `build_context` 中 `sandbox` 区块增加 `rulebook_path`、`rulebook_data`、`enable_*` 开关，从 `cfg.trpg` 读取。

### A8 测试

新增/修改文件：

- `tests/test_trpg_rulebook.py`：加载、校验、`skill_for_action` 回退、`base_value_for_skill`、`to_dict` 往返。
- `tests/test_trpg_extended.py`：奖惩骰边界、推骰并发症、Luck/Inventory/ActorState、SkillImprovement、OpposedCheck、Chase、CombatRound 多轮收敛。
- `tests/test_trpg_integration.py`：`GameMaster` 规则书映射、高冲突场景触发对抗/战斗、`TRPGCharacterSheet` 新字段。
- 修改 `tests/test_social_trpg.py`：适配 `GameMaster(rulebook=...)` 构造签名。

---

## Phase B：脑中世界版本分叉 / A-B 推演

### B1 版本管理器

文件：`src/novelist_brain/sandbox_versioning.py`

- `SandboxVersion`：
  - 字段：`id`、`parent_id`、`branch`、`state_snapshot`、`rounds`、`outcome_summary`、`status`（draft/simulated/merged/discarded）、`created_at`、`simulated_at`。
  - `to_dict`/`from_dict`。
- `VersionTree`：
  - 维护 `id -> SandboxVersion` 与父子边。
  - 提供 `get_lineage(version_id)`、`get_branches()`、`prune_discarded()`。
- `SandboxVersionManager`：
  - `__init__(sandbox: MentalSandbox, config: dict[str, Any] | None)`。
  - `fork(base_version_id, branch) -> str`：深拷贝当前 sandbox 状态创建新版本。
  - `simulate(version_id, rounds, action_hint="") -> dict[str, Any]`：在副本上独立运行 `rounds` 次 `control.sandbox.simulate`，收集结果摘要，不污染主线。
  - `compare(version_a_id, version_b_id) -> dict[str, Any]`：比较叙事产出、角色状态、冲突深度、情感位移等指标。
  - `merge(version_id) -> bool`：将指定版本的 `world_model`、`narrative_lines`、`actor_states` 写回主线；主线必须无活跃 chase/combat。
  - `discard(version_id) -> bool`：标记废弃。
  - `to_dict`/`from_dict` 序列化整棵版本树。
  - `merge` 前通过外部 `TransactionManager` 开启事务，失败则 rollback。

### B2 沙盒消息集成

文件：`src/novelist_brain/sandbox.py`

- 新增订阅：
  - `control.sandbox.fork`
  - `control.sandbox.branch.simulate`
  - `control.sandbox.branch.compare`
  - `control.sandbox.branch.merge`
  - `control.sandbox.branch.discard`
- 新增发布：
  - `data.sandbox.version.created`
  - `data.sandbox.version.simulated`
  - `data.sandbox.version.compared`
  - `data.sandbox.version.merged`
  - `data.sandbox.version.discarded`
- `__init__` 初始化 `_version_manager: SandboxVersionManager | None = None`。
- `init` 中创建 `SandboxVersionManager(self, context.get("sandbox", {}))`，并将当前状态注册为 `main` 根版本。
- 新增消息处理器 `_handle_fork/simulate/compare/merge/discard`。
- `to_dict`/`from_dict` 加入 `_version_manager` 状态。
- 新增公共方法 `version_tree_summary() -> dict[str, Any]` 供 WebUI/EOS 使用。

### B3 CEN 自动分叉（默认关闭）

文件：`src/novelist_brain/cen.py`

- 在 `creation`/`simulation` 高能量阶段，若收到 DMN 灵感提示且 `executive_load` 较低，可发出 `control.sandbox.fork`。
- 仅当 `context["sandbox"].get("cen_auto_fork", False)` 为真时启用。

### B4 事务边界

文件：`src/novelist_brain/transaction.py`（无需修改类）

- `SandboxVersionManager.merge` 调用方显式使用 `TransactionManager.begin(eager=True)`，失败则 `rollback()`。

### B5 测试

- `tests/test_sandbox_versioning.py`：fork 不影响主线、simulate 不污染主线、compare 可量化、merge 回写主线、discard/prune、事务失败 rollback。

---

## Phase C：全量 WebUI 仪表盘

### C1 Web 配置

文件：`src/novelist_brain/config.py`

- 新增 `WebConfig`：
  - `enabled: bool = False`
  - `host: str = "127.0.0.1"`
  - `port: int = 8080`
  - `auth_token: str = ""`
  - `cors_origins: list[str] = field(default_factory=lambda: ["http://localhost:8080"])`
  - `refresh_interval_ms: int = 1000`
  - `max_bus_events: int = 100`
  - `ws_sampling_rate: float = 1.0`
- `NovelistConfig` 增加 `web: WebConfig`。
- `HOT_RELOADABLE_PATHS` 增加 `web.refresh_interval_ms`、`web.max_bus_events`、`web.ws_sampling_rate`；`enabled/host/port/auth_token` 需要重启。

### C2 Web 子系统

目录：`src/novelist_brain/web/`

- `__init__.py`：暴露 `WebServer`、`start_web_server`。
- `app.py`：基于 `starlette.applications.Starlette`。
  - 路由表：
    - `/` → `index.html`
    - `/api/state` → 全量模块状态快照
    - `/api/state/{module_name}` → 指定模块状态
    - `/api/social` → `SocialInput.visualize_state()`
    - `/api/memory/graph` → 记忆图节点边
    - `/api/sandbox` → 沙盘世界模型、角色卡、叙事线、版本树
    - `/api/sandbox/fork`、`/api/sandbox/simulate`、`/api/sandbox/compare`、`/api/sandbox/merge`、`/api/sandbox/discard` → 发布对应控制消息
    - `/api/novel` → 小说手稿
    - `/api/eos` → 最新 EOS 报告与历史
    - `/api/bus/recent` → 最近 100 条总线消息摘要
    - `/api/config` GET/POST → 读取/热更新配置（仅 `HOT_RELOADABLE_PATHS` 白名单）
    - `/ws` → WebSocket 实时推送
  - 静态文件挂载 `/static` → `src/novelist_brain/web/static/`。
  - 模板目录 `src/novelist_brain/web/templates/`；若 `jinja2` 未安装，则退化为直接读取静态 HTML 文件。
  - CORS 与可选 `auth_token` 中间件。
- `state_provider.py`：
  - 只读访问 `agent_context["modules"]` 的 `to_dict()`。
  - 使用 `weakref` 保存 `agent_context_ref`。
  - Web 线程每次请求调用各模块 `to_dict()` 生成快照副本。
- `websocket.py`：
  - `ConnectionManager` 维护活跃 WebSocket 集合。
  - `broadcast(message)` 供主循环调用。
  - 主循环通过 `queue.Queue` 投递消息，Web 线程异步广播。
- `static/css/dashboard.css`：暗色主题、卡片布局。
- `static/js/dashboard.js`：
  - WebSocket 连接管理、消息路由。
  - 定时刷新 REST API（`refresh_interval_ms`）。
  - 配置编辑器表单生成与热更新提交。
  - 使用 CDN 引入 Chart.js、Cytoscape.js、marked.js。
- `templates/`：
  - `index.html`：总览仪表盘（网络、代谢、EOS、小说统计）。
  - `social.html`：社交空间可视化。
  - `memory.html`：记忆图。
  - `sandbox.html`：脑中世界地图、叙事线、版本树、A/B 控制面板。
  - `trpg.html`：TRPG 角色卡、物品栏、状态、战斗/追逐日志。
  - `novel.html`：小说手稿阅读器。
  - `bus.html`：实时总线消息流。
  - `config.html`：配置编辑器。

### C3 记忆图导出

文件：`src/novelist_brain/memory.py`

- 新增 `export_graph() -> dict[str, Any]`，返回 `{nodes, edges}` JSON。
  - 节点类型：`fragment`、`trace`、`social_trace`。
  - 边类型：`fragment_to_trace`、`source_to_fragment`、`social_provenance`。

### C4 EOS 报告事件

文件：`src/novelist_brain/eos.py`

- `EvaluationObservabilitySystem` 在 `_evaluate` 后发布 `data.eos.report` 事件，供 WebSocket 推送。

### C5 主循环集成 Web 服务

文件：`main.py`

- 可选导入 `start_web_server`；未安装 `starlette`/`uvicorn` 时打印警告并跳过。
- 在 `run_agent` 中模块初始化完成后，若 `cfg.web.enabled` 为 True，启动 Web 服务线程，将 `agent_context` 注入 `state_provider`。
- 主循环每 tick 结束时，将本 tick 的重要消息摘要通过 `websocket.broadcast` 投递。
- Web 服务异常不得中断主循环；异常通过 `control.fault.error` 发布。

### C6 默认配置

文件：`default.config.json`、`novelist.config.example.json`

- 新增 `web` 区块，默认 `enabled: false`。

### C7 测试

- `tests/test_web_api.py`：
  - 使用 `httpx` + Starlette `TestClient` 验证 REST endpoint。
  - WebSocket 接收模拟总线消息。
  - 配置热更新拒绝非热更新项。
  - 集成测试：启动 `run_agent(fast_forward=True, days=0)` 后访问 API，确保主循环不被阻塞。

---

## 总线集成

| 功能 | 订阅主题 | 发布主题 |
|---|---|---|
| TRPG 规则书 | `control.sandbox.simulate`、`control.module.init` | `data.sandbox.event.resolved`、`data.sandbox.character.updated` |
| 版本分支 | `control.sandbox.fork`、`control.sandbox.branch.*` | `data.sandbox.version.*` |
| WebUI | 无（只读） | WebSocket 转发 |
| EOS | 主循环喂入所有消息 | `control.eos.recommendation`、`data.eos.report` |

---

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| TRPG 规则书过度设计 | 默认规则书精简；复杂规则可开关；先保证核心扩展可用。 |
| 完整替换破坏既有测试 | 保留向后兼容序列化；先跑全量 pytest 与 smoke test 再推进。 |
| 循环导入 | 新增 `trpg_state.py` 集中存放 `LuckPool`/`Inventory`/`ActorState`/`SkillImprovement`。 |
| 版本分支状态拷贝过大 | 限制 `max_branch_versions`；废弃版本仅保留 metadata。 |
| WebUI 依赖缺失 | Starlette/uvicorn/httpx 已安装；`jinja2` 作为可选依赖，缺失时给出提示并禁用模板。 |
| WebSocket 广播阻塞主循环 | Web 服务在独立线程运行；主循环只把消息丢入线程安全队列。 |
| 配置热更新导致不一致 | `HOT_RELOADABLE_PATHS` 白名单；需要重启的项明确拒绝在线修改。 |

---

## 验证步骤

每阶段完成后执行：

```bash
# 1. 单元测试
PYTHONPATH=/home/hedaas/文档/project/LinYi python -m pytest tests/ -v

# 2. mock smoke test
PYTHONPATH=/home/hedaas/文档/project/LinYi python main.py --fast-forward --days 1 --use-mock

# 3. TRPG 与分叉阶段完成后，真实 LLM regression
PYTHONPATH=/home/hedaas/文档/project/LinYi python main.py --fast-forward --days 1 --llm-base-url <URL> --llm-api-key <KEY> --llm-model Qwen/Qwen2.5-7B-Instruct

# 4. WebUI 阶段完成后启动并访问
PYTHONPATH=/home/hedaas/文档/project/LinYi python main.py --use-mock
# 浏览器打开 http://127.0.0.1:8080
```

---

## 待开始任务清单

1. Phase A 完成后 `TRPGCharacterSheet` 必须携带 `luck`/`hit_points`/`magic_points`/`inventory`/`conditions`/`improvement_marks`。
2. Phase A 完成后 `GameMaster` 必须仅通过 `Rulebook` 解析动作到技能。
3. Phase A 完成后 `MentalSandbox._resolve_event` 必须能触发对抗/追逐/战斗。
4. Phase B 完成后 `MentalSandbox` 必须能通过总线消息完成 fork/simulate/compare/merge/discard 且不污染主线。
5. Phase C 完成后必须能在浏览器中访问仪表盘，看到实时总线、EOS、记忆图、沙盒版本树与 TRPG 角色卡。
