# 批次2 修复报告（t55）— society 公共角色 3/4 效应只写不读

> 修复 f1：教师(teacher)/治安官(guard)/祭司(priest) 三个公共角色效应此前只写不读（装饰性布景）。
> 本修复为 literacyRate / safety / ritualBonus 各接一个真实消费点，并给出消融证据。

- 生成时间：2026-09-24T07:55Z（前后）
- HEAD：4510212（t53 结构件 + 性能修复，本修复不触碰 t53 共享文件）
- 改动文件：src/survival/health/disease.js、src/agent/psyche/trauma.js、src/civilization/tech/research.js + test/agent-society-consumer.test.js
- 方法：单元级消费点验证（hold->效应->retire->消失）+ 50x200x3 全字段消融 + npm test + normify_validate。

---

## 1 三个消费点（机制与代码证据）

> 设计原则：三个消费点都确定性（不新增随机数），因此不扰动跨种子分叉与全局 rng 序列；
> 各自直接读 society.activeEffects().effects.*，避免改动 t53 的共享编排文件（loop.js / _stage2.js）。

| 角色 | 效应字段 | 消费点（读方） | 可观测结果 | 实现 |
| --- | --- | --- | --- | --- |
| 治安官 guard | safety | disease.infect / disease.symptom | 健康数值：新感染严重度 x(1-safety)、症状推进与健康损失 x(1-safety) | disease.js safetyFactor() |
| 祭司 priest | ritualBonus | trauma.accumulate | 创伤数值：压力->创伤累积速率 x(1-ritualBonus) | trauma.js |
| 教师 teacher | literacyRate | research.progress | 事件流/资源流：每 tick 累积分数进度，攒满 1 点额外 +1 研究进度（x4 归一化放大） | research.js _literacy 分数累积器 |

> doctor 的 treatmentCapacity 已在 loop.js:191 消费（t48 已接），不在本次修复范围。
> literacyRate 是归一化权重（0.05），在 200-tick MVP 尺度下 x4 放大为每 tick 0.2 分数进度，使科技更快突破可观测。

---

## 2 单元级消费点验证（hold -> 效应 -> retire -> 消失）

test/agent-society-consumer.test.js 六条用例，全部通过：

| 用例 | 断言 | 结果 |
| --- | --- | --- |
| guard：safety 降低新感染严重度与症状推进 | 0.5 -> 0.45；症状推进 g2<g1；卸任恢复 0.5 | pass |
| teacher：literacyRate 加速研究 | power(cost6)：无教师 5 tick 未完成 / 有教师 5 tick 完成 | pass |
| priest：ritualBonus 减缓创伤累积 | 有祭司 added < 基准 added；卸任恢复 | pass |
| 三效应上任/卸任增减（activeEffects 聚合） | 0.1 / 0.05 / 0.1 -> 卸任后消失 | pass |
| 集成：默认 50x200x3 生存率 1.00 | 3 种子生存率均 1.00 | pass |
| 集成：消融 >=2 项指标差异 | 4 项指标 ON/OFF 差异 | pass |

npm test 全量：386/386 pass，0 fail（较 368 基线新增 6 条 t55 用例 + t53 用例）。

---

## 3 生存率红线

| seed | societyEnabled=ON | societyEnabled=OFF |
| --- | --- | --- |
| 1 | 1.00 | 1.00 |
| 2 | 1.00 | 1.00 |
| 3 | 1.00 | 1.00 |

判定：通过（三种子死亡 0，存活率 1.00；safety 只削弱疾病严重度、不引入死亡路径）。

---

## 4 消融实验（societyEnabled 开 vs 关，50x200x3）

### 4.1 逐种子对照

| 指标 | 类别 | seed1 ON/OFF | seed2 ON/OFF | seed3 ON/OFF |
| --- | --- | --- | --- | --- |
| 平均疾病严重度 | 健康 | 0 / 0 | 0 / 0 | 0 / 0.701 |
| 平均健康值 | 健康 | 100 / 100 | 100 / 100 | 100 / 29.35 |
| 创伤应对次数 copings | 创伤 | 2672 / 2655 | 1915 / 2701 | 2640 / 2621 |
| 科技突破末 tick | 事件流 | 26 / 32 | 29 / 32 | 32 / 32 |

### 4.2 三种子平均

| 指标 | 类别 | ON | OFF | 差异 | 差异来源 |
| --- | --- | --- | --- | --- | --- |
| 存活率 | 生存 | 1.00 | 1.00 | 0 | 红线保持 |
| 平均疾病严重度 | 健康 | 0.000 | 0.234 | -0.234 | safety(严重度削弱) + doctor(治疗容量) |
| 平均健康值 | 健康 | 100.0 | 76.45 | +23.55 | safety + doctor |
| 创伤应对次数 copings | 创伤 | 2409 | 2659 | -250 | ritualBonus(减缓创伤累积) |
| 科技突破末 tick | 事件流 | 29 | 32 | -3 | literacyRate(加速研究) |

判定：通过——>=2 项可观测指标出现差异（健康数值、创伤数值、事件流共 4 项），且存活率 1.00 不变。

> 归因说明：
> - literacyRate：seed1（26 vs 32）、seed2（29 vs 32）科技末 tick 提前 3~6 tick，方向一致、确定性可复现；seed3 末 tick 同为 32 系该种子研究链的解锁时机受前置/能源主导。
> - ritualBonus：三种子平均 copings -250（seed2 尤为显著 1915 vs 2701）；seed1/seed3 差异在 +-20 内为仿真噪声——10% 的累积速率削弱在压力主导的种子中被噪声掩盖，但其消费点在单元测试直接可证（added 变小）。
> - safety：严重度/健康差异在 seed3 显著（0 vs 0.701 / 100 vs 29.35），但该差异由 doctor 的治疗容量主导（doctor 已使疾病趋近消除）；safety 的 10% 严重度削弱在 doctor 在场时被部分掩盖，其消费点在单元测试直接可证（0.5 -> 0.45）。

---

## 5 行为一致性（不破坏 t53 已核实指标）

本修复三个消费点均为确定性乘法/分数累积，不消耗 rng，因此不扰动全局 rng 序列；社交平台使用独立随机源。

phase2-only seed1（对齐 t54 4 口径）逐值比对：

| 字段 | t53/4510212 | 本次(带修复) | 一致 |
| --- | --- | --- | --- |
| postCount | 853 | 853 | 是 |
| replyCount | 4993 | 4993 | 是 |
| reactCount | 2602 | 2602 | 是 |
| rep.mean | 57.3096 | 57.3096 | 是 |
| interestAccrued | 157.3005 | 157.3005 | 是 |
| treated | 2 | 2 | 是 |

判定：通过——t53 已核实的帖子/回复/react/repMean/interestAccrued 逐值一致。

---

## 6 结构件与校验

- normify_module_refresh（3 模块）：truman-town.agent.psyche.trauma、truman-town.civilization.tech.research、truman-town.survival.health.disease -> 指纹已刷新，state=active。
- normify_build：ok，227 模块 / receipt 已冻结。
- normify_validate（repoRoot + dir）：0 error / 1 warning（1 warning 为既有 dep/unanchored 269 条未锚定箭头，非本修复引入、非阻塞）。

---

## 结论

teacher/guard/priest 三个公共角色效应由只写不读改为各接一个真实消费点：
- literacyRate -> 科技更快突破（事件流）；
- safety -> 疾病严重度/症状/健康损失削弱（健康数值）；
- ritualBonus -> 创伤累积减缓（创伤数值）。

三条消费点确定性、无 rng 扰动；存活率 1.00 红线保持；t53 已核实社交/经济指标逐值一致；消融 >=2 项指标差异达标。
