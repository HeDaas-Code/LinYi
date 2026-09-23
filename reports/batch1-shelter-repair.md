# 批次1 修复：避难所容量约束与危机信号恢复（t43）

## 1. 缺陷回顾（t41 验收 findings）

| 缺陷 | t41 现状 | 根因 |
| --- | --- | --- |
| D2-1 容量约束失效 | 三种子 integrity=0、capacity=0、damaged=true，但 occupants=52 仍居住 | `_stage2.js runResidence` 只对**新迁入**做容量判断，对**已入住者**在容量降至 0 后不驱逐 |
| D2-2 危机信号退化 | crisis.level 恒 1.000 critical 且永不复原 | 避难所无修复机制，integrity 单调降至 0 → `damaged` 恒 true → shelterDamageLevel 恒 1.0 |

## 2. 设计选择与理由

选择：**修复（repair）+ 容量拒绝（evict excess）+ 暴露惩罚（exposure）三者互补**，而非二选一。

理由：
- **修复（repair）**是让 integrity/capacity 回升、crisis 可复原的机制——D2-2 要求"避难所修复后 crisis 下降"必须依赖它；它也对应 D2-1 的"驱动避难所修复"路线。
- **容量拒绝（evict）**是让"容量为 0 / integrity 过低时居民**不得**继续居住"真实生效的强制：每 tick 若 occupants > capacity，从 dorm_a 末尾逐出超出者，保证 **occupants <= capacity**。
- **暴露惩罚（exposure）**是被逐出/无处可住居民的可观测后果：food/water 需求额外增长 → 生存压力上升（对应"暴露于环境"）。

三者缺一不可：仅修复无法惩罚超员（居民仍睡在坍塌避难所里）；仅拒绝会让危机永远无法复原。二者相加形成完整闭环——**风暴损坏 → 容量下降 → 超员逐出（暴露压力）→ 劳动力修复 → 容量回升 → 重新入住 → 危机下降**。

## 3. 修复实现

| 文件 | 改动 |
| --- | --- |
| `src/survival/shelter.js` | 新增 `repair(amount)`：提升完整度（封顶 100）、使容量回升；baseCapacity 改由 config 提供默认值 |
| `src/infra/config.js` | 新增默认参数 `shelterBaseCapacity=54`、`shelterRepairRate=1`、`exposureNeedGrowth=0.01`，并加校验规则 |
| `src/runtime/orchestrator/_stage2.js` | 新增 `runShelterRepair`（每 tick 以劳动力修复）；`runResidence` 增加"容量拒绝（超员逐出）"与"暴露（food/water 额外增长）"两段 |
| `src/survival/crisis.js` | **无需改动**：本已按 live integrity 计算 shelterDamageLevel（`damaged ? (100-integrity)/100 : 0`）；缺陷根因是 shelter 无修复、integrity 单调降到 0，修复 integrity 后信号自然复原 |

## 4. 时间序列证据（50 居民 × 200 tick × 3 种子）

三种子抽样（tick | integrity | capacity | occupants | crisis.level | critical）：

| tick | S1 int/cap/occ/crisis | S2 int/cap/occ/crisis | S3 int/cap/occ/crisis |
| --- | --- | --- | --- |
| 0 | 100/54/50/0.02 | 96/51/50/0.04 | 100/54/50/0.06 |
| 20 | 96/51/51/0.04 | 100/54/52/0 | 100/54/52/0.94(疫) |
| 60 | 100/54/52/0 | 100/54/52/0 | 100/54/52/0.96(疫) |
| 100 | 97/52/52/0.03 | 100/54/52/0 | 100/54/52/0.94(疫) |
| 140 | 97/52/52/0.03 | 100/54/52/0 | 95/51/51/0.94(疫) |
| 199 | 100/54/52/0 | 99/53/52/0.01 | 95/51/51/0.96(疫) |

三种子对照表：

| seed | 终态 integrity | 终态 capacity | 终态 occupants | min integrity | max occupants | 累计逐出 | crisis.level 终态 | critical |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 100 | 54 | 52 | 92 | 52 | 16 | 0 | false |
| 2 | 99 | 53 | 52 | 91 | 52 | 36 | 0.01 | false |
| 3 | 95 | 51 | 51 | 88 | 52 | 25 | 0.96（疫情） | true |

要点：
- **容量约束真实生效**：全程 occupants <= capacity（integrity 下降 → capacity 下降 → 超员立即逐出，表中 S1 t20 出现 occ=51/cap=51、S2 t160 occ=51/cap=51 等逐出时刻）。
- **危机可升降（D2-2）**：避难所损坏信号 shelterDamageLevel 从修复前的恒 1.0 降为 0~0.06；S1/S2 危机随修复归零，不再恒 1.000。
- **涌现性**：integrity（100/99/95）、capacity（54/53/51）、occupants（52/52/51）、crisis.level（0/0.01/0.96）均跨种子不同。
- **S3 的 critical 来源**：S3 的 crisis.level=0.96 由 **infectionRate=0.94 的疫情信号**主导（`signals.shelterDamageLevel=0~0.06` 已复原）。这是独立于避难所的既有"群体生存危机"信号（t33/t41 即存在、非本缺陷），不属于 D2-2 的避难所常量退化；避难所信号本身已在三种子全部复原。

## 5. 危机"触发 → 修复 → 恢复"（受控场景，test/survival-shelter.test.js）

| 步骤 | integrity | capacity | crisis.level | critical | reasons |
| --- | --- | --- | --- | --- | --- |
| 触发：damage(100) | 0 | 0 | 1.0 | true | shelter_damage |
| 修复 60 | 60 | 32 | 0.4 | false | — |
| 修复 40 | 100 | 54 | 0 | false | — |

证明 crisis.level 随避难所修复单调下降、critical 由 true 转 false。

## 6. 不回归证据（硬约束）

50 居民 × 200 tick × 3 种子（phase2 开启，默认参数）：

| seed | 存活率 | 崩溃次数 | 终态人口 |
| --- | --- | --- | --- |
| 1 | 1.00 | 0 | 52 |
| 2 | 1.00 | 0 | 52 |
| 3 | 1.00 | 0 | 52 |

t33 基线存活率 1.00 保持不回归（无死亡、无文明崩溃）。

## 7. crisis 与 civilization.collapse.detector 分工确认

- `survival.crisis` 只检测**群体生存危机**（饥饿率/脱水率/感染率/避难所损坏/辐射），输出 level/reasons/critical，供文明崩溃判定作输入；本次仅修复避难所损坏信号的复原，未并入任何崩溃判定逻辑。
- `civilization.collapse.detector` 仍单独判定**文明崩溃**，两模块职责边界未变。

## 8. 参数调整说明（baseCapacity 60 → 54）

将 `shelterBaseCapacity` 由 60 收紧为 54（**收紧而非放宽**）：默认档 50 居民 + 2 新生儿 = 52 人，紧贴 54 容量，单次风暴（5 点损坏 → integrity 95 → capacity 51）即可造成真实超员逐出，使容量约束在默认档可观测。收紧后存活率仍 1.00（§6），无大规模死亡。`shelterRepairRate=1`（每 tick 修复 1 点完整度）使修复速度略高于风暴平均损坏速率（约 0.5/tick），保证避难所可复原、暴露惩罚非致命；`exposureNeedGrowth=0.01`（每 tick 额外 food/water 增长）让被逐出者产生可测压力但不致饿死。

## 9. 文件清单

- 修改：`src/survival/shelter.js`、`src/infra/config.js`、`src/runtime/orchestrator/_stage2.js`、`test/survival-batch1.test.js`（容量断言 60→54/48→43）
- 新增：`test/survival-shelter.test.js`、本报告
- Normify：刷新并激活 `truman-town.survival.shelter`（新增 repair API）与 `truman-town.infra.config`；`normify_validate` 0 error（1 条预存 dep/unanchored 警告）

