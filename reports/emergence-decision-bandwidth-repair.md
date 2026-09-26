# 涌现修复：决策带宽与企业生命周期

范围：src/agent/anticipation/pool/{selector,pruner}.js、src/runtime/orchestrator/{loop,_stage2}.js、
src/agent/decision/candidates.js、src/economy/industry/business.js、src/infra/{config,rng}.js

---

## 一、问题陈述

D2（企业由居民自主创办）接入 found 行动后，出现**存活率崩溃**：

| 版本 | seed1 | seed2 | seed3 |
|---|---|---|---|
| 基线 07fb2b5 | 50/50 | 50/50 | 50/50 |
| 接入 found 后 | 15/50 | 0/50 | 50/50 |

同时 businesses 恒为 0（涌现未发生）。存活率是红线（>=0.96），必须先修复。

---

## 二、诊断过程（逐步排除）

### 2.1 排除法：不是 RNG、不是需求内生化

先怀疑「需求内生化」在高频路径上调用 rng.float(0.5,1.5)，推进了全局随机流，
使采集产出/疾病/事件等所有后续随机序列整体错位。移除该调用后 **seed1 仍全灭** —— 排除。

### 2.2 时间序列定位：崩溃点在 t25

```
t 1 food=123.8 water=123.8 | forage= 0 eat= 0 drink= 0
t 9 food= 49.5 water= 30.5 | forage= 6 eat= 9 drink=31
t17 food= 82.5 water= 60.5 | forage=21 eat= 7 drink=24   <- 采集有效，库存回升
t25 food=  0.0 water=  0.0 | forage= 1 eat= 9 drink=14   <- 崩盘
t33 food=  0.0 water=  0.0 | forage= 0 eat= 9 drink=41   <- 此后 forage 恒为 0
```

### 2.3 基线对照：基线也见底过，但能恢复

```
t13 food= 10.7 water=  0.0 | forage= 0
t25 food= 26.0 water= 26.0 | forage=14
t37 food=101.3 water=106.2 | forage=43   <- 靠采集恢复
t49+ 稳定在 148~150
```

**关键差异：基线靠 forage=43 恢复，修改版 forage 恒为 0。**
即「采集能力并未消失，而是采集**从未被选中**」。

### 2.4 探针直读候选窗口（决定性证据）

在 decide() 中直接打印实际进入打分的候选：

```
PROBE t1 agent=0001 threatened=false stock=2.38
  window=[craft,build,expedition,write,found,drink]
```

**eat / forage 不在窗口内。** 生存骨架被挤出。

### 2.5 根因

loop.decide() 的候选窗口由两级纯分数截断产生：

```
selector.shortlist(limit)  ->  pruner.prune(k)
```

两者都是「按分数降序取前 N」。而生存骨架的基础分天然最低：

| 行动 | 基础分 |
|---|---|
| forage / rest | 0.2 |
| eat / drink | 0.3 |
| found | 0.6 |
| write | 0.7 |
| build / trade | 0.8 |
| craft | 0.9 |
| work | 1.0 |

**新增 found（及此前的 work）后，高基础分行动把骨架挤出了前 N。**
这不是排序错误，而是**决策带宽不足**：把「生存」与「发展」塞进同一个名额池，
两者必然互相挤兑。

---

## 三、修复

### 3.1 两级闸门同时豁免（缺一不可）

selector.shortlist 与 pruner.prune 采用**同一套豁免规则**：

1. **生存骨架保送**：eat / drink / rest / forage 无条件保留。
   forage 是**唯一创造库存**的行动，eat/drink 只消费库存 —— 它是生存的地基。
2. **发展行动独立席位**：found / socialize / court / accept 各占一席。
   - found：企业涌现的唯一入口，基础分 0.6 争不过 craft/build/trade；
   - socialize：社交边产生的唯一来源（12 人 20 tick 小局实测被挤光）；
   - court / accept：**有时间窗口**（对方在等答复，错过就散），且是生育的唯一入口。

> 只修 pruner 不够：shortlist 是更靠前的一道闸，实测修完 pruner 后窗口仍是
> [drink,craft,build,expedition,write,found]，eat/forage 依旧缺席。
> **两级闸门必须同时豁免，否则前一级刚放进来的行动会被后一级再切掉。**

### 3.2 决策带宽对齐

shortlist.limit 与 pruneK 必须一致，否则后一道闸会把前一道放进来的候选再切掉：

- pruneK: 6 -> 12
- shortlist limit: 6 -> 12

分账：骨架 4 + 发展 4 + 生产/交换 4。
（实测 shortlist(12) 之后 prune(k=6) 仍只留 6 个，build 被 craft 挤掉，
60 tick 小局 built=0、action-log 无建造记录。）

### 3.3 采集评分语义修正

原式 !hungry && !thirsty 才给采集加成，造成**语义倒挂**：越饿越不采。
但简单去掉条件又过度矫正（口渴时去采集而非喝水，step 测试期望 drink 得到 forage）。

正确语义：**有货先吃，无货才采**。仅当库存见底（此时进食已是空操作）时，
采集才压过进食。

### 3.4 企业生命周期（D2 补完）

| 项 | 修复前 | 修复后 |
|---|---|---|
| 企业创办 | seed 阶段按 config.businessCount 固定创办 2 家 | 居民决策 found 行动诞生 |
| 创办资本 | account.open({balance: capital}) 凭空造币 | capitalFrom 从创始人账户转入（复式记账守恒） |
| 创业贷款 | 只在 seed 执行，而那时 businessIds 恒为空 -> 贷款从未发生 | 企业成立后即时放款 |
| 招工 | 随固定引导一起被删，wagesPaid 恒为 0 | runIndustry 内按企业余额招募 |
| 市场容量 | Math.floor 把 5.9 砍成 5，所有种子卡同一整数上限 | 保留小数，容量随居民财富连续变化 |

**信贷路径静默失效的发现**：删除固定引导时，唯一一处 credit.apply 也随之消失，
导致 creditIssued / interestAccrued 恒为 0 —— 声誉->信贷整条经济路径失效，
但**没有任何测试报错**（测试断言的是 on < off，而两者都是 0，0 < 0 为 false 才暴露）。

### 3.5 识字个人化

原实现是**全局布尔**：literacyRate > 0 即全体识字，于是「写书」要么人人可做、
要么无人可做，个体差异被完全抹平。

但 literacyRate（0.05）是**社会能力系数**（在 civilization.tech.research 里以 *4 作连续加成），
不是人口比例 —— 直接当比例会让 50 人里仅 2~3 人识字，实测三种子 write 恒为 0（写书灭绝）。

故拆成两层：供给层（教师在职 -> 存在识字供给）× 个人层（成年居民中按 id 确定性哈希
分出 literacyShare 比例，默认 0.4）。

---

## 四、验收证据

### 4.1 存活率（红线）

```
seed 1: alive=50/50
seed 2: alive=50/50
seed 3: alive=50/50
```

### 4.2 涌现（跨种子分化）

| 指标 | seed1 | seed2 | seed3 | 分化 |
|---|---|---|---|---|
| 累计创办 | 80 | 75 | 81 | 是 |
| 破产 | 73 | 69 | 76 | 是 |
| 工资 | 5070 | 4617 | 4959 | 是 |
| 当前存活企业 | 7 | 6 | 5 | 是 |
| 收入 vs 成本 | 27955 / 14938 | 28481 / 15246 | 28821 / 15230 | 可持续 |

**口径修正**：businesses 是**当前存活数**，被市场容量锁在上限（实测三种子恒为 5/5/5），
只报它会掩盖真实的创办差异。因此 summary 增加 businessesFounded（累计创办），
验收断言改用**企业生命周期的两个维度**（累计创办 + 破产）。

### 4.3 行动谱系完整（50 人 200 tick）

```
{"found":80,"eat":1671,"forage":1592,"drink":1666,"court":51,"rest":1502,
 "craft":365,"build":80,"work":2437,"write":199,"accept":28,"socialize":533,"trade":183}
```

12 类行动全部出现 —— 无任何一类被挤占灭绝。

### 4.4 静态分析器误报修正

bin/flow-index.mjs 原报 2 error + 9 warning，逐条核对后：

- **误报 3 条**：x.length = N 未识别为写入；派生缓存（世代号）被当作泄漏。
- **真实缺陷 6 条**：__reset() 遗漏重置。

修正分析器 + 补上真实重置后：**error 0 / warning 0 / info 3**。

### 4.5 架构图与数据流转图

- 架构树（契约）：更新候选池两级闸门契约、补全 stage2 的 8 条真实调用连线、
  loop 补 4 条连线（共 67 条 deps）、candidates 补 found 准入、
  business.found 补 capitalFrom；写入两层阅读导语。
- 数据流转树（事实）：以修改后代码重建 flow-index.json 并重渲染。
- 两棵树 validate 均 **0 error**。

---

## 五、经验教训

1. **「新行动挤占既有行为」已复发 9 次**。任何新增行动分支都必须用
   **逐行动计数分解**验证（forage 380 -> 47 就是这类事故），
   绝不能用总量对比 —— 总量会掩盖此消彼长。
2. **候选窗口的物理收缩是承重的**。threatened 时的窗口收缩曾被尝试改为软抑制，
   结果 seed1 死 19 人、seed42 全灭。压力大时正确的做法是**抬供给端**
   （initialReservePerCapita / forageRegenPerCapita），不是拆掉闸门。
3. **两级闸门必须同时豁免**。只改一处会得到「看起来修了但窗口仍不对」的假象。
4. **不要在高频路径上无理由消耗全局随机流**。一次多余的 rng.float()
   会让所有后续随机序列整体错位，表现为无法直接归因的行为剧变。
5. **summary 的口径选择本身就是建模决策**。报「当前存活」还是「累计创办」，
   决定了涌现能否被观测到。
6. **删除引导代码时要追查它的连带副作用**。固定引导被删时，唯一一处
   credit.apply 一并消失，使整条信贷路径静默失效。
7. **静态分析器的「缺陷数」在误报澄清前没有意义**。本轮 10 条原始 error 中 8 条是误报。
8. **先看事实再调参**。本轮在 limit 上反复试错（6/8/10/12）而不打印实际窗口，
   浪费了数轮；一次探针直读就把根因钉死了。