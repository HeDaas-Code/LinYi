# 楚门小镇 MVP — 交付审计与汇总（二）（DELIVERY-2）

- 生成时间：2026-09-23（t37 交付汇总：难度档位与本地嵌入的审计与结果报告）
- 审计人：infra-engineer
- 范围：第二阶段（t34 本地嵌入 + t35 难度档位 + t36 嵌入对照）的产物核对 / 独立抽查 / 审计 / 交付清单
- 约束遵守：本任务仅做审计与文档，未修改任何他人源码；抽查复跑对既有报告的覆盖已用 git checkout 还原，本交付只新增 reports/DELIVERY-2.md

---

## 1. 三项产物核对

### 1.1 代码（均已 git 跟踪）

| 产物 | 位置 | 核对结果 |
| --- | --- | --- |
| 本地嵌入 provider | src/ai/llm/provider.local.js | 存在；DEFAULT_DIM=384；惰性 import onnxruntime-node；缺依赖/模型/推理异常回退确定性 hash 向量，绝不抛到调用方；complete 抛明确错误 |
| 难度档位预设 | src/infra/config.js（DIFFICULTY_PRESETS，四档 peaceful/standard/harsh/apocalyptic） | 存在；standard 严格等于 DEFAULTS；difficultyIds/difficultyPresets/difficultyParams/getDifficulty/setDifficulty/currentDifficultyParams 齐全 |
| 难度档位 API | src/api/control.js | GET /api/v1/sim/difficulties、GET /api/v1/sim/difficulty、POST /api/v1/sim/difficulty；空 id→400、未知 id→404 |

### 1.2 报告（均存在且已跟踪）

- reports/embed-compare.md（t36 对照实验，已提交 5ecd0a6）
- docs/DIFFICULTY.md（t35 四档含义/curl 示例/自定义档位）
- docs/AI-PROVIDER.md 增补「本地嵌入（onnxruntime + MiniLM）」章节（安装/两条 curl/体积/回退规则/体积性能）

### 1.3 测试

| 测试文件 | 新增用例数 | 本次复跑 |
| --- | --- | --- |
| test/provider.local.test.js | 9 | 9/9 通过 |
| test/difficulty.test.js | 6 | 6/6 通过 |
| 全量 npm test | — | 297/297 通过 |

---

## 2. 独立抽查（报告值 / 复跑值 / 是否一致）

### 抽查 1：难度档位 needGrowth 快照（node --input-type=module 直接调 config.difficultyParams）

| 档位 | 报告值 needGrowth | 复跑值 needGrowth | foragePoolCapacity 复跑 | 一致 |
| --- | --- | --- | --- | --- |
| peaceful | 0.04 | 0.04 | 40 | ✅ |
| standard | 0.08 | 0.08 | 30 | ✅ |
| harsh | 0.12 | 0.12 | 30 | ✅ |
| apocalyptic | 0.16 | 0.16 | 30 | ✅ |

### 抽查 2：本地嵌入维度与归一化（createProvider().embed 真实模型推理）

- 报告值：384 维、norm=1.000000
- 复跑值：dim = 384/384，fallback = null（真实加载），norm(v0)=1.000000、norm(v1)=1.000000（样本 hello world、楚门小镇 避难所）
- 结论：一致 ✅

### 抽查 3：嵌入对照实验命中率（重跑 bin/embed-compare.js）

| 指标 | 报告值 | 复跑值 | 一致 |
| --- | --- | --- | --- |
| local top-1 命中率 | 6.3% | 6.3% | ✅ |
| local top-3 命中率 | 6.3% | 6.3% | ✅ |
| stub top-3 命中率 | 18.8% | 18.8% | ✅ |
| MRR（stub / local） | 0.112 / 0.103 | 0.112 / 0.103 | ✅ |
| 正负间隙（stub / local） | 0.1055 / -0.1227 | 0.1055 / -0.1227 | ✅ |
| 回退向量维度 | 384 | 384 | ✅ |

> 首次加载耗时 131ms（报告）vs 134ms（复跑）、RSS 54MB（报告）vs 55MB（复跑）属计时/内存测量抖动，非确定性数字，不判不一致。

---

## 3. 审计项

### 3.1 git（本轮提交清单 + .env 未跟踪 + 回滚）

本轮（t30 之后）提交：

| hash | 标题 | 文件数 | 归属 |
| --- | --- | --- | --- |
| c153893 | docs(reports): force-add 4 reports ignored by .gitignore reports/ rule | 4 | captain 收口 |
| 80a2355 | t33: 修复长跑两项阻断（chronicle 栈溢出 + 采集池随人口缩放） | 9 | t33 |
| 90b4980 | docs(reports): captain 更新 DELIVERY/RESULT 最终态 | 2 | captain 收口 |
| a8d1f20 | chore(git): 报告目录默认纳管，仅忽略每次重跑覆盖的 bench 汇总文件 | 4 | captain 收口 |
| 2f8d480 | feat(ai): local MiniLM embed provider (onnxruntime optional) | 7 | t34 |
| 6d69104 | t35: 难度档位产品化 | 8 | t35 |
| 5ecd0a6 | feat(ai): 嵌入检索质量对照实验 | 2 | t36 |

.env 未跟踪证据：git check-ignore -v .env 命中 .gitignore 第 3 行 .env 规则；git ls-files 无 .env；git log --all -- .env 为空；status --ignored 显示 !! .env。

回滚命令：

    git revert 5ecd0a6   # 撤销 t36 嵌入对照（仅 bin/embed-compare.js + reports/embed-compare.md）
    git revert 6d69104   # 撤销 t35 难度档位
    git revert 2f8d480   # 撤销 t34 本地嵌入 provider
    git revert 80a2355   # 撤销 t33 长跑两项修复
    git checkout f2599a2 # 回到第二阶段之前的 t30 交付审计点

### 3.2 依赖（onnxruntime-node 可选依赖）

- package.json 无 dependencies / devDependencies 字段；仅新增 optionalDependencies：onnxruntime-node 1.20.1（确认 dependencies 未被污染）。
- 对「零依赖」原则的影响：onnxruntime-node 为 optionalDependencies，默认不安装；provider.local.js 只在首次 embed 时惰性动态 import，缺失时全绿（npm test 无需安装即通过），并在返回值 fallback 字段标注原因后回退确定性 hash 向量，绝不抛到调用方。
- 结论：硬依赖仍为零；onnxruntime-node 属可选的本地嵌入增强，缺失不影响任何默认路径。

### 3.3 体积（models/ 与 node_modules/ 未提交）

- models/：87M（all-MiniLM-L6-v2 模型，model.onnx 约 90MB 级 + tokenizer.json 约 466KB）；git ls-files models/ 计数 0，.gitignore 第 2 行 models/ 忽略。
- node_modules/：186M（本机安装后）；git ls-files node_modules/ 计数 0，.gitignore 第 1 行 node_modules/ 忽略。
- npm 包体积口径：AI-PROVIDER.md 与 embed-compare.md 均标注「约 849MB（含 CUDA 二进制）」，指 onnxruntime-node 全平台/CUDA 二进制包；本机安装后实际磁盘占用 273M（87M 模型 + 186M 依赖），两者口径不同、不矛盾。

### 3.4 密钥（0 命中）

- 工作区搜 sk- 后接 16+ 位字母数字：仅 .env 自身 1 命中（忽略、600 权限），无其它。
- 全 git 历史（含本轮 3 提交）搜同模式：0 命中。
- 其它 key 片段（A6API_KEY/API_KEY/api_key = 值）：仅测试占位（FAKE_KEY='test-key'、A6API_KEY:'   ' 空串、A6API_KEY:'test-key'），无真实 key。
- 本报告与全部仓库/报告文件未出现任何 key 值或前几位。

---

## 4. 交付清单与复跑命令

### 4.1 交付清单

- 代码：src/ai/llm/provider.local.js、src/infra/config.js（DIFFICULTY_PRESETS + difficulty 系列 API）、src/api/control.js（3 个 difficulty 端点）、src/ai/index.js（gateway useLocalEmbed/registerLocalEmbed/registerFromEnv 扩展）。
- 报告：reports/embed-compare.md、docs/DIFFICULTY.md、docs/AI-PROVIDER.md（本地嵌入章节）、reports/DELIVERY-2.md（本文档）。
- 脚本：bin/embed-compare.js（对照实验，可复跑）。
- 测试：test/provider.local.test.js（9）、test/difficulty.test.js（6）。

### 4.2 复跑命令

    节点嵌入对照实验：node bin/embed-compare.js
    真实模型嵌入自检：node --input-type=module -e "import * as local from './src/ai/llm/provider.local.js'; const p=local.createProvider(); const r=await p.embed({texts:['hello world','楚门小镇 避难所']}); console.log(r.vectors[0].length);"
    难度档位快照自检：node --input-type=module -e "import * as config from './src/infra/config.js'; console.log(config.difficultyIds()); for (const id of config.difficultyIds()) console.log(id, JSON.stringify(config.difficultyParams(id).needGrowth));"
    切换档位（HTTP）：curl -s -X POST http://127.0.0.1:PORT/api/v1/sim/difficulty -H 'Content-Type: application/json' -d '{"id":"harsh"}'
    全量测试：npm test（297/297）

---

## 5. 已知限制

1. 本地嵌入体积：onnxruntime-node npm 包约 849MB（含 CUDA 二进制），本机安装后磁盘约 273M；首次加载约 131ms、单条 p50 约 1.5ms、1000 条约 2.6s、RSS 增量约 180MB。
2. 语义收益结论（t36）：MiniLM（英文为主）对中文短句按字切分后 mean-pooling，相似度被字面重叠主导——干扰项余弦均值(0.703)高于正确项(0.581)、正负间隙为负(-0.12)，top-3(6.3%)与平均排名(35.1)均劣于 stub(18.8%/28.5)。默认应保持 stub，未来若上中文语义模型（bge/m3e）再评估。
3. provider.local 仅支持 embed，不支持 complete（调用抛明确错误）。
4. 真实 A6API 推理仅限小规模抽样（≤10 居民 × ≤100 tick 且 --real-every 抽样）；50 居民 × 2000 tick 全真实模型不可行。
5. 切换难度档位只对新建 run 生效，不热改正在运行的模拟（设计如此）。

---

## 6. 一句话总结

当前版本能：以四档难度（peaceful/standard/harsh/apocalyptic）一键切换驱动沙盘生存/经济/心理/科技/遗产全链路（默认 stub 推理，本地 384 维嵌入与真实 A6API 均为可选增强且失败自动回退），并通过 REST 控制面观测与干预；当前版本不能：用默认 MiniLM 在中文短句上获得语义检索收益（字面重叠主导，收益为负），以及大规模 × 高 tick 全真实模型推理（成本/延迟不可行）。
