# 长跑两项阻断修复审计（t33）

## 结论

两项长跑阻断均已最小修复，不新增模块：
① chronicle 编译器把 Math.min/max(...spread) 改为单次循环求 min/max，20 万+ 条日志不再栈溢出；
② 采集池新增人均缩放参数（forageRegenPerCapita=0.15 / foragePoolPerCapita=1.0），有效补给 = 基础值 + 人均 × 人口，
50 居民默认 needGrowth=0.08 不再开局必死，且人口增长仍带来人均下降（needGrowth 梯度未被抹平）。

## 问题与根因

① chronicle 栈溢出：src/observer/chronicle/compiler.js 的 compile() 用 Math.min(...ticks)/Math.max(...ticks)
展开全量 tick 数组。V8 对函数实参数有上限（约 12.5 万），50 居民 × 2000 tick 积累 20 万+ 条日志后，
loop.snapshot() 每 tick 调用 compile() 即抛 RangeError，任何统计/快照路径在长跑后期崩溃。

② 采集池不随人口缩放：foragePoolCapacity=30 / forageRegen=8 是固定总量，人均补给 = 8 / 人口。
20 居民时人均 0.40/tick（可存活），50 居民时人均 0.16/tick（低于 needGrowth=0.08 的实际消耗），
导致 tick 20 内资源归零、tick 40 前全灭；把 needGrowth 降到 0.06 仍全灭（供给侧结构性不足，非需求端可调）。

## 修复方案（两项最小改动）

① compiler.js：compile() 在统计 counts 的同一趟循环里累计 minTick/maxTick，删除 ticks 数组与 spread，
  对 entries/ticks 规模不敏感（O(n) 单趟，无额外数组）。

② loop.js + config.js：新增 foragePoolPerCapita（默认 1.0）与 forageRegenPerCapita（默认 0.15），
  有效容量 = foragePoolCapacity + foragePoolPerCapita × 存活人口；有效再生 = forageRegen + forageRegenPerCapita × 存活人口。
  人均补给 = forageRegen/人口 + forageRegenPerCapita：在合理人口区间（20~50）大致恒定，
  但基础项随人口被稀释，人均仍随人口增长而下降——缩放不完全抵消人口效应，needGrowth 梯度得以保留。

## 改前 / 改后数据

### ① chronicle

| 指标 | 改前 | 改后 |
| --- | --- | --- |
| 20 万+ 条 compile | RangeError（spread 超参上限） | 不抛错，startTick/endTick 正确 |
| 50×2000×1 跑完后 snapshot | 读快照即崩 | 211,534 条编译成功，snapshot ~1.2s 可读 |

### ② 采集池（50 居民 × 200 tick × 3 种子，needGrowth=0.08，phase2+phase3，stub）

| 指标 | 改前 | 改后 |
| --- | --- | --- |
| survivalRate | 0（tick 40 前全灭，food tick 20 起恒 0） | 1.00 / 1.00 / 1.00（三种子） |
| finalPop | 0 | 52 |

### 20 居民回归（needGrowth=0.08，t32 结论）

改后 20 居民 × 200 tick × 3 种子：survival 1.00 / 1.00 / 1.00，pop 22，food/water 100/98 —— 默认局仍是可长期存活，
t32「默认不是必死局」结论未被推翻。

### needGrowth 四档梯度（50 居民，死亡 tick min/中位/max，3 种子）

| needGrowth | seed1 | seed2 | seed3 |
| --- | --- | --- | --- |
| 0.08 | 全存活(200) | 全存活(200) | 全存活(200) |
| 0.12 | 33/35/66 | 31/33/34 | 45/46/64 |
| 0.14 | 18/20/20 | 18/20/20 | 18/20/21 |
| 0.16 | 17/19/19 | 17/19/19 | 17/19/21 |

死亡 tick 随 needGrowth 单调下降（200 → 33~46 → 20 → 19），0.12 与 0.14 明显分离，梯度未被缩放抹平。

### 50 居民 × 2000 tick × 1 种子（needGrowth=0.08）

跑完不崩：runMs≈77s，survival 1.00，pop 52，survivedTicks 全 2000；
资源曲线末段 t1996~t2000：food 100/100/53/50.5/93.4，water 100/100/100/41/82（事件冲击后恢复，未持续归零）。

## 被否决方案

1. 纯线性人均缩放（regen = 人均 × 人口，无基础项）：人均恒定 → 完全抵消人口效应，needGrowth 四档在 50 居民下
   全部存活，梯度被抹平。否决。
2. 只抬高固定 forageRegen（8 → 16）：50 居民能活，但 20 居民补给过剩（0.14 也存活），t32 的 20 居民梯度被抹平。否决。
3. 把默认 needGrowth 降到 0.06：治标不治本（captain 已验证 0.06 仍全灭），且改变需求端默认值。否决。
4. 限制人口（关闭 procreation）：违背 phase2 生育机制，且不产生渐变难度。否决。
5. chronicle 用 Math.min.apply(null, ticks)：apply 仍受实参数量上限约束，20 万条同样抛错。否决（改用单趟循环）。

## 验证

- npm test 282/282 全绿（新增 test/longrun.test.js 2 条：20 万+ compile 不抛错 / 长跑后 snapshot 可读；
  test/survival-gradient.test.js 扩至 4 条：含「按人口缩放、人均递减」）。
- normify_validate 0 error（1 既有 dep/unanchored warning）；normify_build 成功（planned 120 不变，无新增模块）。

