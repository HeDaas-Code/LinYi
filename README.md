# LinYi 号避难所自治沙盘（楚门小镇）

> 一群居民在一座避难所里生存、社交、繁衍、交易、建文明——tick 驱动的多智能体社会模拟，
> 带 Web 控制台、REST API、四档难度、存档快照与实时遥测。规则模式无需外部服务；真实 LLM 可显式启用。
> `npm test` 默认使用确定性的离线 stub，装完即跑、结果可复现。

## 30 秒上手

要求 Node.js ≥ 18（零强制运行时依赖，无需 `npm install`）。

```bash
npm run smoke          # 最小闭环冒烟：起一局、跑若干 tick、观察决策流
npm start              # 启动 API + 控制台，默认 http://localhost:3000
npm test               # 全量测试（64 个文件，含长模拟层，耐心些）
npm run test:fast      # 只跑快速层
```

服务默认将完整运行快照原子写入 `.data/linyi-run.json`，并在下次启动时自动恢复；
可通过 `TRUMAN_SAVE_PATH` 指定其他存档文件。运行存档目录已加入 `.gitignore`。

浏览器打开控制台后即可：开一局 → 调难度 → 单步/连跑 → 看居民实时决策与编年史。总览页支持命名存档槽、读档和新局重置；读档前需停止沙盘，重置会清空当前世界并更新自动恢复档，命名存档会保留。
（进度条式的图表历史、中文行动标识、逐 tick 遥测都在 `web/viewer.html`。）
控制台启动会初始化家庭/经济/文明阶段；直接调用 REST API 时，可在 `start.tickConfig` 或单步请求中传入 `phase2`、`phase3` 开关。

## 架构与数据流图谱（强烈推荐先看）

两套 Normify 图谱的**交互式渲染副本**归档在 [`normify` 孤儿分支](https://github.com/HeDaas-Code/LinYi/tree/normify)；架构渲染产物（2.9 MB）不进代码树：

- [**架构图谱**](https://htmlpreview.github.io/?https://github.com/HeDaas-Code/LinYi/blob/normify/normify-truman-town/normify.html) —— 148 个模块契约（225 个 API、110 条依赖边），十二域分层，点击模块逐层下钻。逐层文本版见 [`outline.md`](https://github.com/HeDaas-Code/LinYi/blob/normify/normify-truman-town/outline.md)。
- [**数据流图谱**](https://htmlpreview.github.io/?https://github.com/HeDaas-Code/LinYi/blob/normify/normify-truman-town-flow/normify.html) —— 153 个模块级可变状态的"谁写、谁读、tick 哪一刻被改"，43 种图节点类型的产出/消费关系。方法论见 [`docs/FLOW-INDEX.md`](docs/FLOW-INDEX.md)。`normify-truman-town-flow/` 保留在**主分支**：它是 `test/flow-index.test.js` 的冻结基准（生成器依赖平台私有工具链，冻结产物即证据），不是渲染缓存。

`flow-index.json` 是受测试守卫的派生索引：改了代码不重建，`npm test` 直接红（`test/flow-index.test.js`）。

## 代码结构

| 目录 | 职责 |
| --- | --- |
| `src/runtime` | tick 编排、世界状态、持久化 |
| `src/agent` | 居民：特质、日程、心理（psyche）、决策、背包、生命周期 |
| `src/ai` | LLM 网关、provider 适配、提示词、记忆与嵌入、`laya` 观察者 |
| `src/survival` | 资源、需求、健康、危机、避难所、远征 |
| `src/social` | 互动、家族图谱、声望、平台 |
| `src/economy` | 账本、银行/信贷、破产 |
| `src/civilization` | 科技树、崩溃判定、遗产与重启继承 |
| `src/observer` | 编年史、审计、时间线 |
| `src/town` `src/genesis` | 小镇设施与开局生成 |
| `src/infra` `src/api` | 配置（四档难度）、HTTP 层 |

## AI Provider

默认 `stub`（确定性回显 + 哈希向量，离线可复现）；可切换 `a6api`（OpenAI 兼容真模型）或 `local`（onnxruntime + MiniLM 本地嵌入，384 维）。配置 `.env`（已被 gitignore）：

```bash
A6API_KEY=sk-xxxx
A6API_BASE_URL=https://api.a6api.com/v1
A6API_MODEL=grok-4.6
TRUMAN_LLM_MODE=population
TRUMAN_LLM_MAX_AGENTS=1
TRUMAN_LLM_POPULATION_SHARE=0.1
TRUMAN_LLM_EVERY_TICKS=5
```

服务默认以 `TRUMAN_LLM_MODE=off` 启动，使用规则决策且不要求 API key。启用真实模型时，设置 `TRUMAN_LLM_MODE=population` 并提供 `A6API_KEY`。默认限额是每 5 tick 最多调用 1 名居民；可通过环境变量显式调整。

Node.js 20.6 及以上会自动读取 `.env`。Node.js 18 可运行规则模式；使用真实模型时需在启动进程前导出对应环境变量。

详见 [`docs/AI-PROVIDER.md`](docs/AI-PROVIDER.md)。**密钥绝不入日志、测试或报告。**

## API 概览

控制台与 API 同源（`bin/server.js`，`PORT` 环境变量可改端口）。核心端点：

| 组 | 端点 |
| --- | --- |
| 仿真控制 | `POST /api/v1/sim/start` `stop` `step` `pause` `resume` `reset` `save` `load` `restore` `pacing` |
| 命名存档 | `GET /api/v1/sim/saves`；`POST /api/v1/sim/save`（传入 `{"slot":"quick"}`）；`POST /api/v1/sim/load`（传入 `{"slot":"quick"}`） |
| 查询 | `GET /api/v1/sim/status` `stages` `ai-status` `logs` `/api/v1/agents/:id` `/api/v1/decisions/:id` `/api/v1/world/state` |
| 难度 | `GET/POST /api/v1/sim/difficulty`（peaceful / standard / harsh / apocalyptic） |
| 遥测 | `GET /api/v1/sim/stream`（SSE） |

## 仿真结果与证据链

关键结论（机制闭环成立、存活率与性能数字、难度梯度、已修复缺陷清单）见：

- [`reports/RESULT.md`](reports/RESULT.md) —— captain 终验：50 居民 × 2000 tick 存活率 1.00、每 tick 约 16ms（较基线 200×）
- [`reports/DELIVERY.md`](reports/DELIVERY.md) / [`DELIVERY-2.md`](reports/DELIVERY-2.md) —— 分批交付与独立抽查
- [`reports/`](reports/) —— 35 份批次修复/审计/基准报告（经济闭合、避难所容量、涌现审计、性能分层等）

## 开发约定（摘要）

- 模块先有 Normify 契约再有实现；重建图谱后更新 `normify` 分支并回填冻结 commit 号。
- 索引与证据禁止手写：`flow-index.json` 只能由 `bin/flow-index.mjs` 生成；`normify-truman-town-flow/` 是测试守卫的冻结基准，重生成须与守卫测试同批提交；架构渲染产物只进归档分支。
- 测试分五层（fast / integration / long / model / perf），`npm run test:layers` 可按层跑。
