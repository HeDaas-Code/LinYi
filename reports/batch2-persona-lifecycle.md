# 批次2-A：智能体人格与生命周期（t46）

实现 agent.persona（identity / motivation / personality）、agent.lifecycle、
agent.traits.evolution、agent.traits.tagset.similarity 六个计划态模块，接入主循环，
证明个体产生可观测分叉（跨种子性格分叉 + 可叙事历史），且默认档存活率不回归。

## 1. 模块与 API（与 Normify 声明一致）

| 模块 | API | 源码 | Normify |
|---|---|---|---|
| agent.persona.identity | describe / update | src/agent/persona/identity.js | 已 activate |
| agent.persona.motivation | evaluate / rank | src/agent/persona/motivation.js | 已 activate |
| agent.persona.personality | profile / evaluate | src/agent/persona/personality.js | 已 activate |
| agent.lifecycle | birth / age / death | src/agent/lifecycle.js | 已 activate |
| agent.traits.evolution | mutate / drift | src/agent/traits/evolution.js | 已 activate |
| agent.traits.tagset.similarity | compare / neighbors | src/agent/traits/tagset/similarity.js | 已 activate |

personality 依赖 agent.traits.tagset（50 特质→连续维度）；similarity 依赖 tagset.store。

## 2. 接入真实（调用点 file:line）

| 模块 | 调用点 | 说明 |
|---|---|---|
| identity | loop.js:140（登记出生身份）、_stage2.js:262-264（子代 familyId/parents、父母 spouseId） | 身份随生育/婚姻事件改变 |
| motivation | loop.js:217（rank 注入决策上下文） | 输出 topMotivation 进决策日志 |
| personality | loop.js:215（profile）、loop.js:259（evaluate 加到评分函数） | 性格对候选行动施加小幅修正 |
| lifecycle | loop.js:139（birth）、loop.js:444（age 每 tick 推进+老年死亡） | 年龄/阶段写入 world-state |
| evolution | loop.js:482（drift 每 10 tick 按生存压力漂移）、_stage2.js:260（mutate 子代可遗传变异） | 特质演化 + 遗传 |
| similarity | _stage2.js:265（compare 择偶相似度）、_stage2.js:520（neighbors 最近邻→社交纽带） | 择偶/结社复用 |

## 3. 跨种子分叉（50 居民 × 3 种子，性格字段对照）

| 字段 | seed 1 | seed 2 | seed 3 | 分叉 |
|---|---|---|---|---|
| avg 冒险性 adventurous | 0.4868 | 0.4678 | 0.4617 | ✅ |
| avg 社交性 sociable | 0.5617 | 0.5491 | 0.5659 | ✅ |
| avg 勤勉度 industrious | 0.5296 | 0.5447 | 0.5305 | ✅ |
| avg 谨慎度 cautious | 0.5087 | 0.4963 | 0.5021 | ✅ |
| avg 年龄 | 35.498 | 35.498 | 35.498 | 设计使然（见 §6） |

4 个性格字段跨种子出现差异（要求 ≥2），来源为 makeTags 用 rng 无放回采样 5 个
特有特质，映射出的性格维度随种子不同；年龄结构因确定性哈希（§6）跨种子一致，
属设计使然而非未生效。

## 4. 可叙事历史（observer 事件流实例）

1. 生育（tick 1）：agent_000000000001 与 agent_000000000020 因特质相似度 0.96998
   结为伴侣并生育 agent_000000000215（fam_1）。
2. 生育（tick 2）：agent_000000000008 与 agent_000000000031 相似度 0.97562，生育
   agent_000000000336（fam_2）。
3. 相似度社交（tick 1）：agent_000000000001 与 agent_000000000037 因特质相似度
   0.97496 建立友谊（social.friendship.similarity）。
4. 特质漂移（tick 10/20）：agent_000000000001 等 45 名居民在生存压力下特质权重漂移
   （agent.trait.drift）。
5. 自然衰老死亡（边界验证）：强制 elderStart=0 + 死亡率 1 时，5 名居民在 tick 1 因
   old_age 死亡（cause 标注为 old_age，区别于 starvation/dehydration）。

## 5. 不回归（默认 50 × 200 × 3 种子）

存活率 3 种子均为 1.00；默认参数 200 tick 内 old_age 死亡数为 0（test/agent-persona-
lifecycle.test.js 断言）。自然衰老死亡不进入默认档。

## 6. 边界与设计说明

- 自然衰老死亡 vs needs 致死：runMortality 只处理饥饿/口渴（cause=starvation/
  dehydration，健康归零）；runLifecycle 只处理衰老（cause=old_age，age>=elderStart 时
  按 elderMortalityRate 判定）。两者并存、互不重复，事件载荷带 cause 字段可区分。
- 默认档无自然死亡：初始年龄 20~50（确定性哈希），ageRatePerTick=1/365（1 tick
  =1 天），elderStart=65 岁，故 200 tick（≈0.55 年）内无人进入老年，存活率 1.00 不变；
  衰老死亡可通过 lifecycleElderStart / lifecycleElderMortalityRate 显式开启（可控参数）。
- 随机流稳定：mutate/drift 与初始年龄均采用确定性哈希（FNV-1a），不消耗全局 rng，
  保证主循环随机流与 t33~t45 基线一致（economy/market/industry 的 seed 复现不被扰动）；
  lifecycle 仅在进入老年时才调用 rng 判定死亡，默认档不消耗 rng。
- 特质漂移单调性与有界：drift 为确定性单调夹逼（weight→target，rate 线性逼近，
  恒为正且 ∈[0.05,10]），便于单调性/范围约束测试。

## 7. 门禁证据

- node --test test/agent-persona-lifecycle.test.js：10/10 pass（6 模块核心 API、边界、
  自然死亡路径区分、漂移单调性、相似度对称性、默认 50×200×3 存活率+跨种子分叉）。
- normify_validate：0 error / 1 warning（既有 dep/unanchored）。
- normify_module_refresh activate:true：6 个模块转 active 并写入真实 fingerprint。
- 默认 50×200×3 存活率 1.00（test 内断言）。

> 说明：本任务与 t47（批次2-B，ai-engineer）并行，共享集成文件 loop.js / _stage2.js /
> config.js / agent/index.js。t47 的 anticipation.simulator.predict 注入全局 rng 探索噪声，
> 导致 economy-closure 的「businesses 跨种子差异」用例当前失败（非本任务改动引起）。
> 共享文件的两方改动交织，需队长协调串行提交（详见完成报告）。
