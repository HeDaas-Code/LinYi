# 性能修复：personality.evaluate 每候选重复读图（t52）

## 根因（CPU profile 证据）

node --cpu-prof 采样确认：结构化克隆 structuredClone 占总采样 74.9%，热路径为

```
step → decide → selector.choose → scoreFn → personality.evaluate
     → profile → tagset.store.get → graph.read → clone → structuredClone
```

scoreFn 对每个候选（pruneK=4）调用一次 personality.evaluate，evaluate 每次重新
profile → 重新 graph.read + 深拷贝该居民的 50 个特质标签并重建 weightMap。调用量
≈ 50 居民 × 4 候选 × 200 tick = 40,000 次深拷贝，构成约 5.8 秒增量。

## 修复（仅改 2 个文件）

1. **src/agent/persona/personality.js**：加按 agentId 的 profile 进程内缓存，避免同一
   agent 在同 tick 内被 evaluate 重复 profile。失效条件：`tagset.store.__writeCount()`
   变化（任何特质写入）或 `graph.__generation()` 变化（复位）时清空。覆盖
   traits.evolution.drift 每 10 tick 改写特质的路径——漂移后缓存自动失效，性格不会读到
   陈旧数据。

2. **src/agent/traits/tagset/store.js**：
   - 加 `writeCount` 写代数（upsert/__reset 自增）并导出 `__writeCount()`，供上层
     派生缓存做失效信号（参考 memory.semantic 的 ensureFresh 思路）。
   - 加 `get` 读缓存：首次 graph.read 后缓存快照；upsert 按 agent 逐条失效、graph
     复位整体失效。命中时用 `cloneTags` 手动浅拷贝扁平 `{key,weight}` 标签数组，
     **保留"get 返回深拷贝"的隔离契约**（test/agent.test.js 深拷贝隔离用例仍通过），
     同时避免二次 structuredClone。

## 墙钟对比（200 tick × 50 居民 × 3 种子，phase2 only）

| 状态 | seed 1 | seed 2 | seed 3 |
|---|---|---|---|
| 修复前（HEAD 1c7c3d6） | 8734 | 8821 | 8869 ms |
| 修复后（连测 3 轮） | 3609/3612/3585 | 3788/3709/3700 | 3744/3863/3656 ms |

- 修复后平均 ≈ 3.70 秒（基线 6939444 ≈ 3.08 秒的 1.20×），稳定 ≤ 4.0 秒，达到 1.33× 红线内。

## CPU profile 对比（self-time 采样占比）

| 指标 | 修复前 | 修复后 |
|---|---|---|
| structuredClone self | 74.9% | 59.8% |
| 其中 tagset 路径（get/upsert/drift） | 主导（≈ evaluate→get 40k 次） | ~3.2%（get 1.65% + upsert 1.09% + drift 0.49%） |
| 其余 structuredClone | — | worldState/observer/economy/semantic 的 graph.read/write（本任务范围外） |

修复后 structuredClone 的剩余来源已不在 personality/tagset 路径，而是主循环其它模块
（load/record/residenceOf/listBusinesses/recall 等）的图读写，属 t52 范围外。

## 行为一致性证明

用独立脚本（_behavior_t52.mjs，仅 import personality/store/graph，绕过 social）对
profile/evaluate/漂移失效/复位失效做完整序列采样，修复前后逐值 diff 结果为 **IDENTICAL**。
evaluate 返回值与修复前逐值一致；drift 改写特质后 profile 读到新值（缓存正确失效）。

## 门禁

- node --test：374/374 全绿（含 test/agent.test.js「深拷贝隔离」、agent-persona-lifecycle、
  economy-closure「涌现性」）。
- 默认 50 居民 × 200 tick × 3 种子存活率仍 1.00（agent-persona-lifecycle 断言），批次2
  跨种子性格分叉结论不变（缓存为行为透明）。
- normify_validate：0 error / 1 warning（既有 dep/unanchored）。
- personality 与 tagset.store 两模块 fingerprint 已刷新（activate 状态不变）。
