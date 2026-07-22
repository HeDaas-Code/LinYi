# LinYi 变更日志

> 记录项目从 v1 原型到 v2 重构的架构演进。日期使用 Asia/Shanghai 时区。

## v2.1 — 系统重构完成 (2026-07-22)

**Commit**: `1336174` (分支 `trae/agent-QAJNBB`)

### 新增模块

- **Planner** (`planner.py`, 1,388 行) — 故事圣经驱动的章节规划，滚动 3-5 章
- **COCMappingEngine** (`coc_mapping_engine.py`, 1,080 行) — 章节意图→COC 规则场景映射
- **ContinuityAuditor** (`continuity_auditor.py`, 1,894 行) — 六维连续性审计 (OOC/设定/时间线/伏笔/语气/节奏)
- **QualityEngine** (`quality_engine.py`, 886 行) — 去 AI 味规则，文风一致性检测
- **ChapterManager** (`chapter_manager.py`, 1,040 行) — 卷/章/版本管理，回溯与定稿
- **WorldState** (`world_state.py`, 1,420 行) — 动态世界状态契约，替代硬编码 default world
- **OCCharacterSystem** (`oc_character_system.py`, 963 行) — 原创角色卡系统
- **WorldVisualDebugger** (`world_visual_debugger.py`, 917 行) — 世界状态可视化调试

### 新增测试 (314 个)

498 tests (从 184 → 498)，覆盖全部新模块 + E2E 集成 + 性能基准 + v1→v2 迁移

### 新增工具

- `tools/migrate_state_v1_to_v2.py` (937 行) — 状态迁移脚本

### 新增文档

- `docs/系统重构方案_v1.md` (1,532 行) — v2 重构方案
- `docs/refs/` — 7 个参考项目源码 + 架构对照表 + 借鉴矩阵 + 技术笔记
- `.trae/specs/refactor-novelist-system-v1/` — 重构 Spec/Tasks/Checklist

### 新增基础设施

- `requirements.txt` + `run.sh` + `run_mock.sh` + `default.config.json`

---

## v2.0 — WebUI 重构完成 (2026-07-21)

**Commit**: `5b33d13` → `dc1c05e` (分支 `trae/agent-zMXkXJ`, PR #33)

### Phase 3 社会空间

- PixiJS v8 像素地图渲染层 (5 个空间)
- 程序化生成 tilemap + spritesheet 占位资产
- NPC 精灵 4 方向动画 + 点击交互
- NPC 详情面板 + 对话历史回放
- GazeOverlay 凝视压力叠加层

### Phase 2 视图

- 12 个 Vue 视图组件 (人格/日记/网络/日程/记忆/社会/世界/小说/EOS/总线/配置/世界)
- 26+ REST API 端点
- WebSocket 实时推送 + 轮询 fallback

### Phase 6

- 移动端响应式 (抽屉式侧边栏)
- 报告导出功能

### Bug 修复

- pixi-viewport 升级至 6.x 修复 PixiJS v8 兼容

---

## v1.2 — 审计修复 + WebUI 骨架 (2026-07-20)

**Commit**: `a4b558b` (分支 `trae/agent-zMXkXJ`)

### 审计修复 (9 issues)

- #2 [P0] BusRouter 线程安全 (RLock)
- #3 [P1] MemorySystem 无界增长 (遗忘机制)
- #4 [P1] Literal 类型检查 (`origin is Literal`)
- #5 [P2] LLM reasoning strip (word boundary + 中文计数)
- #6 [P2] BusSpy idempotent attach/detach
- #7 [P2] 沙盒 defender 选择
- #8 [P2] save_incremental 增量持久化
- #9 [P3] apply_retention 主循环调用
- #10 [P3] dict/dataclass 统一转换

### WebUI 骨架

- Vue 3 + Vite + TypeScript 项目搭建
- 11 视图组件骨架 + Pinia store + vue-router
- FastAPI 后端 API 重构

---

## v1.1 — 独立审计 + 重构方案 (2026-07-20)

**Commit**: `1dda6bf`

- `docs/AUDIT-REPORT.md` — 9 个审计 issue
- `docs/WEBUI-REFACTOR.md` — 11 视图重构方案

---

## v1.0 — 完整原型 (2026-07-19)

**Commit**: `9b16a80`

- 完整 TRPG 规则书
- 脑中世界 A/B 分叉推演
- 全量 WebUI 仪表盘
- 184 tests 基线

---

## v0.1 — 初始原型 (2026-07-18)

**Commit**: `030a32f` → `c41dabe`

- 基于 MD 文档的 Python 原理模型
- Design.md 架构设计文档
