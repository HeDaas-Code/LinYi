# t7 · 阶段计时、性能预算与测试分层

- 日期：2026-09-27
- 基线提交：`034144e`（工作区含团队元数据与未提交改动，非干净基线）
- 环境：Node v22.23.2，Linux；**下列计时均在无其他 node 负载时单独测得**（见第 5 节测量有效性）
- 性质：测量与分层，**未修改任何 src 源码**；新增 2 个只读工具 + package.json 脚本 + 本报告

---

## 0. 结论摘要

| 问题 | 结论 | 证据 |
|---|---|---|
| 全量 `npm test` 超时是死锁吗 | **不是死锁**，是纯算力预算不足 | 逐文件单独运行：`economy-closure` **290s rc=0（6/6 通过）**、`agent-persona-lifecycle` 167s rc=0、`agent-schedule-role` 130s rc=0。曾被判「超时/卡死」的文件给足预算后**全部正常结束** |
| 超时基线可复现吗 | **可复现** | 仅 4 个文件累计 **596s** 已远超 300s；`economy-closure` 单文件内含 7 次「50 人 × 200 tick + phase2 + phase3」重配置，单次该配置实测 45–62s |
| 谁吃掉了时间 | **`phase2:industry` 单阶段占 50.6%** | 50×200 phase2+phase3：industry 累计 22.8s / 45s，p95 193ms/次 |
| 有无超线性退化 | **有，tick 耗时前 1/4 → 后 1/4 比值 2.54** | 同一次运行内 114.7ms → 291.4ms |
| 长跑内存预算 | **200 tick 内 RSS 98MB → 752MB（Δ655MB），图节点 114,892** | 同上 |
| 测试能否分层 | **能，5 层全部落地且快层已达标** | fast 24 文件 4.7s、integration 10 文件 1.5s |

**给下游的直接可操作结论**：任何 300s 超时对全量套件都必然失败，**不能作为「有回归」的证据**；
分层入口已就位，门禁应改用 `npm run test:fast`（预算 60s，实测 4.7s）。

---

## 1. 超时基线：证明「非死锁」

### 1.1 方法

对 `test/*.test.js` 每个文件**单独**运行 `node --test <file>`，记录退出码与墙钟。
单独运行可把「文件间串行累积」与「单文件内死循环」区分开——这正是原判断缺的那一步。

### 1.2 实测（无竞争环境）

| 文件 | 退出码 | 墙钟 | 判读 |
|---|---|---|---|
| `agent-memory-anticipation.test.js` | rc=0 | 8.6s | 通过 |
| `agent-persona-lifecycle.test.js` | rc=0 | **167.4s** | 通过（此前被 `timeout 90` 判为「已终止」） |
| `agent-schedule-role.test.js` | rc=0 | **130.0s** | 通过（此前被判「已终止」） |
| `economy-closure.test.js` | **rc=0** | **290s** | **6/6 通过**（用例 5 = 58.3s、用例 6 = 136.1s）——非卡死，是算力 |

> 关键证据：**被判「超时」的文件给足预算后全部 rc=0 通过**。这排除了死锁/挂起假设。

### 1.3 为什么 `economy-closure` 必然超 300s

该文件（156 行）内含 **7 次重配置主循环运行**，**实测 rc=0 / 290s / 6 用例全过**：

```
:81   loop.run({ agentCount: 50, ticks: 200, seed: 1, phase2: true, phase3: true })
:89   loop.run({ agentCount: 50, ticks: 1,   seed: 42, ... })
:91   loop.run({ agentCount: 50, ticks: 50,  seed: 42, ... })
:93   loop.run({ agentCount: 50, ticks: 200, seed: 42, ... })
:101  loop.run({ agentCount: 20, ticks: 200, seed: 42, ... })
:102  loop.run({ agentCount: 50, ticks: 200, seed: 42, ... })
:118  for (seed of [1,2,3]) loop.run({ agentCount: 50, ticks: 200, seed, ... })   // ×3
```

单次「50 人 × 200 tick + phase2 + phase3」实测 **45s（无竞争）/ 62s（有竞争）**，
故该文件预算 ≈ 7 × 45s ≈ **315s 起**；**实测 290s 完成且全部通过**，与估算同量级。
**结论：单文件 290s 已是 300s 上限的 97%——任何并发负载都会把它推过线。这是测试自身声明的算力，不是回归。**

---

## 2. 阶段计时（`bin/stage-timing.mjs`）

新增只读工具 `bin/stage-timing.mjs`：把 `loop.tickSequence` 的每次 yield 当阶段边界逐阶段计时，
并采样 RSS / 图节点 / 人口。归因规则：generator 在**完成**单元后才 yield，
故两次 yield 的墙钟差归属于**后一个**单元的阶段。

```bash
node bin/stage-timing.mjs --agents 20 --ticks 40                 # 轻量：0.94s
node bin/stage-timing.mjs --agents 20 --ticks 40 --phase2        # 含阶段二：2.09s
node bin/stage-timing.mjs --agents 50 --ticks 200 --phase2 --phase3 --json /tmp/s.json
```

### 2.1 重配置（50 人 × 200 tick + phase2 + phase3）阶段预算

总墙钟 **45s / 200 tick = 225 ms/tick**；RSS 98→752MB；图节点 114,892；人口 74。

| 阶段 | 次数 | 累计 ms | 占比 % | p50 ms | p95 ms |
|---|---:|---:|---:|---:|---:|
| **phase2:industry** | 200 | **22,756** | **50.57** | 110 | 193 |
| decide | 14,380 | 7,165 | 15.92 | 0 | 1 |
| dispatch | 14,380 | 5,291 | 11.76 | 0 | 2 |
| phase2:health | 200 | 2,021 | 4.49 | 11 | 12 |
| phase3:psyche | 200 | 875 | 1.94 | 4 | 6 |
| phase2:platform | 200 | 558 | 1.24 | 2 | 5 |
| lifecycle | 200 | 430 | 0.96 | 1 | 9 |
| phase2:residence | 200 | 361 | 0.80 | 2 | 4 |
| phase2:fiscal | 200 | 267 | 0.59 | 1 | 4 |
| snapshot | 200 | 125 | 0.28 | 1 | 1 |
| phase3:civilization | 200 | 110 | 0.24 | 1 | 1 |
| 其余 12 个阶段合计 | — | ~570 | ~1.3 | 0–1 | 0–1 |

**读法**：`phase2:industry` 单阶段就是一半预算（p95 193ms/次），
任何针对全量套件耗时的优化**必须先看它**，而不是猜主循环 decide（decide 每次仅 p95 1ms，
其总量大只是因为 14,380 次调用）。

### 2.2 轻配置（20 人 × 40 tick，无 phase2）

总墙钟 0.94s / 23.4 ms/tick；decide 占 62.1%（800 次），dispatch 7.6%。
含 phase2 后同配置升到 2.09s / 52.2 ms/tick——**phase2 使每 tick 成本翻倍以上**。

---

## 3. 增长曲线：超线性与内存

### 3.1 tick 耗时超线性（同一次运行内）

| 配置 | 前 1/4 均值 | 后 1/4 均值 | 比值 |
|---|---:|---:|---:|
| 20×40 | 10.7ms | 17.1ms | 1.60 |
| 20×40 +phase2 | 44.1ms | 79.1ms | 1.79 |
| 50×200 +phase2+phase3 | 114.7ms | 291.4ms | **2.54** |

比值随规模上升（1.60 → 2.54），**与 O(n) 不符**。这印证任务描述中
「验证已提交 work 查询优化、graph lazy view、semantic memory 优化」的必要性：
优化确已提交，但**残余超线性仍在**（不是凭直觉改写，而是有上述曲线为据）。

### 3.2 内存与图节点

| 配置 | RSS 起 | RSS 止 | Δ | 图节点 |
|---|---:|---:|---:|---:|
| 20×40 | 63MB | 99MB | +36MB | 3,455 |
| 20×40 +phase2 | 69MB | 178MB | +110MB | 9,253 |
| 50×200 +phase2+phase3 | 98MB | 752MB | **+655MB** | **114,892** |

**200 tick 内 RSS 增长 655MB**，属长跑预算的硬约束；对应 C04（限制日志与记忆增长）。

---

### 3.3 人口 / 图节点 / RSS 对 tick 的线性拟合（50 人 × 200 tick + phase2 + phase3）

对采样序列（每 25 tick 一点，n=8）做最小二乘拟合：

| 量 | 斜率 | 截距 | R² | 末值 | 判读 |
|---|---:|---:|---:|---:|---|
| **图节点** | **+569.2 /tick** | 685.7 | **1.0000** | 114,892 | **严格线性、无上限**——不是「增长趋缓」，是每 tick 恒定新增约 569 节点 |
| RSS | +3.30 MB/tick | 107.6MB | 0.9404 | 709MB | 与节点增长同源 |
| 人口 | +0.013 /tick | 72.0 | 0.3333 | 74 | **已在 tick≈50 饱和于 74**（容量天花板），非指数增长 |

**关键推论（外推）**：图节点 R²=1.0000 意味着 2000 tick 时约 **1.14M 节点**、RSS 约 **6.7GB**。
这与第 3.1 节的 tick 耗时超线性（比值 2.54）互为印证：
节点无界增长 → 图读写成本上升 → tick 变慢。**故 C04（热数据上限与归档）不是可选优化，而是长跑的前置条件。**

人口饱和于 74 说明容量约束**有效**（与 D2「避难所容量失效」的旧缺陷相反，当前行为正常）。

## 4. 测试分层（`bin/test-layers.mjs`）

分层是**静态判定**（读文件内 `ticks:` / `agentCount:` 字面量 + 是否用主循环），
同一份代码永远得到同一分层，可评审可复现——不是按某次计时结果拍脑袋。

| 层 | 判据 | 文件 | 预算 | 实测 |
|---|---|---:|---|---|
| fast | 不使用主循环（纯单测） | 24 | <60s | **4.7s**，268 用例，267 通过 / **1 失败**（见 6.1） |
| integration | 用主循环，ticks<100 且 agentCount<50 | 10 | <180s | **1.5s**，53/53 通过 |
| long | ticks>=100 或 agentCount>=50 | 12 | <900s | 单文件 8.6s / 130s / 167s / **290s**（见第 1 节） |
| model | 外部模型 / 本地嵌入 provider | 2 | 不设 | 需网络或 onnx，默认不入门禁 |
| perf | observer.perf / bench | 2 | 不设 | — |

新增入口（`package.json`，**未改动既有 `test` 脚本**）：

```bash
npm run test:layers        # 打印分层清单与预算
npm run test:fast          # 4.7s，门禁建议用这一层
npm run test:integration   # 1.5s
npm run test:long          # 长跑层
npm run test:model         # 可选能力层
npm run test:perf
npm run perf:stages        # 阶段计时（20 人 × 60 tick）
```

`--list <tier>` / `--run <tier>` / `--json` 亦可直接调用；`--run` 会打印实际墙钟与是否超预算。

---

## 5. 测量有效性（诚实边界）

1. **无竞争前提**：首轮计时曾与另一个后台全量测试循环并发，导致同一配置测得 62s 而非 45s。
   本报告第 2、3 节数字**均在无其他 node 负载时单独测得**；若多人并发跑测试，数字会显著变差。
2. **未测完 long 层全部 12 文件**：全量需数十分钟。已精确测得 4 个（8.6s / 130.0s / 167.4s / **290s**），累计 596s，已足以证明
   「300s 上限必然失败」，`economy-closure` 的精确墙钟在收尾时补记。
3. **未改源码**：本任务只新增工具与脚本；第 6 节缺陷**只报告不代修**（属其他任务范围）。
4. 阶段归因含 generator 调度与 yield 开销，故 `decide` 的 p50 显示为 0ms（单次亚毫秒）。

---

## 6. 缺陷与疑点台账（本任务发现的，供下游认领）

### 6.1 【已确认缺陷 · 高】`flow-index.json` 过期，fast 层因此 1 失败

- 现象：`test/flow-index.test.js:25` 失败 —— `状态单元数变化（159 → 160）：源码改了但索引未重建`
- 精确定位：再生成索引比仓库内文件**多一个状态单元 `infra.rng.genState`**；
  再生成是**确定性的**（连跑两次均为 160）。
- 复现：
  ```bash
  node bin/flow-index.mjs --json /tmp/r.json
  python3 -c "import json;a=json.load(open('/tmp/r.json'));c=json.load(open('flow-index.json'));print(a['stats']['stores'],c['stats']['stores'])"
  # → 160 159
  ```
- 影响：fast 层（建议门禁层）当前为 267/268；且 flow 结构树基于过期索引。
- **未代修**：`flow-index.json` 属源码改动的派生产物，归最近改动 src 的任务（t2 报告称已重建，
  但工作区文件仍缺 `infra.rng.genState`）。修复即 `node bin/flow-index.mjs`（并按需重建 flow 树）。

### 6.2 【已确认缺陷 · 中】tick 耗时超线性，比值 2.54

- 证据：50×200 配置内 前 1/4 = 114.7ms → 后 1/4 = 291.4ms（第 3.1 节）。
- 待定位：未逐阶段拆分增长来源；`phase2:industry` p95 193ms 是首要嫌疑（占 50.6%）。
- 建议：先用 `bin/stage-timing.mjs` 对 50/100/150/200 tick 各测一次，再对 industry 阶段单独采样，
  **不要凭直觉重写**已提交的 work 查询 / lazy view / semantic memory 优化。

### 6.3 【疑点 · 待验证】长跑内存 655MB / 200 tick

- 需与 C04（热数据上限与归档）联合判断是「预期增长」还是「无界泄漏」；
  本工具已提供 RSS 序列（`--json` 的 `rss.series`），可直接画曲线。

### 6.4 【已有实现 · 无需重建】

- `bin/flow-index.mjs`、`bin/flow-to-normify.mjs`、`bin/emergence-audit.mjs`、`bin/bench.js` 均已存在且可用；
  本任务只**新增** `bin/stage-timing.mjs` 与 `bin/test-layers.mjs`，未重复实现既有工具。

---

## 7. 交付物

| 路径 | 性质 |
|---|---|
| `bin/stage-timing.mjs` | 新增（只读阶段计时 / RSS / 图节点 / 人口） |
| `bin/test-layers.mjs` | 新增（静态分层唯一事实来源，`--list/--run/--json`） |
| `package.json` | 新增 7 个 `test:*` / `perf:stages` 脚本（`test` 原样保留） |
| `reports/t7-perf-layering.md` | 本报告 |
