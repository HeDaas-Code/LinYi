# LinYi 独立审计报告

**审计日期**: 2026-07-20
**审计人**: 哈尼斯 (第三方独立审计)
**仓库**: HeDaas-Code/LinYi @ `9b16a80`
**代码规模**: 22,682 行 Python (82 文件)
**测试基线**: 184 tests, 全绿 (6.87s)

---

## 1. 项目概况

LinYi 是一个以小说家"林逸"为人格主体的智能体系统。架构灵感来自脑科学三大网络模型：

- **SN (Salience Network)** — 评估输入碎片显著性，切换 DMN/CEN
- **DMN (Default Mode Network)** — 做梦、反思、心理漫游
- **CEN (Central Executive Network)** — 目标管理、计划生成

辅以脑中世界沙盒（TRPG 驱动的 what-if 推演）、记忆系统（碎片→痕迹→巩固）、社交输入模块、创作执行中心和小说输出。

### 核心数据流

```
经验输入 (Personal/Social) → Fragment → SN 评估 → DMN/CEN 切换
                                                    ↓
记忆系统 ← Fragment 存储 ← 代谢层能量预算
     ↓
痕迹巩固 → 沙盒推演 (TRPG) → 叙事素材 → 创作执行 → 小说输出
```

### 架构亮点

1. **Bus-based pub/sub** — 模块间零直接耦合，所有通信走 BusRouter
2. **A/B 沙盒版本管理** — `SandboxVersionManager` 支持 what-if 分叉推演
3. **Resilient LLM** — 熔断器 + 重试 + Mock 降级的三层容错
4. **设计文档极其详尽** — 2000+ 行 Design.md，实现高度忠实于设计
5. **TRPG 规则书** — COC 风格技能检定、战斗、追逐、对抗检定
6. **实时时钟驱动** — 与真实世界时间同步，白天生活晚上创作

---

## 2. 审计发现汇总

| # | 严重度 | 标题 | Issue |
|---|--------|------|-------|
| 1 | **P0** | BusRouter 缺少线程安全保护 | #2 |
| 2 | **P1** | MemorySystem 多个数据结构无界增长 | #3 |
| 3 | **P1** | reconstruct_dataclass 的 Literal 类型检查脆弱 | #4 |
| 4 | **P2** | LLM _strip_reasoning_prefix 硬编码正则脆弱 | #5 |
| 5 | **P2** | BusSpy monkey-patch 不够健壮 | #6 |
| 6 | **P2** | 沙盒战斗 defender 选择只看 other_characters[0] | #7 |
| 7 | **P2** | save_incremental 存储完整状态而非增量 | #8 |
| 8 | **P3** | apply_retention 从未在主循环中调用 | #9 |
| 9 | **P3** | _apply_loaded_context 混用 dict 和 dataclass | #10 |

---

## 3. 详细发现

### P0: BusRouter 线程安全 [#2]

**位置**: `src/novelist_brain/bus.py`

`BusRouter` 的 `publish()`, `flush()`, `subscribe()` 均无锁。但 WebUI 在独立线程运行 (`main.py:434`)，通过 `/api/control/{topic}` 直接调用 `router.publish()` + `router.flush()`。

两个线程同时操作 `_inbox` deque 会导致消息丢失或迭代异常。

`AgentStateProvider` 已有 `threading.RLock()` 保护读取，但 `BusRouter` 本身完全裸露。这是常驻运行时最可能触发的 critical bug。

### P1: 无界内存增长 [#3]

**位置**: `src/novelist_brain/memory.py`, `src/novelist_brain/sandbox.py`

以下结构只增不减：
- `_fragments: dict` — 每次经验都添加
- `_traces: dict` — 每次 consolidation 都添加
- `_social_provenance: dict` — 社交溯源记录
- `_skill_checks: list` — 每次技能检定
- `_prediction_errors: list` — 每次模拟

Design.md §12 有遗忘曲线设计（recency decay + importance threshold），但代码中只有 recency 衰减计算，没有实际的剪枝/遗忘执行。

### P1: Literal 类型检查脆弱 [#4]

**位置**: `src/novelist_brain/persistence.py`

```python
if origin is not None and str(origin).startswith("typing.Literal"):
    return value
```

应改为 `origin is Literal`。`str(origin)` 依赖 CPython 实现细节，Python 3.12+ 可能改变行为。

### P2: LLM reasoning strip 脆弱 [#5]

**位置**: `src/novelist_brain/llm.py:515-621`

60+ 个硬编码正则表达式来识别推理模型泄漏的推理痕迹。正常散文中的 "let me" / "actually" / "good" 等词会被误判。`chinese_run_re` 中的 `\s` 会匹配纯空行。

更健壮的方案：使用 structured output / tool calling 让 LLM 返回纯文本，而非正则剥离。

---

## 4. 设计-实现偏差登记

| 设计文档描述 | 实现状态 | 偏差说明 |
|-------------|---------|---------|
| §12 遗忘曲线 | ⚠️ 部分实现 | 有 recency 衰减计算，无实际剪枝执行 |
| §10 插件发现 | ✅ 已实现 | `ModuleRegistry.discover()` 支持 |
| §13 沙盒 A/B 分叉 | ✅ 已实现 | `SandboxVersionManager` 完整 |
| §16 社交凝视/规训 | ✅ 已实现 | `GazePressure` 模型完整 |
| §7 代谢预算 | ✅ 已实现 | Metabolism + 能量检查 |
| §14 TRPG 规则 | ✅ 已实现 | COC 风格技能检定/战斗/追逐 |
| §8 记忆巩固 | ⚠️ 部分实现 | 有 consolidation 逻辑，无遗忘 |
| §5 三网络切换 | ✅ 已实现 | SN→DMN/CEN 切换完整 |
| 增量持久化 | ⚠️ 偏差 | 注释说增量，实际存完整状态 |

---

## 5. 安全面检查

| 检查项 | 结果 |
|--------|------|
| `eval()` / `exec()` 使用 | ✅ 无 |
| `subprocess` / `os.system` | ✅ 无 |
| `pickle.load` / `yaml.load` | ✅ 无 (使用 JSON) |
| 路径穿越 | ✅ 无风险 (单用户系统) |
| API Key 处理 | ✅ 通过环境变量 + headers |
| 输入校验 | ⚠️ 社交内容无校验，但单用户场景可接受 |
| SQL 注入 | ✅ 无 (使用内存 dict) |

---

## 6. 代码质量评估

### 优点
- **架构清晰**: Bus + Module 抽象层设计优秀，模块间零耦合
- **文档对齐**: 实现高度忠实于 Design.md，偏差极少
- **测试覆盖**: 184 tests 全绿，覆盖核心路径
- **容错设计**: LLM 三层容错（重试→熔断→Mock 降级）考虑周到
- **类型标注**: 全量 `from __future__ import annotations` + dataclass
- **持久化策略**: 快照 + 增量 log 设计合理（执行层面有问题，见 #8）

### 待改进
- **线程安全**: 常驻运行 + WebUI 的并发场景未充分考虑
- **内存管理**: 遗忘机制缺失，不适配 7x24 常驻运行
- **LLM 适配**: reasoning strip 是临时性 hack，长期不可维护
- **类型重建**: `reconstruct_dataclass` 对边缘情况处理不够健壮

---

## 7. 建议的修复优先级

1. **立即修复** (#2): BusRouter 加锁 — 一行 `threading.RLock()` 就能解决
2. **本周修复** (#3, #4): 内存剪枝 + Literal 类型检查 — 影响长期运行稳定性
3. **迭代优化** (#5~#8): LLM strip / BusSpy / 沙盒 / 持久化 — 架构层面改进
4. **低优先级** (#9, #10): dict/dataclass 统一 / retention 调用 — 不影响功能

---

*审计人: 哈尼斯*
*2026-07-20*
