# 批次2-D：家族与关系网络（t49）

> 生存工程师交付。目标：基于 normify-truman-town 计划态模块树，实现楚门小镇「家族登记 / 家族编年史 / 家庭关系 / 关系边 / 社区发现」5 模块并真实接入主循环，同时证明跨种子涌现分叉。

## 一、交付模块（5 个，API 契约严格对齐声明）

| 模块 | 文件 | API | 依赖 |
|---|---|---|---|
| social.family.registry | src/social/family/registry.js | create / lookup / dissolve | —（复用 graph store + identity） |
| social.family.chronicle | src/social/family/chronicle.js | append / compile | → family.lineage（dataflow） |
| social.relationship.family | src/social/relationship/family.js | trace / label | → family.registry（call）、family.lineage（dataflow） |
| social.graph.edges | src/social/graph/edges.js | create / remove | → agent.memory.semantic（dataflow，可选写记忆） |
| social.graph.community | src/social/graph/community.js | detect / belong | → graph.edges（call） |

- registry 是既有 lineage 的**上层组织**（lineage 记父子女/代际，registry 记家族实体与成员名册），非重复实现。
- community 用**并查集连通分量**手写实现，**零第三方依赖**；阈值过滤弱互动边（交易 0.1），社区由强关系（家人/恋人/朋友 ≥0.5）构成。

## 二、真实接入点（文件:行）

1. **家族登记（runProcreation 生育入口）** — `src/runtime/orchestrator/_stage2.js:318-337`：婚配生育时 `registry.create`（创立者 + 双亲代际 0）→ 子代 `addMember`（代际 1）→ `chronicle.append`（founding/birth）→ `graph.edges.create`（romance + 亲子）。
2. **创始家族播种（初始居民分组）** — `_stage2.js:211`（seed 调用）与 `:249-282`（bootstrapFamilies，用独立随机源分组，不消耗共享 rng）。
3. **关系边随互动增减** — 交易边 `_stage2.js:390`、相似度友谊边 `:612`。
4. **社区发现（节流重算）** — `_stage2.js:808`（tick 步骤）与 `:813`（runCommunity，每 `communityDetectInterval=10` tick 重算，避免每 tick 全量重算拖慢长跑）。
5. **成员死亡写入家族史** — `src/runtime/orchestrator/loop.js:475`（recordFamilyDeath 辅助），挂接在 `:514`（饥饿/脱水死亡）与 `:545`（自然衰老死亡）。
6. **可观测指标** — `loop.js:216-224` socialSummary 暴露 family.families/members/size 与 graph.edges/communities（进 `report.social` / `snapshot().social`）。

## 三、跨种子涌现分叉（硬指标②）

50 居民 × 200 tick × 3 种子（phase2，默认参数）：

| 种子 | 存活率 | 家族数 | 家族规模(max) | 关系边数 | 社区数 | wall(ms) |
|---|---|---|---|---|---|---|
| 1 | 1.00 | 15 | 4 | 204 | 10 | 4024 |
| 2 | 1.00 | 15 | 4 | 202 | 10 | 4126 |
| 3 | 1.00 | 19 | 3 | 202 | 14 | 3966 |

**4 个字段全部跨种子出现差异**（家族数 {15,15,19}、家族规模 {4,4,3}、关系边数 {204,202,202}、社区数 {10,10,14}），远超「≥2 字段差异」的最低要求。差异根因：创始家族用独立随机源按种子分组（家族数/规模随种子变化），交易/友谊/婚配边由共享种子随机序列驱动（关系边数/社区数随种子变化）。

## 四、叙事事件（硬指标③，≥3 条具体事件）

1. **家族成立**：`家族1`（family_000000000228）于 **tick 1** 因「居民 16 与居民 50 婚配生育」成立，创立者 `agent_000000000016`，成员含新生儿 `agent_000000000229`；编年史 compile 输出「家族于 tick 1 成立（创立者 agent_000000000016）」「成员 agent_000000000229 于 tick 1 出生」。
2. **成员死亡写入家族史**：强制衰老场景（lifecycleElderStart=0）下，`agent_000000000001` 于 tick 1 去世，其家族 `family_000000000027` 编年史写入「成员 agent_000000000001 于 tick 1 去世（old_age）」。（默认参数无死亡，故该条在单测 `test/social-family-graph.test.js` 与上述强制场景验证，接线在 loop.js:514/545。）
3. **社区构成**：seed 1 中最大社区 `c_0` 由 13 名成员构成（agent_…001/002/004/005/016/021/025/029/038/041/045/050/229）——多个创始家族经「婚配 + 亲子」边连通合并为同一社区。

## 五、性能（无回归）

50×200 单次 wall-clock 约 **4.0s**（3966–4126ms），与基线 ~3.5–4s/200 tick 持平。社区发现采用每 10 tick 节流重算（`communityDetectInterval=10`），未引入每 tick 全量重算开销。

## 六、无回归

- `npm test`：**374 / 374 全绿**（新增 6 条：registry / chronicle / relationship.family / graph.edges / graph.community / 50×200×3 集成）。
- 默认 50×200×3 存活率 **1.00**（三种子均无初始居民死亡）。

## 七、结构校验（normify）

- `normify_validate`：**0 error**（1 条既有 dep/unanchored 警告，非本次引入）。
- `normify_build`：成功，receipt 冻结（module_count 227，planned_count 87，api_count 359）。
- 5 模块已 `normify_module_refresh activate:true` 转为 active。

## 八、变更文件

- 新增：src/social/family/registry.js、src/social/family/chronicle.js、src/social/relationship/family.js、src/social/graph/edges.js、src/social/graph/community.js、test/social-family-graph.test.js
- 修改：src/social/index.js（新增 family.registry/chronicle、relationship.family、graph 出口）、src/runtime/orchestrator/_stage2.js（bootstrapFamilies + runProcreation 家族接入 + 社区步骤）、src/runtime/orchestrator/loop.js（recordFamilyDeath + socialSummary）、src/infra/config.js（communityDetectInterval）
- 结构数据：normify-truman-town/modules/**（5 模块 source/deps + 指纹激活，config/loop 指纹刷新）

