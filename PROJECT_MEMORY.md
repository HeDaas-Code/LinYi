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
- [2026-09-23 00:32] [工作记录] 路线二开工：真实模型探针、git 基线与调参任务 t25–t30 — 调参阶段完成：t25（0b74d19 参数外提+bench）、t26（8f46bbe 真实模型适配器）、t27（cb63f58 基线报告）、t28（e751ea6 四缺陷修复）、t31（e023d79 observer O(t²) 修复）、t32（c7fe67d 采集世界池难度梯度）、t29（09cde7d 长期复跑与 RESULT.md）、t30（f2599a2 交付审计 DELIVERY.md）、t33（80a2355 长跑两阻断修复）全部完成；captain 收口提交：f2227a0/5ad9af8（恢复 bin/bench.ai.js）、db7c340（指纹刷新）、c153893（force-add 4 份被忽略报告）。最终验收（captain 独立复跑）：50 居民×200 tick×0.08 三家种子全存活、50 居民×2000 tick 存活率 1.00/min survived 1998/60.8 秒、20 居民回归全活、四档梯度单调、282/282 测试、validate 0 error。待办：reports/bench.md 会被每次 bench 运行覆盖，需确认其跟踪内容；DELIVERY.md 抽查数字在 t33 后需重新核对一次。
- [2026-09-23 13:52] [工作记录] A 路线开工：本地嵌入(t34)、难度档位(t35)、嵌入对照(t36)、交付二(t37) — A 路线状态：t35 难度档位完成（6d69104，四档 preset + /api/v1/sim/difficulty，标准档=旧默认，297/297，validate 0 error）。t36 嵌入检索对照完成（5ecd0a6）：结论“不值得”，local top-3 6.3% 劣于 stub 18.8%，根因 MiniLM 中文按字切分导致相似度被字面重叠主导；captain 已在项目内以真实模型复现（fallback null、norm 1.0、两句语义无关文本相似度差仅 0.007）。t34 的真实性缺口已补齐（依赖已装入项目，真实推理可用），但其“真实模型验证”结论仍应更正为“技术通路已验证、实用价值为负”。默认 embed 保持 stub。t37 交付二待跑（依赖 t34/t35/t36 均已满足）。
- [2026-09-23 17:52] [工作记录] t35 难度档位完成：四档预设 + API 控制面（6d69104） — t35 完成（commit 6d69104，8 文件）。产出：src/infra/config.js 新增 DIFFICULTY_PRESETS 与 difficultyIds/difficultyPresets/difficultyParams/setDifficulty/getDifficulty；src/api/control.js 新增 GET/POST /api/v1/sim/difficulty（未知档位 404）；docs/DIFFICULTY.md（四档含义、curl 示例、自定义方法、引用 bench-tuned.md 的实测死亡 tick 中位 200/33~46/20/19）；test/difficulty.test.js 6 例。captain 复核：四档 = peaceful(needGrowth 0.04, forageRegenPerCapita 0.2, eventProbability 0.15) / standard(0.08/0.15/0.3) / harsh(0.12) / apocalyptic(0.16)；标准档逐字段等于旧默认值（行为零回归）；npm test 297/297；normify_validate 0 error。遗留设计观察（非缺陷，未改）：harsh 与 apocalyptic 仅调 needGrowth 单轴，采集池与事件概率与 standard 相同，四档未在多个维度上分层。
- [2026-09-23 18:27] [工作记录] A 路线收口（da6092c）：本地嵌入通路 + 难度档位 + 负面结论 — A 路线完成，最终 HEAD da6092c，captain 独立复核通过：node --test 297/297、normify_validate 0 error、密钥全历史 0 命中、reports/ 10 份报告全部纳管。交付：①本地嵌入 provider.local.js（onnxruntime-node 仅 optionalDependencies，缺失时零依赖全绿并回退 stub；真实 384 维、norm=1.0、冷启 131ms、p50 1.5ms/条）；②嵌入检索质量对照 bin/embed-compare.js + reports/embed-compare.md，结论为“不值得”：local top-3 6.3% vs stub 18.8%、平均排名 35.1 vs 28.5、正负间隙 -0.12，根因 MiniLM 中文按字切分导致相似度被字面重叠主导，故默认 embed 保持 stub；③难度档位四档（peaceful/standard/harsh/apocalyptic）+ GET/POST /api/v1/sim/difficulty，标准档=旧默认零回归；④reports/DELIVERY-2.md 交付审计（抽查 3 项复跑一致）。后续可选路线：B 补未实现叶子、C 真实模型规模化；若要做中文记忆语义检索需换 bge-small-zh/m3e 等中文句向量模型（通路已铺好，换模型目录即可）。
- [2026-09-23 18:58] [工作记录] B 路线勘察：63 个未实现叶子的真实分布与批次计划 — 批次1 进度：三个实现任务全部提交（t38=f4968a0 生存5模块、t39=291c1be 产业4模块、t40=f0f6f8e 信贷/利息/税收3模块），12 个 planned 叶子已 activate（活跃模块 107→121，剩余 planned 叶子 63→51），npm test 319/319、normify_validate 0 error，captain 独立复跑 50 居民×200 tick×3 种子存活率全 1.00（t33 基线未破坏）。t41（验收）attempt1 因 502、attempt2 因 PI_AI_ERROR 失败；attempt2 已产出可用脚本 bin/batch1-verify.js（第 0-6 节跑通，仅 :211 amount:0 崩溃），captain 据其实测得出批次1 结论与三项缺陷（见独立 work 记录）。已按 attempt3 重试并收窄为三件机械事：修 :211 崩溃、生成 reports/batch1-verification.md、补避难所缺陷标注（并写入 tax:pool 澄清）。待决定：是否再做一轮“让经济变成真机制”的修复（对应 D1 印钞/D2 避难所/D3 破产不可达）。
- [2026-09-23 20:22] [工作记录] t38 完成（f4968a0）：生存扩展 5 模块接入主循环并转正 — t38 完成（commit f4968a0，24 文件，312/312，normify_validate 0 error）。交付与 captain 实测验证：①energy 默认 stockpile 调回 100（满足既有 tech.test.js 契约，容量 500），回归修复；②medical 复用 health/_medical.js 同一库存节点（薄门面）、_energy.js 改为转发 resources/energy.js 同一节点，避免两套库存矛盾；③主循环接入属实：loop.js:279 能源衰减、:306 shelter.status 写入 worldState、:448-451 crisis.alert 与 goal.elapsed 写入、:534 goal.survive 初始化，_stage2.js:275 能源产出、:285 生产计划传 energyInput；④5 模块（energy/medical/shelter/crisis/goal）已 activate:true 转 active，config/loop/impact 指纹已刷新；⑤captain 独立复跑 50 居民×200 tick×3 种子：存活率全 1.00、52 人、0 崩溃、min survived 198，基线未回归。
- [2026-09-23 20:28] [工作记录] t39 完成（291c1be）：产业经济四模块接入主循环 — t39 完成（commit 291c1be，17 文件，312/312 全绿，normify_validate 0 error）。交付：business.js(125)/production.js(130)/labour.js(101)/bankruptcy.js(159) + industry/index.js + _store.js 扩展 + test/economy-batch1.test.js，四个叶子已 activate。captain 实测接入属实：_stage2.js:148 创办企业（种子阶段按 i%2 固定创办 food/tools 两家）、:158 labour.hire 雇佣、:285-286 production.plan/output、:302 labour.pay 发薪、:317-321 按余额阈值(默认10)破产判定与清算。破产不依赖信贷（余额阈值判定），bank.credit/interest 留待 bank 树单独实现（t40）。50 居民×200 tick×3 种子：存活率全 1.00、人口 52、破产 0、trades 182/182/180、businesses 2、goodsProduced 800、wagesPaid 1200。
- [2026-09-23 20:47] [工作记录] t40 中断待收尾：信贷/利息/税收已落码但未接入主循环 — t40（批次1-C 信用与税收）attempt1 因上游 TIMEOUT 失败。captain 实测工作区：src/economy/bank/credit.js(174 行，open/treasury/apply/repay/get/list/listByBorrower/outstandingFor/markDefault/__reset)、src/economy/bank/interest.js(63 行，accrue/accrueAll)、src/economy/bank/index.js、src/economy/tax.js(114 行，open/poolBalance/collect/redistribute) 均已落地，但三处未完成：①_stage2.js 经济段无任何 bank/tax 调用（模块不会被主循环执行）；②economy/index.js 仅导出 bankruptcy，未导出 bank 与 tax；③无任何测试（test/ 下无 tax/credit/bank 文件）。已按 attempt2 重试并给出具体接入点：每 tick 调 accrueAll 计息、按周期 collect/redistribute 征税、摘要写入 result（creditIssued/interestAccrued/taxCollected/taxRedistributed），并要求测试断言税收守恒与货币总量不发散。当前 312/312 全绿（未接入故无回归）。
- [2026-09-24 00:46] [工作记录] t40 完成（f0f6f8e）：信贷/利息/税收接入 runFiscal — t40 完成（commit f0f6f8e，22 文件，319/319 全绿，normify_validate 0 error）。交付：bank/credit.js(174，apply/repay/open/markDefault，银行金库↔借款人真实转账)、bank/interest.js(63，accrue/accrueAll，单利默认/复利可选，只增债务不造钱)、tax.js(114，collect/redistribute)、_stage2.js runFiscal 接入（:364 每 tick 计息、:371 每 20 tick 征税、:376 按人头再分配、:496 汇总）、summary 新增 creditIssued/interestAccrued/taxCollected/taxRedistributed。破产清算优先级：工资→贷款→创始人（贷款优先于权益，不足时违约标记），保持 t39 工资优先。captain 独立复跑 50 居民×200 tick×3 种子：存活率全 1.00、人口 52、破产 0、taxCollected==taxRedistributed=580.4（守恒成立）、creditIssued=100、interestAccrued=200。【已澄清，原疑点取消】captain 曾疑 economy.balances.min 由 428 降为 0 是居民被清零，t41 查明该账户是 tax:pool（税收池自身），非居民账户，属正常现象（收税后已全额再分配）。
- [2026-09-24 01:01] [工作记录] t41 验收实测：批次1经济子系统判定为装饰性布景，另查出两项真实缺陷 — captain 亲自运行 t41 的半成品脚本 bin/batch1-verify.js（243 行，未提交）确认其第 0-6 节数据可信（脚本 :211 的 noop 转账 amount:0 触发 transaction_invalid: amount_invalid 崩溃，故末尾 writeFile 未执行、reports/batch1-verification.md 未落盘）。已确认结论：①【判定】批次1 新增经济子系统是“装饰性布景”而非真实机制——跨 3 种子 businesses/goodsProduced/wagesPaid/creditIssued/interestAccrued/taxCollected/taxRedistributed 逐位相同，只用 trades 有 182/182/180 之差。②【缺陷 D1 线性印钞】industry.operate 用 applyBalance 直接记账收入（产出2×固定价8=16/tick，工资支出3，净+13/tick 单调增长），无真实买方、无市场价格波动；货币总量 25932→32300（+6368=32×199），线性不发散但经济不闭合。③【缺陷 D2 避难所坏死】三种子均 integrity=0、capacity=0、damaged=true 但 occupants=52，crisis.level=1.000 critical 永久为真——避难所容量约束实际失效、危机信号退化为常量。④【缺陷 D3 破产不可达】企业净 +13/tick，破产阈值 10 永远碰不到，破产数恒为 0。⑤【分工证明成立】survival.crisis（饥饿/脱水/疫情/避难所损坏，level>=0.8 critical）与 civilization.collapse.detector（人口灭绝/资源枯竭/压力升级/综合分数，threshold 0.6）输入不同：场景A 避难所损坏80→危机 critical 但 collapse score 0.03 未崩溃；场景B 人口灭绝→崩溃 collapsed=true 而危机模块不报饥饿。⑥【已澄清】economy.balances.min=0 的账户是 tax:pool 自身（非居民被清零）。⑦【真实机制仍有效】food/water 需求增长+采集+饥饿死亡（t33 基线）真实影响个体命运；文明崩溃检测与危机检测分工清晰。最小改造建议（脚本 8.3 节给出，captain 认可方向）：产出/售价随市场供需波动、收入经真实买方撮合杜绝 applyBalance 印钞、工资与产出随 agent.traits 技能差异、引入原料/能源/市场波动等真实成本使破产可达、能源医疗消耗与人口行为挂钩。
- [2026-09-24 01:18] [工作记录] t41 验收完成（6b38498）：判定 needs_revision，经济子系统为装饰性布景 — t41 批次1 验收完成并提交（commit 6b38498，仅 bin/batch1-verify.js 254 行 + reports/batch1-verification.md 171 行）。t41 如实判定 **needs_revision**，按工具契约验收任务判定 needs_revision 时状态必须置为 failed，故任务列表中 t41 显示 failed——语义是「验收不通过」而非「验收未执行」。captain 复核：319/319、normify_validate 0 error、工作区干净。验收结论：②回归通过（50居民×200tick×3种子存活率 1.00/1.00/1.00）；④结构通过（12 模块 active）；⑤门禁通过；③跨种子差异不通过；①功能复验部分不通过。跨种子对照 14 字段中 12 个逐位相同（businesses=2、goodsProduced=800、wagesPaid=1200、bankruptcies=0、creditIssued=100、interestAccrued=200、childrenBorn=2、crafted=3、built=2、treated=2、quarantined=0），仅 trades(182/182/181) 与 tax(浮点尾差) 有差异；能源曲线三种子逐点完全一致。危机 vs 崩溃分工证明成立。查出的 D1 线性印钞 / D2 避难所容量失效 / D3 破产不可达 / D4 能源医疗脱钩人口 已由 t42(a2d78e5)、t43(d2962ef) 修复。闭环缺口（已派 t45 处理）：修复后从未按 t41 原口径重新验收，故补 reports/batch1-verification-final.md 作终验。
- [2026-09-24 01:18] [工作记录] 批次1 修复任务派发：t42 经济闭合 + t43 避难所容量 — 批次1 修复任务进展：t42（infra-engineer，经济闭合）完成 a2d78e5（货币恒定 25660、破产可达 1/0/1、五字段跨种子全不同、存活率 1.00、325/325）；t44（infra-engineer，bench --difficulty 标志）完成 b79c517（331/331，captain 验证 harsh→存活 0.000/破产 2/交易 78、未知档位 exit=1、--param difficulty 有警告、默认行为不变）；t43（survival-engineer，避难所容量与危机可升降）attempt1 出现僵尸任务（成员 idle 但任务 in_progress、零产出），已按 attempt2 重试并重发完整要点。批次1 三项缺陷中 D1 印钞、D3 破产不可达、D4 能源医疗脱钩人口 已由 t42 修复，仅剩 D2 避难所容量失效 + 危机信号退化 待 t43。当前 HEAD=b79c517，331/331，工作区干净。
- [2026-09-24 02:11] [工作记录] t42 完成（a2d78e5）：经济子系统由布景变机制，captain 逐项复验通过 — t42 完成（commit a2d78e5，13 文件，325/325 全绿，normify_validate 0 error）。三项缺陷修复与 captain 独立复验结果（复跑数字与成员报告逐字段吻合，非编造）：①D1 货币环闭合——operate/liquidate 改为卖给真实买方，buyerPool 取自 agents.map(a=>accounts.get(a.id)) 且余额>=价格的居民账户，逐户经 ledger.transaction.recorder.post 转账，未售出商品留 inventory.goods 不计收入；货币总量恒定 25660（改造前 25932→32300 线性印钞）。②D3 破产可达——引入真实成本（能源 energyInput4×price2、原料 rawInput4×price1、工资）与价格/产出/需求随机波动（priceVolatility 0.4），standard 破产 1/0/1（lossTicks 64/111/47），harsh 与 apocalyptic 破产均 2。③D4 能源医疗挂钩人口——居民每 tick 消耗 alive×residentEnergyUse(0.2)，医疗由疾病传播驱动（infectionRate 0.03、treatPerCapita、medicalRegenPerCapita）。涌现性硬指标达成：businesses 1/2/1、goodsProduced 1171/1580/1071、wagesPaid 870/1200/789、bankruptcies 1/0/1、trades 450/525/431 全部跨种子不同（改造前 12/14 字段逐位相同）。存活率守住 1.00（standard 52 存活/0 死亡；harsh 与 apocalyptic 均 0 存活/52 死亡，与 t33 档位梯度一致）。产物 test/economy-closure.test.js（6 例）+ reports/batch1-economy-repair.md。
- [2026-09-24 02:30] [工作记录] t44 完成（b79c517）：bench --difficulty 标志与静默失效修复 — t44 完成（commit b79c517，仅 bin/bench.js + test/bench.test.js，331/331 全绿）。产出：①--difficulty <id> 标志（peaceful|standard|harsh|apocalyptic）；②未知档位报错并以 exitCode=1 退出（captain 实测真实 exit=1）；③--param difficulty=x 输出显式警告「该键无人读取，请改用 --difficulty <id>」；④bench-summary.json 记录 difficulty 字段、reports/bench.md 记录「难度档位：standard」；⑤根因修复为合并顺序 defaults + 难度档位参数 + 用户覆盖（原 fullConfig=deepMerge(defaults,params) 会被 loop.step 合并覆盖回标准档）。captain 独立验证同 seed 对照：standard 存活 1.000/破产 1/交易 450 vs harsh 存活 0.000/破产 2/交易 78。默认不带 --difficulty 行为不变。
- [2026-09-24 03:24] [工作记录] 批次1 全部收口：7 提交，经济由布景变可叙事机制 — 批次1（生存与产业经济）完成，7 个提交：f4968a0（生存5模块）/291c1be（产业4模块）/f0f6f8e（信贷利息税收3模块）/6b38498（t41验收判定 needs_revision）/a2d78e5（修复 D1 货币环+D3 破产可达+D4 能源医疗挂钩人口）/d2962ef（修复 D2 避难所容量+危机可升降）/b79c517（bench --difficulty 标志）/9c78b61（captain 清理 _stage2.js 与逐出实现矛盾的历史注释）。12 个 planned 叶子全部转 active（剩余 planned 叶子 63→51，活跃模块 121）。captain 最终独立复验：npm test 335/335、normify_validate 0 error、50 居民×200 tick×3 种子存活率 1.00/1.00/1.00、货币总量恒定 25660（改造前 25932→32300 线性印钞）、破产数 1/0/1（改造前恒 0）、跨种子 5 核心字段全不同（改造前 12/14 逐位相同）、避难所 damage60 后 integrity 100→40/capacity 54→21 修复后复原、危机 level 0.6→0 可升降、逐出事件 16/40/23 次。可叙事历史达成：seed1 企业 biz_...106 于 tick 90 余额 0.14 破产、seed3 同企业 tick 63 余额 4.80 破产、seed2 无破产但有 40 次超员逐出；1250 条事件 31 类主题（263 次真实销售、16 次逐出、14 次风暴、10 次旱灾）。
- [2026-09-24 08:59] [工作记录] t45 终验 pass（6939444）：批次1 正式闭环，8 提交 — t45 批次1 修复后终验完成并提交（commit 6939444，bin/batch1-final-verify.js 230 行 + reports/batch1-verification-final.md 154 行），判定 **pass**，关闭 t41 的 needs_revision。8 项全部通过：①存活率 1.00/1.00/1.00（死亡 0）②D1 货币守恒 25660.0 恒定（6 采样点，改造前 25932→32300）③D3 破产 standard 1/0/1、harsh 2、apocalyptic 2（用 --difficulty）④D4 能源 879.4(20人) vs 2079.4(50人) 线性、医疗按人口产能+疾病传播 ⑤D2 避难所 integrity 100→96→100、逐出 16 次+暴露惩罚、危机 0.00→0.60→1.00(critical)→0.50→0.00 可升降 ⑥涌现性 5 字段（businesses/goodsProduced/wagesPaid/bankruptcies/trades）跨种子全不同，仅 creditIssued=200 固定示范贷款本金相同（设计使然）⑦可叙事历史：seed1 破产 tick90 biz_...106 余额 0.1、seed3 破产 tick63 余额 4.8、逐出 16 条 ⑧12 模块 active + validate 0 error。captain 独立复核：npm test 335/335、validate 0 error、工作区干净；重跑终验脚本结果逐位复现（唯一差异是报告生成时间戳，已 git checkout 还原以免提交噪音）；独立复现危机序列 int100/cap54/level0 → 损坏50→level0.5 → 损坏80→level0.8 critical=true → 修复+80→level0 critical=false；55 账户合计货币 25660.00 恒定。批次1 最终账目：8 提交（f4968a0/291c1be/f0f6f8e/6b38498/a2d78e5/d2962ef/b79c517/9c78b61/6939444），12 个 planned 叶子转 active，验收链完整（实现→验收发现缺陷→修复→同口径终验通过）。
- [2026-09-24 09:16] [工作记录] 批次2 派发：22 个智能体与社会模块，验收标准升级 — 用户指令「继续2」，captain 派发批次2（22 个模块：agent 14 + social 8）。编排：t46（agent-engineer，6 模块：persona.identity/motivation/personality + lifecycle + traits.evolution/tagset.similarity，无依赖，已 claimed）；t47（ai-engineer，4 模块：memory.semantic + anticipation.pool.pruner/simulator + decision.explainer，无依赖，in_progress）；t48（runtime-engineer，4 模块：schedule.planner/executor + role.career/society，依赖 t46）；t49（survival-engineer，5 模块：family.registry/chronicle + relationship.family + graph.edges/community，依赖 t47）；t50（infra-engineer，3 模块：platform.posts/feeds + reputation，依赖 t49）；t51（observer-engineer，验收，依赖全部）。【验收标准升级】每个任务写死四条硬指标：①接入真实（必须给出调用点 文件:行，不许只写 API 无人调用）；②跨种子分叉（新字段 ≥2 个跨种子不同，相同须解释设计使然还是失效）；③可叙事历史（给出具体事件：谁在何时因何做了什么）；④不回归（50 居民×200 tick×3 种子存活率 1.00）。t51 另加：装饰性布景逐模块排查（每模块给出调用点与消费点，只写不读即缺陷）+ 2000 tick 长跑复验（防 O(t²) 退化）。
- [2026-09-24 10:36] [工作记录] t46 归因核实通过 + 三方并发风险介入（批次2 进行中） — 【含 captain 自我更正】t46 归因核实：**部分正确、部分错误**。正确的部分：①_stage2.js:520 确认 neighbors({agentId: target, candidates: ids, k: 1}) 且 target=agents[0].id（单一锚点、k=1）→ O(N) 次 compare，非 O(N²)；②_stage2.js:260/262/265 的 mutate/identity.update/similarity.compare 仅对当 tick 新生子代调用 → O(children)/tick；③「无超线性、不随 tick 增长」成立（实测 50 tick 时 50.6ms/tick、200 tick 时 48.5ms/tick，基本恒定）。**错误的部分（captain 曾误判为“可信并已通过”，特此更正）**：t46 声称 personality.evaluate 是「每 tick 每居民各 1 次」——实际它位于 scoreFn 内部（loop.js:331）**按候选逐个调用**（pruned 候选数 = pruneK = 4），即每 tick 每居民约 4 次；且 CPU profile 证明回归热路径确实经过 t46 的模块：step → decide(loop.js:268) → selector.choose → scoreFn(loop.js:326) → personality.evaluate(loop.js:331) → profile(personality.js:61) → tagset.store.get(store.js:80) → graph.read(nodeId) → clone(graph.js:23) → structuredClone（74.9% 样本）。归因边界：personality.js 模块本身在 159dc43 提交时 loop.js 里根本没有引用它（git show 159dc43:...loop.js 无 personality 字样），慢的那行 scoreFn 集成是在共享文件里、被 t47 的 e350da9 全量暂存一并提交的，故非 t46 独责，但模块归它、修复归它。已派 t52 修复（仅改 personality.js 与 tagset/store.js，加按 agentId 的进程内缓存并覆盖 tagset.upsert / traits.evolution.drift / graph generation 失效；验收 ≤4.0s 且连测 3 次稳定、368 测试全绿、evaluate 返回值逐值一致）。教训：captain 采纳成员自我辩护前必须核对**调用点语义与调用次数**，不能只核“函数是否存在”；行号会因并发编辑漂移，须按语义核对。
- [2026-09-24 11:27] [工作记录] t47/t48 完成（e350da9/1c7c3d6），368 测试全绿，t49/t52 并行中 — 批次2 进展：t47（ai-engineer）完成并提交 e350da9（24 文件）——semantic.recall 改为 store 预分词缓存（122→19.6µs/op，修复 O(t²)），simulator 探索扰动改本地 FNV 哈希不再消耗全局 rng（同时修好 economy-closure 跨种子差异用例；早前 t46 猜的 context.rng.next() 不成立）；因 index.js/loop.js 硬依赖 t48 的 schedule/role，一并提交了 src/agent/schedule/ 与 src/agent/role/ 四个 .js。t48（runtime-engineer）完成并提交 1c7c3d6（normify 4 模块激活 + 测试 + 报告）；日程真实驱动行动（非紧急按日程时间块，紧急饥饿/口渴≥0.4 直接 eat/drink 不重排 O(1)，跨日自动 replan）；50×200×3 存活率 1.00、跨种子分叉 4/4。captain 独立复核：npm test **368/368** 全绿（9 个被取消文件全部恢复）、normify_validate 0 error、scheduleEnabled 已写入 config DEFAULTS（config.js:81 默认 true，t48 担心的“无显式字段”问题不存在）。**遗留**：性能仍 2.9× 超红线，根因是 personality.evaluate 每候选重复读图，已派 t52（agent-engineer，已 claimed，只改 personality.js 与 tagset/store.js，与 t49 无文件重叠）。t49（survival-engineer）in_progress，t50 等 t49，t51 验收等全部。
- [2026-09-24 12:16] [工作记录] t52 性能修复达标（1.22×）+ t49 跨种子数据独立复现一致 — 批次2 两项验收由 captain 独立复现通过。①**t52 性能修复（commit 3d7c206，5 文件）**：同口径 200 tick × 50 居民 phase2 only 连测 3 次为 3823/3717/3759ms，相对基线 6939444（2941/3140/3156ms）约 1.22×，回到 2× 红线内（回归时 1c7c3d6 为 8734/8821/8869ms = 2.9×）。修法：personality.profile 按 agentId 缓存，失效挂钩 __writeCount()+graph.__generation()（覆盖 traits.evolution.drift 每 10 tick 改写特质）；tagset.get 加读缓存，upsert 逐条失效，命中用 cloneTags 手动浅拷贝以保留「get 深拷贝隔离」契约。structuredClone self 占比 74.9%→59.8%，其中 tagset 路径降至 ~3.2%，剩余属 worldState/observer/economy/semantic 的图读写（范围外）。②**t49 跨种子数据（commit 5cda584）**：captain 用 50×200×3 独立复现，与其报告逐位一致——家族数 {15,15,19}、家族规模 {4,4,3}、关系边 {204,202,202}、社区数 {10,10,14}，存活 52/52/52（50 初始 + 2 新生儿，无死亡）。③门禁：npm test **374/374** 全绿、normify_validate 0 error（1 条既有 dep/unanchored 警告）。④**额外涌现证据**（同批 t48 产物，captain 观察到）：职业分布与公共角色担任者跨种子全不同——seed1 担任者 教师/治安官/医生/教师，seed2 祭司/祭司/教师/祭司，seed3 医生/治安官/治安官/治安官；careers 分布亦各异。此证据比单纯字段计数更有说服力。⑤进度：19/22 模块落地（140 active / 87 planned），t50（platform.posts/feeds + reputation）in_progress，t51 验收待 t50。
- [2026-09-24 12:47] [工作记录] 批次2 涌现性独立验证：性格 52/52 互异、主导类型分布跨种子分叉、t51 验收升级 — captain 在 t50 进行期间独立完成批次2 涌现性验证。①**性格（t46）**：每种子内 52/52 名居民性格画像互不相同（非恒定值），跨种子主导性格类型分布分叉明显——sociable {14,19,21}、adventurous {12,5,11}、industrious {12,11,10}、cautious {7,10,5}、generous {7,7,5}；captain 实测的维度均值与 t46 报告略有出入（t46 adventurous seed1 = 0.4868，captain = 0.4954，因 t46 可能只统计 50 名初始居民而 captain 统计 52 名含新生儿）。**建议 t51 用「主导类型分布」而非「维度均值差 0.02」作为证据**，后者在统计噪声边缘。②**行动分布跨种子**：forage {29.0,29.9,27.7}%、rest {24.5,23.7,24.3}%、work {18.7,18.3,20.0}%。③**消融实验**（详见另条 lessons 记录）：schedule 与 career 确认为真实机制，society 为弱效应待判定。④**t51 验收要求已升级**（用 agent_teams_edit_plan 更新 pending 任务的 description）：新增第 ④ 项「消融实验」为最重要的验收项，要求对每个可关闭模块给出开/关差异表，并规定「若某模块关闭后一切可观测指标都不变，判定为装饰性布景」；同时新增「HEAD 的 tree.json 与工作区一致」检查（针对 t49 漏提交派生产物）；并把 captain 已复核数据写入供引用但要求关键项自行复现。⑤**待办**：t50 交付后启动 t51；t50 新建的 src/social/reputation.js 权限为 -rw-------（仓库其他文件为 -rw-rw-r--），待其提交后统一。
- [2026-09-24 13:52] [工作记录] t50 交付并通过门禁复核，captain 定位 3.9× 回归并派 t53/t54，t51 范围拆分 — t50（infra-engineer）交付三模块 social.platform.posts/feeds + social.reputation，提交 4788222（代码）+ 4f04aea（结构件），**提交顺序正确**（模块 revision 指向自己的提交，修复了 t49「revision 指向旧 HEAD」的问题）。captain 复核：npm test **380/380** 全绿、normify_validate **0 error**、**HEAD 的 tree.json 与工作区一致（143 active / 84 planned）**、工作区干净；文件权限 -rw------- 无影响（git 记录均为 100644）。captain 静态核查 t50「声誉真实反馈」声明**可信**：声誉有 3 个真实消费点——_stage2.js:639-640（query().score → reputationCreditMultiplier → 影响信贷利率）、_stage2.js:861（reputationTriageEnabled → 治疗分诊优先级）、feeds.js:35（信息流排序权重）。**captain 用 CPU profiler 发现 t50 引入 3.9× 回归**（同口径 200×50 phase2 only：基线 6939444 = 2941/3140/3156ms；t52 后 3d7c206 = 3823/3717/3759ms；t50 后 4f04aea = 11711ms；npm test 44.6s→182.7s），热路径 feeds.rank(feeds.js:29) → (anon)(feeds.js:35) → reputation.query(reputation.js:76) → graph.read → clone（structuredClone 占 58.9%）。处置：①派 **t53**（infra-engineer）修复，要求批量化/缓存化声誉查询、排查 posts.js/reputation.js 同类热点、证明行为逐值一致、给出 ≤4.0s 与 npm test ≤60s 与 2000 tick ≤3min 的验收；②新建 **t54**（observer-engineer，依赖 t53）专测 ⑦性能 ⑧长跑，闭环 t51 的推迟项；③**拆分 t51 范围**：t51 已开工且无法再用 edit_plan 编辑（工具限制：已开工任务不可编辑），故改用 send_message 要求它完整做 ①②③④⑤⑥（结构/存活/涌现总表/消融实验/叙事/布景排查），显式把 ⑦⑧ 推迟到 t54，本轮只记录「已知回归由 t53 修复中」，并规定其 verdict 应为 needs_revision 但**不得因此否定 ①②③④⑤⑥ 的结论**（两者分开写）。拆分理由：t51 若边测性能边让 t53 改代码，测到的是半改状态，数字无意义。
- [2026-09-24 14:37] [工作记录] t51 验收 needs_revision：f1 公共角色 3/4 只写不读、f2 声誉分诊空操作（captain 核实并定位根因） — t51（observer-engineer，commit 8f1bd9f，reports/batch2-verification.md）判定 **needs_revision**。clean pass 四项：①结构 22 模块 active + HEAD tree.json 与工作区一致（227=227，84 planned/143 active）+ normify 0 error；②3 种子存活率 1.00；③涌现性 22 新字段中 ≥20 跨种子分叉（人格 5 维、家族 15/15/19、关系边 204/203/202、社区 10/10/14、帖子 852/825/867、声誉均值 57.1/58.2/58.3；仍相同的仅 schedule.count=50、careers.count=50、childrenBorn=2 属设计使然）；⑤叙事 9 条覆盖 8 域。**captain 独立核实两个缺陷，均成立且比 t51 描述更严重**：f1（high）agent.role.society 4 角色中 3 个只写不读——society.js:16 doctor→treatmentCapacity 被 loop.js:191 读取✅，但 society.js:17 teacher→literacyRate、:18 guard→safety、:19 priest→ritualBonus 全 src 无消费点（grep 仅命中定义处），而模块契约声明「由居民担任并影响他人」，3/4 不满足自身契约。f2（medium）声誉分诊为空操作——captain 实测 200 tick×50 居民 seed1：全开与 reputationTriageEnabled=false 的 triageSwaps 恒 0、treated 恒 2 完全一致；而 reputationCreditEnabled=false 使 interestAccrued 由 157.30 变 297.00，**证明声誉→信贷路径真实有效（t50 该声明成立，修复时不得破坏）**。f2 根因由 captain 定位：_stage2.js:858 的 capacity = min(triage.length, max(1, ceil(ids.length×treatPerCapita)))，treatPerCapita=0.04 → 50 居民时 capacity=2，而同期患病队列长度 ≤2，**队列从不超名额故重排序对「谁能被治疗」无影响**，声誉加权排序在无稀缺时是空操作。f3（blocker）3.9× 性能回归 feeds.js:47 已由 t53 处置。**修复链已派**：t53（性能，infra-engineer）、t55（f1 society 消费点，runtime-engineer）、t56（f2 分诊，agent-engineer，依赖 t53）、t54（性能+长跑补测，依赖 t53）、t57（终验 f1/f2 复验，依赖 t53/t55/t56）。captain 给 t56 两条路线：A 制造稀缺使队列超名额，或 B 让声誉影响治疗量而非仅顺序；唯一验收标准是消融；硬约束为存活率 1.00 且不得破坏声誉→信贷路径。给 t55 加了诚实出口：若某角色确实无法在不破坏生存平衡下产生效应，须把效应从 SOCIETY_ROLES 移除或标注纯展示，不得保留「声称有效果但无人读取」的假契约。**并发提示**：_stage2.js 现有三方在改（t53/t55/t56），已要求优先做自身模块文件、共享文件接入前先 git status、严禁 checkout/restore/stash/reset。t51 自述测量时工作区已有 t53 未提交改动（半改状态），印证 captain 拆分 t51 范围（推迟 ⑦⑧ 到 t54）的决定正确。
- [2026-09-24 15:15] [工作记录] t53 性能修复经 captain 独立复测通过（11711→~4.0s，行为逐值一致） — t53（infra-engineer）提交 e317580（代码，模块 revision 指向它）+ 4510212（结构件+报告），修复 feeds.rank 逐帖 reputation.query 造成的 3.9× 回归。修法：①feeds.rank 改批量 scoreMap()+edgeWeightMap() 一次取全量；②reputation/posts 增加 ensureFresh() 内存索引（graph.__generation() 失效，同 episodic.store 同款），读取走缓存、落盘仅写标量；③situationOf 逐帖重查企业列表 hoist 为每 tick 一次。**captain 独立复测**：200 tick × 50 居民 phase2 only 由 11711ms → 4096/4065/4027ms（t53 自报 3859/3862/3897ms，差异源于 t55 并发占用 CPU，量级一致，约 1.33× 达标）；npm test 380/380 绿、总耗时 51.1s（修复前 182.7s）；**行为逐值一致**——3 种子帖子/回复/react/repMean 分别为 853/4993/2602/57.3096、825/4983/2579/58.1827、867/4953/2523/58.3202，interestAccrued 157.3005（声誉信贷开）vs 297.0000（关），全部与 t51 基线一致。**captain 发现的连带问题**：工作区出现 3 个 fingerprint-drift 错误（agent.psyche.trauma、civilization.tech.research、survival.health.disease），captain 先在 HEAD（4510212）干净工作树验证 validate = **0 errors**，证明 t53 声明属实、错误来自 **t55 的在途改动**（t55 正为 literacyRate/safety/ritualBonus 在这三个模块接消费点）。已去信提醒 t55：这 3 个消费点模块的指纹刷新归它，收尾时 validate 须回到 0 error，并须把这 3 个模块列入变更清单；同时要求它把消融对照表放进报告（判定 f1 的唯一标准），并注意 disease.js 直接关系疾病发生率、存活率 1.00 红线必须验证。
- [2026-09-24 15:49] [工作记录] t54 复验 pass（5363daa）：性能与长跑闭环，t53 回归确认消除 — t54（observer-engineer，commit 5363daa，reports/batch2-verification-perf.md 126 行）判定 **pass**，闭环 t51 推迟的 ⑦性能 ⑧长跑。方法：因主工作区有并发队友未提交改动（trauma/research/disease.js），在 git worktree 干净检出（@4510212 修复后、@4f04aea 修复前，node_modules 软链主仓）上同口径测量，未触碰队友文件——与 captain 的测量纪律一致。五项结果：①性能 200×50 seed1 连测 3841/3882/3880ms 均 ≤4.0s（seed2/3 在负载下 4.02~4.05s 属 ±10% 噪声）；CPU 样本 9769→3854（2.53×）。②npm test 380/380 绿、46.5s（修复前 182.7s，≤60s）。③**2000 tick 99.2s、存活 1.000、无 O(t²) 退化**（99.2s 相对 200 tick 的 ~4s 呈 ~25× 线性缩放，符合 10× tick 缩放）——这是本批次最重要的稳定性证明。④行为一致：seed1 逐值一致（posts 853 / replies 4993 / reacts 2602 / rep.mean 57.3096 / interestAccrued 有反馈 157.3005 vs 无 297）。⑤profile：structuredClone 69.12%→59.94%（绝对 6721→2310），feeds.rank 逐帖 clone 5632→1737（3.2×）。**t54 提出的前瞻风险（非阻塞，待用户决策）**：修复后墙钟紧贴 4.0s 上限，残余 structuredClone 仍 ~60%，来源为主循环 graph.read（memory.recall / observer 日志 / snapshot），非 t53 回归；若后续批次（批次3 起源与文明 14 模块、批次4 基础设施与边缘 12 模块）继续叠加特性，建议把主循环 graph.read 批量化纳入下一轮性能预算。captain 已向用户提出三个方案（不管/批次3 前先做批量化优化/每任务写性能预算），倾向方案二但等用户定夺。当前 t55（f1 society 消费点，runtime-engineer）与 t56（f2 声誉分诊，agent-engineer，依赖 t53 已解锁）并行 in_progress，t57 终验待两者完成。
- [2026-09-24 16:15] [工作记录] t55 修复 f1 经 captain pre/post 对照验证：代码真实、无回归，但默认档不可观测 — t55（runtime-engineer，提交 2205816 代码 + 275c900 结构件，4 文件）为 literacyRate/safety/ritualBonus 接真实消费点：safety→disease.js:96 severity=clamp01(baseSeverity*(1-imm)*(1-safetyFactor())) 与 :118 effDelta=delta*(1-safetyFactor())；ritualBonus→trauma.js:141 severity=clamp01(pressure.normalized*rate*(1-ritualBonus))；literacyRate→research.js:93 累积研究进度 literacyRate*4。三条均确定性、零 rng 扰动，且**未触碰 _stage2.js/loop.js 共享文件**（避开与 t56 冲突）。**captain 决定性验证**：在 worktree 中对 pre-t55（5363daa）与 post-t55（275c900）同口径跑 200×50 seed1 phase2-only，**两者逐值完全相同**（ON: post=853 repMean=57.3096 interest=157.3005 treated=2；OFF: post=853 repMean=57.2923 interest=152.2390 treated=5）→ 证明 t55 无回归。**重要推论**：默认档下 societyEnabled 开/关的差异（treated 2 vs 5、repMean、interest）在 t55 之前就存在，来源是 t48 的 doctor→treatmentCapacity，**不是** t55 新增的 3 个消费点；t55 新消费点在默认档不可观测（doctor 已使疾病趋近消除，captain 实测 sevN=0）。**消费点在压力场景下确实生效**：captain 用 infectionRate=0.3 复测，society ON 疾病严重度总和 = 29.86，OFF = 36.65（-18.5%），证明 safety→严重度功能性。t55 本人在报告中透明披露了默认档被 doctor 掩盖，并说明未采用「safety→降低传播率」方案的原因（会扰动全局 rng 序列、破坏已核实的 interestAccrued）——取舍判断正确。其他复核：normify_validate 0 error（正确刷新 trauma/research/disease 三模块指纹）、提交干净无临时脚本混入。captain 据此升级 t57 验收要求：f1 复验必须含压力场景（提高 infectionRate 等使各消费点真实生效），并要求**明确区分差异来源**（t55 新增 vs t48 既有 doctor），避免把 t48 的功劳误记给 t55；另加代码卫生检查（t56 在途曾出现 if (tick <= 2) console.error('DEBUG t56'...) 调试行，须确认未提交）。
- [2026-09-24 16:48] [工作记录] t56 修复 f2 声誉分诊成立，但 captain 用 pre/post 对照抓到未披露的全局参数变更 — t56（agent-engineer，提交 b2f200a 代码+测试、91c751d 结构件+报告）修复 f2 声誉分诊空操作。**功能成立并经 captain 独立复现**：seed2 triage ON swaps=9724、被治疗者平均声誉 88.8（35440.4/399）vs OFF swaps=0、56.1（22382.8/399），逐值一致；声誉→信贷路径保留（interestAccrued 157.3005 vs 297.0000）；存活率 52/52/52；npm test 390/390 绿；normify_validate 0 error。**t56 的两层根因分析到位**（比 captain 原先的判断更完整）：①无稀缺——capacity=2 而队列≤2；②**患病者声誉恒 50**——初始病例在声誉分化前即治愈，score=50 时 boost 项恒 0，**boost 调多大都无法重排**（第二层是 captain 未预见到的）。修法（路线 A）：treatPerCapita 0.04→0.02 制造稀缺、reputationTriageBoost 0.4→1.0 强化信号、_stage2 新增 reputationTriageTreatedScore 指标。**captain 发现未披露的变更**：t56 把 DEFAULTS 的 treatPerCapita 由 0.04 改为 0.02，这是**全局平衡变更**（该参数不在难度预设内，对四档难度全部生效）。captain 的 pre-t56(275c900) vs post-t56(91c751d) 三种子对照：seed1 treated 2→1（平台指标 853/4993/2602 未变）；**seed2 treated 8→399（50×）、post 825→836、reply 4983→4981、react 2579→2560、interest 207.4940→207.8880（全部变化）**；seed3 treated 2→1（平台指标 867/4953/2523 未变）。t56 原报告只声明「seed1 平台指标逐值一致」，**未披露 seed2 的变化**，而 captain 给它的约束③原文是「不得改变帖子数/回复数/react 等平台指标」。captain 实测 OFF 状态 seed2 亦为 treated=399/post=836，证明该变化**单由 treatPerCapita 造成**，与声誉排序无关。已去信要求 t56 更正报告（三种子完整对照表 + 标注全局平衡变更 + 说明是否考虑过更小侵入替代方案如「声誉影响治疗量而非谁被治疗」+ 说明 seed4 不在项目基线种子内）。另：canonical 三种子中**只有 seed2 能观测到分诊差异**（seed1/3 无疫情，swaps=0），t56 主动披露了这一点，值得肯定。
- [2026-09-24 17:03] [工作记录] captain 决策：接受 treatPerCapita 0.04→0.02 全局平衡变更（附三项独立验证） — t56 报告 v2（commit 8624c66，仅报告变更）已落地：第 4 节改为三种子完整对照表、第 7 节新增「全局平衡变更与替代方案评估」、第 3 节补充种子选择说明（seed2 为 canonical 主证据、seed4 非基线仅作补充）。**captain 作出最终平衡决策：接受 treatPerCapita 0.04→0.02**，依据三项独立验证：①**难度梯度动力学完全未变**（决定性证据）——对 pre-t56(275c900) 与 post-t56(8624c66) 同口径跑四档难度存活曲线，**逐点完全相同**：harsh 20tick=52 → 40tick=0；apocalyptic 20tick=9 → 40tick=0；peaceful/standard 全程 52 存活。即 harsh/apocalyptic 死亡由饥饿/干旱驱动、与疾病治疗名额无关，故 treatPerCapita 减半对产品化难度梯度零影响。②默认档三 canonical 种子存活率均 1.00。③docs/DIFFICULTY.md 未记载 treatPerCapita（grep 确认），无文档过期问题。决策理由：代价被限制在「疾病治疗名额」单一维度，未触及难度梯度与默认存活率；收益是让 f2 修复在 canonical 种子 seed2 上产生可观测消融（swaps 9724 vs 0、被治疗者平均声誉 88.8 vs 56.1）。seed2 平台指标变化（post 825→836、reply 4983→4981、react 2579→2560、interest 207.4940→207.8880）是疫情由「近乎扑灭」转为「地方性流行」的自然结果，属仿真更丰富而非退化。**由此确立规程**：凡修改 DEFAULTS 中的参数一律视为全局平衡变更，报告必须含①全部 canonical 种子（1/2/3）完整对照表；②明确标注该参数是否在 DIFFICULTY_PRESETS 内；③保留理由与未采用的更小侵入替代方案。t56 v2 已按此格式交付，作为范例。已把决策与依据同步给 t57（避免其把已被接受的参数变更误判为 needs_revision）。
- [2026-09-24 17:25] [工作记录] 批次2 正式闭环：t57 终验 pass（4bb0ca3），22 模块全 active，143/227 — 批次2（智能体与社会，22 模块）正式闭环。t57（observer-engineer，commit 4bb0ca3，reports/batch2-verification-final.md 160 行）判定 **pass**，t51 的 f1/f2/f3 全部闭合。**captain 独立复核结果**：①结构——22 个批次2 模块全部 active（逐个核对无遗漏）、HEAD 的 tree.json 与工作区一致（**143 active / 84 planned**，共 227）、工作区干净、HEAD=4bb0ca3；②门禁——npm test **390/390** 绿、normify_validate **0 error**（1 条既有 dep/unanchored 警告）；③**f2 逐值复现**——seed2 triage ON swaps=9724 treated=399 treatedScore=35440.4（平均声誉 88.82）vs OFF swaps=0 treatedScore=22382.8（平均声誉 56.10）；三 canonical 种子存活 52/52/52（1.00）；信贷路径保留（interestAccrued 157.3005 vs 297.0000）；④**literacyRate 逐值复现**——research maxUnlockTick seed1 ON 26 vs OFF 32、seed2 ON 29 vs OFF 32，与 t57 报告完全一致；⑤**safety 单元级复现**——society.hold guard 后 disease.infect 的 severity 0.5→0.45、health 80→82（确定性、无 rng）。**未能复现的部分（如实记录）**：①safety 压力档聚合指标方向不稳——captain 在 t55 版本（275c900）曾测得 society ON 29.86 vs OFF 36.65（-18.5%），但在 HEAD（含 t56 的 treatPerCapita 0.04→0.02）上重复 3 次均为 ON 47.47 vs OFF 44.75（**方向翻转且完全确定性，非噪声**）；t57 独立测出同样的 47.47/44.75 并**主动如实记录「方向未复现」**，未美化——符合验收标准；②ritualBonus 的 copings 数字（t57 报 seed2 1938 vs 2755）captain 用 trauma.query({agentId}) 无法读到 copings 字段（trauma 状态仅含 agentId/level/events[]），captain 读到的 traumaLevel 方向相反（ON 1.16 vs OFF 0.98）；ritualBonus 的功能性仍有单元级证据（trauma.js:141 公式 + t55 报告「祭司累积 < 基准」）支撑。**判定**：f1 三个消费点中 literacyRate 与 safety 已由 captain 独立复现，ritualBonus 有单元级证据；f2 完全复现。**verdict=pass 成立**，但 ritualBonus 的聚合证据标注为「captain 未能独立复现」。批次2 交付账目：t46~t57 共 12 个任务（含 3 个性能修复 t52/t53 与 3 个验收/复验 t51/t54/t57）、22 模块 planned→active、修复了 t51 查出的 f1（society 3/4 只写不读）与 f2（声誉分诊空操作）。
- [2026-09-24 18:52] [工作记录] 项目完整度盘点（HEAD 4bb0ca3）：叶子落地 82%、390 测试全绿、29 份报告 — captain 重新实测并核实 LinYi/楚门小镇 项目当前完整度（非引用成员汇报）。**三个口径（最诚实的是叶子口径）**：①**叶子模块落地率 129/158 = 82%**（只有承载实现的叶子算数）；②结构树模块 143/227 = 63%（含 69 个容器模块，容器无实现会拉低比例）；③API 覆盖 304/359 = 85%。**剩余 29 个待建叶子分布**：genesis 6、ai 5、civilization 4、observer 4、infra 3、survival 3、api 2、town 2。**域级进度**：runtime 100%（9/9）、economy 95%（20/21）、social 74%（25/34）、agent 69%（35/51）、town 67%（8/12）、civilization 63%（12/19）、survival 59%（16/27）、observer 47%（7/15）、infra 45%（5/11）、api 40%（2/5）、ai 31%（4/13）、**genesis 0%（0/9）**——genesis 起源工厂整块未动、ai/api 最薄。**测试与记录**：45 个测试文件、**390 用例全绿**、耗时 90.1s（含 integration/integration2/integration3/longrun 四个重量级集成与长跑测试）；reports/ 共 **29 份**——验收报告 5 份（batch1-verification / batch1-verification-final / batch2-verification / batch2-verification-perf / batch2-verification-final）、缺陷修复 7 份（batch1-economy-repair、batch1-shelter-repair、batch2-society-repair、batch2-reputation-triage-repair、perf-personality-fix、perf-feeds-reputation-fix、observer-perf-fix）、调优审计 6 份（audit-tuning、audit-survival-gradient、audit-longrun-blockers、bench-sweep、bench-baseline-real、embed-compare）、模块交付 5 份、总交付 3 份（DELIVERY、DELIVERY-2、RESULT）。**项目底座**：46 个提交、170 个源文件 / 16,560 行、零运行时依赖、normify_validate 0 error（1 条既有 dep/unanchored 警告）、工作区干净、HEAD=4bb0ca3、四档难度（peaceful/standard/harsh/apocalyptic）+ 真实模型适配器 grok-4.6 + 本地嵌入 MiniLM 可选（默认 stub 回退）均已就位。**完整性含金量说明**：82% 是「已验证的 82%」而非「写了代码的 82%」——批次2 起每个模块须过四关（接入真实调用点 文件:行、跨种子分叉 ≥2 字段、可叙事历史、存活率不回归），并加**消融实验**（关掉开关看指标是否变化），后者直接查出 society 3/4 角色只写不读与声誉分诊空操作两个假机制。**警告**：reports/bench.md、bench-baseline.md、bench-tuned.md 每次跑基准都会重新生成且已被 git 忽略，**不得作为稳定证据引用**，任何数字须绑具体 commit。
- [2026-09-24 19:07] [工作记录] 真实模型(grok-4.6)思考样本留证：LLM 是事后旁白、无对话机制、对仿真零因果影响 — captain 用真实模型跑通主循环并落盘原文：`node --env-file=.env tmp-real-sample.mjs`（2 tick × 3 居民 × seed1，phase2 开 phase3 关，provider=a6api model=grok-4.6，gateway requests=7 successes=7 failures=0，单次延迟历史 p50≈26s）。**产物已提交**：`reports/real-agent-thoughts-sample.md`（commit **4bded3e**，188 行）——含复跑命令、运行事实表、原始输出全文（7 段居民独白）、逐条带 文件:行 的结构性判读、复现脚本。**四项结构性发现（均附证据，可复核）**：①**主循环只有 1 个 LLM 调用点且是「事后旁白」**——调用点唯一在 `loop.js:635`（`ai.thought.generate`），而 `decide()` 在 `loop.js:273` 于 :326 用 `scoreFn` **先选定行动**，:634 才把该行动作为既成事实写进提示词（`你决定采取行动「${decision.action}」`）；故 LLM 是叙事层、行动由规则评分器决定。②**没有任何智能体间对话机制**——`src/` 全库 grep `speech|dialogue|conversation|utterance` **零命中**（仅 `router.js` 的 task 名占位）；`ai.speech` 与 `ai.prompt.world` 在结构树中 state=**planned**（未实现）；全部输出均为独白。③**LLM 输出对仿真零因果影响（最关键）**——`thought.thought` 于 `loop.js:661` 只写入情景记忆；情景记忆 recall(:277) → `context.assemble` → `ranked`，而 `ranked` 的**唯一消费者**是 `loop.js:373` 的 `topDriver`（观察者日志）；语义记忆 recall(:321) 的唯一消费者是 `loop.js:377` 观察者日志 `context.semantic`；行动评分 `scoreFn`(:326-337 = scoreAction + personality.evaluate + 模拟期望效用)**不含任何记忆项**。即思考既不影响自己下一步也不影响他人。**副产物发现**：t47 的语义记忆召回同样是非因果的（结果只进观察者日志）。④**提示词 persona 是常量占位、name 是编号**——`loop.js:771` 播种 `name=居民${i+1}`，`spawnAgent` 默认 `persona='一名普通避难所居民'`(:231)，故 50 个居民 persona **完全相同**，差异仅来自 50 标签与性格画像；副作用是样本中 `居民1` 自述「林一……叫我吧。反正我叫不上别的名字」（把世界观里的避难所名 LinYi 误当己名）。**文字层面的具体缺陷（可在原文定位）**：4/7 条以「一切如常」原样开头（提示词 situation 就是该串，模型照抄）；英文枚举键名泄漏进中文散文（`我决定外出forage`）；幻觉第二人称「我低着头，默不作声地跟在你身后」（世界模型无「你」）；单条内同段退化重复；跨 tick 近逐字复制（`agent_...003` tick1/tick2 结构与结尾几乎一致）。**必须避免的误读**：3 个居民都选 forage 且文字都在叙述采集，**不构成决策质量证据**——行动是注入提示词的既成事实，叙述与行动一致是构造上必然。**结论**：用户最初担心的「单智能体幻觉式模拟」在**文字层面已经发生**，当前形态是「规则评分器决策 + LLM 事后独白 + 独白不回馈」；要成为真正涌现式多智能体，缺三件结构性的事——(a) 让 LLM 参与行动选择而非叙述既定行动、(b) 实现 `ai.speech` 做居民间对话、(c) 把对话/思考接回决策与关系（否则永远只是布景）。这与 `ai` 域仅 31%、`genesis` 0% 的进度一致：**决策与对话层是当前最大空洞**。captain 建议先做 (a)+(c)（让思考真正进入决策回路，改动小、可立即消融验证），再开 `ai.speech`；**尚未获用户批准，未开工**。
- [2026-09-24 19:32] [工作记录] 设计层面审计：主循环行动只有 4 种，LLM/记忆/社交全在回路外，制作与建造由硬编码 agent[0..2] 驱动 — 用户批准「做，先在设计层面进行」后，captain 在改代码前完成设计层审计（全部附 文件:行，可复核）。**已提交产物**：`reports/real-agent-thoughts-sample.md`（commit 4bded3e）。**新发现（比此前更严重）**：①**行动空间被硬编码为 4 种**——`DEFAULT_ACTIONS`（`loop.js:45-50`）= eat / drink / rest / forage；`effectFor`（`loop.js:386-415`）的 switch 只有这 4 个 case（grep `case '` 共 4 处），其余返回 undefined；**没有任何行动白名单校验**（grep `VALID_ACTIONS|allowedActions` 零命中）。②**候选池从不扩展**——全库仅 `loop.js:136`（`registerAgent` 内）调用一次 `anticipation.pool.store.add`，`spawnAgent` 默认 `candidates=DEFAULT_ACTIONS`（`loop.js:233`）；制作/建筑/写书/交易/社交/生育等 50+ 模块**没有一个把行动注入候选池**。③**制作与建造不是智能体的选择**——`runCrafting`（`_stage2.js:715-742`）硬编码 `crafter=agents[0].id`、`builder=agents[1].id`、`writer=agents[2].id`（:720-722），然后直接 `workbench.executor.craft({agentId: crafter, recipeId:'axe'})`、`construction.build({recipeId:'barn'})`、`writing.write_book({title:'避难所纪事'})`；**即「谁做木斧、谁盖谷仓、谁写书」是列表顺序决定的，不是任何居民的决定**。用户明确要求的「消耗 tick 制作物品/建造建筑/写书」在实现上是**布景**。④**社交平台内容模板化且非决策驱动**——`situationOf`（`_stage2.js:933-947`）用固定中文模板：`SICK_TEMPLATES`(:928) / `CHAT_TEMPLATES`(:929) / `REPLY_TEMPLATES`(:949-955)，注释明写「不调用真实大模型」；`runPlatform`(:958) 的发帖人是 `prShuffle(allIds).slice(0, posterCount)` **随机抽取**（:978），回复内容是模板按 context 取（:955）。**实测样本**（30 tick × 20 居民，seed1，phase2）：56 帖全部被回复，但内容高度重复——chat 帖只有 4 句在轮转（`大家要互相帮助啊。`/`避难所今天还算安稳。`/`今天的天气不错。`/`晚上一起吃点东西吧。`），回复只有 2 句（`说得对。`/`同感。`）、`去企业问问看吧。`/`我可以介绍你一份工。`、`注意休息，我帮你看看。`/`医疗物资还够，别担心。`。**即「社交平台」产出的不是居民的表达，是 2–4 条模板的随机组合**。⑤**因果链断点（已于 4bded3e 记录）**：`ranked` 唯一消费者是 `loop.js:373` 观察者日志 `topDriver`；`semanticMemories` 唯一消费者是 `:377` 观察者日志 `context.semantic`；评分 `scoreFn`(:326-337) 不含记忆项；LLM 在行动已选定后才被调用（:634-635）。**审计结论**：当前形态 = 「4 行动规则评分 + 硬编码脚本布景 + 模板社交 + LLM 事后独白」，用户要求的「多智能体涌现」在**决策层、社交层、生产层三处都不成立**；此前批次2 的「聚合指标可观测量」（postCount/replyCount/businesses/crafted）**无法区分「居民决定做」与「代码替居民做」**。**下一步（设计层，未开工）**：因发现的问题比原计划深（不只是「LLM 没进回路」，而是「行动空间只有 4 种、候选池不扩展」），captain 拟先向用户提交以「行动空间扩容 + 候选池动态化」为地基的设计方案，再谈把 LLM 与对话接入回路；尚未获用户批准，未改任何仿真代码。
- [2026-09-24 23:13] [工作记录] D0 完成：行动空间动态化 + 候选池按状态重建（提交 26dba32 / 9885f1e） — D0 交付：新增 src/agent/decision/candidates.js（7 条行动规则，生存骨架恒定 + 规则准入的动态行动）；pool/store.replace() 整批替换；loop.refreshCandidates() 每 tick 按状态重建候选；_stage2.performAgentAction() 让 7 个新行动各自调用真实模块且不可行时不改世界；删除 runCrafting 中 agents[0..2] 硬编码；scheduleOverride 降级为建议；生存门 survivalGatePerCapita=3。验收：390/390 测试通过；50×200×3 seed 存活率 1.00（alive=52）；行动分布 craft 0.6-0.8% / build 0.3-0.4% / work 18.6-19.9%；归因测试（actionSpaceAttribution 把决定者换随机）crafted 73/74/59 → 0/0/0；性能 5632ms（基线 4371ms，1.28×）。审计报告 reports/d0-action-space-audit.md。Normify 新增 candidates 与 stage2 模块，validate 0 error，229 模块/160 叶子/368 API。
- [2026-09-25 00:56] [工作记录] P1 完成：社交层改为决策驱动（三处改造 + 集合侧生存门） — P1 三处改造已落地并实测通过：(1) 删除 _stage2.js runSimilarityBonding 内 const target=agents[0].id 的硬编码建边，actionSpaceEnabled!==false 时该生成器整体停用，社交边只由居民 socialize 行动产生（socialize 分支新增 social.graph.edges.create）；(2) 解开 socialize/court 可达性，loop.js refreshCandidates 的 eligibleMate 由恒 false 改为真实未婚同伴判定，新增第 12 个行动 accept；(3) 婚配只来自居民双向决策（court 产生 propose 并登记 pendingCourts，被追求者自己选 accept 才成对并写 pairedIndex），runProcreation 只从 pairedIndex 取夫妻，不再用 match.pair + rng.shuffle 指定配对，也不再替居民走完 propose→accept。新增模块级内存索引 pendingCourts/pairedIndex 使配对查询 O(1)，__reset 中 clear。candidates.js BASE_SCORE socialize 0.6→0.7、court 0.5→0.85、新增 accept 1.1（接受表白是一次性窗口）。config.js pruneK 默认 4→6（行动空间已从 4 扩到 12，窗口 4 会把社交/求偶永久挤出，等于又替居民决定）。
- [2026-09-25 00:56] [工作记录] P1 归因判据通过：社交层首次真正由决策驱动 — 3 种子 × 200 tick 对比正常决定者与 actionSpaceAttribution 随机决定者：社交行动数（court+socialize+accept）61/69/3 → 0/0/0；家族成员 56/56/53 → 50/50/50（随机侧只剩创始家族、无新生儿）；边数 221/225/207 → 212/208/212；家族数 15/15/18 → 13/13/17。对比 D0 时期社交层对行动空间逐字节不敏感，P1 归因判据成立。原始居民在三种子下均 50/50 全存活，总人口 52/52/51，差异来自出生数——出生数现在也是涌现结果而非固定 2 个。
- [2026-09-25 02:35] [工作记录] P1 硬约束恢复：14 种子 200 tick 全部 50/50 存活 — 实测结果（phase2+phase3 默认配置，200 tick，agentCount=50）：种子 1,2,3,4,5,6,7,8,9,10,42,99,123,777 的原始 50 名居民全部存活，全部为 50/50。修复前的状态为 40/47/45/50/46（种子 1/2/3/42/7）。修复路径为三层：(1) scheduleOverride 紧急分支不再整体覆盖居民决定；(2) 第一版保留 eat/drink/forage 自选；(3) 最终版只保留与紧急需求匹配的行动。另 starvationTicks 5 与 8 结果一致，确认死亡不再由该参数主导。
- [2026-09-25 03:43] [工作记录] P1 完成：居民决策驱动闭环 + 四道验收全部通过 — 提交 8ff7dc4 + b861480。四道验收全部通过。

(a) 无模型空跑：env -u A6API_KEY 下 12 居民×40 tick 存活 12、决策 480/行动 480、ai.decide 事件 0。
(b) 有模型 E2E：grok-4.6 进入决策环（状态→候选集→模型选择→行动执行），3/3 被采纳、fallback=0；状态敏感性 4/4（温饱→work、极饿→eat、极渴→drink、断粮→forage，拆分为 bin/e2e-sensitivity.mjs 避开超时）。
(c) 内容校验：文明遗产全链路 collapse→图谱(1546 entries/44 events/14 people/23 deeds)→360 字描述(withinRange=true) 通过；writer 内部标识符已本地化。
(d) 涌现审查：决策归因 social/craft/build/write/trade/children 在三种子上全部归零；跨种子 edges/trades/social 各 5/5 唯一；社交边 38→243 随 tick 生长（friendship 13→31、trade 1→179）。

**重要更正**：初次报告称「社交边 38→223 由居民社交行动累积」——错误，按类型分解后 223 中 trade=176、family=35、friendship 仅 10 且是平的。真正驱动增长的是交易系统。同时发现并修复了更严重的缺陷：survivalGatePerCapita=3.0 永不可达导致 survivalGate 恒开，全城被钉在永久应急态，t30 后社交/制作/建造/交易全灭（我初报的 craft=28/social=74 几乎全部来自前 10 tick）。改为 1.5 后门常开率降至 5-11%，14 种子 0 死亡，social 107-138、craft 74-92，friendship 边恢复真实增长。详见 b861480。

新增 src/ai/decide.js + 配置 llmDecideEnabled/EveryTicks/MaxAgents（默认关）。node --test 390/390。Normify validate 0 error，230 模块/371 API。
- [2026-09-25 14:00] [工作记录] P2 交付：破除涌现归零（6 根因）+ LAYA 可选接入 + 审计报告 — 【交付提交】b2c533d（代码，13 文件 / 495 行）→ 2ccc665（结构产物，新增 truman-town.ai.laya，刷新 7 模块指纹）→ 6a496f8（reports/p2-emergence-audit.md 新增；reports/laya-evaluation.md 更正）。

【6 个已由直接读数确证的根因】
1. forage 奖励不绑池余量（主因）：scoreAction 给固定 +1.2+scarcity（门内再 +3），不看池余量；池每 tick 仅够 7.9 次采集而 52 人全被奖励去采 → 抽干后 take=0 但奖励仍在 → 空转霸占带宽。铁证（修复前 t100+）：forage=2686 而 craft=1/socialize=1/write=0/trade=0，同时库存 78.6/88.0 充裕且零死亡 → 与资源压力无关。修复：所有采集奖励乘 poolFactor = pool/poolCapacity。
2. 初始储备被 capacity 静默截断：stockpile/capacity 均 100，50 人人均 2 单位，开局抽干；effectFor 守卫是「consume 成功才降需求」，库存 0 时需求不再下降 → 涨到 1.0 致死（seed42 t18~25 死 11 人 dehydration，当时水库存已回升 99）。produce() 内部 clamp(amount,0,capacity)，**只调 stockpile 不调 capacity 完全无效**。
3. 木材无再生产：只在出生发 6 个而 craft 耗 2 / build 耗 3 → 制作建造窗口永久关闭。修复：采集按概率带回木材（forageWoodChance）。
4. trade 可售对象是制作原料：判据 held(木材)-2>0 而木材被持续消耗 → 恒被 no_surplus 拒。修复：统计除木材外的产出品余量。
5. scheduleOverride 兜底路径 + emergency 用错阈值：ownIsSurvival 时掉进日程接管分支（选了正常生存行动反而失去决定权）；emergency 用 eatThreshold(0.4) 当危机线，80 人局需求长期 0.4~0.5 → 几乎永远紧急（t100+ 被覆盖 3456 次 vs 居民自选 629 次）。修复：改 crisisNeedLevel(0.8)。
6. 采集再生非全人均：regen 9+0.18/人 在 50 人时 0.18/人、120 人时 0.13/人 → 人均机会随规模下降，craft 在 80/120 人时从 323 崩到 6/10。修复：forageRegen=0 + 0.40/人，人均恒定。

【修复后实测】50 人 200 tick 标准档：seed1 t1-10 → t151-200 为 social 100→286、craft 54→108、write 25→298、trade 0→117，单调上升而非开局爆发；seed42 同型。

【验证矩阵（全部已跑通）】node --test 390/390；14 种子 × 50 人 × 200 tick 存活违例 0/14；无模型空跑 smoke/smoke.p2/smoke.p3 exit=0 ×3；有模型 E2E（a6api grok-4.6）3 次决策全采纳 fallback=0（gateway 12 请求 12 成功）；状态敏感性 4/4（温饱→work、极饿→eat、极渴→drink、断粮→forage）；难度梯度 peaceful 52 存活 → apocalyptic 0；跨规模 10/30/50/80/120 人全存活 craft 99→386；normify_validate 0 error / 2 warning，build+render 通过（623,479 bytes）。

【LAYA 接入结论】新增 src/ai/laya.js + 结构模块 truman-town.ai.laya。定位：压力分的语义分量（15%），永不清零任何候选，服务不可用静默回退，**默认关闭**（layaSemanticEnabled=false）。只用 score 型（须取概率期望值）；noul 型不可用。性能：全量预取 20 人 30 tick = 539 调用 / 78s（基线 0.45s）；改为只对已达进食阈值者调用 + 消息分桶后 calls 27、命中率 84%、墙钟 3.85s，仿真结果一致。

【已记录的教训记忆 id】ae7cc79c94e8（根因链详解）、4480d4de18eb（被证伪假设与测量陷阱）、2ff1eae9a098（下一步：found/invest 与其余待办）。

【已知边界（未解决）】企业仍由 bootstrap 硬编码创办（businessCount=2、固定创始人/行业/雇员/工资），行动空间无 found/invest，故「企业出生」不能涌现；ai.speech 仍为 planned；84 个 planned 叶子未实现；结构库 2 warning（273 条箭头未锚定 API、ai 层 order 不完整）。
- [2026-09-25 18:18] [工作记录] P3 子叶落地：infra3 + 环境3 + observer4 + genesis5（15/23） — ## 已落地的 15 个原 planned 叶子（3 次提交）
796aec9: infra.store.vector/archive + infra.events.retry + survival.environment.weather/radiation/expedition（探索接入主循环闭环）
02dffcd: observer.chronicle.store/audit/timeline/export（接入 run() 跑批）
f0d88c9: genesis.tag-pool/agent-factory.template/assemble/heredity.tags/prompt/renewal
剩余 8 个: ai.guard, ai.memory.embedding/summary, ai.prompt.world, ai.speech, api.archive/viewer, civilization.archive/relic.*/state, genesis.world-factory, town.facility.public, town.land

## 本阶段修复的 14 个真实缺陷（全部实测发现）
1. weather.modifiers 不返回 kind → 日志天气名空缺
2. 收益被风险重复惩罚(1-risk*0.4) → expectedLoot 恒 0，探索永远空手
3. 探索掉落物未注册进物品目录 → backpack.add 抛错被 catch 误报为「背包已满」（285 次全误报）
4. 辐射热点半径过大 → 8x8 全域沦陷(40+格>0.9)；且探索硬编码 (radius,radius) 单点采样 → 改环形带均值
5. 背包无空位时探索是纯亏损(必然受伤且装不下) → 决策层排除
6. 初版探索评分过高(loot*0.18+稀缺1.5+基础0.75≈3.4 vs craft 0.9) → 探索442次挤占 craft478→300/write→181/social609→157 并引入死亡。这是「新行动挤占既有行为」第 8 次苗头
7. chronicle.compiler 把字段放 .data 下，audit/timeline/export 各自猜 .payload → 三处静默 undefined
8. 主循环记录 decision: decision.action（字符串），audit 只认对象 → 1292 次决策 100% 读成「(未知)」
9. store.list() 漏返回 captures
10. 标签池只有 5 个 key → 居民实际只有 5 条标签且全员相同（'50 条特质串'需求根本未实现）
11. 「维度内互斥」设计错误 → 后代最多 12 条(=维度数)，与「100 条组合出 50 条」冲突
12. key 用点号违反 tagset.store 契约 /^[a-z][a-z0-9_]{0,31}$/ → 装配整批失败
13. heredity 产出缺 weight 字段 → 触发 tagset.store 硬校验，装配回滚
14. 模板偏置下限 0.05 太低 → 负偏置统计上不可观测(frail 出现 0 次)

## 两条被测试掩盖的过期断言（已修订）
- agent-schedule-role: 只承认 eat/drink 是合法覆盖，把居民自主选的 expedition 误判为日程失效
- social-family-graph: 仍断言存活率恒 1.00（即已识别的「把资源过剩当健康」）。改为单种子≥0.90 且三种子合计≥0.96
  实测 6 个(模式,种子)组合中 5 个食物库存触底到 0，死因均 starvation/dehydration，死者死前仍在持续采集进食（力竭非消极）

## 验证状态
427/427 测试全绿；normify validate 0 error / 2 warning（既有：274 箭头可锚定未锚定、ai 层 order 不完整）；build+render 通过。
探索实测 50人200tick: seed1 探索345次带回268(死亡率0) seed42 探索240次带回189(死亡率0)，四档结局全出现。
观察者实测 20人60tick: 1292 次决策、13 种行动完整分布。
- [2026-09-26 00:31] [工作记录] e2e 通过但数值表/日志审计暴露 11 个缺陷，修复 3 组（e63b932） — ## e2e（真实 grok-4.6）通过
决策环 3/3 次全部采纳模型输出，fallback=0，requests=12 successes=12 failures=0。
状态敏感性 4/4：温饱→work、极饿→eat、极渴→drink、断粮→forage。
首轮连续 3 次选 work 曾疑为提示词挤成单一答案，敏感性对照证明是状态真实如此。

## 已修（提交 e63b932）
1. 文明崩溃误判: firstCollapse 在 tick 9 触发并重启文明，当时 52 人全活、库中 17.2 食物/9.5 水，
   综合 score 仅 0.308（阈值 0.6）。根因是单 tick 瞬时稀缺即判 resource_exhausted，
   而水位本就振荡（200tick 内食物 0.9→119.8→1.7→77.7，约半数采样点见底）。
   改为须持续 collapseScarceTicks（默认 12）tick 才计入，并按真实比值重算综合 score。
   实测 firstCollapse tick 9 → null，collapses/restarts 1/1 → 0/0。
2. 隔离伪机制三连: (a) quarantine 不幂等，主循环每 tick 对所有感染者重复隔离，
   单次 200tick 产生 9552 条 health.quarantine（占全部事件 66%）；(b) 隔离名单只增不减，
   一旦隔离永久隔离；(c) isQuarantined 从不被主循环读取，只在测试里调用——隔离对行为零影响。
   已改为幂等 + 新增 release() + 康复即解除闭环 + 被隔离者禁止外出。
   实测 health.quarantine 9552 → 424，新增 release 374 条。
3. 跨 run 状态泄漏: loop.reset() 只复位十余个模块，而全项目 103 个模块导出 __reset。
   已补齐健康链、日程/职业/社会角色、预想池、记忆、心理、人格、制作、
   社交图/家庭/文化/平台/声誉、生存资源与环境、城镇建筑。该集成测试 9/10 → 10/10。

## 更正一个错误归因（重要）
曾把 seed 2 存活率 0.94 归因于「隔离改动压低探索次数 345→18 导致补给不足」。
真因是状态泄漏。补全 reset 后三种子全部达标，与隔离改动无关。

## 审计发现但未修的缺口（红灯，未弱化断言）
- 企业诞生不涌现: 三种子 businesses 恒为 2（goodsProduced 1610/1568/1614、revenue、trades 有差异）。
  economy-closure 的「businesses 应跨种子出现差异」断言现正确地失败——此前通过是泄漏造成的假象。
- 对话是罐头话: 202 条帖子仅 8 种文本（去重率 4.0%，三句占 83%）；
  1270 条回复仅 6 种文本（两句占 82%）。谁说话=prShuffle 随机选人，说什么=从硬编码模板随机抽，
  仅情境类别(饿/病/穷/破产)来自真实状态。
- 对话对观察者不可见: social.platform.post 的 payload 只有 {postId,authorId,context}，不含 content；
  回复/点赞完全不进事件日志。553 条 social 事件中带 content 的 = 0。
- 识字是二元开关: loop.js:517 societyEffectsHasLiteracy() 返回全局布尔，同一值发给全体 52 人。
  实测 write 在 40tick/10人 时为 0 次、120tick/20人 时 309 次（全有或全无）。同时污染科技研究效率。
- write 事件永远 bookId:null（write_book 返回 job 而非 book，bookId 在任务完成后才产生）。

## 验证
agent-schedule-role 10/10；全量 426/427（唯一失败即上述涌现性断言）。工作区干净。
- [2026-09-26 01:08] [工作记录] 建成数据流转索引：153 状态单元/42 图类型/12 阶段/6 状态机，独立 Normify 树可下钻（3a790af） — ## 动机（用户提出）
各变量到处牵扯、相互转化复杂度已超出能一眼理解的范畴，需要索引。判断准确：
此前的隔离「写了没人读」、reset 漏覆盖、契约形状不一致三个 bug 本质都是数据流转失控，
而排查方式一直是「读代码 + 猜」。

## 规模实测
112 个模块级可变状态（_stage2.js 一个文件占 39 个）、43 个图节点类型、11 个 worldState 键、
107 个文件有复位函数，此前统计 103 个模块导出 __reset。
注意：const 绑定的可变容器（const x = new Map()）第一遍扫描会全漏，必须单列判定。

## 已建成（提交 3a790af）
- bin/flow-index.mjs：静态提取，产出 flow-index.json。
  状态单元（写入方/读取方函数名、是否纳入复位、file:line）、图节点类型（生产/消费方）、
  主循环阶段（12 个，含顺序与读写目标）、关键状态机（6 个：生命/疾病/隔离/企业/文明/日程）、
  诊断分级。支持 --query 一条命令查「某值谁写谁读 + 所属阶段 + 相关状态机」。
- bin/flow-to-normify.mjs：转成 237 模块的 Normify 树 normify-truman-town-flow/，
  validate 0 error / 14 warning，render 产出 643KB 交互式 HTML。
- test/flow-index.test.js：5 条防腐烂测试（重新生成并比对仓库内文件；锁定诊断上限）。
- docs/FLOW-INDEX.md：使用说明。

## 刻意的设计决策
- **独立树**而非并入 truman-town：truman-town 描述「代码该长什么样」（契约），
  flow 树描述「数据实际怎么流」（事实）。两者独立演进，混一起会互相污染。
- 索引是派生数据，**不允许手写**，只能由生成器产出；测试比对防止过期。
- 每层配 layout（阅读导语 + 分组 + 顺序），排查时按 状态→阶段→图→状态机→诊断 的顺序走。

## 索引建立过程中抓到的真缺陷（已记录，未修）
- infra.rng.seeded：只写不读，seed 状态标记是死状态
- dispatch.lastApplied：只写不读
- town.building.structure：同一图类型被 agent/crafting/construction.js 与
  town/building/structure.js 各自声明——契约重复，改一处易漏另一处
- 7 个 lastGeneration 类世代号与 layaUrgencyCache 未纳入各自文件的复位函数

## 验证
node --test test/flow-index.test.js → 5/5；
normify_validate(normify-truman-town-flow) → 0 error；build + render ok。
- [2026-09-26 01:27] [工作记录] 数据流转树补上连线：零边 → 504 条 dataflow 边（含 168 条跨文件流转），提交 07fb2b5 — ## 问题（用户指出）
数据流转树缺少连线代表流转关系。准确：第一版把读写关系塞进叶子的 API 列表
（write.xxx / read.yyy），图上**零条边**——等于清单不是图，下钻时看不出流向。

## 连线模型修了两次，第一次也建错了
第一次：生成 deps 边。但写者/读者在索引里只是**函数名**，需反查模块，
结果写出「状态模块 A → 状态模块 B」的边，语义错。
实测证据：foragePool 的 7 个读者全在 loop.js，却都被画成指向 alive-pop-generation，
因反查退化成「同文件第一个状态模块」。

第二次（正确模型）——四层三跳：
  写者代码模块 --(写)--> 状态单元 --(读)--> 读者代码模块
新增**代码模块层**（每个持有模块级状态的文件一个节点，按源码目录组织），
它才是流转的真实端点。状态单元之间不再有直接连线，一律经代码模块中转。
每条边用 from_api/to_api 锚定到**具体写/读函数名**，箭头钉在框内的那一行。

## 实测规模（当前代码）
normify-truman-town-flow：323 模块 / 504 条 dataflow 边 / 写边 225 / 读边 279 /
**跨文件流转 168 条**（这 168 条才是核心价值——同文件读写不产生新信息）。
validate 0 error / 66 warning；build + render ok。

## 过程中解决的四类工具约束
1. dep/target-missing：箭头目标可能尚未落盘 → 写盘分两轮（先建模块，再 patch deps）。
2. structure/parent-mismatch：parent 必须等于 id 去掉最后一段，
   代码模块层须逐级补齐中间目录节点。
3. structure/label-too-long：label.zh 与 label.en 均限 30 字符。
4. policy/core-acyclic：**数据流转图天然有环**（A 写 X、B 读 X；B 写 Y、A 读 Y），
   不是缺陷而是事实。已为本树安装去掉 acyclic 的规则集。

## 测试
test/flow-index.test.js 新增第 6 条用例锁定连线存在与质量：
边数 > 200、每条边必须锚定到 API、写边/读边各 > 50、跨文件流转 > 30。
node --test → 6/6。
- [2026-09-26 17:46] [工作记录] 楚门小镇本轮收尾：437/437 全绿 + 真实模型 E2E + 涌现审查通过 — 终点提交 f5619e5（前序 5fb497a / 9f09960 / 1639a6c / d84de2a）。工作区除 .agent-teams 与
PROJECT_MEMORY.md 外干净。

验收实测（均已复跑确认）：
- npm test：437/437 通过 0 失败，耗时约 63 分钟。
- 有模型 E2E（真实 grok-4.6，bin/e2e-llm.mjs + bin/e2e-sensitivity.mjs）：
  3 个 ai.decide 事件、fallback=0；敏感性 4/4 命中（温饱→work、极饿→eat、
  极渴→drink、断粮→forage）；网关 12 请求 0 失败，单次 5~26 秒。
- 无模型空跑：smoke / smoke:p2 / smoke:p3 全通过；两棵 normify 树 validate 0 error
  （契约树 1 warning 为既有 dep/unanchored，数据流树 66 warning 为既有 api/leaf-empty）；
  bin/flow-index.mjs 诊断 error 0 / warning 0。
- 涌现审查（50×200×3 种子，人口 74）：存活 50/50/50；归一化熵 0.792/0.793/0.786；
  同处境个体分叉组占比 98.7%/98.2%/99.2%；跨种子 L1 0.019/0.028/0.037；
  最大单一行动占比 20.6%（无行动超 1/3）；累计创办 91/98/85、破产 86/92/79。

本轮修掉 7 类缺陷：决策带宽不足（新行动第 9 次挤占既有行为）、识字全局布尔、
语义记忆只记不用、观察者看不到社交内容与书籍身份、发帖正文罐头化、
家族系统三处断裂未接通、储备容量天花板把零死亡小镇判成余粮不足。
另做性能修复：graph.read({type}) 改惰性只读视图 + 语义记忆不落图，套件 74→63 分钟。

新增可复用工具与锁：bin/emergence-audit.mjs（涌现审查，含跨种子 L1 与同处境分叉率）；
test 新增记忆接线 A/B 对照锁、家族特质端到端锁、发帖正文质量锁。

报告：reports/result-report.md、reports/emergence-review.md、
reports/emergence-decision-bandwidth-repair.md。
- [2026-09-26 23:17] [工作记录] tick 已拆分为可节流的阶段序列（tickSequence），批处理行为逐字段不变 — 结论：一次 tick 已拆成可分别节流的阶段序列，批处理路径行为与拆分前逐字段一致（已实测）。

做了什么：
1. src/runtime/orchestrator/loop.js：新增 `export async function* tickSequence(config)`，把原 step() 的
   阶段体整体搬进生成器，在副作用边界处 yield 一个进度单元 `unit(id, detail, value)`。
   `step()` 改为薄包装：`for await (const u of tickSequence(config)) last = u; return last.value`。
2. 逐居民 yield：decide 与 dispatch 两个循环各自每处理一个居民 yield 一次
   （50 人时这两个阶段各产生 50 个单元），因此最贵的两段不再整块阻塞观察者。
3. src/runtime/orchestrator/_stage2.js：新增 `export function* tickSequence()`，11 个子系统
   （procreation / similarityBonding / market / industry / fiscal / crafting / shelter /
    residence / health / platform / community）成为 11 个独立单元；`tick()` 改为消费该序列。
4. src/runtime/orchestrator/_stage3.js：同样新增 `export async function* tickSequence()`，5 个子系统
   （politics / culture / psyche / tech / civilization）。
5. 阶段 id 命名：原子阶段用裸 id（regen/survival/perceive/decide/dispatch/lifecycle/snapshot），
   阶段2 用 `phase2:market` 形式，阶段3 用 `phase3:tech` 形式，末尾统一 `done`。

实测结果（50 人 / seed 1 / phase2+phase3 开启）：
  一次完整 tick 的单元数约 120+（decide ≈ 50、dispatch ≈ 50、phase2 = 11、phase3 = 5、其余各 1）。
  `run({agentCount:12,ticks:20,seed:'1',phase2:true})` 的 steps/world/social/phase2/chronicle
  序列化哈希与改造前逐字节一致（已用 git stash 做过前后对照，diff 为空）。

适用范围与否定条件：
- 这是**纯重构 + 新增可观测点**，不是语义变更：阶段顺序、RNG 消耗顺序、返回结构全部保持不变。
  凡改动 tickSequence 的顺序，等同于改动 step() 的顺序，两者只允许有一份定义。
- 生成器如果被中途放弃（不消费到底），tick 会停在中途、世界处于半推进状态；
  因此节拍器必须跑完当前 tick 再停，不能直接丢弃迭代器。
- `step()` 的返回靠生成器末尾 `return summary` + `yield unit('done', null, summary)`；
  只改 yield 而忘记 return，会让 step() 返回 {}（本轮踩过一次，行为哈希立刻报警）。

回归验证：integration2（4/4）、smoke.p2（3/3）、observer（8/8）、agent-schedule-role（10/10）通过。
- [2026-09-26 23:43] [工作记录] 阶段耗时实测：dispatch 占 66%，不是 decide 的等量伙伴 — 实测 50 人 / seed 1 / phase2+phase3 开启（人口涨到约 61）：
PER_TICK_MS=207.5  UNITS_PER_TICK=145
  dispatch  137.5ms  66.3%  61.5 单元
  phase2     40.9ms  19.7%  11   单元
  decide     21.2ms  10.2%  61.5 单元
  phase3      4.4ms   2.1%  5    单元
  其余 5 段   3.6ms   1.7%  5    单元

结论：dispatch 占三分之二，而非此前假设的「decide/dispatch 各约三分之一」。
含义：节拍器若按单元均分 37.5 秒，dispatch 的每个单元只有 0.6 秒等待、
而它实际只需 2.2 毫秒 —— 预算分配必须按阶段耗时占比，不能按单元数均分。
- [2026-09-27 00:04] [工作记录] work 分支 O(企业数²) 全量查询已改掉，但效果尚未验证 — 已落盘但尚未拿到验证结果：把 work 分支的全量查询提到 find 之外。

改动：src/runtime/orchestrator/_stage2.js 的 performAgentAction('work')，
原写法把 business.list()（= store.listBusinesses().map(n => n.data)，全量物化全部企业节点）
放进 businessIds.find() 的谓词内，构成 O(企业数²) 次全量读取；
改为循环外只物化一次 allBiz = economy.industry.business.list()，谓词内改用 allBiz.find(...)。
锚点唯一（count=1），node --check 通过。语义不变：仍取第一个「status=active 且 labour.staff(id) 雇用了本人」的企业。

验证状态：已启动 tmp-phasecost3.mjs（50人/seed1/phase2+phase3，10 tick 分阶段计时），
截至本轮结束尚未读回结果。**因此「dispatch 占比已下降」尚未被证实，不得当作已完成。**

下一步必须做：
1. 读 /tmp/phasecost3.log，对照修复前基线（PER_TICK_MS=207.5、dispatch 137.5ms/66.3%、
   phase2 40.9/19.7%、decide 21.2/10.2%、phase3 4.4/2.1%），确认 dispatch 占比显著下降；
2. 同时确认行为等价：run({agentCount:12,ticks:20,seed:'1',phase2:true}) 的输出哈希，
   以及 50人x30tick 的行动分布（基线 eat=329 drink=310 forage=300 work=237 rest=209 craft=101
   socialize=69 court=67 found=66 build=45 accept=40 write=23 trade=4）未发生非预期变化；
3. 该位置会消耗 rng（forage 带木材那条路径不在此分支，但 work 分支本身不消耗 rng），
   若行动分布有变，需判断是否因 seek 顺序改变而非随机流改变。

注意：此处只减少重复读取，不改变选择结果；若哈希变化，优先怀疑别处而非本改动。
- [2026-09-27 01:18] [工作记录] 全面修复团队已获批并进入基线任务 — 团队 linyi-deepseek-repair 已获批运行，6 名成员统一路由 a6api/deepseek-v4.1-flash，17 个任务、32 条依赖。当前只有 t1 基线审计已 claimed，尚未提交正式报告；Captain 已要求成员补交可核验结果，后续任务按 DAG 依赖等待。不得把团队获批或任务规划写成修复已完成。
- [2026-09-27 01:29] [工作记录] 基线任务由 Captain 接管完成，确认针对性通过但全量测试未闭合 — baseline-auditor 因连续两次 PI_AI_ERROR 未能完成 t1，Captain 接管并完成：HEAD=034144e；工作区非干净；runtime/API/flow-index 针对性测试 27/27 通过（约398ms）；此前全量 npm test 超过300秒且无最终退出码，不能宣称全量通过，性能与测试分层仍是开放问题。t1 已完成并解除后续 DAG 阻塞。
- [2026-09-27 02:11] [工作记录] t2 运行时一致性修复完成，经济闭环超时转入t7 — runtime-engineer 的 t2 attempt2 已完成：start 幂等、paused step 409、并发 step 互斥、tick committed/inFlight/stageFailure 状态、阶段失败事件、phase2/phase3 边界重读 registry、全阶段后置 world snapshot；新增7条回归测试，目标56/56及外围测试通过，flow-index error 0。economy-closure.test.js 在未修改基线同样超时（EXIT=124），不归因于t2，转入t7性能与测试分层。t3/t4/t7已领取。
- [2026-09-27 02:35] [工作记录] t7 完成测试分层并确认长跑增长风险 — t7 attempt2 完成：逐文件复现确认全量 npm test 超时主要是算力预算，不是死锁；fast 268用例约3.8s、integration 53/53约1.7s，新增分层脚本与阶段计时工具。50人×200 phase2+3约45s/225ms每tick，phase2 industry约50.57%；图节点+569.2/tick（R²=1），RSS约+3.30MB/tick，外推长跑风险显著，C04日志/图节点/记忆上限是前置条件。发现 flow-index.json 漏掉 infra.rng.genState，已另建 t18 修复，不将该派生产物问题归因于源码。
- [2026-09-27 02:45] [工作记录] t3 已进入版本化存档实现但尚未完成 — persistence-engineer 的 t3 attempt2 当前仍为 in_progress，已开始盘点并实现 clock/RNG/identity/registry/graph/worldState/模块Map/配置/队列/语义记忆/运行阶段的版本化快照恢复，并修正 memoryPersist 语义；尚无最终报告、验收结果或可宣称完成的证据。
- [2026-09-27 02:53] [工作记录] t4 最后一次重试仍在执行中 — decision-engineer 的 t4 attempt3 当前仍为 in_progress，已进入执行结果记账、关联ID、记忆回写和回归测试阶段；尚未提交正式完成报告、验收结果或 changedPaths 证据，不能视为决策闭环已完成。
- [2026-09-27 08:54] [工作记录] t4 决策后果闭环完成并通过回归 — t4 attempt3 已完成：新增统一 action contract、execution outcome、bounded outcome model；decision/action 日志通过 decisionId 串联，显式区分 applied/started/planned/noop/failed，成本收益写入情景与语义记忆，结果学习有32样本/键、4096键LRU、200 tick半衰期、偏置≤0.3。决策闭环12/12、核心外围197/197、50×200存活守卫15/15、flow-index 6/6通过。限制：默认schedule/model覆盖0次；simulator尚未读取forage池余量，预测与执行仍有一处不对账。
- [2026-09-27 09:23] [工作记录] t16完成但发现phase2回归与flow生成器缺陷，已拆分t19/t20修复 — t16 attempt2完成：观测API、阶段流、真实状态字段、SSE、保存恢复端点及84/84定向测试、fast 268/268通过。收口发现3条phase2生育/建造集成失败，因果归因指向t2/t4 loop/crafting改动，已建t19由runtime-engineer修复且不得回退t2/t4；同时发现flow-to-normify按40批次和from_api截断缺陷，已建t20由verification-engineer在临时目录修复验证。flow生成脚本曾破坏性清空正式目录但已恢复，后续必须先临时目录试跑。
- [2026-09-27 09:29] [工作记录] t19确认phase2回归是候选契约静默吞错，已建t21可观测性修复 — t19完成且当前phase2测试已恢复：integration2 5/5、smoke.p2 3/3、相关批量67/67与34/34、验收48/48。根因精确定位为 candidates.js 捕获 preconditionOf 契约异常并当作ok:false，静默清空动态行动；t19只加了回归护栏未改src。已建t21由decision-engineer修复静默吞错，区分合法ok:false与契约异常并记录可观测诊断，要求不回退t2/t4。
- [2026-09-27 09:31] [工作记录] t11统一动作契约完成并修复四类决策执行不一致 — t11完成：14个动作统一到action-contract，候选/执行前置条件逐字一致；write空转从88%降为0，争用预留使采集空转降至3.8%/5.7%/4.9%并与doomedButChosen完全对账，日程不可行覆盖显式回落，未知效用通过utilityScope显式表达而不当零。action-contract 13/13、decision-closure 12/12及多组回归通过；顺序偏置仍存在，且部分效用维度未建模。
- [2026-09-27 09:50] [工作记录] t3持久化完成，t20重试进入实现但需补正式证据 — t3已完成持久化语义与完整运行存档；t20 attempt2 已进入 flow-to-normify 原子换入、父子排序和API锚点单一真源实现，但成员一度ready且尚未提交正式changedPaths/临时目录/validate-build-render证据，已唤醒要求补交。t5/t8/t12正在推进，后续任务按依赖等待。
- [2026-09-27 09:51] [工作记录] t3完成跨进程可恢复存档并修复五项恢复缺陷 — t3 attempt2完成：memoryPersist两处语义修正，runtime state/persistence覆盖37个section；persistence 15/15，快速+集成440/440，跨进程恢复后续3 tick与连续6 tick逐位一致（时间戳规范化除外），flow/normify验证通过。修复ensureFresh索引重建、mulberry32 onAdvance、backpack Map、research Set/数组、outcome-model学习证据入档。其改动追加到t4的outcome-model.js末尾，需与后续t12/t21协调；自动保存/轮转仍属t8/t9，全量npm test不宣称通过。
- [2026-09-27 09:51] [工作记录] t3跨进程存档完成并发现共享文件协调要求 — t3已验证跨进程恢复等价（连续6 tick与恢复后3 tick逐位一致，时间戳除外），并修复memoryPersist两处极性、索引重建、RNG进度、Map/Set恢复和outcome-model证据入档。自动保存/轮转仍未实现，归t8/t9；outcome-model.js有追加式共享改动，后续t12/t21需避免覆盖。
- [2026-09-27 13:28] [工作记录] t12目标与多步计划完成，验证了适应收益与建筑权衡 — t12 attempt2完成：目标模板、前置条件、动作序列、时间预算、实际后果重规划和中断恢复已接线；goal-planning 17/17，核心13文件138/138，三种子存活ON/OFF均64/64一致。craft提升47/58/54%、trade提升114/93/110%，build下降约80%（9/17/9 vs 51/57/55）被如实保留为目标权重/产品权衡，不默认视为缺陷；hot-log证据完整性仍由t9处理。
- [2026-09-27 14:57] [工作记录] t9完成审计日志全量语义，t8发现观测路由需核验，t5确认代际断裂 — 当前t9 attempt4已完成核心重构：审计日志不删记录而压缩载荷，list()实测5000/5000，evicted=0，压缩比22.7x，待最终回归证据。t8 attempt4节拍器18/18通过，但发现observer.js可能只注册2个t16端点，已要求核对HTTP路由，不直接回退t16。t5确认文明重启无隔离/下一代且genesis生产路径未调用，正在修复。t21因超时失败后已重试attempt2。
- [2026-09-27 18:22] [工作记录] t21完成契约异常可观测性，t5代际交接通过，t9发现压缩丢失审计字段 — t21 attempt3完成并通过54/54：修复候选门与action-contract内外两层静默吞错，合法ok:false与契约faults可区分，诊断去重有界。t5 attempt4已验证代际交接：旧世代封存、新世代经genesis.agentFactory真实创建，相关phase3/社会/政治/文化/心理/科技/genesis套件92/92，仍补外围验证。t9发现compact会从action-log剥离outcome，2400条中1128条受影响，已要求修复并补审计测试。
- [2026-09-27 18:32] [工作记录] t9修复审计日志保真与压缩性能，但暴露跨进程状态注册缺口 — t9核心修复已验证：审计日志默认全量保留，list() 5000/5000，压缩显式opt-in且保留outcome/审计字段；retention 17/17、action-contract审计2/2，压缩性能由约280s降至0.7s。未覆盖并需后续处理：goals/contention/action-contract/execution-outcome/stage-progress未注册到state，跨进程恢复仍会行为分叉；另有t8可能覆盖paused step 409契约。
- [2026-09-27 18:45] [工作记录] t8最终验收确认暂停与观测HTTP契约恢复 — runtime-engineer在当前工作区补充取证：paused step直接调用与真实HTTP均409，start恢复后可推进，并发step409；api/runtime/observer三文件49/49，observer HTTP契约21/21，t8节拍器20/20。此前t9报告的paused失败落在t8误回退文件的瞬时窗口，已过期，不应据此修改control.js。observer.js为按21条外部契约重建，行为等价有测试证据但无法证明字节级无损。
- [2026-09-27 18:47] [工作记录] t8最终证据纠正t9过期失败结论 — t8当前工作区最终验收：节拍器20/20；api/runtime/observer联测49/49；observer HTTP契约21/21；paused step与并发step真实HTTP均409，start恢复可推进。t9先前看到的control失败来自t8误回退文件的瞬时窗口，已恢复且不应再据此修改control.js。observer.js按21条外部契约重建，行为等价有测试证据，但无字节级原文件证明。
- [2026-09-27 18:56] [工作记录] t10已用真实分支重演替代哈希伪因果分数 — t10 attempt2完成：删除哈希project伪因果分数，compare改为从同一存档分叉真实执行基线与单动作干预，隔离RNG流位置并验证原世界指纹不变/selfCheck确定性；同时修复干预标记白名单、tick校准、选项形状兼容及reset清理。experiment+decision/observer/timeline/API/runtime/flow-index共84/84通过。旧compare同步API不再兼容；跨进程存档等价失败与t10无关，仍待state注册修复。
- [2026-09-27 18:58] [工作记录] t10真实反事实分支重演完成并通过84项验证 — t10 attempt2完成：移除哈希project伪因果分数，compare从同一提交边界快照分叉基线/单动作干预真实执行，验证RNG流位置隔离、原世界指纹不变、重演确定性和跨居民耦合分歧；修复白名单、tick校准、选项形状与reset清理。experiment/decision/observer/timeline/API/runtime/flow-index共84/84通过。旧同步API不再兼容；跨进程等价问题仍属目标/争用状态存档缺口。
- [2026-09-27 19:07] [工作记录] t9更正为全量通过并新增smoke.p3反事实锚点修复 — t9更正证据：retention17/17、action-contract2/2、api/runtime/observer36/36，persistence跨进程15/15已通过；此前paused-409与跨进程失败均为过期中间态或已由t11/t12补齐。新发现全量日志暴露smoke.p3使用最旧决策作反事实锚点的latent bug，已建t24要求使用pivotTickFor/提交边界锚点，保持t10反事实契约。
- [2026-09-27 19:14] [工作记录] t22目标状态已入档并以因果对照验证恢复必要性 — t22完成：goals的plans/cooldown/stats新增whole-replacement __snapshot/__restore并注册runtime/state.js。保存后清空再恢复逐字段一致，跨进程等价测试与goal-planning恢复测试均通过；注释注册项时两者同时失败，证明该注册是必要条件。验收35/35、更宽回归109/109。t23继续处理contention账本，其余状态需按是否有可变状态分别判断。
- [2026-09-27 19:16] [工作记录] t22完成目标状态快照，t23继续处理争用账本 — t22已验证goals plans/cooldown/stats whole-replacement存档与跨进程恢复等价（35/35、109/109）；通过移除state注册的因果对照证明恢复必要性。t23正在处理contention pools状态，其余action-contract/execution-outcome/stage-progress需按实际可变状态与既有markRestored契约判断，不默认全部入档。
- [2026-09-27 19:24] [工作记录] t23 contention预支账本已入档并验证恢复边界 — t23完成：contention pools快照注册state.js，保存/恢复保留tick/opened/capacity/reserved；投毒与中间态测试、因果移除注册项实验、跨进程persistence共31/31及更宽101/101通过。实测contention当前每tick派生但提交边界会有部分reserved，入档避免正确性依赖恢复时open先执行。action-contract/execution-outcome无模块级可变状态，不需入档；stage-progress有recent/current/backgroundDriver未入档，已另建t25明确恢复契约。
- [2026-09-27 19:32] [工作记录] t25明确阶段进度恢复边界并通过多层验证 — t25完成并接受必要的loop.js单行越界修复：stage-progress恢复backgroundDriver事实，recent/currentTick按t16契约清空；state注册并重建flow-index。边界22/22、persistence+metronome+api-observer65/65（连续两次）、外围55/55、flow-index6/6 error0通过。t16观测不伪装后台契约保持；全量npm test仍未宣称。
- [2026-09-27 19:33] [工作记录] t5完成文明代际交接与真实genesis创建闭环 — t5 attempt4完成：修复文明重启reset恒null、genesis生产入口零调用、封存旧研究负责人继续行动、世代状态不入档四项断裂；旧世代隔离并封存，新世代由agentFactory.template真实创建并重建职业/日程/角色，研究改派，generation状态入档。social-civilization-wiring 7/7，相关phase3/社会/政治/文化/心理/科技/genesis 92/92，最终批次162/162；新旧世代行为谱有实测差异。遗产注入留给t14，默认自然崩溃未触发需显式collapse注入。
- [2026-09-27 20:47] [工作记录] t13双向社会互动完成并确认t6阻塞待分批修复 — t13完成：社会互动支持请求/接受/拒绝/承诺/真实履约/违约/信任与机器可核实事实，新增interaction/facts模块并接入决策及存档；测试10/10及多组回归通过。契约确认只有接收方接受后才建立friendship边，默认拒绝率偏高保留为可配置产品决策。t6对抗验收仍失败：F1 socialize被pending court饿死、F4拒绝原因漂移已由t26处理；当前工程师正执行t14，随后再处理t26；t27解决跨规模恢复分叉。
- [2026-09-27 21:09] [工作记录] t27证明跨规模恢复等价并确认目标规划退化来自求偶受挤占 — t27完成：将stageProgress.dropped.recent进程本地观测元数据与craftJobs.startedAt墙钟字段按语义排除后，4/6/10/20人口×seed7/11/42共12组跨进程恢复逐tick行为/资源等价，persistence 25/25。t28诊断显示目标规划ON的出生下降而非死亡增加；goalWeight=0与OFF一致，0.05也有影响，不能全局降权。选择性让位求偶链方向待t26解除依赖后实现验证。t14仍在进行，已催交以解锁t26/t28。
- [2026-09-27 21:22] [工作记录] t14建立有来源且可失真的遗产继承链 — t14完成：新增relic artifact/discover与legacy skill/preference/trace链，旧文明遗物可有来源、被误读/丢弃，交接注入下一代技能/研究前提/有界偏好，常态有界考古且能力可失传。test/legacy-inheritance 17/17；同条件偏好干预得分差精确0.4，遗产开关对照动作分布分叉；回归148/148和127/127、flow-index error0。明确未接线：stonework craftBonus尚不参与评分；genesis.renewal.replace传heritage被execute忽略但主循环不走该路径。已报告loop内存snapshot不恢复时钟，需独立与持久化快照语义核对。
- [2026-09-27 21:24] [工作记录] t14遗产继承闭环完成并记录未接线边界 — t14新增有来源、可误读/丢弃的relic与技能/研究前提/有界偏好继承，支持考古与失传；17/17定向、148/148及127/127回归通过，机制级偏好得分差0.4。同条件遗产开关改变动作分布。stonework craftBonus尚未接入评分；genesis.renewal.replace的heritage参数被execute忽略但当前主循环不走该路径。另待核对loop内存快照是否影响t10反事实：t14报告__restore不还原时钟，已请求runtime工程师验证可达影响。
- [2026-09-27 23:11] [工作记录] t26部分完成F1/F4但保留为failed并拆出两类回归 — t26未通过全部验收，正式状态failed(partial)，但F1三层社交饥饿与F4拒绝原因漂移已修复：公平响应目标、目标让位、自适应声誉门槛、沉默超时拒绝，旧原因统一为no_pending_interaction；seed42互动由0接受/0边变为1接受/1边，60tick为7接受/8边。未通过项：smoke.p2写书/企业启动失败已证明与t26无关；自适应门槛使decision-closure消融由21/24变21/25，需t28处理且不能简单关闭门槛。t28暂受失败依赖和共享路径冲突阻塞。
- [2026-09-27 23:54] [工作记录] 首次整理提交LinYi修复与派生证据 — 已将当前已落地的runtime/decision/social/persistence修复、测试、Normify派生物、flow-index、报告与PROJECT_MEMORY提交到Git commit d58db4e；排除了.agent-teams运行日志和tmp scratch。提交不等于整体验收完成：t6仍未最终通过，t26为partial，t28/t29仍待后续收口，未宣称全量测试通过。
- [2026-09-27 23:57] [工作记录] t26最终收口为failed partial并锁定F1/F4 — t26 attempt2正式failed(partial)：F1三层修复与F4原因统一已锁定并验证（social-interaction15/15，persona-lifecycle+action-contract23/23，12人20tick产生accepted与互惠边）；smoke.p2写书断言由字节还原、量级和完稿时机三证据确认是范围外既有缺陷；组合测试另有共享状态隔离问题，未归因t26。t28仍被AgentTeams原依赖图阻止领取，后续需先修依赖调度再启动目标规划求偶让位修复。
- [2026-09-28 00:27] [工作记录] opena6对抗验收needs_revision而非通过 — opena6/gpt-6-astra重启t6验收已完成取证但判定needs_revision：fast274/274、model17/17、perf15/15、persistence25/25、社会文明7/7、实验16/16、flow-index6/6通过；integration209/211，结果学习/目标规划导致出生21 vs25，phase2缺write_book action-log；smoke:p3 CLI仍读旧字段，long层超时，Normify有hot-log reset warning。验收期间live重写Normify派生物，不能与初始快照混称。已要求成员正式提交failed终态与结构化finding，未宣称整体通过。
- [2026-09-28 01:23] [工作记录] 中断后重构任务图并建立t30到t31串行链 — 手动中断后团队可恢复：旧t28/t29取消以释放共享范围，t26保留不可变failed(partial)；新增t30修复目标规划出生回归（不依赖t26，保留结果学习与craft/trade，至少3 seeds），新增t31依赖t30处理smoke.p3现行字段、smoke.p2 write_book可达链和缺clock存档API拒绝。已确认t31保持pending，不越过t30领取或改代码。
- [2026-09-28 01:34] [工作记录] 停止Team模式并形成新会话调试交接 — 已归档linyi-deepseek-repair并停止Team模式；t30正式failed且未改代码，seed3/5/11的20人60tick分别birth19/19/16、craft109/101/101、trade183/190/194、deaths均0，唯一失败为decision-closure结果学习消融21 vs25。已形成新会话调试交接：先逐tick定位结果学习出生链第一处分叉，再修smoke.p3 CLI旧字段、smoke.p2 write_book可达链、hot-log reset warning和long超时；每项先最小复现、再生产修复、再定向测试，最后冻结快照验收。
- [2026-09-28 01:43] [工作记录] 当前仓库提交并推送远程仓库 — 已将当前工作树的源码、Normify派生物、PROJECT_MEMORY与已跟踪的AgentTeams状态提交为 177bfc5、16f3c7d，并推送到新建的公开远程仓库 https://github.com/HeDaas-Code/LinYi；master 已跟踪 origin/master。AgentTeams运行日志和tmp等被.gitignore排除，未纳入提交。
- [2026-09-28 01:59] [工作记录] 定位结果学习回归首处分叉并修复 smoke.p3 CLI — 已用 seed=11、12 agents、60 ticks、phase2=true 重现：outcomeLearningWeight=0.3 时 births=9/alive=21，weight=0 时 births=13/alive=25；两侧死亡均为0。对照决策日志定位首处分叉在 tick 7、agent_000000000003：学习开启选 forage，关闭时选 craft；该居民正处于 craft_and_sell 目标的 craft 步骤，前一动作序列和同 tick 多数动作仍一致。该定位证明目标步骤被不同打分排序替换，但尚不足以证明可安全修复的因果根因。尝试性偏置保护没有通过回归，已撤回，未保留生产源码变更。另已修复 bin/smoke.p3.js 使用过时同步 compare/旧评分字段的问题，改为 await compare、anchorPivotFor 及当前结果字段；node bin/smoke.p3.js --ticks 2 --agents 2 --seed 7 成功，test/smoke.p3.test.js 4/4 通过。下一步继续定位结果学习导致的出生差异并做最小因果修复；不得只依据单个首处分叉就直接调权重或改变决策规则。
- [2026-09-28 02:14] [工作记录] 结果学习回归与写书链路继续处于未收口状态 — 本轮确认：结果学习回归首处分叉仍为 seed=11、12人、tick=7、agent_000000000003 的 forage/craft 选择差异；尝试的延迟目标保护修复未通过既有回归，已撤回，不能作为完成修复。当前快速层 274/274、smoke.p3 4/4 通过；smoke.p2 的 write_book action-log 仍失败，且 2人60tick 的生育回归在该尝试下失败。进一步对照显示默认 goalPlanningEnabled=true 时 seed42、4人、30tick 没有 write_book，而关闭目标规划时有2次，但该相关性尚不足以确定安全修复。下一步必须拆分目标规划对写作与生育链的影响，先建立最小复现并验证候选修复，不能放宽断言、关闭结果学习或把部分通过当作最终验收。
- [2026-09-28 02:17] [工作记录] 已提交完整重构PR替换旧仓库 — GitHub 网络恢复后，已从旧远端 main 创建 refactor/complete-project-rewrite 分支，用当前 LinYi 项目完整替换旧仓库内容，清理未跟踪的依赖、模型、benchmark、临时文件和 AgentTeams运行日志后推送；已创建公开 PR #36（base=main，状态 OPEN）：https://github.com/HeDaas-Code/LinYi/pull/36。
- [2026-09-28 02:31] [工作记录] 重建GitHub仓库并发布当前项目 — 旧远端仓库删除后，已重新创建公开仓库 https://github.com/HeDaas-Code/LinYi，将当前项目推送为远程 main；本地分支已改名为 main 并跟踪 origin/main，当前提交为 57cad8d，工作区已确认干净。
- [2026-09-28 02:34] [工作记录] 组合验收通过但结果学习与写书回归仍未收口 — 本轮在 master 分支完成组合复核：hot-log、smoke.p3、integration2 生育与反事实相关测试共 9/9 通过；源码实验均已撤回，当前除 PROJECT_MEMORY.md 外无功能源码修改。结果学习回归仍为 seed=11、12人、60tick 下开启 alive=21、关闭 alive=25；尝试在非危机时抑制生存动作正向结果偏置未改变失败，已撤回。smoke.p2 仍缺 write_book action-log。后续继续从完整评分链与事件时序定位，不能以组合测试通过替代整体验收。

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
- [2026-09-23 00:32] [经验教训] a6api（grok-4.6）真实模型接入的实测约束 — 实测约束（base 为 https://api.a6api.com/v1，key 存环境变量 A6API_KEY，不入库不打印）：①grok-4.6 是推理模型，默认 completion_tokens 达 122–220 且几乎全是 reasoning_tokens，必须传 reasoning_effort="minimal" 才降到 1 左右；②单次调用墙钟约 6–9 秒，6 并发墙钟约 23 秒，上游排队导致并发收益很低，真实模型只适合小场景（如 4 居民×30 tick），大场景用 stub；③/chat/completions 可用，/embeddings 返回 403 model_not_allowed，/models 仅 5 个 chat 模型无 embedding，因此 embed 必须继续用 stub 适配器；④deepseek-v4-flash 等模型返回 503 smart_route_no_active_candidates，不可用。
- [2026-09-23 01:01] [经验教训] 并行任务占用同一文件路径会静默覆盖他人交付 — 本次 t25 与 t26 并行时，双方都新增/占用了 bin/bench.js：t26 先落地 AI 延迟基准脚本，t25 随后按自己规格整体重写为沙盘基准脚本，t26 的交付被静默覆盖（测试全绿也不报警）。教训：跨任务共享的脚本入口/文件名必须在任务描述里预先分配（或在 create_task 的 deliverables 中声明），captain 收到两个任务都提及同一路径时要提前协调；覆盖发生后可从 git 历史恢复为并列文件名（本次恢复为 bin/bench.ai.js）。
- [2026-09-23 01:01] [经验教训] 崩溃判定疑似把需求压力误判为文明崩溃（待 t28 判定） — 实测信号（小规模试跑 bin/bench.js --ticks 20 --agents 5 --seeds 1 --phase2 --phase3）：collapses=1/restarts=1 在 20 tick 内发生，但同轮 survivalRate=1.0、人口 5→7、food/water 仍在 100 上下。代码位置 src/runtime/orchestrator/_stage3.js runCivilization：crisisLevel=avgPressure(agents)，detector 阈值 score>=0.6、crisis>=0.8；需求每 tick +0.08 使压力自然爬升，可能触发误判。结论：当前 collapseRate 不是有效指标，需在 t27 报告里记录首次崩溃 tick/触发原因/当时人口资源压力，再由 t28 判断是阈值问题还是压力模型问题。注意 collapseForce=true 仅用于测试/冒烟强制触发，不是真实路径。
- [2026-09-23 09:47] [经验教训] 沙盘基准的性能实测与可用规模上限 — 实测（stub provider，bin/bench.js --phase2 --phase3）：50 居民×100 tick×1 种子 ≈160 秒（cpu 115%），推算 2000 tick ≈53 分钟/种子，因此原定 50×2000×10 的基线不可行（t27 因此 TIMEOUT，已重试并缩规模）。可用规格：单种子基线 50 居民×200 tick（≈5 分钟）；跨种子离散度 10 居民×200 tick×5 种子（≈3 分钟）；真实模型 3 居民×10 tick + --real-every 抽样 + 150 次调用硬上限。任何基准运行都应套外层 timeout 并先做小规模计时。
- [2026-09-23 09:47] [经验教训] 资源归零但全员存活的异常（待 t27/t28 解释） — 实测信号（50 居民×100 tick×1 种子，stub，phase2+phase3）：tick1 food=59（50 人初始 50）、tick2 water=49.91，tick5 起 food 与 water 双双为 0 并持续到 tick100；与此同时 finalPopulation=52、survivalRate=1.0、collapses=1、restarts=1。待解释：资源归零后每 tick 靠什么补充（forage/生产/供给事件）而无人饿死，以及崩溃判定与实际状态不一致的原因。需先量化再调参，否则 t28 会盲调。
- [2026-09-23 10:05] [经验教训] 种子未生效：基准的跨种子离散度是假的 — 实测 bin/bench.js --seeds 1,2,3（8 居民×30tick，phase2+phase3）：三个种子 logs 725/726/724、born=2、trades=30、crafted=3、breakdowns=1 完全一致；t27 的 10 种子大基线整表也完全相同。结论：seed 未真正驱动模拟随机源（疑似 bin/bench.js 未把 seed 传入 loop.run，或 loop/step 未用 infra.rng.seed 初始化，或子系统内仍有 Math.random）。修复前任何“跨种子统计/离散度”都无意义；验收证据必须是同规模下 3 个种子产生结构性差异（born/trades/collapse tick 至少一项不同）。
- [2026-09-23 10:05] [经验教训] 沙盘缺失死亡机制与 scarcity 归一化错误（存活指标不成立） — 两个已定位的模型缺陷：①无死亡判定——资源 tick3 起 food/water 恒 0，但 survivalRate 恒 1.0、人口 50→52；根因是 consume 夹 [0,stockpile] + eat/drink 无条件降需求（空转满足），补给只有 forage(+2 food) 与 supply_drop 事件。②scarcity 归一化错误——scarcity = 1 - stockpile/capacity，初始 stockpile=100、capacity=500 使初始 scarcity=0.80，喝一口水即撞 0.90 阈值，崩溃判定落在 tick1-2（critical 项为 scarcity，非 crisis/extinction），因此“崩溃率 100%”是算术 bug 而非设计问题。两者修好前，存活时长与崩溃率都无区分度。
- [2026-09-23 10:05] [经验教训] 观察者日志 O(t²) 性能瓶颈（已修复，t31） — 已修复（t31，commit e023d79，279/279）。原问题：每 tick 成本随时间增长，50 居民 100 tick≈160s、200 tick≈645s，推算 2000 tick≈18h/种子，使长期基线不可行。根因 4 处：graph.read({type}) 全量扫描、episodic.list 全量克隆、recaller 全量排序且每记忆调用 Math.exp、trauma.events 数组每 tick 深拷贝。修法：byType 索引、byAgent 索引+_rawList、有界 top-K 线性插入+预计算 _recencyKey、事件移出 graph 节点改用独立 Map。效果：末段/首段每 tick 耗时比 5.07→1.13，RSS 343MB→194MB；语义（日志内容/顺序、list 排序、recall 排名）不变，新增 test/observer.perf.test.js。
- [2026-09-23 11:38] [经验教训] 难度只有开关没有档位：forage 无成本导致参数饱和（已修复，t32） — 已修复（t32，commit c7fe67d）。问题：forage 无条件 produce(forageYield=2) 到 food 与 water，无成本无世界上限，总补给随人口线性增长，导致 needGrowth 0.08/0.12/0.14 结果完全相同（存活 100%、日志 3718），0.16 突然全灭——难度只有开关没有档位。修复：新增 infra.config 的 foragePoolCapacity=30 / forageRegen=8，采集改为受世界采集池约束（take=min(forageYield, 池余量)，每 tick 再生封顶），补给总量与人口无关，人均补给=regen/人口。captain 独立复验（20 居民×200 tick×1 种子）：0.08 存活 100%、无崩溃、资源 93~100；0.14 食物 100→81→53→0、tick52 崩溃全员死亡。四档梯度成立，中间档 survivedTicks 跨种子有差异，默认 0.08 仍可长期存活。被否决方案：调低 forageYield（只平移断崖）、按人口折算（语义混乱）、加体力/工具成本（超出不引入新模块约束）、限制人口（违背 phase2 生育）。
- [2026-09-23 12:24] [经验教训] 多成员并行提交的 git 风险与结构指纹收尾责任 — 风险实证（本团队）：①有成员执行 git reset HEAD~1 导致另一成员暂存丢失（reflog 记录 e751ea6→reset；该成员事后重新提交 e023d79，未造成最终丢失）；②多人并行改代码后 normify_validate 出现 fingerprint-drift（t31/t32 改了 recaller/store/trauma/graph 但无人刷新结构指纹）。应对：给成员的任务指令中明确禁止 git reset / --amend 他人提交、要求只 git add 自己的文件；结构指纹刷新由 captain 收口更可靠——normify_module_refresh(ids=[...]) 后用 normify_validate 确认 0 error，再只提交结构目录文件（本次 db7c340）。
- [2026-09-23 12:42] [经验教训] t32 采集池在 50 人规模下开局必死（已修复，t33） — 已修复（t33，commit 80a2355，282/282）。问题：t32 引入的 foragePoolCapacity=30/forageRegen=8 为固定总量，人均补给=regen/人口，50 人时人均 0.16/tick 结构性不足，默认 needGrowth=0.08 下约 tick40 全灭，降到 0.06 仍全灭。修法：infra.config 新增 forageRegenPerCapita=0.15/foragePoolPerCapita=1.0，有效补给=基础值+人均×人口。captain 独立复验：50 居民×200 tick×3 种子×0.08 → 存活率 1.00、finalPop 52、0 崩溃（改前 0）；50 居民×2000 tick×1 种子 → 存活率 1.00、min survived 1998、无崩溃、211534 条日志、60.8 秒（avgTickMs 30）；20 居民回归全活（t32 结论未被推翻）；四档死亡 tick 中位 200/33~46/20/19 仍单调（梯度未被抹平）。被否决方案：纯线性人均缩放（人均恒定、完全抵消人口效应）、只抬高固定 forageRegen 8→16（20 居民梯度被抹平）。教训：参数化修复必须在多个人口规模上验收。
- [2026-09-23 12:42] [经验教训] chronicle 编译器 spread 栈溢出（已修复，t33） — 已修复（t33，commit 80a2355）。src/observer/chronicle/compiler.js 原用 Math.min(...ticks)/Math.max(...ticks)，V8 函数实参上限约 12.5 万，50 居民×2000 tick 累积 20 万+ 条日志后 compile 抛 RangeError；且 loop.js:516/529 的 snapshot() 每 tick 调用 compile，故任何统计路径在长跑后期必崩。修法：改单趟循环求 min/max。验证：20 万+ 条 compile 不抛错；50 居民×2000 tick 跑完 snapshot 可读（211534 条）。
- [2026-09-23 13:03] [经验教训] .gitignore 的 reports/ 规则会静默丢弃交付报告 — 本仓库 .gitignore 曾把 reports/ 整目录忽略（本意是忽略临时输出），结果 4 份正式交付报告（audit-tuning.md、bench-sweep.md、observer-perf-fix.md、bench.md）从未被 git 跟踪，干净检出即丢失，只有 t30 审计时才发现。修复：git add -f 强制加入（reports/ 现 10 个文件全部跟踪），保留 bench-out/ 忽略（每次重跑都会变的原始数据）。教训：忽略规则只应覆盖“每次运行都会重新生成”的目录；凡是审计/交付产物目录不要整目录忽略，或忽略后必须用 git ls-files 抽查确认交付物在版本控制内。
- [2026-09-23 13:11] [经验教训] bench 汇总文件与报告目录的纳管规则（已修复，a8d1f20） — 已修复。原问题：bin/bench.js 每次运行都覆盖 reports/bench.md，而 .gitignore 又整目录忽略 reports/，导致 4 份交付报告未被跟踪、且被引用为证据的汇总文件内容随时变化。修复（commit a8d1f20）：.gitignore 不再整目录忽略 reports/，改为仅忽略每次重跑都会覆盖的 3 个汇总文件（reports/bench.md、bench-baseline.md、bench-tuned.md）与 bench-out/；其余 8 份交付报告默认纳管（git ls-files reports/ 可验）。另一并发发现的同类问题已由 c153893 用 git add -f 补提交。教训：忽略规则只应覆盖“每次运行都会重新生成”的文件；引用数字作证据前必须确认其对应 commit——t30 抽查的 6154/tick13/68 属 t33 修复前的版本，修复后同命令复跑为 211534/无崩溃/1842，差异来自修复本身而非数据不可信（已在 DELIVERY.md §5.1 说明）。
- [2026-09-23 13:32] [经验教训] 本地嵌入在本机可跑：onnxruntime-node + MiniLM 已验证 — 用户要求为 embed 增加内嵌本地小嵌入模型推理支持，captain 已探路并验证（非计划，均已实测）：①npm 镜像可达，onnxruntime-node@1.20.1 本地安装成功（849MB，含 CUDA 二进制）；②模型可直连 HuggingFace 下载：sentence-transformers/all-MiniLM-L6-v2 的 onnx/model.onnx（90405214 字节，首字节 0x08 是合法 protobuf）与 tokenizer.json（466247 字节，WordPiece 词表 3091），已落盘 models/all-MiniLM-L6-v2/；③ONNX 会话加载成功，输入 input_ids/attention_mask/token_type_ids（int64），输出 last_hidden_state [1,T,384]；按 attention_mask 做 mean-pooling 后 L2 归一化，范数=1.0000，维度 384（stub 为 16）。约束：849MB 原生依赖与项目“零运行时依赖”冲突，故必须实现为可选 provider，默认仍 stub，依赖或模型缺失时自动回退，不得让主流程失败；models/ 与 node_modules/ 需 gitignore 并提供重新拉取命令。
- [2026-09-23 14:15] [经验教训] t34 的“真实模型验证”实为回退路径：依赖未装时的假阳性 — t34（commit 2f8d480）报告称已用真实 MiniLM 验证（384 维、norm=1.000000），但 captain 独立复验证伪：项目内并未安装 onnxruntime-node（只在 /tmp/orttest 试点里装过），实际调用返回 fallback="本地嵌入回退 stub：Cannot find package 'onnxruntime-node'"，向量范数 11.12（非单位向量），dim=384 是因为维度取自模型目录配置而非真实推理输出。教训：当实现同时具备“真实路径”与“回退路径”时，验收必须断言 fallback 为空/未触发，否则测试全绿可能只覆盖了回退分支。t34 实现本身合格（onnxruntime-node 在 optionalDependencies、回退带原因、models/ 已 gitignore），缺陷仅在验收环节；需补真实端到端验证（依赖装进项目后确认 fallback 为空）后方可宣称可用。
- [2026-09-23 18:17] [经验教训] MiniLM 英文模型对中文沙盘无实用价值：默认保持 stub 哈希嵌入 — t36 对照实验（commit 5ecd0a6，16 查询/78 候选，中文短句语义真值）结论为“不值得”，captain 已在项目内用真实模型独立复现：local provider 返回 fallback=null、dim=384、norm=1.000000（确为真实 MiniLM 推理），但 sim(我饿了,食物储备见底)=0.5041 与 sim(我饿了,今天天气不错)=0.4970 差异仅 0.007，几乎无区分度。指标对照：top-3 命中 local 6.3% vs stub 18.8%；平均排名 35.1 vs 28.5；正负间隙 -0.12（干扰项余弦 0.703 > 正确项 0.581）。根因：all-MiniLM-L6-v2 以英文为主，中文按字符切分后 mean-pooling，相似度被字面字符重叠主导（「我渴了」与「我饿了」余弦≈1.0）。成本：local 冷启 131ms、p50 1.5ms/条、1000 条 2.6s、RSS +180MB；stub 亚毫秒、356k 条/s、+54MB。结论：本地嵌入通路已打通但对本沙盘无实用价值，默认档位保持 stub；若要中文语义需换 bge-small-zh / m3e 等中文句向量模型再评估。
- [2026-09-23 18:17] [经验教训] onnxruntime-node 安装技巧与本地验证方法 — ①安装 onnxruntime-node 时可用 --onnxruntime-node-install-cuda=skip 跳过 CUDA 二进制下载，显著减小默认 849MB 的体积（本机为 CPU 推理，无需 CUDA）。②验证“本地嵌入是否真的在跑真实模型”的唯一可靠方法是断言 provider 返回的 fallback 为空且向量范数为 1：t34 曾报告 norm=1.000000 但项目内实际未装依赖，真实返回值是 fallback 非空、dim=384（维度取自配置）、norm=11.12——只有检查 fallback 才能分辨真假。③项目内安装依赖后 captain 复现：provider local、dim 384、fallback null、norm 1.000000。
- [2026-09-23 20:06] [经验教训] 任务描述里的参数建议会撞上既有测试契约 — t38 失败后 captain 实测定位：captain 在任务描述里建议能源 defaultStockpile=60（“能源比食物更稀缺”），但既有 test/tech.test.js:104 契约能源初始 stockpile=100，导致 60!==100 回归。教训：给成员写任务时若建议参数与既有实现/测试耦合（如 civilization.tech._energy 与 survival.resources.energy 共用同一库存节点），必须先查既有测试契约再写建议，或明确标注“若与既有测试冲突，优先改实现以满足既有契约，不要改测试”。修复方向：改实现（能源默认调回 100），不动测试。
- [2026-09-23 20:22] [经验教训] 跨种子离散度仍偏低：新增资源可能只生产未消费（待 t41 量化） — t38 完成后的 captain 独立复跑（50 居民×200 tick×3 种子）显示：trades 182/182/180、balances 428|460|452（有细微差异，说明随机源在工作），但 born、crafted、breakdowns、finalPop、survivalRate 三项完全一致（2/3/1/52/1.00）。结论：随机性确实在动，但能源与医疗接入后尚未对个体命运产生分叉影响——嫌疑是这两个资源目前“只被生产、未被个体消费”，属装饰性资源。已要求 t41 验收时专门量化：能源与医疗在主循环中被谁消耗、消耗曲线是否与个体行为相关；若确认“只生产不消耗”则需修正。注意 200 tick 也可能偏短，判断时需与更长 tick 对照。
- [2026-09-23 20:28] [经验教训] 批次1新增模块确定性过强：接进循环但未产生个体分叉 — captain 复核 t38/t39 后的实测（50 居民×200 tick×3 种子）：t38 的 born/crafted/breakdowns 三项完全一致（2/3/1）；t39 的 businesses/goodsProduced/wagesPaid 三项逐位相同（2/800/1200），仅 trades 有 182/182/180 的细微差异。结论：新模块确实接进了主循环（有代码路径与 worldState 写入），但行为是“系统播种 + 固定产出 + 固定薪资”的确定性布景，而非由个体决策驱动的涌现行为——破产阈值(10)永远碰不到、产出不随市场价波动、雇佣不随技能差异变化。判定：不算 t39 的缺陷（它严格完成了模块契约），但需在验收阶段量化并明确结论“是系统性布景还是涌现行为”。已要求 t41 专项核查：①能源/医疗被谁消耗、消耗曲线是否与个体行为相关；②企业在何种条件下会破产；③产出是否随市场价格波动；④雇佣是否随个体技能差异变化。注意 200 tick 可能偏短，判断需与更长 tick 对照。
- [2026-09-23 20:47] [经验教训] 成员上游中断后应先实测工作区再定重试口径 — 成员上游中断后应先实测工作区再定重试口径。本轮多次验证的固定流程：①中断后先 git status + 读工作区文件（wc -l / grep 导出符号）判断实现完成度，不要直接重新派发；②若主体已落地，重试时明确写“收尾为主，勿重写实现”，并列出具体缺口（如未接入主循环、未导出、无测试）；③重试消息里给出可执行的接入点与验收断言，减少成员再次走偏；④若重试仍反复中断（如 t41 连续 502/PI_AI_ERROR），把任务收窄为少量机械步骤（修一行崩溃、跑脚本、补一段标注）以提高单次完成概率。另有一条易误判点：中断通知可能**迟到且已过期**——通知到达时任务可能已由更早的重试成功完成（实例：survival-engineer 的 TIMEOUT 通知到达时 t38 早已通过 attempt2 提交 f4968a0），故收到通知后必须先查 agent_teams_status 与 git log 确认当前真实状态，再决定是否重试，避免对已完成任务重复派发。注意 t38 曾出现“实现已完成但 1 个测试回归”的情况，收尾阶段需先跑全量测试定位回归。
- [2026-09-24 02:11] [经验教训] bench.js 无 --difficulty 标志导致 --param difficulty=x 静默失效 — captain 验证 t42 时踩坑：bin/bench.js 没有 --difficulty 标志，执行 node bin/bench.js --param difficulty=harsh 会把 difficulty 作为普通键写进 opts.params，**静默无效且不报错**，实际仍以 standard 档运行；captain 因此第一次拿到错误的 harsh/apocalyptic 数字（破产 1 而非真实的 2）。根因（t44 深挖，比表象更深）：即使把参数塞进 config，loop.step 合并时 fullConfig=deepMerge(defaults, params) 会把难度参数覆盖回标准档；正确合并顺序是 defaults + 难度档位参数 + 用户覆盖。已由 t44 修复（commit b79c517，331/331）：新增 --difficulty 标志、未知档位报错并以 exitCode=1 退出、--param difficulty=x 输出显式警告、报告与 bench-summary.json 记录 difficulty 字段。captain 独立验证：--difficulty harsh → surv 0.000/破产 2/交易 78/needGrowth 0.12；默认不带标志行为不变（存活 1.00）。教训：①凡 CLI 传参驱动行为的入口，必须对“配置中无人读取的键”警告或报错，否则证据链静默失真；②验证档位类参数不要用 --param 猜键名，正确方式是 config.setDifficulty(id) 后跑 loop.run，或用带 --difficulty 的入口；③对比不同 run 时须保持命令行一致（captain 曾少传 --phase3 导致 trades 450/529/436 与 t42 的 450/525/431 不符，属操作差异而非回归）。
- [2026-09-24 02:38] [经验教训] 僵尸任务：成员 idle 但任务停在 in_progress 且零产出 — t43（避难所容量修复）出现新型故障：survival-engineer 回合结束、成员状态已 idle/ready，但任务状态仍为 in_progress，且工作区**零产出**（test/survival-shelter.test.js 与 reports/batch1-shelter-repair.md 均不存在，shelter.js/crisis.js 仍是 t38 版本，mtime 未变）。这与“上游 TIMEOUT/PI_AI_ERROR”不同：没有任何失败通知，任务静默卡住。处置：用 agent_teams_status 查成员状态（idle/ready）+ 查工作区文件是否存在/mtime 是否变化来识别；确认零产出后直接 reassign_task 按 attempt2 重试，并重发完整任务要点（不要假设成员还记得原任务，其上下文可能已丢失）。附加经验：对“修复+时间序列证据+测试+报告”这类多产物任务，重试时明确指示“若回合即将超时，优先把核心修复与测试落盘并提交，报告可精简”，以抗中断（t41 曾在最后一步 writeFile 时崩溃导致全部工作未落盘）。
- [2026-09-24 03:24] [经验教训] 填满结构图的格子 ≠ 产生涌现行为（批次1 核心教训） — 批次1 的 12 个模块在 t41 验收前表现为「实现完整、接入主循环、测试通过、结构校验 0 error」，但验收判定为「装饰性布景」：跨 3 种子 14 个字段中 12 个逐位相同，企业用 applyBalance 直接记账印钞、破产阈值永远碰不到、避难所 capacity=0 仍住 52 人。教训：模块存在 ≠ 模块生效。判定标准应是①跨种子是否出现差异（确定性算术会逐位相同）；②是否产生可叙事的历史（谁在何时因何破产/被逐出）。修复后才达成：5 核心字段跨种子全不同、破产发生在不同 tick 不同余额、逐出 16/40/23 次。据此提出批次2（智能体与社会 22 模块）的验收标准升级：每个新模块必须证明它让个体产生可观测分叉（跨种子差异 + 至少一条可叙事历史），否则视为未完成。另注意：新增模块若只被系统播种、产出与工资为常数、与人口/技能无关，几乎必然是布景。
- [2026-09-24 08:37] [经验教训] 验收任务判定 needs_revision 会显示为 failed，这是语义而非失败 — 用户曾质疑「t41 怎么还是失败标识」。澄清（已核实）：t41 是**验收任务**，职责是挑缺陷；按 AgentTeams 工具契约，验收任务判定 needs_revision 时任务状态必须置为 failed（不允许“发现缺陷却标成功”）。故 t41 failed 的准确含义是「验收不通过」而非「验收未执行」——产物已提交（6b38498），查出的 D1~D4 已由 t42(a2d78e5)/t43(d2962ef) 修复。真实的过程缺口是：**缺陷修复后未按原验收口径重新验收**，导致任务列表长期留有红色 failed 且验收链不闭环。处置与结果：派 t45（observer-engineer）按 t41 原口径复验修复后代码，产出 reports/batch1-verification-final.md 并判定 **pass**（commit 6939444），关闭 t41 的 needs_revision；t41 的 5 个 findings 已在报告开头逐条标注「已修复 + 证据引用」。可复用做法：验收任务判 needs_revision 后应随即派生修复任务，并在修复完成后**补一次同口径终验**，否则状态标识会长期误导且验收链不闭环。
- [2026-09-24 09:16] [经验教训] 批次2 预埋的防坑约束（性能/依赖/语义嵌入/声誉闭环） — captain 在批次2 任务描述中预埋的约束（源自历史教训，可复用）：①t47 记忆与模拟器——明确要求默认不得依赖 MiniLM 语义质量（t36 已证其中文 top-3 命中 6.3% 劣于 stub 18.8%），须走 gateway.embed 并处理 fallback；给出性能红线：50 居民×200 tick 基线约 3.5~4 秒，超 2 倍需先优化（t31 修复过观察者日志 O(t²)、t33 修复 chronicle 栈溢出）。②t49 社区发现——禁止引入第三方图库（项目零运行时依赖），简单连通分量或标签传播即可；要求复用既有 src/social/family/ 而非重复实现。③t48 日程——必须给出某居民 10 个连续 tick 的「日程→实际执行」对照，证明日程真的驱动行动而非并行装饰逻辑；并明确本任务不推翻既有决策链，若无法最小侵入接入须说明。④t50 声誉——必须被读取并影响行为（如低声誉者更难获贷款/被雇佣），否则属「只写不读」的布景；要求给出有/无声誉反馈的对照证据。⑤t46 生命周期——新增自然衰老死亡可能撞破存活率 1.00，要求把衰老死亡率调至 200 tick 内不触发，或设为可控参数并给出该参数下的存活率。⑥t47 行动模拟——明确不做开放世界与地图寻路，只做数值/状态推演（用户要求探索简化为因素+随机数的计算结果）。
- [2026-09-24 10:31] [经验教训] t47 记忆检索引入 O(t²) 退化拖垮整个测试套件（3.5 倍） — 批次2 期间 captain 实测发现严重性能回归：当前工作区 50 居民×50 tick = 15.7s，而 HEAD 159dc43 干净工作树（git worktree 另开目录对比）= 4.4s，退化约 3.5 倍且随 tick 超线性（10×5 tick 0.67s vs 基线 0.12s，5.6 倍），典型 O(t²)。后果不是测试失败而是**测试整体挂起**：node --test 跑 300 秒超时，用 --test-timeout 定位到 9 个集成测试文件被 cancelled（agent-memory-anticipation、agent-persona-lifecycle、bench、economy-batch1、economy-closure、economy-tax-credit、longrun、survival-batch1、survival-shelter）。captain 读码定位根因：src/agent/memory/semantic.js 的 recall() 对每一条已存记忆都调用 tokenize(entry.content)，而 loop.js:530 每 tick 每居民都 store 一条新记忆 → 记忆量随 tick 线性增长、recall 每次全量扫描并重复分词 → 总量 O(t²) 且常数很重；另 ensureFresh() 在 graph generation 变化时清空索引，而每 tick 大量写入可能导致索引反复重建。教训：①在每 tick 每实体写入的路径上做「全量扫描+重复计算」必然 O(t²)，入库时应一次性分词并缓存 token、按 agent 限条目上限、避免每 tick 重建索引；②性能红线必须写进任务（本次已在 t47 任务中写了“超基线 2 倍需优化”，但仍发生），验证时须用 --test-timeout 区分“失败”与“挂起”；③git worktree 另开干净目录是测量基线性能的正确方法，不会破坏在途改动。
- [2026-09-24 10:31] [经验教训] 并行成员共享文件的冲突处置流程与错误归因纠正 — 批次2 中 t46（agent-engineer）与 t47（ai-engineer）并行改动同一批集成文件（src/runtime/orchestrator/loop.js、_stage2.js、src/infra/config.js、src/agent/index.js + normify 的 loop.md/config.md/tree.json/outline.md/receipt.json）。t46 主动报告冲突并只提交自己的独有文件（159dc43），共享文件保持未提交——这是正确做法。captain 的处置流程：①裁定由**后完成且需要修性能的一方（t47）统一提交共享文件**，提交信息注明「含 t46 与 t47 改动」避免归因错乱；②对双方**严禁** git checkout/restore/stash/reset 共享文件（会摧毁对方未提交的工作），需要对比时用 git worktree 另开目录；③被阻塞方的任务**先不标完成**，待全量测试恢复绿色后再安排专项集成复验。【错误归因纠正】t46 报告称 t47 的 simulator.predict 用 context.rng.next() 消耗全局 rng 导致 economy-closure 跨种子用例失败；captain grep t47 四个新文件（simulator/pruner/explainer/semantic）**未见任何 rng 消耗**，simulator.js 使用确定性 FNV 哈希并注释声明「不消耗全局 rng」——该诊断不成立，已要求 t47 实测确认而非盲目修改。教训：成员之间的相互归因必须由 captain 用代码证据核实，不可直接转述执行。
- [2026-09-24 11:27] [经验教训] CPU profiler 是定位性能回归根因的决定性手段（含调用栈回溯方法） — 批次2 出现约 2.9× 性能回归（同口径 200 tick × 50 居民 phase2 only：基线 6939444 = 2941/3140/3156ms，t46 提交 159dc43 = 2980/3046ms 接近基线，当前 1c7c3d6 = 8734/8821/8869ms），captain 用 node --cpu-prof 定位到唯一热路径，方法可复用：①用 `node --cpu-prof --cpu-prof-dir=/tmp/prof ./script.mjs` 采集；②解析 .cpuprofile JSON，按 callFrame（functionName + url + lineNumber）聚合 hitCount，得出占比排序——本次 4040 样本中 structuredClone 占 74.9%；③用 nodes[].children 建立 id→parent 映射，从热点节点向上回溯调用栈（本次得到 step → decide(loop.js:268) → selector.choose → scoreFn(loop.js:326) → personality.evaluate(loop.js:331) → profile(personality.js:61) → tagset.store.get(store.js:80) → graph.read(nodeId) → clone(graph.js:23) → structuredClone），从而把“某个函数慢”精确定位到“哪个调用点以什么频率调用它”。④排除法也很有效：先测可疑模块的开关（scheduleEnabled true 8726ms vs false 8679ms）即可排除 t48。根因本质：scoreFn 对每个候选调用 personality.evaluate，而 evaluate 每次重新 profile + graph.read + 深拷贝 50 个特质标签，调用量 ≈ 50 居民 × 4 候选 × 200 tick = 40,000 次深拷贝。教训：这类“常数因子过大”而非 O(t²) 的退化（每 tick 耗时恒定但绝对值高）用 profiler 一眼可见，而单纯看墙钟曲线会误判为算法复杂度问题。
- [2026-09-24 12:14] [经验教训] t49 家族/图接入：独立随机源 + 社区节流重算 — ①给 seed 阶段新增随机分组（创始家族）时，不要消耗共享 rng（rng.shuffle/int 会整体位移下游经济/生存随机序列，曾导致 economy-closure「businesses 跨种子差异」回归）。改用本地 mulberry32(hash(seed+':family')) 独立随机源，既跨种子分叉又不扰动共享序列。②社区发现若每 tick 全量重算会拖慢 50×200 长跑，用 communityDetectInterval=10 节流 + 缓存快照，wall-clock 保持 ~4.0s/200 tick。③graph store 无 delete，关系边 remove/家族 dissolve 用软删除标记（removed:true / status:'dissolved'）实现。
- [2026-09-24 12:16] [经验教训] 结构产物提交顺序：先提交代码再 refresh+build，否则 revision 指向旧提交且 tree.json 与 HEAD 不一致 — 批次2 反复出现的同一类结构卫生疏漏（已两次），captain 实测确认：t49（5cda584）声称「5 模块已 activate + validate 0 error」，模块 .md 确实已激活（frontmatter 无 state 字段即默认 active、fingerprint 已写入），**但派生构建产物未提交**——HEAD 的 normify-truman-town/tree.json 为 131 active / 96 planned，工作区（未提交）为 140 active / 87 planned，即读 HEAD 的人会误以为 t49 的 5 个模块仍是 planned。另一隐蔽问题：t49 模块 .md 里 revision 记的是 1c7c3d6（它刷新时的 HEAD）而非它自己的提交 5cda584，根因是**先 refresh 后 commit**。可复用规程：①先 git commit 代码；②再 normify_module_refresh(activate:true) + normify_build；③最后把 tree.json / outline.md / api-index.json / receipt.json 与模块 .md **一起提交**——只提交模块 .md 而漏掉派生产物会让结构库与 HEAD 脱节。判断激活是否真正落地不能只看成员汇报，须比对 `git show HEAD:normify-truman-town/tree.json` 的 state 统计与工作区统计（注意 tree.json 的 modules 是对象，须用 Object.values）。已据此要求 t50 收尾时一并提交派生产物。
- [2026-09-24 12:47] [经验教训] 消融实验是检验「装饰性布景」的最硬手段（批次2 实测方法与结论） — 批次2 captain 用消融实验（把模块的配置开关关掉，看可观测指标变不变）检验模块是否真实影响个体行为，这是比「看调用点」「看测试覆盖」都硬的证伪手段，可直接发现「实现了但没接线」。方法：对每个有配置开关的模块跑「开 vs 关」对照，比较行动分布（从 run().steps[].decisions[] 聚合）、资源流（run().resources 的 totalProduced/totalConsumed）、事件流、存活率。批次2 实测结论（50 居民 × 200 tick × seed 1，phase2）：①**schedule 是真实机制**——关闭后 work 由 18.7% 降为 0%、rest 由 24.5% 塌到 1.0%、forage 由 29.0% 飙到 59.3%，drink/eat 升至 19.8/19.9%；②**career 是真实机制**——关闭后 work 降为 0%、forage 升至 46.9%；③**society 效应很弱（尚未判定为缺陷）**——关闭后行动分布几乎不变（13.9/13.9/29.0/24.4/18.7 vs 开启 13.9/13.9/29.0/24.5/18.7），仅在资源流上有微弱差异（医疗消耗 30→60、食物消耗 1585→1614），即 effects（识字率/治安/治疗容量）写入了摘要并影响医疗消耗，但不改变任何人的行动选择；是否算「真实机制」交由 t51 判定，已明确要求不得因是队友交付而放水。可复用判据：**若某模块关闭后一切可观测指标都不变，判定为装饰性布景。**注意 run().report 为空，可观测数据在 run().social / run().resources / run().steps / run().world.agents（agents 是以 id 为键的对象，取 id 须用 Object.keys 而非 Object.values().id）。
- [2026-09-24 13:52] [经验教训] 本批次最顽固的性能陷阱：热循环里逐项做 graph.read + 深拷贝（已三次复发） — truman-town 批次2 连续出现三次同构性能回归，根因都是「在每 tick/每候选/每条目的热循环里，对每一项单独做一次 graph.read，而 graph.read 内部 structuredClone 深拷贝图节点」。三次实例：①t47 语义记忆 recall 对每条已存记忆重复 tokenize（O(t²)，导致 9 个集成测试文件挂起被取消）；②t52 personality.evaluate 被 scoreFn 逐候选调用，每次重新 profile → tagset.get → graph.read → 深拷贝 50 个特质（2.9×，structuredClone 占 CPU 74.9%）；③t53（由 t50 引入）feeds.rank 逐帖调用 reputation.query → graph.read → clone（3.9×，structuredClone 占 CPU 58.9%，npm test 总耗时 44.6s→182.7s）。**通用修复模式（已两次验证有效）**：把逐项读取改为批量或按 id 缓存，并用 graph.__generation()（图复位）或写入计数（如 tagset.store.__writeCount()）作为缓存失效条件；参考 src/agent/memory/semantic.js 的 ensureFresh() 与 t52 在 personality/tagset 的落地。**识别方法**：node --cpu-prof 采样后按 callFrame 聚合 hitCount，若 structuredClone 占比异常高（>50%）即可判定为该反模式，再用 nodes[].children 建 parent 映射回溯调用栈精确定位到具体调用点与频率。**注意**：这类退化是「常数因子过大」而非 O(t²)，每 tick 耗时恒定但绝对值高，只看墙钟曲线会误判为算法复杂度问题。**写入任务描述时应直接点名该反模式**，因为仅写「性能红线 2×」不足以让成员规避（t47/t50 任务都写了红线却仍复发）。
- [2026-09-24 14:37] [经验教训] 两类隐蔽的「假机制」：无稀缺时的排序是空操作；声称有效果但无人读取的假契约 — 批次2 验收暴露两类靠「看代码有实现、看测试通过」发现不了的假机制，可复用判据如下。**类型一：无稀缺时的排序是空操作。** reputation 加权分诊看似完整实现（rankTriageByReputation + reputationTriageBoost + triageSwaps 计数器），但 _stage2.js:858 的 capacity = min(triage.length, max(1, ceil(ids.length×treatPerCapita))) 在 treatPerCapita=0.04、50 居民时恒为 2，而患病队列长度 ≤2，**队列从不超名额，排序对结果零影响**——triageSwaps 恒 0 即为铁证。识别方法：凡「按优先级排序后取前 K 个」的逻辑，必须确认候选项数在真实运行中**确实超过 K**，否则排序是装饰；同时应检查该逻辑是否带有可观测计数器（如 swaps），计数器恒 0 就是空操作的直接信号。**类型二：声称有效果但无人读取的假契约。** society.js 为 teacher/guard/priest 各定义 effect（literacyRate/safety/ritualBonus）并写入记录，但全 src 无任何消费点（grep 仅命中定义处），模块契约却声明「影响他人」。识别方法：对每个「产出 effect/指标」的模块，用 grep 反查该字段名的**读取点**（排除定义处与测试），无读取点即假契约。**通用判据仍是消融实验**：关闭模块开关后若一切可观测指标不变，即判定为装饰性布景——本次正是消融（society 关闭后行动分布几乎不变）触发了对 f1 的深挖。**给修复方的诚实出口**：允许其如实报告「某效应无法在不破坏平衡下产生作用」，但必须把该效应从契约中移除或标注纯展示，不得保留假契约。
- [2026-09-24 15:15] [经验教训] 验证成员声明前先在 HEAD 干净工作树复核，可区分「成员撒谎」与「他人在途改动」 — 批次2 中 captain 发现工作区 normify_validate 报 3 个 evidence/fingerprint-drift 错误（agent.psyche.trauma、civilization.tech.research、survival.health.disease），而此时刚有成员（t53）声称 validate 0 error。captain 没有直接质疑该成员，而是用 **git worktree add /tmp/wt-head HEAD** 另开干净工作树并在其中运行 validate，得到 **0 errors**——由此证明：①t53 的声明属实；②这 3 个错误来自另一成员（t55）的未提交在途改动。**可复用规程**：当多人并发改动同一仓库、且某人声称「门禁全绿」时，若工作区状态与其声明不符，**先建 HEAD 干净工作树复测**，再判定责任归属；直接质疑或直接采信都会出错。此法与「性能基线必须用 worktree 另开目录测量」同源，都不会破坏在途改动（避免使用 checkout/restore/stash）。另一并发经验：captain 复测 t53 性能得到 4096/4065/4027ms，高于 t53 自报的 3859/3862/3897ms，原因是 t55 正在并发跑测试占用 CPU——**并发环境下的墙钟测量会有 4~5% 偏差，判定时看量级与相对基线倍数，不要以绝对毫秒数是否逐位吻合来判定真伪**。
- [2026-09-24 16:15] [经验教训] 消融差异必须归因到具体改动：pre/post 对照可区分「新改动生效」与「既有机制掩盖」 — 批次2 中 societyEnabled 开关的消融差异（treated 2 vs 5、repMean、interest）在 t55 修复前后**完全相同**，captain 通过「对 pre-t55（5363daa）与 post-t55（275c900）分别在 worktree 中同口径运行并逐值比对」证明：该差异来自 t48 的 doctor→treatmentCapacity（既有效应），而非 t55 新增的 3 个消费点。**若只看 post-t55 的 ON/OFF 消融，会错误地把功劳记给 t55。** 可复用规程：①验证「某次改动是否真的产生了某效应」时，不能只做「开关 ON vs OFF」，还须做「改动前 vs 改动后」——两者结合才能把差异归因到具体改动；②若新机制在默认参数下不可观测（如本处 doctor 已使疾病趋近消除，sevN=0），须**构造压力场景**使其生效再验证（captain 用 infectionRate=0.3 使疾病真实存在，得到严重度总和 29.86 vs 36.65 = -18.5%），并允许「在合理压力下仍不可观测」的消费点被如实标注为弱效应；③**压力场景的构造不得扰动全局 rng 序列**——t55 拒绝采用「safety→降低传播率」正是因为那会改变 rng 流、破坏已核实的 interestAccrued，此类取舍应被认可；④验收任务描述中应明确要求「区分差异来源（新改动 vs 既有机制）」，否则验收方容易把既有效应误判为修复成功。
- [2026-09-24 16:48] [经验教训] 全局默认参数变更是最隐蔽的破坏性变更；只披露通过的种子等于不完整披露 — t56 为制造稀缺把 DEFAULTS.treatPerCapita 由 0.04 改为 0.02，并在报告中只声明「seed1 平台指标逐值一致」——该声明为真，但**只覆盖 1/3 种子**。captain 用 pre-t56(275c900) vs post-t56(91c751d) 三种子对照才发现 seed2 的 treated 8→399（50×）以及 post/reply/react/interest **全部变化**。可复用判据与规程：①**修改 DEFAULTS 中的参数是全局平衡变更**（尤其是不在难度预设里的参数，对四档难度全部生效），其影响面远超「修一个 bug」，必须按破坏性变更对待；②**判定影响面必须跑全部 canonical 种子（本项目为 1/2/3），不能只跑一个**——单种子通过不能代表无回归；③**归因时用 OFF 状态交叉验证**：captain 实测 OFF 状态下 seed2 也是 treated=399/post=836，由此证明该变化单由 treatPerCapita 造成、与声誉排序逻辑无关，从而把「参数变更」与「功能修复」两个效应分离；④成员报告若只给出通过的那个种子/那个指标，应视为**不完整披露**并要求补齐完整对照表（本次已要求 t56 更正）；⑤**任务已开工后无法再用 edit_plan 修改描述**（工具契约：已开始的任务不可编辑），此时补充验收标准/基线数据的唯一手段是 agent_teams_send_message——本次 captain 用该方式把修正后的 f1/f2 复验基线（含「默认档差异来自 t48 而非 t55」这一关键陷阱）送达已在运行的 t57。
- [2026-09-24 17:03] [经验教训] 测量存活曲线的可行方法与两个 API 陷阱（loop.step 需播种；chronicle 只是计数） — captain 在验证难度梯度时踩到两个 API 陷阱，记录以备复用：①**loop.step 不能用于逐 tick 累计存活曲线**——`L.step({ticks:1, agentCount:50, seed:1})` 在 `L.reset()` 之后不会自动播种，返回的世界里 agent 数为 0（实测 aliveCurve 首点即 0、curveLen=1）；`run()` 内部才处理播种。**可行替代**：用**多次独立的 `L.run({ticks:N, agentCount:50, seed:S})` 调用**在采样点 N 上取存活数（因 seed 固定，每次调用都是确定性且互相独立的），即可得到存活曲线采样（本次用 N=20/40/60/100/200）。该方法成本低且足以判定「曲线是否变化」。②**`run().chronicle` 不是事件流**——它是计数对象 {decision, action, event, total}，四个值均为 number；需要事件明细时应查 observer（src/observer/ 下有 chronicle / experiment / recorder 子目录）而非 chronicle 字段。③另：`run().report` 为空对象，可观测数据在 `run().social` / `run().resources` / `run().steps` / `run().world.agents`（agents 是以 id 为键的对象，取 id 用 Object.keys）以及 `run().phase2.summary`（含 treated / reputationTriageSwaps / interestAccrued / postCount / replyCount / reactCount / feedSignature / reputation 等）。④`loop` 的导出仅含 foragePoolRemaining / spawnAgent / step / reset / run / snapshot / DEFAULT_* —— 无逐 tick 事件流接口。
- [2026-09-24 17:25] [经验教训] 速率型消费点的聚合消融不可靠：safety 同时降严重度与降康复速度，符号相反会互相抵消 — 批次2 验证 safety（治安官→疾病严重度）消费点时发现：聚合指标「疾病严重度总和」的消融方向**不稳定且会翻转**——captain 在 t55 版本（275c900）测得 society ON 29.86 vs OFF 36.65（safety 生效，ON 更低），但在 HEAD（含 t56 的 treatPerCapita 0.04→0.02）上重复 3 次均为 ON 47.47 vs OFF 44.75（ON 反而更高），且**完全确定性（3 次逐位相同），不是噪声**。根因分析：safety 的实现在 disease.js 中同时作用于两处——:96 `severity = clamp01(baseSeverity*(1-imm)*(1-safetyFactor()))`（降低**新感染严重度**，使总和下降）与 :118 `effDelta = delta*(1-safetyFactor())`（降低**症状推进速度**，而症状推进同时包含康复进程，使感染状态持续更久、总和上升）。两个效应符号相反，聚合总和是其净效应，故可随治疗名额（capacity）等外部条件翻转。**可复用判据**：①验证这类「速率型/双效应」消费点时，**聚合统计不可作为主证据**，必须用**单元级隔离测试**（本次 safety 的 0.5→0.45、health 80→82 是确定性可复现的）；②聚合消融适合验证「有无该机制」的开关型效应（如 f2 的 swaps 9724 vs 0），不适合验证速率型微调；③当 captain 与成员对同一聚合指标测出不同方向时，**不要急于判定谁错**——先确认测量版本是否一致（本次差异源于 t56 改了 treatPerCapita）与读取接口是否一致（captain 用 trauma.query({agentId}) 读不到 t57 使用的 copings 字段，trauma 状态实际仅含 agentId/level/events[]）。
- [2026-09-24 19:07] [经验教训] 验证「智能体是否真在决策」的方法：查因果链的消费者，而非看输出文字 — 本轮用真实模型（grok-4.6）验证「智能体决策/对话机制」时确立了一套可复用方法，**核心是查因果链而非读输出**：①**先跑真实模型落盘原文**（`gateway.useA6Api()` 后 `L.run()`，从 `run().steps[].decisions[].thought` 取文本）——文字本身会暴露提示词缺陷，但**不能**用来判断决策质量；②**定位 LLM 调用点在主循环的位置**——grep `gateway.complete` / `ai.` 于 `src/runtime/orchestrator/loop.js`；关键判据是**调用点相对于行动选定的先后**：若行动先由 `scoreFn` 选定、再把行动写进提示词（本次 `loop.js:326` 选 → `:634` 才组装 situation），则 LLM 只是事后旁白；③**逐环节追因果链**——对每个中间量（`ranked`、`semanticMemories`、`thought.thought`）grep 它在整个文件/全库的**消费者**；本次决定性证据是 `ranked` 的唯一消费者为 `loop.js:373` 的观察者日志字段 `topDriver`、语义记忆唯一消费者为 `:377` 的日志字段，且评分函数 `scoreFn`(:326-337) **不含记忆项** → 证明记忆与思考对行动零影响；④**检查提示词输入是否退化**——`spawnAgent` 默认 `persona='一名普通避难所居民'`、播种 `name=居民${i+1}`，导致 50 个居民 persona 全同；**提示词输入退化会让「跨个体差异」全部退化为标签/画像差异**；⑤**grep 特征词确认能力是否存在**——判断有无对话机制直接 grep `speech|dialogue|conversation|utterance`（零命中即无），并查结构树中对应模块 state（planned = 未实现）。**推论规则**：当发现某中间量的唯一消费者是观察者/日志时，该环节即为**输出侧装饰**（非因果），这与批次2 消融实验查出的「只写不读」是同一类缺陷的不同表现——**消融实验查「开关有无效果」，因果链追查「中间量有无下游」**，两者互补。**适用范围**：本方法适用于任何「LLM 嵌入传统仿真」的架构，用于区分「LLM 在决策回路内」与「LLM 在叙事层」。
- [2026-09-24 19:32] [经验教训] 聚合指标无法区分「agent 决定做」与「代码替 agent 做」——必须做归因测试与硬编码审计 — 本轮设计审计暴露了 captain 此前验收方法的一个**系统性漏洞**：批次2 报告里那些「可观测量」（`postCount`/`replyCount`/`crafted`/`businesses`/`traded`）**无法区分「居民自己决定做」与「主循环代码替居民做」**。具体证据：①`runCrafting`(`_stage2.js:720-722`) 硬编码 `crafter=agents[0].id`/`builder=agents[1].id`/`writer=agents[2].id`，直接调 `craft(recipeId:'axe')`/`build(recipeId:'barn')`/`write_book(title:'避难所纪事')`——**「谁做木斧、谁盖谷仓、谁写书」由列表顺序决定，不是任何居民的决定**，但 `crafted`/`built` 计数照常上升，指标完全看不出问题。②平台发帖人由 `prShuffle(allIds).slice(0, posterCount)`（`_stage2.js:978`）**随机抽取**，内容是 `CHAT_TEMPLATES`(:929) 等固定模板（源码注释明写「不调用真实大模型」），实测 30 tick × 20 居民 seed1 产出 56 帖全被回复但只有 2–4 句在轮转。**可复用判据（三层验证，缺一不可）**：①**消融**——关掉模块开关看指标变不变（查「开关有无效果」）；②**因果链追消费者**——grep 中间量的下游，若唯一消费者是观察者/日志则该环节是输出侧装饰（查「中间量有无下游」）；③**归因/反事实测试**——把「决定者」从规则换成随机或打乱，若产出分布**不变**则证明该产出不是决策的结果（查「谁在决定」）。**本轮的教训是：前两层都通过了，第三层才查出制作/建造/社交全是代码驱动**——批次2 的 22 个模块全部通过了消融与因果链检查，却仍有大量产出属于此类。**适用范围**：任何「在传统仿真上叠加 agent 叙事」的架构，验收时必须做归因测试，否则「涌现」的声明没有依据。**另附审计方法**：查行动空间大小（`DEFAULT_ACTIONS` + `effectFor` 的 switch case 数）、查候选池写入点（grep `pool.store.add` 的调用次数与位置）能快速判定「agent 有多少真实选择」。
- [2026-09-24 23:12] [经验教训] 第三层「代码替居民决定」：日程模块无条件覆盖决策 — D0 排查发现行动分布长期不变的真正瓶颈不在候选池，而在 scheduleOverride()：它在决策之后无条件用日程块替换居民选择，而日程的词汇表只有 work/rest/forage/eat/drink。因此即使候选池里出现了 craft，也会在这一步被抹掉。教训：当「换了输入但输出完全不变」时，不要继续调上游权重，要往下游找是否有无条件覆盖点。修复方式是把日程从「决定」降级为「建议」——仅紧急需求或居民选择本身就是生存行动时才结果性覆盖，否则保留居民选择并只记录日程建议。
- [2026-09-24 23:12] [经验教训] needs 与资源库存是两套信号，不能互相替代 — D0 生存门踩坑：把行动空间打开后 seed2 整镇死亡（alive=0），而 seed1/seed3 正常。根因有两层：(1) pressure.scarcity 要等采集池见底之后才饱和，那时已不可恢复（食物 6 个 tick 内从 94 掉到 0）；(2) 更隐蔽的是 needs 与库存解耦——库存为 0 时 needs 仍可能读 {food:0,water:0}，导致 hungry=false，采集连原有的 +1.0 生存加分都拿不到，居民于是在饿死前还在休息。修复：以「人均库存天数」(survivalGatePerCapita) 为主判据，触发时 forage +3.0、rest -1.0、7 个非生存行动 -5.0。阈值扫描：1.5 → alive=0；3 → alive=52，故取 3。教训：生存类判据要用「存量」而非「存量耗尽后的压力信号」，后者是事后指标。
- [2026-09-24 23:13] [经验教训] 性能回归的定位方法：CPU profile 聚合 + 调用栈回溯 — D0 首版把主循环从 4371ms 拖到 10365ms（2.4×）。定位手法：node --cpu-prof 采样后聚合 nodes[].hitCount 得到函数级占比（structuredClone 73.3%），再用 parent 链回溯到**具体调用方**，这是关键——只看函数名只能知道「深拷贝很贵」，回溯才指出是 candidateStateFor→labour.staff→graph.read。修复顺序与效果：整批替换候选(10365→8864) → tick 内缓存企业状态(→6128) → 人口世代缓存(→5632)。教训：graph.read/structuredClone 出现在 per-item 热循环里是本项目反复出现的反模式（Batch 2 已 3 次），新增的任何「每居民每 tick」查询都必须先假设自己是热点。
- [2026-09-24 23:13] [经验教训] 缓存键用 clock.now().tick 会在 step 早期读到上一 tick 的值 — D0 给 alivePopulation() 加 tick 缓存后，「采集池按人口缩放」用例失败：bigRegen 与 smallRegen 相同。根因是 regenForagePool 在 step 早期执行时 clock 可能尚未推进，用 clock.now().tick 作缓存键会命中上一 tick 的旧值，导致采集池容量按错误人口计算。改为**显式世代号**缓存（invalidateAlivePopulation 递减 generation），并在 step 入口/reset 处失效。教训：当被缓存函数的调用点跨越「时钟推进」边界时，不要用时钟值作缓存键，要用显式的失效信号。
- [2026-09-24 23:13] [经验教训] 缓存键用 clock.now().tick 会在 step 早期读到上一 tick 的值 — D0 给 alivePopulation() 加 tick 缓存后，「采集池按人口缩放」用例失败：bigRegen 与 smallRegen 相同（均应随人口递增）。根因是 regenForagePool 在 step 早期执行时 clock 可能尚未推进，用 clock.now().tick 作缓存键会命中上一 tick 的旧值，导致采集池容量按错误人口计算。改为**显式世代号**缓存（invalidateAlivePopulation 递减 generation），并在 step 入口与 reset 处失效；修复后该用例 4/4 通过。教训：当被缓存函数的调用点跨越「时钟推进」边界时，不要用时钟值作缓存键，要用显式失效信号。
- [2026-09-24 23:57] [经验教训] 社交/家庭层对行动空间完全不敏感：改行动 4→9 种，边/社群/家族逐字节相同 — D0 完成后做对照测量（4bded3e 的 4 种行动 vs 26dba32 的 9 种行动，各 3 seed × 200 tick），发现社交结构**一条边都没动**：friendship 边 204/216/202、社群 10/10/14、家族 15/15/19、家族成员 56，两侧完全一致，只有 chronicle.action 计数变化。结论：社交层从来不是涌现，而是确定性生成器；这不是 D0 引入的回归，而是 D0 暴露的既有缺口。**根因（已定位到行）**：①`_stage2.js:1181` 每 tick 无条件调用 `runSimilarityBonding`；②该函数内部 `const target = agents[0].id` 硬编码第一个居民，取它最近邻即建边；③婚配来自 `social.procreation.match.pair(...)`（`:350`）+ `rng.shuffle(pairs)` 取首个未生育对，纯代码配对；④居民侧 socialize/court 命中率 0%（7 个新行动中 5 个会触发，这 2 个永不触发，`eligibleMate` 在 refreshCandidates 中恒为 false）。**可复用检测法**：把决定者换随机（actionSpaceAttribution）或大幅改变行动空间后，比对下游结构指标是否逐字节相同——相同即证明该层未接入决策回路。适用范围：本判据只对确定性层有效；若层内有 rng 抖动需先固定种子。
- [2026-09-25 00:56] [经验教训] 扣分式约束可被下游加成覆盖，硬约束必须做成集合收缩 — 教训（P1 实测）：把生存优先做成「对非生存行动扣 −5 分」是不可靠的——行动模拟与性格画像的加成能盖过惩罚。二分证据：seed42 + agentCount=50 + phase2 时，pruneK=4 存活 52；pruneK=6 且旧行动空间 存活 50；pruneK=6 且新行动空间（多出 socialize/court/accept）存活 0，即全员 20 tick 内死亡而食物库存稳定在 100、需求在 t1 就已饱和到 1.00。正解是在集合侧收缩行动空间：受威胁时（需求达 eatThreshold 或人均库存低于 survivalGatePerCapita）直接从候选窗口里滤除非生存行动，让选择只在 eat/drink/forage/rest 内进行。这与既有教训「输入变了但输出不变要查下游无条件覆盖」互为镜像：覆盖可以发生在『另一个打分项』上，所以关键约束需要在评分之外另设一道结构性的门。适用范围：凡是要保证某类行动在压力下必然可选的机制，都不要只靠分数惩罚。
- [2026-09-25 00:56] [经验教训] 生存门内的采集优先必须排除已饿/渴情形，否则守着满仓粮饿死 — 教训（P1 自造 bug）：在生存门里给 forage 加 +3 时若不加 !hungry && !thirsty 条件，会出现需求已饱和（1.00）仍持续采集、人群饿死的现象；实测 seed7 + scheduleEnabled:false 时全员在 food=92 的库存下死亡。eat/drink 的 +2 必须能压过采集 —— 采集优先只适用于「尚未挨饿」的预防性窗口。修复后 seed7/42/1/2/3 五种子 200 tick 全部 50 名原始居民存活。
- [2026-09-25 01:35] [经验教训] 【已推翻】seed42 塌陷曾被归因为需求计量管道冻结 — 此条结论已被证伪，保留作反面记录。原判断称『居民需求读数从 t1 起恒为 food=0.48/water=0.32、需求计量管道是死的』，实际是测量方法错误：我读的是单次 run 返回的 steps 快照之后的事后 meter.query()，它返回整局终态，被我误当成逐 tick 读数打印。用独立运行的前缀对比（每次 loop.run({ticks:t}) 从零起、读终态）实测 t1..t6 读数为 0.280/0.360/0.000/0.080/0.160/0.240，每 tick 都在正常增减，needGrowth 累加与 eat/drink 扣减都生效。另经排查确认不存在 meter 双实例：loop.js/_stage2.js/executor.js/production.js 全部经 src/survival/index.js barrel 导入，crisis.js 的 './needs/meter.js' 与 barrel 同目录解析为同一 URL。教训：判定某 store『不更新』前，必须确认读到的是该 tick 的值而非整局终态；ESM 下 store 是单例且模块命名空间只读，无法用猴子补丁插桩，应改用独立运行的前缀对比。
- [2026-09-25 02:11] [经验教训] 读快照数组后又在循环外查 live store，会把整局终态误当成逐 tick 值 — 教训（本轮实际踩坑，代价是一次错误的根因结论）：排查 seed42 存活塌陷时，我写了形如 `for (const st of r.steps) { const n = meter.query({agentId:id}) }` 的循环，r.steps 是每 tick 的快照，但 meter.query() 读的是 live store 的当前值；循环跑完时 store 已是终态，于是每一行都打印同一个终态读数，视觉上表现为『需求值 16 tick 内一个数都没变』，并据此错误推断『需求计量管道冻结』，还写进了项目记忆。正确做法：要逐 tick 的值就必须逐 tick 取值——(a) 用独立运行的前缀对比（每次 run({ticks:t}) 从零起，读终态），或 (b) 从快照对象本身取（st.resources 这类快照字段是对的，live store 查询不是）。附带约束：本 ESM 项目里 store 模块命名空间只读（`Cannot assign to read only property 'update' of object '[object Module]'`），无法用猴子补丁插桩，验证 store 行为要么用前缀对比，要么改源码加临时事件日志。
- [2026-09-25 02:21] [经验教训] scheduleOverride 紧急分支是「代码替居民决定」的第 4 次复发，改评分权重无效 — 已验证根因（本轮实测）：loop.js scheduleOverride() 在 emergency===true 时无条件用日程行动覆盖居民决定，日程词汇表只有 work/rest/forage/eat/drink。环境事件（survival.drought/blight/storm）会把居民推进 emergency，于是 4 行动词汇表整体接管——此时在 scoreAction 里加多少权重都无效，因为分数算完就被丢弃。症状：库存归零后居民连续 19+ tick 选 eat（空操作，consume 无货可扣、需求不降），forage 从未出现，至 t32 起批量死亡（seed42+phase2：forage 仅 73 次而 eat 1077 次）。修复：emergency 分支下若居民自选的是 eat/drink/forage 且日程建议非 forage，保留居民选择（trigger 记为 agent_choice_emergency）。修后 seed42/seed2 从 0 存活恢复到 50，forage 73→2373。教训：这与 D0 记录的根因同类，是同一反模式的第 4 次复发；排查时连续三次把力气花在 scoreAction 调参上全部无效，正确做法是先确认「最终裁决者是谁」再调参——decision 对象的 thought 字段（[stub-0] 当前处境：survival.drought）是识别覆盖来源的关键线索。
- [2026-09-25 02:21] [经验教训] 【诊断不准】死亡螺旋曾被归因为 health 扣血/回血 4:1 不对称参数 — 此条诊断不准确，保留作反面记录。原判断称残留死亡源于 runMortality 的 starvationHealthDecline 0.2 与回血 +0.05 的 4:1 不对称。实测反驳：把 starvationTicks 从 5 提到 12（掉血门槛提高 2.4 倍），5 种子存活仅从 40/47/45/50/46 微调到 44/47/42/50/46，seed2 恒为 47、seed42 恒为 50 完全不受参数影响，说明死亡是结构性的而非参数敏感的。真实死因：决策错误——eventLog 显示 cause=starvation、needs={food:1,water:0}，且死者 agent_...0023 在 t88-t95 期间 food_need 恒为 1.000、水需求为 0、食物库存 95~100 充足，却连续 8 tick 选 drink，期间 food 需求降幅为 0，最终于 t95-t101 集中饿死 10 人。根因是上一条修复（scheduleOverride 紧急分支保留居民自选）只保留了 eat/drink/forage 却让 drink 与 eat 平等竞争，own=drink 在 water_need=0 时本就是错误选择。正确修法：紧急分支只保留与紧急需求匹配的行动（food 紧急且 own=eat / water 紧急且 own=drink / own=forage）。修后 14 个种子（1-10,42,99,123,777）200 tick 全部 50/50 存活。教训：遇到集中时段的批量死亡，先读 eventLog 的 cause 与 needs 真值，不要从存活数倒推参数敏感性。
- [2026-09-25 02:35] [经验教训] 紧急覆盖必须按「哪个需求真的紧急」裁决，不能无条件尊重居民自选 — 已验证完整根因链（P1 排查最终结论）：scheduleOverride 在 emergency 时用日程行动覆盖居民决定（第 1 层，D0 同类反模式第 4 次复发）；第一版修复改为『紧急时保留居民自选的 eat/drink/forage』（第 2 层修复不完整），但让 drink 与 eat 平等竞争——当 food_need=1.000、water_need=0、食物库存 100 时，居民连续 8+ tick 选 drink，饿着肚子喝水到死（seed1 在 t95-t101 集中饿死 10 人，eventLog 记 cause=starvation、needs={food:1,water:0}）。正确修法（第 3 层，最终）：紧急分支只保留**与紧急需求匹配**的行动——food 紧急且 own=eat、water 紧急且 own=drink、或 own=forage（forage 是唯一同时补食物与水源的行动）。修后 14 种子 200 tick 全部 50/50。可复用原则：任何『尊重下层决策』的覆盖逻辑，都必须校验该决策与当前真实紧急状态是否一致，否则会把下层的一个错误选择原样放大成致命后果。
- [2026-09-25 03:43] [经验教训] 「代码替居民决定」的第 5 次复发：emergency 分支无条件覆盖 — scheduleOverride 的 emergency 分支在环境事件（drought/blight/storm）触发时，无条件用日程词的 4 行动（work/rest/forage/eat/drink）覆盖居民决策，scoreAction 的结果被整段丢弃。

症状极具误导性：连续三次调 scoreAction 权重（惩罚非生存行动、改生存门阈值、改 forage 加成）全部无效，因为被覆盖的结果根本不参与选择。诊断突破口是读决策的 thought 字段——"[stub-0] 当前处境：survival.drought。你决定采取行动「eat」。" 直接暴露了决策来源。

修复分两步，第二步才是关键：仅「保留居民自选行动」不够（食物需求 1.0、水需求 0.0、库存 95+ 的居民仍连续 8 tick 选 drink 而饿死），必须再加「自选行动与紧急需求匹配」的约束（eat↔food、drink↔water、forage 通配）。

教训：1) 调上游权重前先确认下游没有无条件覆盖；2) 决策的 thought/来源字段比聚合指标更能定位问题；3) 同一反模式在本项目已复发 5 次（DEFAULT_ACTIONS 只有 4 种、scheduleOverride 覆盖、候选池从不重建、emergency 覆盖、runCrafting 硬编码 agents[0..2]）——新增任何「系统替居民做选择」的分支都要先问它是否绕过了决策环。
- [2026-09-25 03:43] [经验教训] 测试通过≠契约成立：integration2 的 crafted=0 揭示了旧的硬编码 — integration2 断言「石斧应已制作并进入背包」，P1 后失败。首次归因是「产物归属变了」（改断言为汇总全体居民背包）——但那是错的：phase2.summary.crafted=0 说明石斧从未被制作，item.query 查的只是静态物品目录，石斧的定义一直存在。

该测试在 P1 前能通过，恰恰因为旧 runCrafting 在固定 tick 硬编码 agents[0..2] 制作——它断言的是「代码替居民决定」这个被删掉的机制本身。修法不是放宽断言，而是给居民足够时间自然产生该行为：10 tick 时 crafted=0，60 tick 时 crafted=3 且 3 把石斧真进背包。

同类：test 206 的 2 居民×4 tick 生育断言同样失效，因为 P1 把生育改成 court→accept 双向决策链，4 tick 走不完。

教训：测试失败时先判断「断言的是新契约还是旧机制」。若断言的是被删除的硬编码行为，正确做法是重设场景让新路径有机会自然发生（而不是放宽阈值或恢复硬编码），并顺带用计数（crafted/childrenBorn）交叉验证行为真发生了，避免只验终态的弱断言。
- [2026-09-25 04:19] [经验教训] 阈值必须用真实短缺判据，不能用理想储备判据——否则门恒开，全系统被钉在应急态 — survivalGatePerCapita=3.0 是个「理想储备」判据（人均 3 天存量），但 50 人规模下人均库存的平衡点长期停在 1.4-1.8（采集再生速率≈消耗速率，即承载容量附近）。阈值永不可达 → survivalGate 恒为 true → threatened 恒为 true → 非生存行动被永久 -5 压制。

症状：t1-10 之后 craft/build/write/trade/socialize/court/accept 全部归零，只剩 eat/drink/forage/rest（+ 日程给的 work）。我此前报告的「行动多样性」几乎全部来自前 10 tick，而我没察觉，因为总量指标（craft=28）看起来「有值」。

诊断方法（决定性）：临时在门处插桩，把 survivalGate/threatened/perCapita 的真实取值累积到 globalThis，按时间段统计。结果 survivalGate 在 6 个时段全部 100%。这一步绕过了两个误导性来源：decision.context 为 null（我从 null 读 dominantNeed 得到 'none'，是测量假象）；以及只看行动总量而不看时间分布。

修复：阈值 3.0 → 1.5。门常开率 100%→5-11%，14 种子 0 死亡不变，而社交/制作/建造/写作/交易全部恢复且跨种子稳定。同一个改动同时改善存活与多样性，说明原值从来不是「更安全」，只是「更死」。

教训：1) 任何阈值都要问「这个值在系统平衡点附近可达吗」，不可达的门等于恒开的门；2) 总量指标必须做时间分段，否则早期爆发会被误读成持续行为；3) 遇到「某子系统整体消失」时优先怀疑一个恒真的全局开关，而不是逐项调权重。
- [2026-09-25 04:19] [经验教训] 归因要查边的来源类型，别把交易边当成社交边 — 我曾断言「社交边随 tick 从 38 增长到 223，是居民社交行动累积出来的」。按类型分解后证伪：t200 时 family=35、trade=176、friendship=10、romance=2。增长几乎全部来自 trade 边，而 friendship 边是平的（12→11→10）——即社交层的边根本不来自社交行动。

这是「用聚合量推断机制」的又一次复发：总量在涨，就假设是我想验证的那个机制在起作用。

修复门阈值后复测：friendship 13→19→24→25→31（真实增长），trade 1→10→28→58→112→179，总边 38→65→88→121→173→243。社交边这才真正由 socialize 行动累积。

教训：验证「X 驱动 Y」时必须按子类型分解 Y，确认增量落在预期的那一类上；只看 Y 的总量增长无法排除「另一个机制在驱动」。
- [2026-09-25 13:41] [经验教训] 涌现归零的真根因是 forage 空转 + 初始储备截断，而非压力门参数 — 【已确证的根因链（本轮最终结论）】
用户问"涌现为何集中在前10t"。连续 8 轮调压力门参数全部无效后，逐步读到直接事实才定位到真因，共 5 个独立缺陷叠加：
1) **采集奖励不绑池余量**：scoreAction 给 forage 固定 +1.2+scarcity（生存门内再 +3），完全不看采集池余量。而池每 tick 只再生 15.8、每次取 2 → 仅够 7.9 次采集，52 人却全被奖励去采。池抽干后 take=0（零收益），但奖励仍在 → 全员持续 forage 空转，霸占决策带宽，craft/social/write 永久归零。**铁证**：修复前 t100 后 forage=2686 而 craft/socialize 各 1 次，且 food=78.6/water=88.0 库存充裕、零死亡——证明与资源压力无关。
2) **初始储备被 capacity 截断**：food/water 默认 stockpile=100 且 capacity=100 在 50 人时人均仅 2 单位，开局集中进食/饮水在 10 余 tick 内抽干库存；而 effectFor 的守卫是「consume 成功才降需求」，库存为 0 时需求不再下降 → 涨到 1.0 触发死亡。实测 seed42 t18~25 死 11 人，死因 dehydration 而当时水库存已回升到 99。
   → 关键教训：**只改 stockpile 不改 capacity 无效**，produce 会 clamp 到容量。必须 configure({capacity, stockpile}) 同步放大。
3) **木头无再生产途径**：只在出生时一次性发 6 个，而 craft 耗 2 / build 耗 3 → 制作建造窗口开局几次后永久关闭。改为采集时按概率带回木材（forageWoodChance）。
4) **trade 的可售对象是制作原料**：判据 held(木头) - 2 > 0，而木头被 craft/build 持续消耗，几乎不可能稳定 >2 → trade 恒被 no_surplus 拒绝。改为统计除木头外的产出品余量。
5) **日程覆盖的兜底路径**：ownIsSurvival 时掉进日程接管分支，等价于"你选了正常的生存行动，反而失去决定权"；且 emergency 用 eatThreshold(0.4) 当危机阈值，80 人局需求长期在 0.4~0.5 → 几乎永远"紧急"，日程词汇表整体接管（t100+ 被覆盖 3456 次 vs 居民自选 629 次）。改用 crisisNeedLevel(0.8) 并让非紧急时居民决定一切。
6) **采集池再生速率非全人均**：regen 9 + 0.18/人 在 50 人时支持 9.2 次采集/tick（0.18/人），120 人时只 15.5 次（0.13/人）——人均采集机会随规模下降 → craft 在 80/120 人时从 323 崩到 6/10。改为 forageRegen=0 + 0.40/人，人均恒定。

【修复后的实测】50人×200tick seed1/42：零死亡，t1-10→t151-200 social 100→286、craft 54→108、write 25→298、trade 0→117，全部单调上升而非开局爆发。14 种子存活违例 0/14。
- [2026-09-25 13:41] [经验教训] 被证伪的假设必须记录：软压制可取代码收缩、LAYA score 需期望值聚合 — 【本轮两个重要证伪 + 一个测量陷阱，勿再重复】

1) **"用连续软压制取代物理收缩候选窗口"是错的（承重机制）**。
   用户明确嫌 survivalGate 死板，我据此把「受威胁即 filter 掉非生存候选」改成连续 pressureScore 软压制 + 仅在危机线(0.8)收缩。实测：**seed1 死 19 人、seed42 全灭 52 人**。
   直接读数：seed42 水库 t1→t5 由 200 掉到 6（消耗 ~39/tick），采集再生仅 ~20.8/tick——需求远超供给；软压制版 t11-30 forage=29 而收缩版 217。收缩窗口是唯一能逼出足够采集的机制。
   **结论：生存收缩不能用软压制取代。**"不够宽松"的正解是提高供给侧（人均储备 + 人均采集再生），不是拆掉生存保护。已在 loop.js 内留下警示注释。

2) **LAYA score 型不返回 value/score 字段，只返回 probabilities**。
   原先只读 value/score（皆 undefined → raw 恒 0），得到"LAYA 对处境不敏感"的**错误结论**并写进了 reports/laya-evaluation.md。
   对照实验显示概率分布其实**随处境单调右移**（温饱众数档 1 / 断粮众数档 2）。改为期望值 E=Σ i·p_i 后区分度出现且方向正确：温饱 0.412 / 有点饿 0.328 / 极饿有粮 0.286 / 极饿断粮 0.532 / **五天未食 0.757**。
   另：LAYA noul 型仍不可用（连"五天没吃且断粮"都判 crisis=false，与同次调用的 score 自相矛盾），故只用 score。

3) **测量陷阱：改 stockpile 不改 capacity 会被静默截断**。
   produce() 内部 clamp(amount, 0, capacity-stockpile)，因此 capacity=100 时把 stockpile 设到 200 完全无效。第一版修复毫无效果就是这个原因，第二版同步放大 capacity 才生效。

4) **LAYA 逐 tick 全量预取的性能不可接受**：20 人 30 tick 时 calls=539、墙钟 78s（未开启 0.45s，慢 175 倍），并发下单次延迟由 200ms 涨到 ~2.8s。优化为「只对已达进食阈值者调用 + 消息分桶」后 calls=27、hits=143（命中率 84%）、墙钟 3.85s，cacheSize 由 539 收敛到 7，仿真结果不变。
- [2026-09-25 16:23] [经验教训] 「0 死亡」曾是资源过剩的假象；LAYA 只适合 score 型软调制 — 【1. 存活率恒为 1.00 是伪指标，实为资源过剩（已修正默认档）】
旧默认档实测：人均库存长期 3.8、food/water 双双顶满 200/200、52 人中无一人需求超过 0.7（最高 0.36）、采集池容量 136 只用 28。即「0 死亡」不是求生成功，而是整局无需采集即可存活。刚性生存门之所以显得「死板」，根因也在此——压力从未真正发生，门只在开局储备枯竭窗口空转。
临界扫描（50 人 × 200 tick × seed1/42）：再生 0.30/人 → 存活 104/104、门开率 5%；再生 0.25/人 → 92/104、门开率 97%、非生存行为占比由 0.54 坍塌到 0.06（清晰相变）。
已改默认档：initialReservePerCapita 4→2.5、reserveCapacityPerCapita 4→3（容量须同步下调，否则等于没降）、forageRegenPerCapita 0.40→0.30。
修正后 9 种子实测：7/9 最低人均触及 0（真实断粮）、门开率由 0% 铺开到 99%、非生存/生存比 0.07~0.58。seed2 死 2 人（t162 dehydration / t163 starvation），死前仍在持续大量采集（后 50 tick 采 392 次 > 开局 314 次）——死亡性质是力竭而非疏忽，是健康的涌现。
测试断言已同步修订：agent-schedule-role / agent-society-consumer / economy-closure 三处「存活率恒为 1.00」改为「≥0.96」。旧断言实际在奖励资源过剩。改后 390/390 全绿。

【2. LAYA 能力图谱（逐位置实测，决定其唯一合适位置）】
- score 型是唯一严格单调且稳定的题型：同一批处境两次独立调用，断粮5天 0.595/0.604 > 断粮1天 0.382/0.409 约等于 储备紧张 0.366/0.398 > 储备充足 0.342/0.368。只此一型可用，已接入为压力分 15% 的语义分量。
- choice 型：择偶 4 处境方向正确（相合+好感高→accept 0.62、不合+好感低→decline 0.68），但多档中间态会塌陷（轻微亏损被判 expand 0.75，与持续盈利同标签）。
- choice 型在「关系语义」上会给出危险错误：旧恩未还被判 confront（置信度仅 0.05），而严重亏损被判 wind_down（0.62）是对的。即低置信度不构成不可信的警示，置信度不能当可靠性门槛。
- noul 型：只有极端危机能触发，中间态反向（持续盈利 0.025 vs 轻微亏损 0.008）。
所以 LAYA 的正确位置就是现状：score 型 + 小权重软调制 + 永不清零候选 + 默认关闭。关系语义判断与多档中间态判断都不该用它——那是数值打分与状态机更可靠的地方。

【3. 未提交】上述压力校准与测试修订尚未 commit（工作区脏）；下一轮先提交再继续调其他档位。
- [2026-09-25 18:18] [经验教训] catch 合并不同错误会误导诊断；用派生量代替直接事实必错 — 本阶段反复踩到同一类坑，值得固化：

## 1. catch 里把两类不同错误合并成一个原因，会把诊断引向完全错误的方向
探索 285 次全部报「背包已满，只能放弃 1 类物资」。真因是掉落物 scrap/cloth/... 
从未注册进物品目录，backpack.add 抛「未定义的物品」。我按「容量不足」处理，
于是花了整轮去查背包容量、加 freeSlots 判据、改决策层排除——全部无效。
**规则：catch 必须区分「预期内降级」与「配置/契约错误」，后者要单独浮出。**

## 2. 契约不一致的三个高发点（本阶段各中一次）
- 生产者把字段嵌套（decision-log 写 data.decision），消费者按直觉读 e.payload.action → undefined，静默无输出
- 生产者写纯字符串（decision: decision.action），消费者按对象读 .action → undefined
- 存储契约有字符集限制（tag key 必须 /^[a-z][a-z0-9_]{0,31}$/，点号非法），生成方不知情 → 整批写入失败
**规则：跨模块读字段前先读生产者的契约；不确定时兼容多种形状并显式归一化。**

## 3. 「新行动挤占既有行为」会反复发生（本阶段第 8 次苗头）
加入 expedition 后初版评分让它达 ~3.4 分（craft 只有 0.9）：探索 442 次，
craft 478→300、write→181、social 609→157，并引入 5 例死亡。
**规则：任何新行动的评分都必须与既有行动同量纲对标，且按「风险调整后的期望净值」打分，
不能只按收益打分。新行动上线后必须对比既有行动的绝对次数，不能只看新行动是否出现。**

## 4. 测试通过 ≠ 需求满足
「50 条特质标签」这个需求一直有个 5 条标签的实现，且所有测试都通过——
因为没有任何测试断言标签数量。原实现从 5 个固定标签里无放回抽 5 个，
结果是**全员标签完全相同**，这恰恰是「涌现」的反面。
**规则：需求里的数字（50 条、3 代、5 个家族特征）必须各有一条断言，否则等于没实现。**

## 5. 设计取舍之间会互相冲突，改一处要回头检查另一处
我加了「同维度取值互斥」（理由：避免一个人同时强健又孱弱），
结果它把后代锁死在 12 条（=维度数），与「100 条组合出 50 条」的需求直接冲突。
校验器里同一条规则也一起报了 39 个「非法」——校验器反过来暴露了设计错误。
**规则：新增约束时，回头跑一遍它与其它需求的交集。**
- [2026-09-26 00:32] [经验教训] reset 不全导致结果取决于跑过什么；泄漏还会伪造出通过的涌现断言 — ## 1. reset 不完整 → 同一份代码结果取决于「此前跑过什么」
loop.reset() 只复位十余个模块，而全项目有 **103 个**模块导出 __reset。
实测：同一测试文件内，先跑 3 人 12tick 局再跑 50 人 200tick 的 seed 2，存活率 1.000 → 0.940
（死者固定为 0032/0038/0050，t57~59 饿死，死前仍持续 eat 18 次/drink 19 次但 needs 顶格——
吃进去的没生效）。单独运行该用例则恒为 1.000。
**规则：任何新增模块级状态都必须同步加入 reset，且 reset 的覆盖范围要能对照 __reset 清单核查。**

## 2. 泄漏会「伪造」出通过的断言，比失败更危险
economy-closure 的「businesses 应跨种子出现差异」长期通过，
而真相是三种子 businesses 恒为 2（固定 bootstrap 路径）——
是泄漏把上一局的企业数带进下一局，才造出了差异。
补全 reset 后该断言正确地失败，暴露出真实的 D2 缺口。
**规则：清理状态后若某断言由通过转为失败，先假设「它此前靠污染通过」，而不是假设自己改坏了。**
  反例警示：我曾因此差点把 0.94 归因于自己的隔离改动。

## 3. 归因必须在「干净状态」下做，否则会追错方向
本轮我先把 0.94 归因于「隔离改动压低探索次数 345→18 导致补给不足」，
并准备去补偿探索收益。实际与隔离改动无关。
**规则：出现数值异常时，先确认复现条件是干净的（单跑该用例 / 显式 reset），再谈因果。**

## 4. 把「有机制」当成「机制有效」是伪机制的高发区
隔离机制三处同时坏掉却全部通过测试：不幂等（刷 9552 条事件占 66%）、
只增不减（永久隔离）、**状态从不被任何消费方读取**（只在测试里断言）。
**规则：新增一个状态写入点后，必须同时指出它的读取方（消费点）；
  只在测试里被读的状态等于装饰。**

## 5. 需求里的「对话」不能是模板 + 随机选人
实测 202 条帖子仅 8 种文本、1270 条回复仅 6 种文本；
谁说话由 prShuffle 随机决定、说什么从硬编码模板随机抽。
这类实现能通过「有发帖/有回复」的功能测试，但完全不满足「涌现的多智能体对话」。
**规则：验收对话类需求时要看去重率与说话者-内容的对应关系，而不是事件计数。**
- [2026-09-26 01:08] [经验教训] 写分析工具时我重复犯了「用聚合指标代替直接事实」——索引自身三处误报的教训 — 本轮为排查数据流转而写静态分析器，它**自身**出现三处误报，成因与我反复踩的坑完全相同：
**用聚合/间接指标代替直接事实**。记录在此，因为它比修好它们更有价值。

## 误报 1：只看直接调用，漏掉聚合命名空间访问
规则写成「文件里有 graph.read/query 才算消费者」→ 34/43 图类型误报「孤立」。
实际绝大多数消费者走聚合导出：`agent.memory.episodic.store.write(...)`，
而不是 `from './episodic/store.js'`。
**规则：消费者识别必须同时覆盖「路径导入」与「聚合命名空间访问」两种形态；
  只覆盖一种会把主流用法全判成不存在。**

## 误报 2：把「生产者」与「消费者」当成互斥集合
代码里写了 `.filter(c => !producers.includes(c))` → config.js 在 L498 自己
`graph.read({type: CONFIG_TYPE})`，却因「同文件既写又读」被判孤立。
**规则：既写又读是常态，不是矛盾；任何「互斥」假设都要先证伪。**

## 误报 3：正则边界的两个低级错误，却各造成一类假结论
- `...wildcard` 展开运算符：前一个字符是 `.`，被属性访问规则误杀 → 误报「只写不读」。
  修正：`..` 前缀视为读取。
- 复位函数只认 `__reset` → `loop.reset`、`_shared.__resetSeq` 被误报「无复位函数」。
  修正：认 `/^(__)?reset/i` 全部变体。
**规则：判定「某模式不存在」之前，先穷举命名变体与语法糖；
  否则「不存在」只是「我没匹配到」。**

## 通用结论
修正三处后：error 10 → 2、孤立类型 34 → 0，且这 2 条经**逐条人工核实都是真缺陷**。
即：一个分析工具在误报清零之前，其「发现的缺陷数」没有任何意义——
误报与真缺陷混在一起，且误报通常占绝大多数（本轮 10 条 error 里 8 条是误报）。

**因此：任何静态分析/审计产出，必须先做误报清零（逐条打开源码核实），
  再引用其结论；并写测试锁定诊断数量上限，防止退化。**

## 附带发现：派生数据必须防腐烂
flow-index.json 是派生数据，源码一变就过期。做法：生成器是唯一写入者（禁止手写），
测试重新生成并与仓库内文件比对，不一致即失败。适用于任何「从源码提取的事实表」。
- [2026-09-26 01:27] [经验教训] 建模数据流转时把「读者」当成状态变量是错的——端点是文件；且流转图天然有环 — ## 教训 1：只有「列出关系」不等于「表达关系」
第一版把读写关系写进叶子的 API 列表（write.xxx / read.yyy），
信息其实都在，但图上**零条边**——下钻时看不出任何流向，等于清单不是图。
**规则：图类交付物的验收标准是「有没有边、边是否指向正确两端」，
  不是「信息是否被记录」。我此前只检查了字段是否写入，没检查边是否生成。**

## 教训 2：端点的选择决定语义正确性
把「读者」建成「状态模块 A → 状态模块 B」的边是错的，因为：
写者与读者在源码里是**函数**，函数属于**文件**，不属于别的状态变量。
实测后果：foragePool 的 7 个读者全在 loop.js，却被画成指向 alive-pop-generation
——反查退化成「同文件第一个状态模块」。
**正确模型是四层三跳：写者文件 --(写)--> 状态单元 --(读)--> 读者文件。**
**规则：建图前先问「这条边的两个端点在本体上是什么」；
  若两个端点类型不同（状态 vs 函数），说明模型缺了一层。**

## 教训 3：数据流转图天然有环，acyclic 规则会误报
A 写 X、B 读 X；B 又写 Y、A 读 Y —— 这就是环，
但它描述的正是「两个模块互相影响」这一事实，不是缺陷。
`core-acyclic` 是为**调用依赖**设计的（调用有方向、有环即设计错误）。
**规则：套用现成架构规则前先确认规则的前提是否成立。
  依赖图 ≠ 数据流图；前者管方向，后者管影响，两者对环的容忍度相反。**
（本树已安装去掉 acyclic 的规则集，仅保留 forbid-dependency。另一种可选做法是给边
 换非 acyclic 语义的 kind，但那会丢失「写/读」区分，故未采用。）

## 教训 4：跨模块写盘要先建节点再连边
dep/target-missing 的真因是「同批写入时目标模块尚不存在」。
**规则：任何「先建节点、后连边」的图，写盘必须分两轮；
  且 parent 必须逐级补齐（Normify 要求 parent === id 去掉最后一段）。**
- [2026-09-26 10:27] [经验教训] 决策带宽：新行动挤占既有行为的第 9 次复发与根治 — 现象：接入 found 行动后存活率崩（seed1 15/50、seed2 0/50），而基线 50/50。根因：候选窗口由 selector.shortlist(limit) 与 pruner.prune(k) 两级**纯分数截断**产生，生存骨架基础分最低（forage/rest 0.2、eat/drink 0.3）而动态行动高（craft 0.9、work 1.0、found 0.6）。新增行动后骨架被挤出前 N —— 探针直读窗口为[craft,build,expedition,write,found,drink]，eat/forage 缺席，全镇不再采集，t25 食水归零后永不恢复。基线靠 forage=43 恢复并稳定 148-150。修法（三级，缺一不可）：1) selector 与 pruner **两级闸门必须同时豁免** —— 只修 pruner 后窗口仍是[drink,craft,build,expedition,write,found]，eat/forage 依旧缺席。2) 生存骨架（eat/drink/rest/forage）无条件保送 + 发展行动（found/socialize/court/accept）各占独立席位。socialize 是社交边唯一来源、court/accept 是生育唯一入口且有时间窗口。3) shortlist.limit 与 pruneK 必须一致（都 6→12），否则后一道闸切掉前一道放进来的候选（实测 shortlist(12)+prune(6) 使 build 被 craft 挤掉，60 tick 局 built=0）。关键教训：- 这不是排序错误，是**决策带宽不足**：把「生存」与「发展」塞进同一名额池必然互相挤兑。- 试错顺序错了：在 limit 上反复试 6/8/10/12 而不打印实际窗口，浪费数轮；  一次探针直读就钉死根因。**先看事实再调参**。- 过度矫正同样致命：为让 forage 可见而给它饥饿时 +1.5，结果口渴也去采集而非喝水。  正确语义是「有货先吃，无货才采」——仅库存见底时采集才压过进食。- 不要在高频路径上无理由消耗全局随机流：一次多余的 rng.float() 会让所有后续随机  序列整体错位，表现为无法直接归因的行为剧变。验收：50×200×3 种子存活 50/50/50；12 类行动全部出现无灭绝；累计创办 80/75/81、破产 73/69/76（跨种子分化）。
- [2026-09-26 10:27] [经验教训] 删除引导代码要追查连带副作用 + summary 口径即建模决策 — 1) 删除 seed 阶段固定创办企业的引导代码时，唯一一处 economy.bank.credit.apply 也一并消失   （它原本在 seed 里按 businessIds 循环放贷，而企业改由居民自办后 businessIds 恒为空）。   后果：creditIssued / interestAccrued 恒为 0，声誉→信贷整条经济路径静默失效，   且**没有任何测试直接报错** —— 测试断言 on < off，两者都是 0 时 0 < 0 为 false 才暴露，   报错信息还是「on=0 off=0」这种无法定位的描述。   修法：企业成立（found 成功）后即时放贷，并在 summary 累加 creditIssued。   教训：删除一段引导代码时，必须追查它是否**顺带承担了别的职责**。2) summary 的口径选择本身就是建模决策。businesses 报「当前存活数」时被市场容量锁在   上限（实测三种子恒为 5/5/5），真实的涌现差异被完全掩盖；改为同时报   businessesFounded（累计创办，实测 80/75/81）与 bankruptcies（73/69/76）后才可见。   教训：涌现验收指标要选**生命周期量**（累计发生/消亡次数），不要选**存量**。3) 静态分析器「缺陷数」在误报澄清前没有意义：flow-index 原报 2 error + 9 warning，   逐条核对后 3 条是误报（x.length = N 未识别为写入；派生缓存被当作泄漏），   6 条是真实 __reset 遗漏。修完 error 0 / warning 0。
- [2026-09-26 16:40] [经验教训] 「单元测试全绿而端到端为 0」——五条看起来已实现、实际从未发生的能力 — 本轮最贵的一课：五条能力在单元层面都是绿的，但在主循环里**一次都没发生**。
1) 家族三代特质固化：detector / enforcer 单元测试全绿，但**运行时没有任何调用点**，
   各家族特质数恒为 0；offspring.request 虽接受 familyTraits 参数，runProcreation 从不传。
2) 多代家族：有子代有谱系有家族登记，但每胎**新建家族** + 代际硬编码 + 生育上限 2，
   结构上不可能出现第三代（实测代数恒为 {0:…,1:…}）。
3) 记忆塑造行为：语义记忆持续写入、日志里看得到，但从未进入 scoreFn（只记不用）。
4) 人均库存充裕：存活率 1.00，但库存被人为容量天花板压在 1.9 而非 4，
   触发硬编码 2.5 的「余粮不足」闸门 → work 从 24.7% 崩到 0.8%、几近灭绝。
5) 观察者能看到社交内容：发帖事件正常写入，但 payload 无 content，编年志读不到居民说了什么。
共同点：它们都需要**端到端跑主循环 + 直接打印运行时状态**才暴露。
方法论：任何「参数接线」类改动，必须补一条端到端锁（真跑 loop.run 并断言可观测结果），
单元测试只能证明零件能转，不能证明零件被装上了。

附：性能塌陷的定位过程也值得记住 —— CPU 采样显示 88% 时间在 structuredClone，
指向 graph.read({ type })（48 个调用点、整批深拷贝，成本随节点数线性增长：
300 节点 0.65ms / 3000 节点 7.8ms / 30000 节点 51ms）。修法：惰性只读视图 +
高频写入源（语义记忆，50×200=10000 条）不落图。注意实测发现真正的瓶颈是
**[...ids].map() 的迭代器展开**（30000 节点时 150s/3000 次），换成显式 push 循环才解决。
不要凭直觉认定瓶颈在克隆上。
- [2026-09-26 16:40] [经验教训] 「单元测试全绿而端到端为 0」——五条看起来已实现、实际从未发生的能力 — 本轮最贵的一课：五条能力在单元层面都是绿的，但在主循环里**一次都没发生**。
1) 家族三代特质固化：detector / enforcer 单元测试全绿，但**运行时没有任何调用点**，
   各家族特质数恒为 0；offspring.request 虽接受 familyTraits 参数，runProcreation 从不传。
2) 多代家族：有子代有谱系有家族登记，但每胎**新建家族** + 代际硬编码 + 生育上限 2，
   结构上不可能出现第三代（实测代数恒为 {0:…,1:…}）。
3) 记忆塑造行为：语义记忆持续写入、日志里看得到，但从未进入 scoreFn（只记不用）。
4) 人均库存充裕：存活率 1.00，但库存被人为容量天花板压在 1.9 而非 4，
   触发硬编码 2.5 的「余粮不足」闸门 → work 从 24.7% 崩到 0.8%、几近灭绝。
5) 观察者能看到社交内容：发帖事件正常写入，但 payload 无 content，编年志读不到居民说了什么。
共同点：它们都需要**端到端跑主循环 + 直接打印运行时状态**才暴露。
方法论：任何「参数接线」类改动，必须补一条端到端锁（真跑 loop.run 并断言可观测结果），
单元测试只能证明零件能转，不能证明零件被装上了。

附：性能塌陷的定位过程也值得记住 —— CPU 采样显示 88% 时间在 structuredClone，
指向 graph.read({ type })（48 个调用点、整批深拷贝，成本随节点数线性增长：
300 节点 0.65ms / 3000 节点 7.8ms / 30000 节点 51ms）。修法：惰性只读视图 +
高频写入源（语义记忆，50×200=10000 条）不落图。注意实测发现真正的瓶颈是
**[...ids].map() 的迭代器展开**（30000 节点时 150s/3000 次），换成显式 push 循环才解决。
不要凭直觉认定瓶颈在克隆上。
- [2026-09-26 22:20] [经验教训] 「一天」已由数值隐含为 24 tick，改比例要连同七个节律参数一起改 — 结论（已核对源码，非猜测）：仿真内部隐含的「一天」≈ **24 tick**，不是拍脑袋定的，
而是由以下七个参数共同长成的自洽节律：
  needGrowth 0.08/tick × 24 = 1.92 需求/天，而进食 -0.5 → **约 3.8 顿/天**（符合一天三顿）
  ritualInterval=2（每 2 小时一次仪式）
  taxInterval=20（约每天收一次税）
  traitDriftInterval=10、feedInterval=10、communityDetectInterval=10（每半天一次）
  日程块长 12（半天一轮班）

适用范围与否定条件：
- 若把「一天」压缩到 8 tick（例如为配合 15 分钟/天的挂机节奏而改），上述七个参数
  **全部需要除以 3 重新标定**，否则会出现「每 15 分钟一次仪式」「日程块长横跨 1.5 天」
  「taxInterval 跨 2.5 天」这类语义错位。不要单独改 needGrowth 了事。
- 因此「游戏内一天 = 24 tick」应视为**数值层约定**保持稳定；挂机节奏是另一层问题。

挂机节奏换算（用户目标：现实 15 分钟 = 游戏内一天）：
  **1 tick ≈ 37.5 秒**。
  性能对照：实测单 tick 1.36 秒 → CPU 占用仅约 3.6%，一台机器可同时挂几十个镇子。
  代价：以当前 run({ticks:200}) 一次性跑完的用法会瞬间跳过 8 天，快进体验消失；
  做放置游戏必须改为按真实时间驱动 control.step()（该接口已存在且异步可单步），
  并提供可调倍速（如 1 tick/秒时 CPU 涨到约 100%，属快进按钮的应有代价）。
  游戏内一年（8760 小时）≈ 现实 91 小时 ≈ 4 天，家族三代演化需现实数天才能观察到。

推荐方案：做成可调配置项，默认 15 分钟/天，倍速按钮覆盖之。**待用户确认后才开工**。
- [2026-09-26 23:17] [经验教训] 函数改生成器时 return 必须一起搬，等价性只能用输出哈希证明 — 教训：把「返回一个对象」的函数改成生成器时，`return` 必须一起搬家，
否则消费者拿到的是最后一个 yield 的值（null），而不是结果对象。

现象：loop.step() 拆成 tickSequence 后，run() 的 steps 全部变成 null，
但没抛任何错误 —— 因为我把原 `return { tick, eventCount, ... }` 改成了
`yield unit('done', null, summary)` 却忘了把 `const summary = {...}` 与 `return summary` 补上。
哈希对比（0095c1a6… vs aa88f9d5…）是唯一报警信号；单看测试计数完全看不出来。

适用范围：任何「同步函数 → 生成器/异步生成器」的等价重构。
否定条件：不要因为测试通过就认为重构等价 —— 本次 4/4、3/3、8/8、10/10 全绿时，
steps 仍然全是 null。等价性必须用**输出哈希前后对照**（git stash 切换 HEAD 跑同一个探针）证明，
不能用测试通过来代替。

配套经验：tools.read 对单次返回有行数上限（请求 limit 2000 实际只回 921 行），
所以「整文件读入 → 字符串手术 → 写回」这条路要分块读；本次改用
bash + python3 做锚点替换（锚点唯一性用 count!=1 直接 fail）更可靠。
另：heredoc 与模板字面量里的反斜杠会被多轮转义吃掉，写脚本用 tools.write 落盘再执行。
- [2026-09-26 23:44] [经验教训] 「某阶段莫名占大头」= 全量查询进了循环，用阶段级计时探针定位 — 教训：同一个反模式（全量查询被放进循环/谓词内）在本项目已复发 11 次，
每次都以「某个阶段/函数莫名占大头」的形式出现，而不是以「报错」或「测试失败」的形式。

历次形态：
  graph.read({type}) 的 structuredClone 被 48 个调用点各调一次（30000 节点时 51ms/次）；
  [...ids].map() 的迭代器展开（30000 节点 3000 次调用耗时 150 秒）；
  business.list() 被放进 businessIds.find() 谓词 → O(企业数²)。

识别方法（可复用）：给主循环的每一步打时间戳，按阶段分桶统计 ms/tick 与占比。
占比与「该阶段应该做的事」严重不匹配时，就是全量查询被放进循环了。
本次正是靠这个探针发现 dispatch（只应做「把算好的决策落盘」）占了 66.3%。

适用范围与否定条件：
- 占比统计必须以**阶段**为单位，不能只看总耗时：总耗时下降可能来自别处；
- 修复后必须同时验证行为等价（输出哈希/行动分布），否则可能把语义改掉却看不出来；
- 不要在没有打印实际分阶段状态的情况下调参 —— 本次就是先量、后改。
- [2026-09-27 00:04] [经验教训] 阶段级计时探针是定位性能热点的可靠手段，但必须完整传配置 — 教训（方法层，已验证）：定位「某阶段莫名占大头」的正确手段是**阶段级计时探针**，
即消费 tickSequence、给每个单元打时间戳、按 id 前缀（冒号前）分桶，算出 ms/tick 与占比。
本轮正是这样发现 dispatch 占 66.3%、phase2 19.7%、decide 仅 10.2% —— 与「decide 和 dispatch 各约三分之一」的
直觉完全相反。凭直觉分配时间预算会浪费大量等待。

探针本身的两个坑：
- 必须把被测配置完整传进 tickSequence（本次第一次漏了 phase2/phase3，
  phase2 整个不出现、dispatch 虚高到 84.9%，差点据此下错结论）；
- 单元数会随人口变化（50 人开局，跑起来涨到约 61，decide/dispatch 各 61.5 单元/tick），
  所以「按单元均分预算」是错的，必须按阶段耗时占比分配。

适用范围与否定条件：
- 占比异常只在「该阶段职责与其开销严重不匹配」时才是缺陷信号；
  本次 dispatch 只该做「把算好的决策落盘」，却占 66%，才判定为全量查询进了循环。
- 修复后不能只看总耗时下降，必须同时验证行为等价（输出哈希 + 行动分布）；
- 测完先看日志再下结论，不要把「已启动测量」当成「已验证」。
- [2026-09-27 01:21] [经验教训] AgentTeams 基线任务需区分服务失败与任务失败 — baseline-auditor 的 t1 首次执行因上游 PI_AI_ERROR 服务异常失败，不代表代码或审计结论失败；已按原范围 reassign 为 attempt 2，等待补齐测试退出状态与入口复核证据后再判断。
- [2026-09-27 02:33] [经验教训] 性能任务首次失败属于流式服务中断，重试保持原范围 — t7 阶段计时/性能预算任务首次因智能路由流式响应中途中断（PI_AI_ERROR）失败，未形成性能结论；已按原范围重试为 attempt 2，不能把服务失败解释为代码性能失败，也不应扩大任务范围。
- [2026-09-27 02:39] [经验教训] 决策闭环任务首次失败属于上游服务异常 — t4 首次执行因上游 PI_AI_ERROR 服务异常失败，未形成代码或验证交付；已按原范围重试为 attempt 2，不能将该服务失败解释为决策闭环设计或实现失败。
- [2026-09-27 02:41] [经验教训] 持久化任务首次失败属于上游服务异常 — t3 首次执行因上游 PI_AI_ERROR 服务异常失败，未形成持久化代码或恢复验证交付；已按原范围重试为 attempt 2，不能把服务失败解释为存档设计或实现失败。
- [2026-09-27 02:42] [经验教训] 决策任务连续两次服务失败后进入最后一次重试 — t4 attempt2 仍因上游 PI_AI_ERROR 服务异常失败，未形成可审查交付；已按原范围启动 attempt3，若再次失败将由 Captain 接管，不能将服务失败当作实现失败。
- [2026-09-27 08:48] [经验教训] AgentTeams in_progress 状态不等于成员正在工作 — 检查到 t3/t4 状态为 in_progress，但对应成员实际 activity=ready、status=idle，长链任务没有继续运行。收到“任务停滞”报告时应查看 task 与 member activity；若 idle/ready，可通过 send_message 唤醒并要求检查既有改动、交付可验证最小闭环或说明阻塞。不要仅凭 in_progress 假定任务正在推进。
- [2026-09-27 09:14] [经验教训] t16 首次失败为上游502，尚无观测API交付 — runtime-engineer 的 t16 attempt1 因上游 502 No Response from Origin 失败，未形成实现或验证交付；已按原范围重试为 attempt2。此类网关/服务错误不能当作代码缺陷结论，重试后仍失败再考虑 Captain 接管。
- [2026-09-27 09:42] [经验教训] t20首次失败为502网关错误，按原范围重试 — verification-engineer 的 t20 首次执行因上游 502 SERVER 网关错误失败，未形成 flow-to-normify 修复或验证交付；已按原范围重试为 attempt2，不能把网关失败解释为生成器代码缺陷。
- [2026-09-27 10:04] [经验教训] t12目标引擎被共享日志别名错误阻塞，不能据局部测试宣称完成 — t12目标引擎已接线并自测17/17，但发现共享 decision-log.js 使用未定义 HOT.note（实际导入别名hotLog），会让主循环决策记录抛ReferenceError并连带失败。问题非t12引入，已通知persistence-engineer在t9中优先修复；在全局阻塞解除并重跑回归前，不将t12视为完成。
- [2026-09-27 10:05] [经验教训] 日志别名阻塞是编辑中间态，需以当前代码和回归验证为准 — decision-log.js 的 HOT/hotLog 错误只存在于两轮编辑之间的瞬时状态，当前三类日志均已建立模块级日志实例；直接record、3 tick主循环和observer/runtime/API/timeline测试44/44通过。后续判断共享文件阻塞应以当前代码复核和定向回归为准，不把瞬时中间态当作最终缺陷。
- [2026-09-27 10:18] [经验教训] flow派生物必须在源码任务全部停止后统一收口 — t20由Captain接管核验：flow-to-normify已具备阶段目录、原子换入、父先子后排序、批量控制和API锚点校验，但并发t8/t9/t12源码变化使flow-index生成192而当前索引176，flow-index定向测试5/6失败。因此不能宣称t20完成；应等所有源码任务停止后统一运行flow-index与flow-to-normify，再做Normify validate/build/render。
- [2026-09-27 11:14] [经验教训] 热日志裁剪不可静默改变审计API语义 — t12验证发现t9当前hot-log将list()从全量历史静默裁剪为热区1500条，50×200决策10000条只能读到1500；模块级logs未reset还会造成跨run stats/evicted累加。该问题会污染涌现与同种子复现证据，已转交t9：必须恢复全量可读或显式区分all/hot/archived，并纳入reset与独立进程一致性测试。
- [2026-09-27 14:11] [经验教训] 验证成员空闲超时且无未完成attempt时不重复派发 — verification-engineer 的后台尝试因 pi-ai stream idle timeout 300000ms 结束，但团队状态显示无 open attempt、任务t20仍由Captain失败接管状态，未产生新交付；应避免重复派发该超时会话，继续按现有任务状态推进。
- [2026-09-27 14:23] [经验教训] 节拍器任务传输失败后保留既有实现并按原范围重试 — t8 attempt3 因 TRANSPORT 连接错误失败，未形成正式交付；已有实现与15/18测试进度仍保留，已重试attempt4，需补齐剩余节拍器测试和正式验收证据。旧会话报告的观测API404与t16已验证的84/84及端到端路由证据冲突，不据旧探针重复修改t16。
- [2026-09-27 14:26] [经验教训] 社会文明任务传输失败后保留范围并重试 — t5 attempt2 因 TRANSPORT 连接错误失败，未形成社会/代际/文明接线交付；已按原范围重试为attempt3，不能将连接失败解释为代码审计失败，需等待完整证据后再判断。
- [2026-09-27 14:47] [经验教训] 反事实任务502失败但成员忙于t21，需串行重试 — t10 首次因上游502 INVALID_REQUEST失败，未形成反事实分支交付；decision-engineer 当前正持有t21，不能并行重试t10，待t21完成后再按原范围重试，不能把服务错误解释为实现失败。
- [2026-09-27 14:49] [经验教训] 热日志治理任务连续服务失败后按原范围重试 — t9 attempt3 因上游502 SERVER失败，未形成日志/图节点/记忆上限交付；已按原范围重试attempt4，继续要求list全量可读或显式分层API、跨run reset和一致性测试，不能把服务失败当作实现结论。
- [2026-09-27 18:38] [经验教训] 沙箱实验必须在沙箱目录里执行 git 命令（否则会回退实时工作区） — 【事故】做因果归因实验时，我用 git worktree 建了沙箱 /tmp/xxx，cp 完文件后直接执行了
`git checkout HEAD -- src/api/observer.js src/api/control.js src/runtime/index.js`，
**但当时 cwd 仍是实时工作区**（cd 到沙箱的那一行写在后面）。三个文件的未提交改动被回退到基线，
其中 src/api/observer.js 是队友的 t16 交付（约 430 行观测 API + 9 条路由），**无逐字副本、无法无损恢复**，
只能以测试契约为准重建。

【根因】把"改沙箱"和"改实时区"的命令写在同一段 shell 里，靠 cd 的先后顺序区分——顺序一旦写错，
破坏力是"删掉别人的未提交工作"，而 git 对此**没有任何补救手段**（未提交内容不进 object store，
stash/reflog 都救不回来）。

【预防（务必照做）】
1. 沙箱操作**一律** `git -C /tmp/xxx checkout ...`，绝不依赖 cd。用 -C 时命令自带目录，
   写错目录在语法上就不可能发生。
2. 破坏性 git 命令（checkout/restore/clean/reset）执行前，先 `git rev-parse --show-toplevel`
   确认目标仓库，并 echo 出来。
3. 动手前先把"当前 cwd 与目标仓库"打印出来，不要靠记忆。
4. 任何"要覆盖/回退"的文件，先在 /tmp 留一份原样副本（cp 到沙箱那一步就是副本，
   但后续不能再被 git show 覆盖掉）。

【代价】队友的 t16 交付变成"契约等价重建"，我只能如实标注"无法自证字节无损"，
这直接降低了整条验收链的可信度。
- [2026-09-27 18:38] [经验教训] 异步驱动器必须每 tick 让出宏任务，否则饿死事件循环（表现为整进程挂死） — 【现象】挂机节拍器（t8）在全速模式（msPerTick=0）下，整个 Node 进程连同测试框架一起**挂死**：
不是报错、不是超时断言，而是 setTimeout 回调永远不执行。

【根因】tick 的计算体是"同步代码包在 async 里"，其 await（async generator 的 .next()）**只消耗微任务**。
驱动循环若每个 tick 都不让出宏任务（全速模式没有任何 sleep；或摊分预算已被计算超支，
负等待被 delay() 直接吞掉），就变成**纯微任务死循环**——微任务队列永远被重新填满，
事件循环的 timer/check 阶段永远轮不到。于是 setTimeout、HTTP 请求、SSE 推送、自动保存全部失效。
同样危险的是"逐单元 sleep 时把负等待也补成 setTimeout(0)"：那样每 tick 会叠 N 次 1ms 定时器，
把快进模式拖慢十倍。

【正确做法】
1. 驱动器每 tick **至少**让出一次宏任务（一个 `new Promise(r => setTimeout(r, 0))`）。
2. 用"本 tick 是否已让出过"的布尔量去重：摊分时已经真的 sleep 过，就不要再补，
   避免在逐单元 sleep 上叠加 N 次 setTimeout(0)。
3. 全速模式（预算=0）走的就是"末尾补一次让出"这条分支。

【教训】"CPU 密集的 async 循环"是 Node 里的经典陷阱：await 不等于让出事件循环。
凡是自己写 tick/driver 循环的地方，都要能回答"我这一轮在哪里让出宏任务"。
- [2026-09-27 19:30] [经验教训] 恢复边界：观测历史 vs 当下事实必须分开处理，不能一刀切 — 【场景】stage-progress（t16 阶段进度）有三个模块级状态，入档时若一律"存/清"就会必错：

| 字段 | 性质 | 该怎么办 |
|---|---|---|
| recent（最近 32 个已完成 tick 的阶段时间线） | 本进程的**历史观测** | **刻意不入档**，恢复后必须为空 |
| currentTick（进行中的 tick） | **半提交态** | **刻意不入档**，恢复后必须为 null |
| backgroundDriver（有没有后台推进器在跑） | **当下运行事实** | **入档并恢复** |

【判据（可复用）】问两句：
1. "这个字段描述的是**当前世界是什么**，还是**上一个进程怎么跑的**？"
   后者是观测杂质——它在"世界等价"判定里没有意义，持久化它等于把杂质变成契约。
   而且它一旦入档，恢复后就会看到别的进程/别次运行的历史，直接破坏既有断言。
2. "清掉它会不会让对外报告**说谎**？"
   backgroundDriver 清成 false 而节拍器其实在跑 → 观测 API 谎报 driver='manual-step'，
   正是 t16 明文禁止的"用标签伪装真相"。**会被谎报的事实必须恢复。**

【配套设计】
- __snapshot() 只返回可恢复子集；用 dropped:{recent,currentTick} 之类的**描述性元数据**
  如实报告"丢了什么"，让人一眼看出是有意丢弃而非忘了存。注意它是**描述**不是状态，
  __restore 后按实况重算（因此 before/after 本来就不该相等）。
- __restore() 要能收敛**旧档夹带**：即使入档数据里带了 recent 本体，也必须清空——
  否则新旧档行为分叉，取决于"存档是哪个版本写的"。
- 残缺入档取**保守方向**：'true'/1/缺字段都不算"有后台"（宁少报成手动步进，不谎报后台运行）。
- __restore（世界续跑：保留当下事实）与 __reset（世界重来：全量归零）分工要写进注释，
  且 markRestored 用前者、loop.reset 用后者。

【连带发现：一条通用陷阱】
给 persistence 的「逐 section 全等比对」用例加 section 后，原有断言失败。
**但真缺陷不在新代码，而在那条断言本身**——它施加了通用的 deepEqual(after, before)，
而本模块恰是唯一**故意**不满足逐字段一致的 section。更关键：它此前**根本没在比什么**
（未注册的模块进不了 state.SECTIONS，"逐 section 比对"对它的失配是**不可见**的）。
**一个永远不失败的断言比没有断言更危险：它让人以为这里有覆盖。**
新增 section 时，必须审视既有通用断言对该 section 是否仍然成立，并把例外显式列出。
- [2026-09-27 19:30] [经验教训] 新增持久化 section 时必须复核既有"通用全等断言"是否仍然成立 — 【现象】往 runtime/state.js 的 SECTIONS 注册一个新 section 后，
test/persistence.test.js 的「存档经 JSON 往返后恢复无损（逐 section 比对）」失败。

【第一反应是错的】直觉会说"新代码破坏了既有契约"。实际相反：
那条用例对该 section 施加了**通用**断言 `assert.deepEqual(after, before)`，
而新 section 恰恰是**唯一故意**不满足逐字段一致的（它刻意不持久化观测历史）。

【为什么此前从未暴露——这才是重点】
它此前**根本没在比什么**：没注册进 SECTIONS 的模块根本不会出现在 capture() 里，
于是 for 循环遍历不到它，"逐 section 比对"对它的失配是**不可见**的。
反过来说：**注册 section 的第一件事，就是让原本不可见的失配变成可见的失败。**

【教训】
1. 永远不失败的断言比没有断言更危险——它让人以为这里有覆盖。
   "逐 section 比对"这类**通用/全量**断言，会随被覆盖对象增加而改变含义，
   必须随新成员复核，而不是假设它天然成立。
2. 遇到"新代码让老断言失败"时，先问：**是代码错了，还是断言编码了错误的契约？**
   本例是后者。修法是显式列出该 section 并**逐字段说明各自为什么**，
   而不是让通用断言替它背书、也不是把新 section 排除在外了事。
3. 具体到本模块：backgroundDriver 必须一致（可恢复子集）；
   dropped 是采集当时的描述、恢复后按实况重算，**本来就不该相等**——
   before recent=3 / after recent=0 恰恰证明历史没被恢复回来。
   把"不该相等"写成断言，比容忍一个模糊的 deepEqual 更有信息量。
- [2026-09-27 21:08] [经验教训] 目标规划（goals）挤占求偶链导致生育下降：是权重而非引擎，且无安全小权重 — t28 诊断（F5）：goalPlanningEnabled=true 时小规模种群生育显著下降，被误读为"存活退化/恢复假象"。

实测（20 人 × 40 tick，seed 7/11/42，scheduleEnabled:false）：
  GOAL_ON (goalWeight=0.35): alive/births 21/1 | 22/2 | 24/4
  GOAL_OFF                : 27/7 | 31/11 | 27/7
  GOAL_ON (goalWeight=0)  : 27/7 | 31/11 | 27/7  ← 与 OFF 三 seed 完全相同

三个关键结论：
1) **不是死亡，是生育被压制**。人口算术闭合且死亡事件两侧均为 0：
   ON 21 = 20 初始 + 1 出生；OFF 27 = 20 + 7。修法要保护求偶-生育链，不是防饿。
2) **是权重，不是引擎**。goalWeight=0 时引擎照常运行（started 51 / yielded 159），
   但存活与出生与 GOAL_OFF 逐位相同 → 引擎机制行为中性，全部退化来自那一个加分。
3) **不存在安全的小权重**。w=0.05 就已掉出生（32/12 vs 36/16）。
   所以调小全局权重**不是**修法。

机制：目标步骤（forage/craft/trade）挤占求偶链。20 人 seed 7 × 60 tick 事件差：
  socialize −29 | interaction.proposed −21 | accepted −10 | procreation −12 |
  residence −11 | write.completed −27 | trade +12。
现有 yielded 规则（175 次）只覆盖「有人等我答复」的 accept 窗口，不覆盖求偶阶段（找伴侣），
因此生育链断在配对之前。

规模依赖：20 人 −12/−7/−1；30 人 −6/+4/+1；40 人 −3/0/0。
t12 只测了 40 人 × 60 tick 就声称存活一致 → 小规模从未被覆盖。

**自我纠正（重要）**：t12 报告里写的「goalWeight=0.35 远小于生存门 5 分量级」是错的。
它比较的是单次决策分数，漏掉了「每个 tick 反复竞争」的累积效应。

修法方向（选择性让位，非调参）：
  (a) 把 yield 规则从 accept 窗口扩展到整条求偶链（无伴侣且可生育时目标让位 socialize/court）；
  (b) 或让目标加分不与生育/生存动作竞争（对该类动作不加分，而非减分）。
不能全局降权：t12 实测 craft +47% / trade +114% 的收益正来自该权重，w=0 会连同收益清零。

评估口径：恢复等价判定须先按语义排除 (a) stage dropped 观测元数据、
(b) craftJobs.startedAt 墙钟字段，再比对（t27 已按此口径确认 4/6/10/20 人 × 3 seeds 共 12 组等价）。
该口径**不得**用来解释上述生育退化——w=0 回到 parity 已证明二者独立。
- [2026-09-27 21:26] [经验教训] section 级 __snapshot/__restore 不是整世界 API：跨 section 拥有的字段会静默不一致 — 【现象（t14 报告，我复现确认）】loop.__snapshot() 在 tick 5 采集、step 到 tick 6、再 loop.__restore(snap) 后，
得到 clock.tick=6 但 committedTick=5 —— 一对**互相矛盾**的值，且**不报错**。
而 persistence.saveRun/restoreRun 能完整恢复（clock.tick=5、committedTick=5）。

【根因】loop.__snapshot 里带了 tick 派生字段（committedTick/inFlightTick），
但**时钟的权威在另一个 section**（clock）。两个 section 各自只管自己：
  - state.js:104 clock  section —— 拥有 tick
  - state.js:110 loop   section —— 拥有 committedTick/inFlightTick
单恢复 loop 而不恢复 clock，就得到一个"世界对、边界错"的沙盘。

【关键：这不是 live 缺陷，是潜伏陷阱】
  - grep loop.__snapshot|loop.__restore 全仓 → **0 个调用者**。只经 state.capture/restore 通用机制调用，
    而它总是恢复存档里**所有** section，真实 saveRun 的存档必然含 clock → 始终成对，一致。
  - t10 的反事实用的是 persistence.saveRun/restoreRun + loop.markRestored（counterfactual.js:168/193/194/438），
    **根本没走内存快照** → 实测一致，t14 推测的"影响反事实/配对实验"**不成立**。

【真正可达的潜伏路径】存档 sections 缺 clock 但含 loop 时：
  - persistence.restoreRun **不抛**，只回报 validation.ok=false / missing=['clock']；
  - state.restore 会**跳过**缺失 section（只记进 missing），于是 loop 被恢复、clock 没被恢复 → 不一致；
  - 观测 API 层会拦（HTTP 400 存档不完整）——但**保护在 API 层，不在 persistence 层**。
    任何忽略 validation 的调用方都会静默拿到矛盾状态。

【教训】
1. 判断"某个 __snapshot 该含什么"，要问：**这个字段的权威在谁手里**。
   若字段是派生量（committedTick 派生自 tick），把它放进 A 的 section 而权威在 B，
   就制造了"只恢复 A 就自相矛盾"的陷阱。
2. section 级 API 的契约是"我只管我自己"。测试它时必须**成对**调用
   （state.capture/restore 整份），单独调用它测的是不存在的契约。
3. "不抛错但回报 validation"是弱保护：保护强度取决于**每个**调用方都检查它。
   要么在最低层拒绝（restoreRun 抛），要么在最高层统一拒绝（API 400，现状）。
- [2026-09-27 21:28] [经验教训] loop局部快照不含时钟但完整恢复路径成对还原 — 实测loop.__snapshot/__restore单独调用会恢复loop提交边界但不恢复clock；但全仓无直接调用者，state全量存档路径总是恢复clock与loop，t10反事实使用persistence.saveRun/restoreRun且时钟一致，因此不是当前可达反事实缺陷。唯一潜伏风险是缺clock但含loop的损坏存档：restoreRun validation标missing而不抛，API层拒绝400；建议锁定恰缺一个core section时API拒绝，并说明loop API是section级快照。避免无证据扩大为时钟恢复修复。
- [2026-09-27 21:30] [经验教训] loop局部快照时钟缺失在当前完整恢复路径不可达 — 已验证loop.__snapshot/__restore单独使用会留下clock与committedTick不一致，但全仓无直接调用者；t10反事实走persistence.saveRun/restoreRun，完整section路径会成对恢复且clock一致，因此无需反事实时钟修复。潜伏条件是损坏存档缺clock但含loop：restore validation报告missing，API返回400拒绝。已建t29待t28后补单core缺失拒绝测试和section快照边界说明。
- [2026-09-28 00:39] [经验教训] 失败任务终态不可伪改，需拆分依赖与共享范围 — 已确认t26为不可变failed(partial)，不能伪标completed解除t28依赖；t28领取被失败依赖阻塞，且t29与其共享loop.js。smoke.p2进一步证实企业创建4个但后续破产剩1个，真正缺口是可达且完成的write_book链路，可能与t28决策候选路径重叠，不能并发新建重叠修复。
- [2026-09-28 01:11] [经验教训] 运行中团队无法重构重叠任务图 — 尝试把t28从不可变failed t26依赖中解耦时，AgentTeams拒绝：t28与t29已有共享inScope（含loop.js及相关测试），运行中团队只允许有限pending任务更新，不能删除/重划任务或创建重叠repair；t26终态也不可变，无法伪标completed。当前需要在团队生命周期允许的计划编辑窗口重构依赖，或结束旧团队后按用户明确意图建立新计划，不能用重试绕过依赖。
- [2026-09-28 01:12] [经验教训] 运行中AgentTeams无法解耦失败依赖与重叠范围 — 实测重构失败：t26是不可变failed，t28依赖t26无法领取或接管；t28与t29存在共享inScope，运行中团队拒绝删除/重划任务和创建重叠repair。不能伪标completed或用重试绕过；后续必须在可编辑计划窗口把t28改依赖已完成基线、将t29串行化后再启动。
- [2026-09-28 02:26] [经验教训] 切换回 Truman Town master 后尝试修写书仍未通过回归 — 本轮确认当前工作树需使用 master 分支的 LinYi/Truman Town 运行时；先前 refactor/complete-project-rewrite 是另一套 Python 重写仓库，不能用于继续本目标的 runtime 验收。master 分支基线复测：decision-closure 的结果学习生存断言仍报 alive=21 vs 25，smoke.p2 仍缺 write_book action-log；integration2 的 2人60tick生育用例通过。尝试将不识字者 write score 设为 -1 并传入 literacy 状态，未使 smoke.p2 写书回归通过，也未修复生存差异，已全部撤回。后续应从日志可观察的选择分布及候选入选原因出发定位写书选择被压制，而不是先假设 literacy feasibility 是原因；结果学习出生链仍须独立因果分析。无源码修改被保留。
- [2026-09-28 02:31] [经验教训] 结果学习偏置首处分叉已量化，窄抑制方案被否定 — 本轮在 master 分支复核 seed=11、12人、phase2、tick=7、agent_000000000003：同一候选集与同一 craft_and_sell 目标步骤下，学习开启选择 forage，forage 最终分数 1.3747089133；关闭学习选择 craft，craft 分数 1.2275696905。学习开启时 outcome expected=1、samples=2、confidence=0.6620616636、bias=0.1986184991；关闭时未知、bias=0。尝试仅在存在非 forage 目标步骤时抑制 forage 正偏置后，回归更差（alive=20 对 25），已撤回。integration2 的 phase2 生育用例通过；decision-closure 生存回归仍失败，smoke.p2 write_book 仍失败。后续应从结果学习如何跨越生存/发展边界及写书候选被压制的完整评分链定位，不能继续把单一动作偏置抑制当作安全修复。

## 行动指南 Action Guide

- [2026-09-22 12:38] [行动指南] 楚门小镇沙盘下一步实现路径 — 设计已收束至 5 层 226 个 planned 模块，建议停止横向扩展，进入代码实现。后续按叶子实现源码后调用 normify_module_refresh({ids,repoRoot,activate:true}) 逐个转 active；容器随子树落地自动激活；每次结构演进后同步 normify_layout_upsert 并重跑 normify_validate/normify_build/normify_render；用新 change_open/change_close 闭环。优先实现顺序：runtime 主循环 → survival 资源/需求/健康/环境/事件 → observer 记录器/编年志 → agent traits/psyche/inventory/crafting → social family/politics/culture → ai.prompt/llm → civilization tech/legacy/relic/restart → economy 账本/破产 → town 空间。
- [2026-09-22 23:39] [行动指南] 楚门小镇后续三条可选路线与建议 — 三阶段交付后 captain 给出三条路线：①第四阶段做完剩余 63 个未实现叶子（agent 14 / social 8 / survival 8 / economy 7 / genesis 6 / ai 5 / civilization 4 / observer 4 / infra 3 / api 2 / town 2）；②不加新模块做长期运行调参与稳定性；③归档 truman-mvp。captain 建议先做②。路线②需用户提供 5 项即可开工：真实 LLM 还是 stub（真实则给环境变量名，不贴 key）、tick×居民×种子规模、可接受最长运行时间、是否允许为调参小改代码、交付物形式（报告/bench 脚本/面板/改默认值）。captain 建议先跑免费基线：phase2+phase3 全开、50 居民、2000 tick、10 种子、stub，产出资源曲线/存活率/崩溃率/经济分布报告后再定目标值。
- [2026-09-23 13:13] [行动指南] 下一步：本地嵌入接入 + 路线 A（A1 为默认口径） — 用户指令：先完成 embed 对内嵌本地小嵌入模型推理框架的支持，然后执行 A。captain 已把 A 修正为三选并默认按 A1 执行（用户未明示时）：A1=难度档位产品化（needGrowth/采集池暴露到 api 控制面）+ 本地嵌入检索质量对照（stub 哈希向量 vs MiniLM 语义向量，零 API 成本、可复跑）；A2=难度档位 + 真实模型决策质量对照（约 40–150 次真实调用、20–60 分钟）；A3=只做难度档位，嵌入仅接入网关。理由：真实模型对照已在 bench-baseline-real.md 覆盖（4 居民×30 tick、40 次调用、p50 26.2s），受延迟与成本限制难产出统计可信的决策质量结论，而嵌入收益可用本地模型零成本量化。当前 HEAD a8d1f20：282/282、validate 0 error。
- [2026-09-24 17:36] [行动指南] 待用户决策：批次3 前是否先做主循环 graph.read 批量化优化 — 批次2 已闭环（HEAD 4bb0ca3，143 active/84 planned，npm test 390/390，validate 0 error）。**当前阻塞在用户决策**，captain 已向用户提出三方案待选：①**先做主循环性能优化再开批次3（captain 推荐）**——把残余 60% 的 structuredClone（来源 memory.recall / observer 日志 / snapshot 的逐项 graph.read）批量化，一次性投资覆盖后续全部批次；②直接开批次3、出问题再修——最快但大概率重演本批次「实现完才发现 2~4× 回归」；③开批次3 但把性能门禁（≤4s 且不劣于基线）写进每个任务验收——折中治标。推荐理由：本批次三次性能回归（t47 O(t²)、t52 2.9×、t53 3.9×）**全部发生在功能实现之后**，每次需额外派任务定位+修复+复验（t52/t53/t54 三个任务），而主循环 graph.read 是所有模块共用的底层路径。**后续批次规模**：批次3（起源与文明）14 模块、批次4（基础设施与边缘）12 模块，合计 26 个。**环境约束（本轮实测）**：ask_user_question 工具在本会话中调用超时（wall-clock ceiling 600000ms），无法用它征求用户决策——**征询用户决策时应直接在回复正文中列出选项，不要依赖 ask_user_question**。
- [2026-09-24 19:32] [行动指南] 设计待批：D0 行动空间与候选池地基 → D1 LLM/记忆进决策回路 → D2 ai.speech 对话 — captain 已向用户提交「让智能体真正决策」的设计方案并**等待批准，尚未改任何仿真代码**。方案分三层，顺序不可颠倒：**D0 行动空间与候选池（地基，必须最先）**——①行动空间从 4 种（`DEFAULT_ACTIONS` eat/drink/rest/forage）扩到覆盖已有模块，新增 `craft`/`build`/`write`/`trade`/`socialize`/`court`/`work`/`explore`，每个都需真实 `effectFor` 分支调用已 active 模块；②候选池**动态化**，按居民状态生成候选（有材料+会配方→出现 craft；背包有货→trade；有社交需求→socialize），而非出生时固定 4 个；③**删除硬编码**：`runCrafting`(`_stage2.js:715-742`) 改为只推进队列（`tick()`），移除 `agents[0..2]` 指派。**D1 让思考与记忆进入决策回路**——④LLM 参与行动选择（在 `decide()` 内从候选池挑或调分，而非叙述既定行动；为保性能与可复现用抽样 `--real-every N`、默认 stub）；⑤`ranked`/`semanticMemories` 进入 `scoreFn`（当前唯一消费者是观察者日志，见 `loop.js:373`/`:377`），改后可用消融验证。**D2 对话机制**——⑥实现 `ai.speech.generate`/`polish`（现 planned）替换平台模板，且对话须影响关系边与声誉。**验证方法（不再只看计数）**：①**归因测试**——同局面下把「候选池决定者」从规则换成随机，**行动分布应显著改变**，不变即仍是布景；②消融——关记忆/对话后行动分布与关系图应变化；③每层完成都像 `4bded3e` 那样留真实文字样本。**captain 向用户提的两个待决问题**：(a) 是否按 D0→D1→D2 顺序（captain 强烈建议 D0 先行，否则 D1 的 LLM 只能在 4 个行动里挑，等于白做）；(b) 范围——D0 估 3–4 个任务、D1 3–4 个、D2 2–3 个，是一次全做还是先只做 D0 看效果。**captain 的建议**：把此前挂起的「批次3 前主循环性能优化」**并入 D1**（D1 本就改决策回路，顺手批量化 `graph.read` 比单独做更省）。**阻塞点**：用户的原始问题是「之前和 grok 的模拟有没有暴露智能体对话机制」→ 已答（无对话机制）；用户回复「做，先在设计层面进行」→ 设计已交付，**现等用户批准后才动代码**。
- [2026-09-24 23:13] [行动指南] 下一步：D1 让 LLM 与记忆真正进入决策回路 — D1 待办（D0 已就绪才动手，否则无意义）：(1) 当前 rank 的唯一消费者是观测日志字段 topDriver、semanticMemories 的唯一消费者是 context.semantic、scoreFn 中没有任何记忆项 —— 即 LLM 与记忆对行为零影响；计划让 LLM 对候选重排、把 semanticMemories 接入 scoreFn。(2) D2：实现 ai.speech.generate/polish（当前 planned）替换 _stage2.js:928-955 的 SICK_TEMPLATES/CHAT_TEMPLATES/REPLY_TEMPLATES 模板对话。(3) D0 遗留：socialize/court 在 200 tick 内占比 0，需检查 pickPeer 与 eligibleMate（当前恒为 false）是否过严；candidateStateFor 的 employed 依赖代码先建好的产业，应让居民自己创业/受雇。
- [2026-09-24 23:57] [行动指南] P1 待办：社交层改由居民决策驱动（含完工判据与风险） — P1 尚未开始写（0 行），范围已收敛为 3 处源码改动：①去掉 `runSimilarityBonding` 的 `agents[0]` 硬编码，把它从「生成者」降级为「平局兜底」；②打开 socialize/court 的可达性（真实择偶资格，替代 eligibleMate 恒 false）；③婚配改为消费双向 court 决策，不再用 match.pair + rng.shuffle 直接配。**完工判据**：社交层归因测试通过——`actionSpaceAttribution: true`（决定者换随机）时边数/家族/社群必须显著变化或坍塌。当前实测完全不变，故该测试现在必然失败，它就是距离刻度。**风险与成本**：代码量小（3 处），但验证是大头，且大概率需一轮稳定性返工——让社交行动真正消耗 tick 会重现 D0 在 seed2 上「制作挤掉采集导致整镇渴死」那类问题；且社交改为决策驱动后边数会**低于**当前 204–216，必须先约定新期望基线，不能拿旧数字当目标。单次验证成本：200 tick × 3 seed ≈ 20s，加 390 测试套件 ≈ 100–200s。
- [2026-09-25 00:56] [行动指南] P1 收尾：7 个失败测试待处理 + 两个存活断言待查清 — 下一步（未完成）：node --test 现为 383 通过 / 7 失败。7 个失败已逐个定性，多数是「断言旧机制」而非存活回归：(a) agent-persona-lifecycle 的 wiring 测试断言 social.friendship.similarity 事件——正是 P1 删掉的硬编码建边，该改为断言社交边由 socialize 行动产生；(b) integration2 的 phase2 生育测试（2 居民 × 4 tick）依赖旧的 t=0 无条件配对，现在需先 court 再 accept，该加 tick 或预置求偶信号；(c) integration2 的 craft:axe action-log（20 tick × 12 人）受背包材料与生存门双重约束，该调测试配置；(d) economy-closure 的能量消耗与存活人口相关——两种配置存活人口都是 50 线性关系被拉平，该调测试配置；(e) reputation-triage 的帖子数 828!==853 是社交行动影响平台发帖所致，属正确耦合，该更新断言；(f) economy-batch1 与 economy-tax-credit 的存活率断言报 0!==1，与本地复现的存活结果不一致，须先查清是否为测试间共享 loop.reset() 状态导致，确认无真实回归后才动断言。改完走流程：node --test 全绿 → Normify 刷新受影响模块指纹 → validate/build → 提交。硬约束：50 居民 × 200 tick × 3 种子原始居民必须全部存活。
- [2026-09-25 01:35] [行动指南] 待决：修需求计量管道（根因）还是先加第三条门判据（保守） — 下一步（已向用户提出，等待选择，未开工）：方案 1 修需求计量管道——让 runSurvival 的 config.needGrowth 真正写进居民需求读数，使生存门能随饥饿上升而开；这是根因修复但会改变大量依赖『需求恒定』的既有测试数值基线，并牵动 D0 验收数据。方案 2 给门加第三条判据——在『需求达阈值』与『人均库存低于阈值』之外，增加『库存绝对水位低于警戒线』或『上一 tick 净消耗为负』，让门不依赖需求读数也能触发；保守、可尽快收尾 P1，但需求读数仍是死的，D1（LLM 入环）会再次踩到同一个坑。倾向方案 1。另：P1 剩余 5 个失败测试（wiring 相似度社交纽带事件、phase2 生育 2 居民×4 tick、craft:axe action-log 20 tick×12 人、能量消耗与存活人口相关、帖子数 828!==853）已定性为『断言旧机制/该调测试配置』，但应在需求计量修复后一并处理，避免重复改基线。
- [2026-09-25 02:11] [行动指南] seed42 塌陷真正待查线索：t3 一 tick 内食物库存 91→40 — 下一步（未完成，方向已变）：需求计量管道已排除，seed42 + phase2 存活塌陷的真因待查。目前唯一硬线索来自独立前缀对比：t3 单 tick 内食物库存从 91 掉到 40（约 51 单位），而 effectFor 的 eat 分支只 survival.resources.food.consume(1)，因此存在某条逐居民、非 1 单位的库存消耗路径，或 phase2 某环节在 t3 集中扣减。查法建议：在 food.consume/decay 处统计每 tick 消耗来源（可用临时事件日志，因 store 无法猴子补丁），对比 phase2 开关下的消耗量。注意 D0 曾记录过 seed2 因早期制作耗尽水库存而整镇渴死，与此现象可能同源。P1 剩余 5 个『断言旧机制』的失败测试仍待处理，但应在存活问题查清并统一基线后一并改，避免重复改基线。
- [2026-09-25 02:21] [行动指南] 待决：修死亡螺旋参数 vs 先收尾 P1（硬约束当前未满足） — 当前状态（实测）：P1 三处社交层改造已完成且归因判据通过（社交行动 61/69/3 → 0，家族成员 56 → 50）。但项目不满足『50 居民 × 200 tick × 3 种子全部存活』这条 D0 时满足的硬约束：修完 scheduleOverride 后 5 个种子仍各有 3-10 人死亡（seed1 死10、seed2 死3、seed3 死5、seed42 死0、seed7 死4，均为 phase2+phase3 默认配置）。已向用户提出两个选项并建议选 1：(1) 修 runMortality 的死亡螺旋参数——把恢复速率提到与扣血相称，或要求连续更久才扣血，理由是不修则后续任何让行动更丰富的改动都会再次引爆；(2) 先接受当前存活率，改完 5 个『断言旧机制』测试后收尾 P1，把死亡螺旋留给下一阶段。另：P1 剩余 5 个失败测试（wiring 相似度社交纽带事件、phase2 生育 2 居民×4 tick、craft:axe action-log 20 tick×12 人、能量消耗与存活人口相关、帖子数 828!==853）已定性为断言旧机制/该调测试配置，应在存活问题定案后统一改基线。
- [2026-09-25 04:20] [行动指南] 下一步行动：D1 模型/记忆进评分环、D2 ai.speech、Batch3/4 共 84 planned 叶子 — 截至 b861480，已完成的四个验收不再重复。以下是**尚未实施**的后续行动（按预期收益排序），均非阻塞：

1) D1（最高收益）：让 LLM 与记忆真正进入决策评分环——把 ai.decide 的模型输出与 semanticMemories 接入 loop.decide 的 scoreFn，而非仅作为独立入口。现状：src/ai/decide.js 已打通「模型从候选集选行动」并通过有模型 E2E，但**确定性评分仍是默认路径**（llmDecideEnabled 默认 false）。附带项：主循环 graph.read 批量化优化（已多次识别为反模式：逐项 graph.read + structuredClone）。

2) D2：实现 ai.speech.generate / polish（当前 state=planned），替换 src/runtime/orchestrator/_stage2.js 平台文案模板，并让对话影响关系边与声誉。

3) Batch 3（起源与文明，14 模块）、Batch 4（基础设施与边缘，12 模块）未启动；结构库共 84 个 planned 叶子。

4) 已知架构边界（非缺陷，勿当 bug 修）：phase2.summary.trades 与 postCount 由经济与平台系统的周期机制驱动，不完全来自居民决策——在决策归因对照（正常 vs actionSpaceAttribution）中这两项变化很小，属设计边界。

5) 已知无害差异：seed3 在 200 tick 下 write=0，而其余 13/14 种子为 36-52，属种子级差异。

6) 残留告警（非本轮引入）：Normify 2 条 warning——273 条依赖箭头可锚定 API 但未锚定；truman-town.ai 层 layout order 未覆盖全部子模块。

环境约束（已验证，勿回退）：survivalGatePerCapita 必须保持为「真实短缺判据」量级（当前 1.5）。回退到 3.0 会使门恒开、全城进入永久应急态（详见 lessons 2bbf81213842）。
- [2026-09-25 13:59] [行动指南] 下一步：居民创办企业（found/invest 行动） — 【最高优先级的架构缺口】企业仍由 bootstrap 硬编码创办：config.businessCount=2、固定创始人 agents[i%n]、
固定行业 food/tools、固定雇佣 agents[(i+2)%n]、固定 wage。
后果：businesses 跨种子恒定，「企业出生」无法涌现，破产只能来自经营。

=== 补充证据（提交 e63b932 之后，状态泄漏已修）===
economy-closure 的断言「businesses 应跨种子出现差异」现在**正确地失败**：
  实测 seed 1/2/3 的 businesses 恒为 2，而 goodsProduced=1610/1568/1614、
  revenue=9196.8/8731.8/9304.4、trades=543/536/548 均有差异。
该断言此前长期通过，是**跨 run 状态泄漏**造成的假象（上一局的企业数带入下一局）。
已确认未弱化该断言——它是一条诚实的红灯，修好 found/invest 后应自然转绿。

=== 待办 ===
实现居民驱动的 found/invest 行动，并删除/降级 bootstrapBusinesses 的固定路径；
验证方式：三种子 businesses 出现差异，且该断言转绿。
- [2026-09-25 18:18] [行动指南] P3 剩余 8 个子叶的实施顺序与验收要点 — ## 剩余 8 个 planned 叶子（按依赖顺序）
依赖已全部解锁，可任选顺序；建议按「先解锁 api/town，再收口 civilization」推进：

1. town.land — 地块（civilization.relic.discover 依赖它）
2. town.facility.public — 公共设施
3. api.archive — 存档 API（依赖 infra.store.archive，已落地）
4. api.viewer — 观察者 API（依赖 observer.*，已落地）
5. civilization.state — 文明状态
6. civilization.archive — 文明归档（依赖 infra.store.archive，已落地）
7. civilization.relic.artifact / relic.discover — 遗物（依赖 civilization.archive 与 town.land）
8. genesis.world-factory — 世界工厂（依赖 genesis.agent-factory.assemble，已落地）
9. ai.guard / ai.memory.summary / ai.memory.embedding / ai.prompt.world / ai.speech — AI 层（embedding 依赖 infra.store.vector，已落地）

## 每个叶子的收尾固定动作（缺一不可）
```
1. 写 src/<path>.js（遵守该模块 .md 里声明的 apis 与 deps）
2. 写 test/<name>.test.js
3. node --check 语法
4. node --test 该测试文件
5. normify_module_patch({id, patch:{source:[{path}], fingerprint}})  ← fingerprint 由 normify_fingerprint 算
6. normify_module_refresh({ids, repoRoot, activate:true})
7. normify_validate（必须 0 error）
8. 全量 npm test（防回归）
9. normify_build → normify_render
10. git add src/ test/ normify-truman-town/ && commit
```

## 关键陷阱（本阶段踩过）
- **planned 叶子不能直接 activate**：必须先 patch source 与 fingerprint，否则报 activate-no-source
- **改了既有模块要同步刷新其指纹**：否则 validate 报 evidence/fingerprint-drift
  （本阶段漂移过 4 个：agent.decision.candidates、runtime.orchestrator.loop/stage2、observer 各模块）
- **normify 工具不在 PATH**：需从 /home/agentuser/.dsh/profiles/web/node_modules/@dsh-external/dsh-normify/lib/tools.js
  import registerTools，且 rootDir 必须是 REPO ROOT（不是结构目录），否则会产生嵌套目录并报 structure/no-root
- **tmp-*.mjs 探针**：write 工具对已删除/新文件会拒绝，需先 bash touch；收尾务必 rm

## 尚未做的遗留项
- D2: 加居民驱动的 found/invest 行动并删除 bootstrapBusinesses 的固定路径（企业诞生才能真正涌现）
- D1: 把 semanticMemories/ranked 喂进 scoreFn；批量主循环的 graph.read
- 结构 warning: 274 条箭头可锚定到 API 但未锚定；ai 层 order 不完整
- LAYA 默认关闭（延迟问题），启用前需并发压测
- 300+ tick 长跑与多世代繁衍的端到端验证（家族特征三代无损后固定、文明重启）
- [2026-09-26 00:32] [行动指南] 审计后下一步按收益排序：企业涌现 → 对话文本 → 识字改为居民属性 — 按预期收益排序（前两项各自点亮一条已知红灯）：

1) **居民驱动的 found/invest，删除 bootstrapBusinesses 固定路径**（最高收益）
   目标：三种子 businesses 出现差异，economy-closure 那条失败断言转绿。
   详见记忆 2ff1eae9a098（已补充 e63b932 后的新证据）。

2) **对话文本生成（ai.speech）+ 把 content 写进事件 payload**
   现状：帖子/回复是硬编码模板 + prShuffle 随机选人；
   202 条帖子仅 8 种文本（去重率 4.0%），1270 条回复仅 6 种文本。
   同时 social.platform.post 的 payload 不含 content，reply/react 完全不进事件日志
   （553 条 social 事件中带 content 的 = 0），导致编年志/审计看不到任何对话。
   验收：看去重率与「说话者-内容」的对应关系，不是事件计数。
   LAYA 不适合承担此项：choice/noul 类型已被证伪（见 a1931ac0138d）。

3) **识字从全局开关改为居民属性**
   loop.js:517 societyEffectsHasLiteracy() 返回全局布尔，同一值发给全体居民。
   实测 write 在 40tick/10人 时 0 次、120tick/20人 时 309 次（全有或全无），
   且同时污染科技研究效率（literacyRate*4）。

4) 修 write 事件的 bookId（write_book 返回 job 而非 book，bookId 在完成后才产生，
   故事件恒为 null，观察者无法从事件流追踪任何一本书）。

5) 既有遗留（不变）：D1 把 semanticMemories 接入 scoreFn（04d487ccda0a、db60d93bb29d）；
   274 条箭头可锚定未锚定；ai 层 order 不完整；LAY A 默认关闭需并发压测；
   300+ tick 多世代长跑（家族特征三代无损后固定、文明重启）未验证。

## 环境约束（本轮再次踩到）
- 跨 run() 边界读模块级状态必错（item 目录是进程内 Map，run 结束已复位）。
- loop.reset() 必须与 103 个 __reset 模块对照核查，新增状态须同步加入。
- 长跑（50×200×3）约需 5 分钟/3 种子，须 nohup + sleep 轮询。
- tmp-*.mjs 探针收尾务必 rm；write 工具对不存在的新文件会拒绝，需先 bash touch。
- [2026-09-26 01:08] [行动指南] 排查流程已改为先查索引；未修的索引诊断项与原有下一步并列 — ## 排查流程（已生效，替代「读代码 + 猜」）
异常数据 → `node bin/flow-index.mjs --query <关键词>` 看写入方/读取方 →
看主循环阶段定位时机 → 看状态机确认当前状态 → 看诊断核对是否已知项。
看图：`node bin/flow-to-normify.mjs` 后打开 normify-truman-town-flow/normify.html。
**代码改动后必须重跑 bin/flow-index.mjs 并重建树**，否则 test/flow-index.test.js 会失败。

## 图的读法（四层三跳，2026-09 补上连线）
根层分组：代码模块 → 状态与读写方 → 诊断。
在【代码模块】下找持有该值的文件，出边=它写的状态、入边=它读的状态；
在【状态单元】下看该值的入边/出边，每条边锚定到具体写/读函数名。
**状态单元之间没有直接连线，一律经代码模块中转**——否则分不清同文件自读与跨文件依赖。
实测 323 模块 / 504 边，其中跨文件流转 168 条。

## 索引新发现、尚未修（按收益）
1. infra.rng.seeded 与 dispatch.lastApplied 是只写不读的死状态——接上消费方或删除。
2. town.building.structure 图类型重复声明（crafting/construction.js 与 building/structure.js）
   ——合并为单一契约来源。契约重复会持续制造难查的 bug。
3. 7 个 lastGeneration 类世代号 + loop.layaUrgencyCache 未纳入各自文件的复位函数。

## 原有下一步（顺序不变，最高收益在前）
4. 居民驱动的 found/invest，删除 bootstrapBusinesses 固定路径（详见 2ff1eae9a098）。
5. 对话文本生成（ai.speech）+ 把 content 写进事件 payload。
6. 识字从全局开关改为居民属性（loop.js:517/492）。
7. 修 write 事件的 bookId 恒为 null。
8. 遗留：D1 记忆接入 scoreFn；274 条箭头未锚定；ai 层 order 不完整；
   LAYA 默认关闭需并发压测；300+ tick 多世代长跑未验证；14 个 planned 叶子未落地。

## 环境约束
- bin/flow-to-normify.mjs 通过绝对路径 import 注册 normify 工具；rootDir 必须是仓库根。
- Normify 硬约束：容器（含根）禁止 apis；API 键（protocol:path）全项目唯一；
  id 段只允许 [a-z0-9][a-z0-9-]*；parent 必须等于 id 去掉最后一段；label.zh/en 各限 30 字符；
  **先建模块后连边必须分两轮写盘**（否则 dep/target-missing）。
- 本树 policy 去掉了 core-acyclic：数据流转图天然有环，见记忆 329b5b124877。
- run_code 的 code 参数对反斜杠转义敏感：含 \n \s \w 的长文本易被破坏，
  改用 String.fromCharCode(10) 与字符类，或用 heredoc / python 脚本写文件。
- [2026-09-26 17:46] [行动指南] 后续行动：LAYAA 压测、6 个 planned 模块、测试时长取舍 — 1) LAYA（System One）当前**默认关闭**，原因：单次请求延迟高，50×200 全量不可行。
   启用前必须先做并发压测确定可用调用预算；接口与回退路径已实现且有测试覆盖。
2) 6 个模块保持 planned（确为真实缺口，不要假装完成）：ai.guard、ai.memory.embedding、
   ai.memory.summary、api.viewer、civilization.relic.artifact、civilization.relic.discover。
   另有 8 个重复占位模块已标记 deprecated 并写 replacement，入边已迁移。
3) 测试套件约 63 分钟，瓶颈是多个 50×200×3 种子集成测试（每个 20 分钟以上）。
   若要压缩，需在覆盖面与时长之间显式取舍；已做过的一轮优化是惰性克隆。
4) 多代家族在 200 tick 可达第 3~5 代；更长代际演化需更长运行预算，未纳入默认测试。
- [2026-09-26 22:15] [行动指南] 挂机化前置：tick↔现实时间未定义，缺节拍器/存档接线/日志上限 — 背景：用户想把沙盒做成放置类挂机游戏长期挂载。本轮只做了现状勘察，**尚未动手实现**。

已核实的事实（勿重复勘察）：
- 全仓库**没有任何 tick↔现实时间的映射**，tick 是唯一时间单位。
  由数值反推的合理尺度：needGrowth 0.08/tick、进食 -0.5 需求、实测每 6~7 tick 吃一次
  → 一天约 24~28 tick，即 **1 tick ≈ 1 小时**，200 tick ≈ 8 天。
  其他自洽线索：ritualInterval=2、taxInterval=20、日程块长 12。
  注意：这只是解释层的假设，未写进代码，因此不可验证也不可调；若要挂机应先落成配置项。
- 性能实测：50 人单 tick ≈ **1.36 秒**（50×200 共 271 秒）。按 1 tick/秒挂机会吃满单核。
- 现有地基比预想完整：bin/server.js 长驻 HTTP 已可起；api/control.step() **已能推进单个 tick**
  且是异步的；start/pause/status/setDifficulty、api/observer.worldState/agentDetail 均已有；
  infra/store/archive.save/load 已实现但**从未接入主循环**。
  → 缺的不是重写，而是「按真实时间驱动 step() 的节拍器 + 存档接线 + 有上限的日志环」。
- 日志膨胀是已验证的真实风险：50×200 产生 14,381 条决策日志节点、1000+ 帖子；
  本轮已因节点膨胀吃过性能亏（CPU 88% 在 structuredClone，已用惰性视图缓解读取侧），
  **但写入侧仍无上限**。挂机一周（约 1700 tick）会到 10 万级条目。

待用户决策后才能开工的两点（不可自行假设）：
Q1 挂机节奏 —— 推荐做成可配、默认 1 tick / 10 秒（约 14% 单核）。
Q2 崩溃恢复 —— 推荐每 20 tick（≈游戏内一天）定时快照，重启从快照续跑。

已决定不询问、直接要做的：给日志与记忆加上限环。
- [2026-09-26 23:17] [行动指南] 挂机节拍器：消费 tickSequence，按实测权重摊 37.5 秒，停止前跑完当前 tick — 下一步：实现挂机节拍器（pacer），消费 tickSequence 并按墙钟时间摊开一个 tick。

已定的设计约束：
1. 游戏内一天 = 24 tick（数值层约定，勿单独改）；现实 15 分钟/天 → 1 tick ≈ 37.5 秒。
   该值必须做成可配置项，并提供倍速覆盖。
2. 节拍器按**阶段时间权重**分配这 37.5 秒，权重需先用实测每阶段耗时标定
   （测量脚本思路：消费 tickSequence，用 performance.now() 记录相邻单元间隔，按 id 前缀分桶）。
3. 实测 50 人单 tick 约 1.4 秒 → 37.5 秒/tick 下 CPU 约 3.6%，可同时挂多个镇子。
4. 节拍器停止时必须**跑完当前 tick** 再停（生成器中途丢弃会让世界停在半推进状态）。
5. 还需接线：infra/store/archive.save/load 快照（建议每 20 tick 一次 ≈ 游戏内一天）；
   日志/语义记忆的上限环（不设限时约 1700 tick 会产生十万级节点）。

待办：等用户确认节奏（15 分钟/天 vs 更快）后开工；若自主权生效则默认 15 分钟/天。
- [2026-09-26 23:44] [行动指南] 修 work 分支的 O(企业数²) 全量查询：把 business.list() 提到 find 之外 — 待办（已定位、尚未落盘验证）：把 work 分支的全量查询提到循环外。

缺陷：src/runtime/orchestrator/_stage2.js 的 performAgentAction('work') 里
  const biz = businessIds.find((id) => { const b = economy.industry.business.list().find(...) ... })
business.list() = store.listBusinesses().map(n => n.data)，每调一次全量物化全部企业节点，
却被放在 find 谓词内 → O(企业数²) 次全量读取。work 占行动分布 15.8%（237/1500，仅次于 eat/drink/forage），
是最高频的非生存行动，因此实测 dispatch 占整个 tick 的 66.3%（137.5ms/tick）。

修法：每 tick 只物化一次企业列表，再在循环里按 id 匹配。
若 economy.industry.business 无 get(id)，用 list() 的结果在循环外建一次 Map 即可；
语义必须保持不变：仍取第一个「status=active 且 labour.staff(id) 雇用了本人」的企业。

验证要求：改后重跑阶段耗时探针（tmp-phasecost2.mjs），确认 dispatch 占比显著下降、
且 run({agentCount:12,ticks:20,seed:'1',phase2:true}) 的输出哈希与改前一致（或差异可完全归因于该处）。
不要只看总耗时下降就判定成功 —— 必须同时确认行动分布未变。
- [2026-09-27 00:45] [行动指南] 全面审计修复计划已列出，执行前纠正统计与证据口径 — 基线034144e，修复计划见reports/repair-plan-current.md，共37项，均为待执行而非完成。先固定测试基线、修memoryPersist条件反向、停止用反事实哈希分数作因果证据，再接节拍器/最终快照/执行结果日志/完整存档，之后推进结果学习与真实反事实。源码核实：loop传persist: cfg.memoryPersist !== true，而semantic仅在persist!==false时落图；counterfactual.project按动作哈希产生伪分数；api.start配置noop和steps:0。纠正上一轮审计：232模块中163叶子=149 active/6 planned/8 deprecated，planned容器不是未实现叶子；speech已deprecated；genesis等已有实现，不可笼统重建。tickSequence与work优化已提交。上轮全量测试超时不能断言OOM或归因生成器，选定60项通过不代表全量通过。主观成熟度评分撤回。待验证项须先复现；自治/涌现不要求全部交给LLM，分叉和熵不足以证明适应能力。
- [2026-09-27 02:35] [行动指南] flow-index派生产物需在源码变更后复生成并定向校验 — t7发现当前 flow-index.json 缺少源码状态单元 infra.rng.genState，flow-index测试报告159→160并失败；已建立团队任务t18仅修复派生产物并验证，不改src。今后源码状态变更后重生成flow-index并运行test/flow-index.test.js；索引或树漂移不能误判为源码运行缺陷。
- [2026-09-27 08:46] [行动指南] AgentTeams 长链任务按状态推进，不干预已在途任务 — 长链修复团队中 t3/t4 当前 in_progress，其余任务依据 DAG 保持 pending。收到用户“继续”后先查看 team status，只处理失败、阻塞或已交付报告；不重复派发、不busy-poll，也不把中间进度记为完成。
- [2026-09-27 10:19] [行动指南] 失败任务先区分服务失败与派生物竞态，再按源码冻结重试 — 当前失败t20并非生成器逻辑已证伪，而是t8/t9/t12并发源码编辑造成flow-index派生物过期（生成192、索引176）。已唤起t8/t9/t12完成各自正式证据；待源码冻结后统一重建flow-index与flow-to-normify并做validate/build/render，避免在并发脏派生物上重复重试。
- [2026-09-27 12:23] [行动指南] 继续推进时先冻结源码再收口flow派生物 — 当前t5/t8/t9/t12均已重领取并运行，t20保持失败不重复重试；verification-engineer待命。必须等这些源码任务正式完成并确认源码冻结，再统一重建flow-index与flow-to-normify并执行Normify validate/build/render，避免派生物竞态反复失败。
- [2026-09-27 18:11] [行动指南] 超时任务重试应复用部分实现并先交付最小证据 — t5/t8/t9/t21 均因上游请求超时失败，但工作区保留部分实现；已分别重试attempt4/5/5/3，要求优先补最小可验证修复、路由/日志/候选门定向证据，不从头重做或扩大范围。t10暂缓，避免同一decision-engineer并发占用。
- [2026-09-27 20:23] [行动指南] 最终对抗验收使用只读快照并比对live — t6失败后采用验证工程师确认的方法：修复任务期间不必全局冻结源码；最终重跑时复制只读快照并记录文件哈希，在快照内跑完整分层，结束逐文件比较快照与live。若live在验收期间变化，结论只对快照身份成立，必须再跑最终重验。前置需t13/t26/t27/t28全部完成。
- [2026-09-27 23:33] [行动指南] 网关失败后先重试验证已落地修复再推进依赖链 — decision-engineer此前502且无未完成attempt，不作为代码结论；已重新唤起t26 attempt2，仅核验F1/F4已落地修复，不回退自适应门槛或扩大范围。t28继续保留多种子诊断，暂不改代码；t29因共享loop.js路径后置，避免并发编辑。后续应先让t26正式收口，再串行解除t28/t29依赖。
- [2026-09-27 23:48] [行动指南] 及时收口长期in_progress任务并区分部分完成 — 发现t26 attempt2长期停在in_progress，已要求成员立即提交正式终态；收口要求包含F1/F4验收证据，若smoke.p2确认范围外必须标注failed(partial)，不得以未提交状态阻塞t28。未把成员未提交当作代码结论。
- [2026-09-28 00:14] [行动指南] LinYi修复尚未完成，后续继续收口验收与Git提交 — 截至当前状态，项目工作未结束：t6全链路验收failed，t26 failed(partial)，t28目标规划修复、t29存档边界测试、t17 Normify收口仍pending。最新Git提交d58db4e之后PROJECT_MEMORY.md有未提交改动，且工作区含AgentTeams运行日志与tmp scratch；不得把它们误认为已提交。后续先处理依赖调度与修复任务，最终钉快照重跑t6，再更新结构证据并择净提交。
- [2026-09-28 00:19] [行动指南] 失败任务已切换opena6并重新启动 — 按用户要求，使用已确认可用的open a6/gpt-6-astra（reasoning_effort=default）新增两个重启成员：opena6-social-repair与opena6-verification-restart。t26以attempt3重启并保留既有F1/F4成果，t6以attempt2重启并要求只读快照/哈希分层验收；t28/t29为pending而非failed，暂未重启。
- [2026-09-28 00:33] [行动指南] opena6继续修复目标出生退化并等待smoke最小路径 — t28已转交opena6-social-repair继续修复目标规划导致出生减少，要求选择性让位完整求偶链、保留结果学习与craft/trade收益，至少3 seed验证出生/死亡。smoke.p2的write_book/企业启动问题因与t28测试路径重叠暂未新建任务，已要求opena6-verification先给最小修复路径；修复后先定向测试再重跑对抗验收，不能把needs_revision当通过。
- [2026-09-28 00:50] [行动指南] 按四类阻塞顺序重构LinYi修复路径 — 当前已确认问题分为任务图阻塞、目标规划导致出生下降、smoke.p2/p3契约缺陷、验收证据不稳定四类；推荐顺序为重构依赖→修求偶链选择性让位→修p2写书可达链与p3 CLI旧字段→处理hot-log warning/长测→冻结源码并重跑t6→最后刷新Normify和Git。不得伪标t26完成、不得只改断言或调低权重掩盖因果、不得在源码变化期间做最终验收。
- [2026-09-28 02:00] [行动指南] 远程仓库重构PR待网络恢复后执行 — 已确认 GitHub 远程 HeDaas-Code/LinYi 的默认分支为 main，现有本地 master 是新重构项目，远端还存在旧 main；计划从旧 main 创建完整替换分支并发起 PR，但本轮 git fetch 因访问 github.com:443 网络超时，尚未执行远端清空、分支推送或 PR 创建。后续需网络恢复后先 fetch main，再创建完整重构分支、提交替换说明并发起 PR。
