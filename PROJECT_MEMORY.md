# 项目持久记忆 Project Memory

> 本文件由 dsh-memoir 插件维护：记录本项目历次会话的工作归纳、经验教训与行动指南，
> 作为未来 AGENTS 接手本项目时的行动指南；它是人类可读的投影，不是 system prompt 的完整注入内容。
> 新会话只注入有界的 Hot Memory，完整历史通过 memoir_read 按需检索。

## 工作记录 Work Log

- [2026-09-22 12:38] [工作记录] 楚门小镇智能体沙盘 Normify 计划态模块树完成 — 在 LinYi 项目建立 normify-truman-town 结构：113 个 planned 模块（78 叶子、165 API 契约、66 依赖、35 布局），覆盖 runtime/agent/social/economy/town/genesis/ai/api/infra 九大领域；50-tag 特质、行动预想池、恋爱繁衍与 100→50 标签遗传、经济破产与生命周期等需求均已落为模块契约；normify_validate 0 error（仅 dep/unanchored 1 warning），build/render 产出 tree.json 与 normify.html，变更 2026-09-22-truman-town-sandbox-design 已 verified。
- [2026-09-22 12:58] [工作记录] 楚门小镇沙盘扩展：生存/观察者/家族/文明重启模块树 — 在 normify-truman-town 计划态树上新增 35 个模块（总 148，105 叶子、225 API、110 依赖、43 布局）：survival 生存系统（LinYi 避难所、四类资源、生存压力、突发事件、存活时长）、observer 观察者系统（每次决策/行为记录、编年志、时间线、审计、导出）、social.family 家族系统（三代稳定遗传固化家族特质，最多 5 个，自动继承给族内新生儿）、civilization 文明系统（崩溃判定、历史图谱 + 200-500 字遗产描述、存档与重启继承）。变更 2026-09-22-truman-town-survival-civilization 已 verified，normify_validate 0 error（仅 dep/unanchored 1 warning），HTML 已更新。
- [2026-09-22 13:10] [工作记录] 楚门小镇沙盘第三轮扩展：治理/文化/心理/技术/环境/制作 — 在 normify-truman-town 计划态树上新增 40 个模块（总 188，135 叶子、298 API、190 依赖、53 布局）：social.politics（派系/规则/领导/冲突）、social.culture（规范/仪式/模因）、agent.psyche（创伤/应对/崩溃）、civilization.tech（技术树/研究/遗忘）、survival.health（疾病/治疗/疫情）、survival.environment（辐射/探索/天气）、observer.experiment（回放/反事实/跨文明对比）、civilization.relic（遗物/发现）、agent.inventory（物品/背包）、agent.crafting（配方/制作物品/建造建筑/撰写书籍，均声明消耗 tick）。变更 2026-09-22-truman-town-society-crafting 已 verified，normify_validate 0 error（仅 dep/unanchored 1 warning），HTML 已更新。
- [2026-09-22 13:29] [工作记录] 楚门小镇架构向下收束到实现模块 — 将 16 个核心叶子提升为容器并拆出 38 个实现级子模块，总模块 226（157 叶子、336 API、259 依赖、69 布局、最大深度 5）。覆盖决策、特质、预想池、记忆、观察者、生存压力、事件生成、文明崩溃/遗产、家族特质/遗传、交易/订单簿、制作工坊等实现层。变更 2026-09-22-truman-town-implementation-refinement 已 verified，0 error（仅 dep/unanchored 1 warning），HTML 已更新。
- [2026-09-22 14:02] [工作记录] 楚门小镇 MVP 团队启动，t1 基础设施完成 — 楚门小镇三阶段均已交付复验：MVP（t1–t9）、第二阶段（t10–t16）、第三阶段（t17–t24，政治/文化/心理/技术/遗产重启/观察者实验 + 集成 + 冒烟）。全仓 npm test 248/248，normify_validate 0 error（仅 dep/unanchored warning），module 227 / leaf 158 / API 341 / dep 336 / max_depth 5，planned 226→120（剩余 63 个未实现叶子）。冒烟入口：npm run smoke / smoke:p2 / smoke:p3；运行入口 node bin/server.js。phase2/phase3 集成挂在 runtime.orchestrator.loop 的开关上，默认关闭，既有用例行为不变。

## 经验教训 Lessons Learned

- [2026-09-22 12:38] [经验教训] Normify 工具在无 DSH 运行时的调用方式 — 本机 normify_* 不在 PATH；可用 node 导入 /home/agentuser/.dsh/profiles/web/node_modules/@dsh-external/dsh-normify/lib/tools.js 的 registerTools，传入 {tools:{register(def){...}}} 的 mock ctx 与 rootDir 后直接调用 execute。设计阶段可用 state=planned + fingerprint=pending + source=[] 建全计划态树，0 error 校验不要求源码落地；normify_change_close 不传 repoRoot 即可关闭纯设计变更。
- [2026-09-22 12:58] [经验教训] Normify 扩展设计时的依赖环规避 — 新增跨域依赖时保持单向，避免 A→B 与 B→A 同时存在（如 survival.goal ↔ civilization.state 会触发 policy/core-acyclic）。先用 normify_check 传拟建 modules + deps 预检，报错会给出完整环路径，删一条反向边即可。全量结构演进可用 normify_module_batch upsert 重写全部 planned 模块（uid/id 不变即幂等），再统一重写 layouts。
- [2026-09-22 13:10] [经验教训] 楚门小镇设计决策：否决 agent.meta，新增背包与制作 — 用户明确否决 agent.meta（智能体自省/怀疑观察者）扩展，后续设计不要再次提出该项。用户确认新增：agent 背包（agent.inventory）、消耗 tick 制作物品（crafting.workbench）、建造建筑（crafting.construction）、撰写书籍（crafting.writing）。这些均以 planned 模块落入 Normify 树。
- [2026-09-22 13:22] [经验教训] 探索系统不做开放世界，改为计算结算制 — 用户明确：survival.environment.expedition 不创建开放世界，只由辐射、天气、物资、装备、Agent 特质、生存状态与随机数综合计算出一个结果；结果仅体现为一段日志 + 资源变化 + Agent 状态变化。对应接口为 plan/execute/settle，依赖 infra.rng 与 observer.recorder。后续实现探索模块时不要引入地图寻路或开放世界模拟。
- [2026-09-22 13:29] [经验教训] Normify 叶子晋升容器时的 apis 处理 — 把叶子提升为容器时，必须先移除其 apis 字段并把 API 契约下沉到子模块，否则 validate 报 api/non-leaf。父子模块可在同一个 normify_module_batch 中 upsert，写工具会自动完成文件形态晋升（leaf.md → index.md）。原指向该模块的 deps 可保留在容器上（模块级边），不需要改写。
- [2026-09-22 16:02] [经验教训] AgentTeams 成员瞬时上游错误导致任务失败的处理 — AgentTeams 成员因上游瞬时错误（如 502 INVALID_REQUEST、Request timed out TIMEOUT）不可恢复失败时，其当前任务会被标记 failed；captain 用 agent_teams_reassign_task({task_id, assignee:同一成员, reason}) 即可重试，attempt 会 +1 并重新唤醒成员，任务本身无需重建、也无需改动依赖。
- [2026-09-22 21:21] [经验教训] AgentTeams 成员空闲但任务仍 in_progress 的停滞处理 — 成员一轮结束但任务没收尾时，会同时出现“成员 idle/ready + 任务 in_progress”的停滞信号（不同于 failed）。captain 应主动用 agent_teams_send_message 唤醒该成员，消息里带上当前 attempt_id 与剩余验收项；不必 reassign，也无需重建任务。仅在成员报 failed（502/TIMEOUT 等）时才用 reassign_task 重试。
- [2026-09-22 22:27] [经验教训] 多成员并发修改共享 barrel 文件时的合并核对 — AgentTeams 中两名成员同时开发同一子包并各自修改共享出口文件（如 src/social/index.js）时，后提交者需保留前者的导出，不能整体覆盖。captain 收到此类报告后应核对两个子模块导出是否都在、能否正常 import；本次 culture 与 politics 的导出合并正确，全仓测试通过可作证据。
- [2026-09-22 22:39] [经验教训] 并发开发期间的中间态测试失败先复跑再判定 — AgentTeams 多成员并行改同一仓库时，成员报告的全仓测试失败常是队友编辑中的中间态（本次 test/tech.test.js 1 例失败）。captain 收到此类“与本人无关”的失败提示时，应单独跑该测试文件并复跑全仓测试；本次复跑后 15/15 与全仓 241/241 全绿，确认无需修复，避免误开修复任务。
- [2026-09-23 00:26] [经验教训] 长期运行调参前必须先外提 stage2/stage3 的硬编码参数 — 调参路线（路线 2）实测发现：_stage2.js / _stage3.js 中仍有硬编码常量，不配置化就无法调——疫情阈值（epidemicThreshold 默认值）、仪式 interval=2、创伤累积 rate=0.2、崩溃 threshold=0.7、生育匹配 threshold=0.3、SHARED_TAG_COUNT=45、TAG_COUNT=50。另注：ai.llm.gateway 默认 stub-0 是确定性回显，用 stub 只能评估结构平衡（资源/经济/心理阈值），不能评估真实决策质量；接真实模型后每 tick 每居民一次调用，是主要成本项。

## 行动指南 Action Guide

- [2026-09-22 12:38] [行动指南] 楚门小镇沙盘下一步实现路径 — 设计已收束至 5 层 226 个 planned 模块，建议停止横向扩展，进入代码实现。后续按叶子实现源码后调用 normify_module_refresh({ids,repoRoot,activate:true}) 逐个转 active；容器随子树落地自动激活；每次结构演进后同步 normify_layout_upsert 并重跑 normify_validate/normify_build/normify_render；用新 change_open/change_close 闭环。优先实现顺序：runtime 主循环 → survival 资源/需求/健康/环境/事件 → observer 记录器/编年志 → agent traits/psyche/inventory/crafting → social family/politics/culture → ai.prompt/llm → civilization tech/legacy/relic/restart → economy 账本/破产 → town 空间。
- [2026-09-22 23:39] [行动指南] 楚门小镇后续三条可选路线与建议 — 三阶段交付后 captain 给出三条路线：①第四阶段做完剩余 63 个未实现叶子（agent 14 / social 8 / survival 8 / economy 7 / genesis 6 / ai 5 / civilization 4 / observer 4 / infra 3 / api 2 / town 2）；②不加新模块做长期运行调参与稳定性；③归档 truman-mvp。captain 建议先做②。路线②需用户提供 5 项即可开工：真实 LLM 还是 stub（真实则给环境变量名，不贴 key）、tick×居民×种子规模、可接受最长运行时间、是否允许为调参小改代码、交付物形式（报告/bench 脚本/面板/改默认值）。captain 建议先跑免费基线：phase2+phase3 全开、50 居民、2000 tick、10 种子、stub，产出资源曲线/存活率/崩溃率/经济分布报告后再定目标值。
