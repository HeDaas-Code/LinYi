# 生存压力梯度修复审计（t32）

## 结论

把采集从「无成本、随人口线性增长」改为「世界采集池约束」（每 tick 再生、全局共享、封顶），
使 needGrowth 从二值断崖（0.14 全活 / 0.16 全灭）变为四档渐进梯度。默认参数（foragePoolCapacity=30、
forageRegen=8）下 needGrowth=0.08 仍可长期存活，更高 needGrowth 产生渐进恶化。

## 问题与根因

captain 实测（20 居民×80 tick，phase2+phase3，stub，单种子）：

| needGrowth | 存活率 | 人口 | 资源末值 | 崩溃 | 日志计数 |
| --- | --- | --- | --- | --- | --- |
| 0.12 | 100% | 22 | food=100 / water=98 | 无 | 1758/1796/164 |
| 0.14 | 100% | 22 | 80~100 振荡 | 无 | 1758/1796/164（与 0.12 完全相同） |
| 0.16 | 0% | 灭绝 | tick 9 起归零 | tick 8 | — |

根因（src/runtime/orchestrator/loop.js forage 分支）：forage 无条件 produce(forageYield=2) 到 food 与
water，既无成本也无世界资源上限。总补给 = 人口 × forageYield，随人口线性增长，资源恒在容量附近；
只有当 needGrowth 超过人均采集能力时才会崩，因此 0.12/0.14 的行为与 0.08 完全一致（人人存活、日志计数相同），
0.16 突然全灭——难度只有开关没有档位。

## 修复方案（世界采集池）

新增两个 infra.config 参数（带默认值与 validate），不引入新模块：

| 参数 | 默认 | 含义 |
| --- | --- | --- |
| foragePoolCapacity | 30 | 采集池容量上限（首次满池） |
| forageRegen | 8 | 每 tick 再生量（min(pool + regen, capacity)） |

loop.js 采集分支改为：forage 实际获取 take = min(forageYield, 池余量)，扣减池，take>0 时才 produce 到 food/water；
每 tick 开始前 regenForagePool(cfg) 补充池；reset() 复位池；新增 loop.foragePoolRemaining() 与
worldState.resources.foragePool 快照供测试/观测。

关键机制：补给总量被 forageRegen 封顶（与人口无关），因此人均补给 = regen / 人口，人口增长 → 人均紧张；
needGrowth 升高 → 人均消耗升高 → 越过 regen 时资源渐进枯竭，产生连续梯度而非断崖。

## 改后数据（20 居民×200 tick×3 种子，phase2+phase3，stub，默认采集池）

| needGrowth | seed1 | seed2 | seed3 |
| --- | --- | --- | --- |
| 0.08 | 存活 100%，final 99/94，min food 70 | 存活 100%，final 92/96，min food 72 | 存活 100%，final 99/88，min food 72 |
| 0.12 | 存活 100%，final 80/97 | 存活 100%，final 83/79 | 死亡，death tick 130~140 |
| 0.14 | 死亡，death tick 68~74 | 死亡，death tick 46~48 | 死亡，death tick 46~48 |
| 0.16 | 死亡，death tick 28~29 | 死亡，death tick 21~23 | 死亡，death tick 21~26 |

四档结果：0.08 全存活且资源有余 → 0.12 部分种子存活/部分晚期死亡（存活时长有分布）→ 0.14 全灭（中期死亡）
→ 0.16 全灭（早期死亡），共 4 档不同结果（满足 ≥3 档）。中间档 0.12 的 survivedTicks 在 3 个种子间有实际差异
（seed1/seed2 全 200，seed3 130~140），不再完全相同。

## 被否决方案

1. 直接调低 forageYield（2→1）：仍是人均固定供给，人口线性增长仍会抵消，只平移断崖位置，不产生渐变。
2. 按人口折算 forageYield（yield / population）：引入除法取整边界抖动，且改变 forageYield 的语义（不再是每次采集量），参数难解释。
3. 给采集加额外资源成本（体力/工具耐久）：引入新资源维度与模块，超出「不引入新模块」的约束，改动面过大。
4. 硬限制人口（关闭 procreation）：违背 phase2 生育机制，且不产生「渐变」难度。

## 验证

- 新增 test/survival-gradient.test.js（3 用例）：采集池按 tick 再生并封顶、池空时采集受限（take=min(yield,pool)）、
  资源随人口增长而紧张（固定池下人口越多库存越低）。
- npm test 279/279 全绿（无回归）。
- normify_validate 0 error（仅既有 dep/unanchored warning）；normify_build 成功。
- 扫描耗时：12 组 200-tick 运行合计约 12 秒（stub）。

