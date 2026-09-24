# 批次2-C：日程与职业角色（t48）实现报告

> 任务：实现 `agent.schedule.{planner,executor}` 与 `agent.role.{career,society}` 四个模块，并接入主循环，
> 使日程真正驱动个体行动、职业与公共角色产生可观测分叉，且生存率不回退。

## 1. 结论

- 4 个模块全部落地，RPC 键与计划态声明一致（generate/replan、start/tick、assign/release、hold/retire）。
- 日程真实驱动行动：非紧急时以日程时间块为准，紧急（饥饿/口渴 ≥ eatThreshold）时直接进食/饮水，**不触发全量重排（O(1)）**。
- 跨种子分叉：`日程长度 / 重排次数 / 职业分布 / 公共角色担任者` 四个字段在 seed 1/2/3 间**全部**出现差异（要求 ≥2）。
- 生存无回退：默认 50×200×3 三种子存活率均为 **1.00**。
- 性能：日程执行器为每 tick 每居民 O(1)（时间块查找为常数块数），重排仅发生在「跨日边界」（每 `scheduleLength` tick 一次）与真实中断；50×50 墙钟约 **2.5s**（基线 4.4s）。

## 2. 独有文件（本任务完全归属，已落地）

| 文件 | 内容 |
|---|---|
| `src/agent/schedule/planner.js` | 日程规划：generate（按动机权重生成时间块）/ replan（重排，replans 递增 + trigger 记录） |
| `src/agent/schedule/executor.js` | 日程执行：start（预取预想池候选）/ tick（推进 + 跨日重排 + 紧急进食/饮水） |
| `src/agent/role/career.js` | 职业角色：assign（记录职业并可绑定企业职位）/ release（卸任） |
| `src/agent/role/society.js` | 公共角色：hold（上任）/ retire（卸任）/ activeEffects（聚合影响） |
| `test/agent-schedule-role.test.js` | 8 个单元测试 + 2 个集成测试（10/10 通过） |

### 2.1 模块 API

- `agent.schedule.planner.generate(agentId, {tick,length,needs,profile,occupation})` → 日程（startTick/length/blocks/replans/trigger）。
- `agent.schedule.planner.replan(agentId, {tick,trigger,needs,profile})` → 重排后的日程（replans 递增、trigger/prevTrigger 记录）。
- `agent.schedule.executor.start(agentId, {tick})` → 执行状态（预取 anticipation.pool 候选 + crafting.workbench 进行中制造）。
- `agent.schedule.executor.tick(agentId, {tick,interrupted,trigger})` → `{action, block, replanned, schedule}`。
- `agent.role.career.assign(agentId, {occupation,businessId,wage,tick})` → 职业记录（可选调用 `economy.industry.labour.hire` 绑定企业）。
- `agent.role.career.release(agentId, {tick,reason})` → 卸任记录。
- `agent.role.society.hold(agentId, {role,tick})` / `retire(agentId, {tick,reason})` → 公共角色记录。
- `agent.role.society.activeEffects()` → `{effects, holders}`（医生→treatmentCapacity、教师→literacyRate、治安官→safety、祭司→ritualBonus）。

### 2.2 设计要点

- 日程 = 「时间块 → 行动」有序列表，按 `persona.motivation.rank` 权重切分 `scheduleLength` 个 tick；职业为日程注入 `work` 块。
- 执行器每 tick O(1)：`blockAt` 在 ≤5 个时间块内二分/线性查找；紧急需求走 `emergencyAction`（food/water 谁更危急）直接返回，不重排。
- 跨日边界（`tick >= startTick + length`）自动 replan，频率 = 每 `scheduleLength`（12~15）tick 一次，随 tick 线性、无 O(t²) 退化。
- 跨种子分叉用 `hashUnit(seed + ':' + agentId + ':' + 维度)`（FNV-1a 确定性哈希）派生职业/角色/日程长度，**不消耗全局 rng**，不扰动既有随机流。

## 3. 共享文件接入（**本任务未提交共享文件，待 captain 三方合并**）

> 纪律：以下改动已保留在工作区、未回退、未提交，供 captain 与 t46/t47 三方合并核对。

| 文件:行 | 语义 |
|---|---|
| `src/infra/config.js:81-84` | DEFAULTS 新增 `scheduleEnabled/scheduleLength/careerEnabled/societyEnabled` |
| `src/infra/config.js:291-294` | RULES 新增四条校验器 |
| `src/agent/index.js:42-45` | import schedule/role 四个模块 |
| `src/agent/index.js:87,89` | `export const schedule = {planner,executor}`、`export const role = {career,society}` |
| `src/runtime/orchestrator/loop.js:55-56` | 常量 `CAREER_OCCUPATIONS/CAREER_WAGES/SOCIETY_ROLE_IDS` |
| `src/runtime/orchestrator/loop.js:159-164` | `hashUnit(key)` 确定性哈希（不消耗 rng） |
| `src/runtime/orchestrator/loop.js:167-185` | `seedAgentScheduleRoles`：真实调用 4 模块种子日程/职业/公共角色 |
| `src/runtime/orchestrator/loop.js:187-195` | `applySocietyEffects`：医生按治疗名额 `treatment.triage+apply` |
| `src/runtime/orchestrator/loop.js:199-213` | `scheduleOverride`：日程驱动的行动覆盖（紧急触发重排） |
| `src/runtime/orchestrator/loop.js:215-222` | `socialSummary`：日程/职业/公共角色汇总 |
| `src/runtime/orchestrator/loop.js:590-601` | `step()` 决策循环内：日程覆盖决策 action |
| `src/runtime/orchestrator/loop.js:655` | `step()` 末尾：`applySocietyEffects(tick, cfg)` |
| `src/runtime/orchestrator/loop.js:775` | `run()` 内：`seedAgentScheduleRoles(spawned, options)` |
| `src/runtime/orchestrator/loop.js:792,806` | `run()` 与 `snapshot()` 返回值新增 `social` 字段 |

**关键语义约定（供合并核对）**：
1. 紧急需求（`decision.context.dominantNeed` 为 food/water 且压力 ≥ `clampUnit(cfg.eatThreshold, 0.4)`）→ `executor.tick(..., {interrupted:true, trigger:'emergency'})` → 执行器**直接返回 eat/drink 不重排**。
2. 非紧急 → `executor.tick(..., {interrupted:false})` → 返回当前时间块行动；跨日由执行器内部自动 replan。
3. `_stage2.js` 我**未修改**；职业层与既有 `labour.hire` 解耦（career.assign 仅记录职业，可选绑定企业，绑定失败不抛错）。

## 4. 性能

- 每 tick 每居民：`scheduleOverride` → `executor.tick`（`blockAt` 常数块数查找）→ O(1)。
- 重排次数：200 tick × 50 居民下总重排 ≈ 658~666（= 居民数 × 200/scheduleLength），随 tick **线性**，无 O(t²)。
- 实测墙钟（node 直接运行）：50×50 默认局 schedule ON ≈ 2.5s、schedule OFF ≈ 2.0s（新增约 0.5s，基线 4.4s 内）。

## 5. 验收证据

### 5.1 日程真实驱动行动（≥1 居民 10 连续 tick 对照）

`scheduleLength=100`（避免跨日重排）下，`agent_000000000001` 的 12 tick 对照：

```text
t0 schedule=forage actual=forage MATCH
t1 schedule=forage actual=forage MATCH
t2 schedule=forage actual=eat    DIFF(紧急)  ← 饥饿≥0.4 强制进食
t3 schedule=forage actual=drink  DIFF(紧急)  ← 口渴≥0.4 强制饮水
t4..t11 schedule=forage actual=forage MATCH（间歇 eat/drink 为紧急覆盖）
```

10 tick 内 ≥5 tick 由日程驱动，其余差异均为紧急进食/饮水（测试断言 `matches>=5` 且 `matches+emergencies==10`）。

### 5.2 跨种子分叉（要求 ≥2，实测 4/4）

| 维度 | seed 1 | seed 2 | seed 3 | 分叉 |
|---|---|---|---|---|
| 日程平均长度 | 13.74 | 13.46 | 13.54 | ✅ |
| 总重排次数 | 658 | 666 | 657 | ✅ |
| 职业分布 | guard7/medic7/craftsman6/teacher14/farmer10/merchant6 | merchant7/guard9/farmer9/craftsman11/teacher8/medic6 | farmer6/craftsman6/medic14/guard4/teacher14/merchant6 | ✅ |
| 公共角色担任者 | teacher/guard/doctor/teacher | priest/priest/teacher/priest | doctor/guard/guard/guard | ✅ |

### 5.3 叙事历史（≥3 具体事件，seed 1）

1. **重排**：`agent_000000000001`（guard）跨日重排 13 次，最近触发 `day_boundary`（上一触发 `day_boundary`）——日程随世界推进持续滚动重排。
2. **职业**：`agent_000000000002` 获得 `medic` 职业（wage=6）；`agent_000000000004` 获得 `craftsman`（wage=4）。
3. **公共角色影响**：`agent_000000000003` 担任 `doctor`（医生）→ 社区聚合效应 `treatmentCapacity:+1`（另有教师 literacyRate:+0.1、治安官 safety:+0.1），医生按名额对感染者实施 `treatment.triage+apply` 治疗。

### 5.4 生存无回退

- seed 1/2/3 均 **50/50 存活（1.00）**（默认 50 居民 × 200 tick × phase2+phase3）。
- 紧急进食/饮水覆盖保证日程不挤压生存需求；`test/agent-schedule-role.test.js` 第 10 个用例固化该回归门槛。

## 6. 测试

`node --test test/agent-schedule-role.test.js` → **10/10 通过**（8 单元 + 2 集成）。

## 7. 待办（依赖 captain 调度）

1. 共享文件（config.js / agent/index.js / loop.js）的三方合并与提交（t47 先提交，随后由本任务补 t48 接入）。
2. 合并后跑全量 `npm test` + `normify_module_refresh activate` 4 模块 + `normify_validate 0 error` + git commit。

