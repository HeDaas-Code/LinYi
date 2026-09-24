# D0 执行审计报告：行动空间与候选池地基

- 日期：2026-09-24
- 范围：D0（行动空间动态化 / 候选池按状态重建 / 归因测试 / 性能回归修复）
- 基线提交：`4bded3e`
- 结论：**D0 完成并通过全部验收**（390/390 测试、存活率 1.00、归因测试决定性通过）

---

## 1. 为什么要做 D0（问题定义）

在 D0 之前，代码库有 ~50 个已实现模块（制作/建造/写作/产业/社交/婚恋），但**居民实际只有 4 个行动**：

```
DEFAULT_ACTIONS = ['eat', 'drink', 'rest', 'forage']
```

- `effectFor()` 的 switch 只有 4 个 case；
- 预想池（anticipation pool）在全代码库中**只被写入过一次**（`loop.js:136`，在 `registerAgent` 内）；
- 因此「消耗 tick 制作物品 / 建造建筑 / 写书」这条需求，在此前是**布景**：由 `runCrafting` 硬编码 `agents[0]` 制作、`agents[1]` 建造、`agents[2]` 写作，与任何居民的选择无关。

这是「多智能体涌现」与「单智能体幻觉模拟」的分界线：**如果行动由代码按列表顺序指定，那么观察到的"社会"就是代码的产物，不是智能体的决策。**

---

## 2. 根因链（逐层定位）

修复过程中一共暴露出**三层**独立的「代码替居民决定」：

### 第一层：行动空间本身只有 4 个
`DEFAULT_ACTIONS` 与 `effectFor` 的 switch 都只覆盖生存骨架。

### 第二层：日程模块无条件覆盖居民决定（本次新发现）
`scheduleOverride()`（`loop.js`）在决策之后**无条件**用日程块替换居民的选择：

```js
const scheduled = agent.schedule.executor.tick(...);
return { action: scheduled.action, ... };   // 直接丢弃 decision.action
```

而日程的动作词汇表**只有** `work / rest / forage / eat / drink`（`schedule/planner.js`）。
因此即使候选池里出现了 `craft`，它也会在这一步被日程抹掉——这是行动分布长期不变的**真正瓶颈**。

### 第三层：候选池从未按状态重建
预想池只在居民**出生时**写一次，此后再不更新。所以「背包里有木头 → 可以制作」这类状态根本无法进入决策。

---

## 3. 修复内容

| 文件 | 改动 |
|---|---|
| `src/agent/decision/candidates.js` | **新增**（纯函数候选规划器）：7 条规则（craft/build/write/work/trade/socialize/court），各自前置条件不满足时返回带理由的 `null`；`plan(state, opts)` 恒定推入 4 个生存骨架行动，再追加规则准入的动态行动 |
| `src/agent/anticipation/pool/store.js` | 新增 `replace(agentId, candidates)`：**整批替换**（单次 `graph.write`） |
| `src/runtime/orchestrator/loop.js` | 新增 `refreshCandidates()`，在 `decide()` 开头按当前状态重建候选池；dispatch 对动态行动调用真实模块并记录 `outcome.applied/reason`；`scheduleOverride` 改为**建议而非剥夺**；`alivePopulation` 世代缓存 |
| `src/runtime/orchestrator/_stage2.js` | 新增 `craftMaterialId()` / `candidateStateFor()` / `performAgentAction()`；**删除** `runCrafting` 中 `agents[0..2]` 硬编码（三个队列改为只推进、只由居民自己发起的任务） |
| `src/agent/anticipation/pool/pruner.js` | 打分重标定 + **生存门**（见第 5 节） |
| `src/infra/config.js` | 新增 `actionSpaceEnabled` / `actionSpaceAttribution` / `survivalGatePerCapita` |

### 3.1 日程改为"建议"
```js
const ownIsSurvival = own === 'eat' || own === 'drink' || own === 'forage' || own === 'rest';
if (!emergency && !ownIsSurvival && own !== undefined) {
  return { action: own, trigger: 'agent_choice', ... };  // 保留居民的选择
}
```
紧急需求（饥饿/口渴超阈值）时日程仍可结果性覆盖——但那时 `eat/drink` 本来就是正确选择，与候选池打分一致。

---

## 4. 归因测试（D0 的核心证据）

只测「行动分布变了吗」是不够的：分布变化也可能来自代码。因此引入 **`actionSpaceAttribution`**：
开启后 `candidates.plan` 把所有候选分数压平为 0.5，使「决定者」退化为随机。

| seed | 正常模式 crafted | 随机决定者 crafted | built（正常/随机） |
|---|---|---|---|
| 1 | **73** | **0** | 30 / 0 |
| 2 | **74** | **0** | 31 / 0 |
| 3 | **59** | **0** | 41 / 0 |

**制作/建造在随机决定者下完全归零**，证明这些产出确实由居民基于自身状态的选择驱动，而非代码固定指派。
（同时三组 `alive` 均为 52，说明归因开关本身不改变生存能力。）

---

## 5. 生存门（本次修复中最重要的一处"踩坑"）

### 症状
把行动空间打开后，**seed2 整镇死亡（alive=0）**，而 seed1/seed3 正常（52）。

### 排查
- `actionSpaceEnabled:false` → alive=52；HEAD → alive=52 ⇒ 回归确由 D0 引入；
- 逐 tick 打印库存：食物在 **6 个 tick 内从 94 掉到 0**，而 `pressure.scarcity` 要等采集池见底**之后**才饱和——那时已不可恢复；
- 更隐蔽的是：**needs 与资源库存是两套信号**。库存为 0 时 `needs` 仍可能读 `{food:0, water:0}`，导致 `hungry=false`，采集连原有的 `+1.0` 生存加分都拿不到，居民于是**在饿死前还在休息**。

### 修复
以**人均库存天数**为主判据（`survivalGatePerCapita`），触发时：
- `forage` **+3.0**（采集优先于一切）
- `rest` **−1.0**
- 7 个非生存行动 **−5.0**

阈值扫描（seed2）：

| 阈值 | alive | crafted |
|---|---|---|
| 1.5 | **0** | 46 |
| 3 | **52** | 74 |
| 5 | 52 | 74 |
| 8 | 52 | 74 |

取 **3.0**（1.5 太迟，实测仍崩溃）。

---

## 6. 性能回归与修复（2.4× → 1.28×）

D0 首版把 200tick×50agent 主循环从 **4371ms 拖到 10365ms**。用 `--cpu-prof` 聚合 `hitCount` 定位：

| 阶段 | structuredClone 占比 | 耗时 | 根因 |
|---|---|---|---|
| 首版 | **73.3%** | 10365ms | `pool.reset()+N×add()` 逐候选 `graph.read` 深拷贝（≈9 万次） |
| 改用 `replace()` | 71.7% | 8864ms | `candidateStateFor` 每居民每 tick 调 `labour.staff()`（每次深拷贝企业图） |
| 加企业状态缓存 | 62.9% | 6128ms | `alivePopulation()` 每居民每 tick 调 `registry.lookup()`（深拷贝全部居民） |
| 加人口世代缓存 | — | **5632ms** | — |

关键手法：
1. **整批替换**代替逐条写入（单次 `graph.write`，不读旧值）；
2. **tick 内缓存**企业状态快照，把 O(居民²) 降为 O(居民)；
3. 人口缓存用**显式世代号**而非 `clock.now().tick`——因为 `regenForagePool` 在 step 早期执行时 clock 可能尚未推进，用 tick 作键会读到上一 tick 的值，导致采集池容量算错（表现为「采集池按人口缩放」用例 `bigRegen === smallRegen` 而失败，已修复）。

关闭行动空间时 `refreshCandidates` 直接短路，OFF 路径为 4783ms（贴近 4.4s 基线）；ON 路径 5632ms，**Δ0.85s 是更丰富行动空间的真实成本**。

---

## 7. 验收结果

| 验收项 | 结果 |
|---|---|
| `node --test` 全量 | **390 / 390 通过** |
| 基线不变量：50 居民 × 200 tick × 3 seed | **alive=52 / 52 / 52（存活率 1.00）** |
| 行动分布 | craft 0.6–0.8%、build 0.3–0.4%、work 18.6–19.9%、forage 26.7–28.3%、eat/drink 各 14%、rest 22.7–24.5% |
| 归因测试 | 随机决定者下 crafted **73/74/59 → 0/0/0** |
| 性能 | 5632ms（基线 4371ms，**1.28×**） |
| 硬编码清除 | `runCrafting` 中 `agents[0..2]` 正则匹配数为 **0** |

---

## 8. 遗留与下一步

- **D1**：让 LLM 与记忆进入决策回路。当前 `ranked` 的唯一消费者是观测日志字段 `topDriver`，`semanticMemories` 的唯一消费者是 `context.semantic`，`scoreFn` 中**没有任何记忆项**——即 LLM 目前不影响任何行为。计划：LLM 对候选重排、`semanticMemories` 进入 `scoreFn`。
- **D2**：实现 `ai.speech.generate/polish`（当前 `planned`）替换平台模板对话（`_stage2.js:928-955` 的 `SICK_TEMPLATES` / `CHAT_TEMPLATES` / `REPLY_TEMPLATES`，源码注释即写明「不调用真实大模型」）。
- 角色分工问题：`candidateStateFor` 目前 `employed` 依赖产业雇佣关系，而产业是代码先建好的；后续应让居民**自己创业/受雇**。
- `socialize`/`court` 在 200 tick 内占比 0——需要检查 `pickPeer` 与 `eligibleMate`（当前恒为 `false`）是否过于严格。
