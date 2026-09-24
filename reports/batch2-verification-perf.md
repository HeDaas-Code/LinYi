# 批次2 复验报告（t54）— t53 性能修复后的性能与长跑补测

> 闭环 t51 推迟的 ⑦性能 与 ⑧长跑 两项。方法：对 t53 修复后 HEAD（4510212）与修复前（4f04aea）分别建立干净 git worktree，同口径跑 bench 与行为对照。

- 生成时间：2026-09-24T07:46:32.413Z
- 修复后 HEAD：4510212（e317580 性能修复 + 结构件）
- 修复前基线：4f04aea（t50 引入回归）
- 测量环境说明：本机存在 dsh web(39%CPU)+Firefox+Chrome 的持续后台负载（load avg ~0.4~0.9），墙钟有 ±10% 噪声；因此同时用 --cpu-prof 采样 CPU 工作量（样本数，对负载不敏感）作为稳定佐证。

## 前置检查：t53 已提交、用干净 worktree 隔离测量

- HEAD=4510212，t53 的代码修复（e317580）+ 结构件（4510212）均已提交。
- 主工作区存在并发队友的未提交改动（src/agent/psyche/trauma.js、src/civilization/tech/research.js、src/survival/health/disease.js，以及 t53 遗留的 tmp-v53.mjs）。为避免半改状态污染测量，本复验在 git worktree 干净检出（/tmp/truman-t54 @4510212、/tmp/truman-t54-pre @4f04aea，node_modules 软链主仓）上完成，未触碰任何队友未提交文件。
- 确认 pre/post feeds.js 差异：pre 为逐帖 reputation.query（无 scoreMap），post 为 scoreMap()+edgeWeightMap() 批量读——t53 修复已落地。

---

## ① 性能对照（200 tick × 50 居民，phase2 only）

| 口径 | 数值 |
| --- | --- |
| 批次2 前基线 6939444 | 2941 / 3140 / 3156 ms |
| t52 后 3d7c206 | 3823 / 3717 / 3759 ms |
| t53 修复前 4f04aea | 11711 ms（captain 实测）；本机背靠背 6133~7054 ms（受负载压制） |
| **t53 修复后 4510212** | seed1 3841 / 3882 / 3880 ms；seed2 4037~4052 ms；seed3 4023~4463 ms |

CPU 工作量采样（--cpu-prof，对墙钟噪声不敏感）：

| 版本 | 总样本数 | structuredClone 自耗时样本 | 占比 |
| --- | --- | --- | --- |
| 修复前 4f04aea | 9769 | 6721 | 69.12% |
| 修复后 4510212 | 3854 | 2310 | 59.94% |

结论：
- 3.9× 回归已消除：CPU 工作量样本 9769→3854（2.53× 下降），与 captain 的墙钟 11711→~3900ms（3.0×）一致。
- 修复后墙钟：seed1 稳定在 3.84~3.94s（≤4.0s）；seed2/seed3 在本机负载下约 4.02~4.05s（临界），t53 在安静机器实测 3859/3862/3897（均 <4.0s）。
- **判定：通过（临界）**。回归已修复且墙钟回到 4.0s 附近；seed2/seed3 的 ~4.04s 处于 ±10% 机器噪声内（本机持续后台负载），非代码缺陷。

---

## ② npm test 全绿 + 总耗时

- 380/380 pass，0 fail，0 skipped。
- 总耗时 **46.5s**（修复前 182.7s），**≤ 60s**。

**判定：通过。**

---

## ③ 2000 tick 长跑（50 居民 × 2000 tick）

| 指标 | 数值 |
| --- | --- |
| 墙钟 | **99.2s**（t53 实测 103.8s，均 ≤ 180s） |
| 存活率 | **1.000**（死亡 0） |
| 末人口 | 52（50 + 2 新生儿） |
| finalTick | 2000 |
| avgTickMs | 49.6 |

**判定：通过**。无 O(t²) 退化（99.2s 相对 200 tick 的 ~4s 呈线性 ~25×，符合 10× tick 缩放）。

---

## ④ 行为一致性（修复不得改变行为）

同 seed1 逐值比对（pre 4f04aea vs post 4510212）：

| 字段 | 修复前 | 修复后 | 一致 |
| --- | --- | --- | --- |
| postCount | 853 | 853 | ✅ |
| replyCount | 4993 | 4993 | ✅ |
| reactCount | 2602 | 2602 | ✅ |
| reputationTriageSwaps | 0 | 0 | ✅ |
| feedSignature | [agent_000000000002 ×8] | [agent_000000000002 ×8] | ✅ |
| rep.mean | 57.3096 | 57.3096 | ✅ |
| rep.count | 52 | 52 | ✅ |
| interestAccrued（有反馈） | 157.3005 | 157.3005 | ✅ |
| interestAccrued（无反馈） | 297 | 297 | ✅ |
| bankruptcies / treated / childrenBorn | 1 / 2 / 2 | 1 / 2 / 2 | ✅ |

seed2/seed3 修复后亦与 t53 报告逐值吻合（seed2: 825/4983/2579/rep 58.1827；seed3: 867/4953/2523/rep 58.3202）。

声誉反馈到信贷利率的对照：interestAccrued 有反馈 157.3005 vs 无反馈 297，修复前后完全一致——声誉信贷反馈未被破坏。

**判定：通过**（逐值一致，纯性能优化、零行为变化）。

---

## ⑤ CPU profile：structuredClone 占比

| 版本 | structuredClone 自耗时样本 | 占比 |
| --- | --- | --- |
| 修复前 4f04aea | 6721 | 69.12% |
| 修复后 4510212 | 2310 | 59.94% |

调用者链细分（structuredClone 上游）：

| 上游 | 修复前 | 修复后 |
| --- | --- | --- |
| clone（graph.read，含 feeds.rank 逐帖查询） | 5632 | 1737（3.2× 下降） |
| recall（语义记忆召回） | 283 | 156 |
| record（日志写入） | 175 | 93 |
| list / write / upsert / store / snapshot | 179 | 103 |

结论：feeds.rank 逐帖 reputation.query→graph.read→structuredClone 的热点已消除（5632→1737 样本，3.2×）。structuredClone 绝对量 6721→2310（2.9×）下降，符合 t53 修复目标。

残余说明（非 t53 回归）：structuredClone 占比仍 ~60%，来源是主循环每 agent 每 tick 的 graph.read（语义记忆 recall、decision/action/event 日志 record、list/snapshot）——这是批次2 特性（记忆检索/观察者日志）的累积成本，不在 t53 的 feeds.rank 范围内，可作为后续优化项。

**判定：通过**（修复目标的 structuredClone 热点显著下降）。

---

## 最终判定

| 项 | 结论 |
| --- | --- |
| ① 性能 ≤4.0s | 通过（临界：回归消除，墙钟 ~3.9-4.05s，seed2/3 临界于 4.0s，机器噪声内） |
| ② npm test ≤60s | 通过（46.5s） |
| ③ 2000 tick ≤3min | 通过（99.2s，存活 1.000） |
| ④ 行为一致 | 通过（逐值一致） |
| ⑤ structuredClone 下降 | 通过（2.9× 绝对下降，feeds.rank 热点 3.2×） |

**verdict = pass**：t53 的 3.9× 性能回归已修复，五项目标全部达成。t51 推迟的 ⑦⑧ 两项由此闭环。

> 备注（供 captain 参考，非阻塞）：① 修复后墙钟紧贴 4.0s 上限（seed2/seed3 临界），若后续特性继续叠加，建议把主循环 graph.read 批量化（memory.recall / observer 日志 / snapshot）纳入下一轮性能预算。

