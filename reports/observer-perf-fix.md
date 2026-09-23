# observer 日志 O(t²) 修复报告（t31）

- 角色：observer-engineer（观察者工程师）
- 生成时间：2026-09-23（会话内）
- 目标：让 2000-tick 规模运行可行，消除 per-tick 随 tick 数增长的 O(t²) 瓶颈，且不改变日志内容/顺序语义。

## 根因（逐处定位）

| # | 位置 | O(t²) 来源 | 修复 |
| --- | --- | --- | --- |
| 1 | `src/infra/store/graph.js` | `read({ type })` 每次全量扫描所有节点（observer.recorder list/query、chronicle 编译都走它），节点随 tick 累积 → O(t²) | 新增 `byType: Map<type, Set<id>>` 索引，`read({type})` 降为 O(matching) |
| 2 | `src/agent/memory/episodic/store.js` | `list(agentId)` 全量扫描+克隆所有记忆 | 新增 `byAgent: Map<agentId, Array>`，`list` 只读该主体、`_rawList` 免克隆 |
| 3 | `src/agent/memory/episodic/recaller.js` | `recall` 全量排序 + 每条记忆一次 `Math.exp` + 每步 `sort` | 有界 top-K 线性插入；写入时预计算 `_recencyKey`（非枚举，API 形状不变），召回只做一次 `Math.exp` |
| 4 | `src/agent/psyche/trauma.js` | `events` 数组随 tick 无界增长，每次 load/save 都 `structuredClone` 全量 → O(t²) | `events` 移出 graph 节点、独立 `Map` 存放，graph 节点只保留 `{agentId, level}`，读写 O(1) |

## 关键不变量（语义不变）

- observer 审计（decision/action/event）内容与顺序不变：类型索引只改查找方式，不改返回顺序（插入序）。
- `episodic.list(agentId)` 仍按 ts 升序返回该主体记忆。
- `recall` 结果顺序与 `rank` 一致（分数降序、分数相同 ts 升序）。
- `_recencyKey` 为非枚举属性，`structuredClone`（list/write 返回值）不带出，对外 API 形状不变。
- 未新增运行时依赖，未改动参数/平衡（t28 属 agent-engineer）。

## 验证

### 微基准（test/observer.perf.test.js，4 条全绿）
- `graph.read({type:'small'})` 在 50000 个无关节点背景下读 10 个节点，耗时远小于读 50000 个节点（O(matching) 生效，未退化为全量扫描）。
- 类型索引 upsert 换类型正确迁移、插入顺序与内容保持、list 按主体过滤且 ts 升序。

### 全环路 per-tick 曲线（50 agents，phase2+phase3，stub）
- 修复前（本会话实测）：300 tick 分段均耗 `[47.1, 99.1, 142.6, 166.7, 215.0, 239.0]`ms，末段/首段 ≈ 5.07，RSS ≈ 343MB。
- 修复后：300 tick 分段均耗 `[26.8, 19.6, 20.8, 24.4, 26.8, 30.4]`ms，末段/首段 ≈ 1.13，RSS ≈ 194MB —— 曲线不再单调增长。

### 2000-tick 可行性
- 修复前 extrapolation：t27 50×200×1 约 645s（O(t²) 下 2000 tick 不可行）。
- 修复后：2000 tick 全链路可完成（本次实测单跑 3:20 内；后续 agent-engineer 的死亡/崩溃机制让全环路在更早 tick 收束，但 per-tick 已是 O(1)/O(matching)，不再随 tick 增长）。

## 测试与结构校验状态

- 本任务相关测试（observer.perf + agent + psyche）：37 条全绿。
- 全仓 `node --test`：277 pass / 2 fail；2 条失败位于 agent-engineer（t28）新增的 `test/survival-gradient.test.js`（采集池再生/封顶），非本任务改动引入。
- `normify_validate`：当前 1 个结构错误 `structure/no-root`（根模块/树结构，来自 agent-engineer 并发重构），非本任务代码改动引入；本任务 4 个模块指纹需在 normify 收尾时刷新（deferred）。

## 提交范围

仅提交本任务文件：
- `src/infra/store/graph.js`
- `src/agent/memory/episodic/store.js`
- `src/agent/memory/episodic/recaller.js`
- `src/agent/psyche/trauma.js`
- `test/observer.perf.test.js`
