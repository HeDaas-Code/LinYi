# 楚门小镇 MVP — 交付审计与汇总（DELIVERY）

- 生成时间：2026-09-23（t30 执行审计与交付汇总）
- 审计人：infra-engineer
- 范围：git 审计 / 依赖与安全审计 / 交付清单 / 复跑命令 / 结论一致性抽查 / 已知限制
- 约束遵守：本任务仅做审计与文档，未修改任何他人源码；抽查复跑输出写入 /tmp（未污染 bench-out/ 与既有报告）

---

## 1. Git 审计

### 1.1 提交清单（HEAD=09cde7d，共 11 个提交）

| # | hash | 标题 | 影响文件数 | 备注 |
| --- | --- | --- | --- | --- |
| 1 | a1edc2a | chore: baseline before tuning (3 phases delivered) | 472 | 基线：三阶段交付完成的调参前快照 |
| 2 | 8f46bbe | feat(ai): A6API real-model provider adapter + offline tests + docs | 9 | t26 真实模型适配器 |
| 3 | 0b74d19 | feat(t25): 参数外提、config 快照校验与基准脚本 | 14 | 参数外提 + bench.js |
| 4 | f2227a0 | chore(bench): restore AI latency bench as bin/bench.ai.js | 1 | captain 收口：恢复 AI 延迟基准 |
| 5 | 5ad9af8 | docs(bench): fix bench.ai.js usage header after rename | 1 | captain 收口：AI 基准用法头修复 |
| 6 | cb63f58 | feat(t27): 调参前基线报告 + 首次崩溃遥测 | 4 | t27 基线报告 |
| 7 | e751ea6 | fix(runtime): seed variance, death mechanism, scarcity caliber, decision/forage tuning | 10 | t28 决策/资源调优 |
| 8 | c7fe67d | t32: 采集加世界资源池，修复生存压力梯度断崖 | 6 | t32 采集池 |
| 9 | e023d79 | perf(observer): 消除 observer 日志 O(t²) 瓶颈 | 5 | t31 性能修复 |
| 10 | db7c340 | chore(normify): refresh module fingerprints after t31/t32 concurrent edits (validate 0 error) | 9 | captain 收口：结构指纹刷新 |
| 11 | 09cde7d | t29: 调优复跑与对比报告 | 2 | t29 调优复跑（HEAD） |

参数相关提交：e751ea6（t28 决策/资源/死亡/稀缺度调优）、c7fe67d（t32 采集池参数）、0b74d19（t25 参数外提）。回滚其中任一项用 git revert <hash>，见第 7 节。

### 1.2 .env 未被跟踪（证据）

- git check-ignore -v .env 命中 .gitignore 第 2 行 .env 规则
- git ls-files 中无 .env（仅 .env.example 与 normify survival/environment/* 模块路径）
- git log --all -- .env 为空（全历史从未提交过 .env）
- git status --porcelain --ignored .env 显示 !! .env（确认为 ignored）

### 1.3 工作区状态说明（审计时点）

提交态 HEAD=09cde7d 是干净基线（t29/t31/t32 均报 279/279 测试、0 error 校验）。审计时工作区存在并发未提交改动（t33：forage 池按人口缩放 + chronicle min/max 改循环，涉及 src/infra/config.js、src/runtime/orchestrator/loop.js、src/observer/chronicle/compiler.js 及对应 normify 模块），因此下述「最新实际输出」为工作区态，而非提交态（详见 2.3）。

---

## 2. 依赖与安全审计

### 2.1 无新增运行时依赖

- package.json 无 dependencies / devDependencies 字段；engines.node >= 18；type: module。
- 无 node_modules/ 目录（零外部依赖，纯 Node 内置模块）。
- 结论：无新增运行时依赖，符合零依赖约束。

### 2.2 无 key 泄漏

| 搜索范围 | 模式 | 结果 |
| --- | --- | --- |
| 工作区全树（排除 .git/node_modules） | sk- 后接 16+ 位字母数字 | 仅 .env 自身 1 命中（忽略、600 权限） |
| 全 git 历史（11 个 rev） | sk- 后接 16+ 位字母数字 | 0 命中 |
| reports/ 与 bench-out/ | sk- 后接 16+ 位字母数字 | 0 命中 |
| 跟踪文件中的 sk- 字面量 | git grep sk- | 仅 docs/AI-PROVIDER.md:23 占位 A6API_KEY=sk-xxxx |

- 测试文件 test/provider.a6api.test.js 使用 FAKE_KEY='test-key'（占位，非真实 key）。
- .env.example（已跟踪）三个变量值均为空。
- 本报告及所有仓库/报告文件未出现任何 key 值或前几位。

### 2.3 最新验证输出（证据）

- node --test（工作区态）：tests 279 / pass 277 / fail 2。2 个失败均为 test/survival-gradient.test.js（采集池按 tick 再生并封顶、池空时采集受限），由并发未提交的 t33 改动（loop.js 采集池按人口缩放 + config.js 新增 foragePoolPerCapita/RegenPerCapita）导致，非本审计引入、非提交态回归。
- normify_validate（工作区态）：3 error / 1 warning。3 个 error 均为 fingerprint-drift，对应模块 truman-town.infra.config、truman-town.observer.chronicle.compiler、truman-town.runtime.orchestrator.loop（即上述 t33 未提交改动）；1 个 warning 为既有 dep/unanchored（264 条）。
- 提交态基线（HEAD 09cde7d）：npm test 279/279、normify_validate 0 error / 1 warning（见 t29/t31/t32 报告与 db7c340 收口）。

### 2.4 .env 权限

- stat -c '%a %n' .env 返回 600 .env（仅属主读写），符合要求。
- .env 内容键：A6API_BASE_URL / A6API_KEY / A6API_MODEL（值全程脱敏，未读入本报告）。

---

## 3. 交付清单

### 3.1 参数代码位置（外提参数唯一事实来源）

- src/infra/config.js — DEFAULTS（冻结默认值）+ RULES（validate）+ defaults()/get/set/setMany/validate/resolve()。
  参数全集：decay.food/water、needGrowth.food/water、eventProbability、epidemicThreshold、procreationMatchThreshold、tagCount、sharedTagCount、ritualInterval、traumaRate、breakThreshold、starvationThreshold、starvationTicks、starvationHealthDecline、eatThreshold、forageYield、foragePoolCapacity、forageRegen、foragePoolPerCapita、forageRegenPerCapita（后两者为 t33 并发新增，尚未提交）。
- src/runtime/orchestrator/loop.js — 世界采集池（foragePoolCapacityOf/RegenOf）与死亡判定参数。
- src/runtime/orchestrator/_stage2.js — 疫情阈值、仪式间隔等 phase2 参数。
- src/runtime/orchestrator/_stage3.js — 创伤率、崩溃阈值等 phase3 参数。

### 3.2 bench 脚本用法

- node bin/bench.js（沙盘基准，t25 起，绝不读取/打印 .env）：--ticks N --agents N --seeds N 或 a,b,c --phase2 --phase3 --provider stub|real --real-every N --real-cap N --out DIR --report baseline|real --param k=v
- node bin/sweep.js --index=N（0..32）— 参数扫描（20 居民 × 80 tick × 3 种子，追加 bench-out/sweep/results.jsonl）
- node bin/bench.ai.js — AI 延迟基准（原 bench.js，captain 收口恢复）
- node bin/smoke.js / bin/smoke.p2.js / bin/smoke.p3.js — 三阶段冒烟（对应 npm run smoke / smoke:p2 / smoke:p3）

### 3.3 报告索引

| 报告 | 说明 | 跟踪状态 |
| --- | --- | --- |
| reports/bench-baseline.md | t27 调参前基线（stub） | 已跟踪（工作区有并发再生成） |
| reports/bench-baseline-real.md | t27 真实模型小基线（A6API） | 已跟踪 |
| reports/audit-tuning.md | t28 阻断缺陷修复 + 调优 | 未跟踪（reports/ 被忽略） |
| reports/bench-sweep.md | t28 参数扫描 34 配置 | 未跟踪 |
| reports/audit-survival-gradient.md | t32 生存梯度修复 | 已跟踪 |
| reports/observer-perf-fix.md | t31 日志 O(t²) 修复 | 未跟踪 |
| reports/bench-tuned.md | t29 调优复跑与对比 | 已跟踪 |
| reports/RESULT.md | t29 最终结果四问 | 已跟踪 |
| reports/DELIVERY.md | 本文档 | 已跟踪（本次强制加入） |

### 3.4 AI provider 文档

- docs/AI-PROVIDER.md — A6API 适配器用法（环境变量、OpenAI 兼容端点、usage 透传、无 embedding 回退说明）。

---

## 4. 复跑命令（已核对与当前 CLI 一致）

- stub 大基线（t27，单种子 2000 tick）：
  node bin/bench.js --ticks 2000 --agents 50 --seeds 1 --phase2 --phase3 --out bench-out/baseline --report baseline
- 真实模型小基线（t27）：
  timeout 1500 node --env-file=.env bin/bench.js --ticks 30 --agents 4 --seeds 1 --provider real --real-every 3 --real-cap 150 --out bench-out/real --report real
- 调优复跑（t29）：
  node bin/bench.js --ticks 2000 --agents 50 --seeds 10 --phase2 --phase3 --provider stub
- 参数扫描（t28）：
  for i in 0..32 依次执行 node bin/sweep.js --index=i
- 冒烟：npm run smoke / npm run smoke:p2 / npm run smoke:p3

---

## 5. 结论一致性抽查（3 项数字，自行复跑核对）

复跑方式：node bin/bench.js --ticks 2000 --agents 50 --seeds 1 --phase2 --phase3 --out /tmp/spot-tuned（与 bench-out/tuned 同规模同种子同默认参数，仅输出目录改为 /tmp）。

| # | 抽查项 | 报告值（bench-out/tuned/bench-seed-1.json） | 复跑值 | 是否一致 |
| --- | --- | --- | --- | --- |
| 1 | 日志总数 logCounts.total | 6154 | 6154 | 一致 |
| 2 | 首次崩溃 tick（firstCollapse.tick） | 13 | 13 | 一致 |
| 3 | 经济交易量 economy.trades | 68 | 68 | 一致 |

附：报告 survMedian=38 与复跑 survivalDuration 分布一致（42/52 个居民落入 36–39 tick 桶，中位数 37–38；mean=41.44）。首次崩溃原因 resource_exhausted、techsLost=4、breakdowns=12、medical.stockpile=80 亦逐项吻合。

一致性说明（非数字不一致）：bench-out/tuned/*.json 与 tuned-th/bench-ng-*.json 使用旧版/临时扫描脚本的 summary 字段名（顶层 survMedian/survP10/survP90/minFood 等），当前 bin/bench.js 输出 schema 为 survivalDuration.{count,min,max,mean,alive,buckets} 与 economy 等；底层数值与结论完全一致，仅字段命名/归属不同。属已识别、非阻断项。

---

## 6. 已知限制与未覆盖项

1. RESULT.md 两处「未解决」项 → 已定位、已开修复任务 t33（工作区已有未提交实现）：
   - forage 世界池固定容量不随人口缩放（50 居民默认参数约 40 tick 全灭）→ t33 在 config.js/loop.js 加 foragePoolPerCapita/forageRegenPerCapita 按人口缩放。
   - observer chronicle 编译器 Math.min/max(...spread) 栈溢出 → t33 在 compiler.js 改为循环求 min/max。
2. .gitignore 含 reports/：导致 4 份报告（audit-tuning / bench-sweep / observer-perf-fix / bench）未被 git 跟踪，干净检出会丢失这些报告，影响可回滚、可审计完备性。建议后续将需要留档的报告 git add -f 或调整忽略规则（本任务不自行改动忽略规则）。
3. provider.a6api 无超时/AbortSignal：上游挂起会无限等待，真实模型运行需外层 timeout 兜底（t26 已知，t30 后加固）。
4. A6API 无 embedding 模型：embed() 不支持并回退 stub。
5. 未覆盖：50 居民 × 2000 tick 全真实模型不可行（约 10 万次调用、数小时级、成本高），真实模型仅限 ≤10 居民 × ≤100 tick 且采用 --real-every 抽样（见 bench-baseline-real.md）。

---

## 7. 回滚指引

### 7.1 回到基线 commit（a1edc2a）

    # 只读查看基线（detached HEAD）
    git checkout a1edc2a
    # 或强制回到基线（丢弃基线之后的全部提交与工作区改动，破坏性）
    git reset --hard a1edc2a

### 7.2 撤销单个参数/机制 commit（安全，生成 revert 提交）

    git revert e751ea6   # 撤销 t28 决策/资源/死亡/稀缺度调优
    git revert c7fe67d   # 撤销 t32 采集池
    git revert 0b74d19   # 撤销 t25 参数外提

### 7.3 恢复单个文件到基线版本

    git checkout a1edc2a -- src/runtime/orchestrator/loop.js
    git checkout a1edc2a -- src/infra/config.js

### 7.4 .env 说明

.env 从未被跟踪、也不受任何 git checkout/reset 影响；密钥不会因回滚被删除或提交。
