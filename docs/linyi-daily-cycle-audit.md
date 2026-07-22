# 林逸的一天：循环审计、模块溯源与重构建议

> **审计日期**：2026-07-23
> **审计对象**：LinYi 小说家大脑 Agent（仓库 HeDaas-Code/LinYi）
> **代码规模**：22,682 行 Python / 82 文件（含 184 tests）
> **审计视角**：以"林逸的一天"这一核心循环为主线，串联模块职责、参考项目溯源、循环缺陷与重构建议
> **表达方式**：以 Mermaid 架构图为主，文字作图注与结论
> **上游依据**：[Design.md](file:///workspace/Design.md)、[main.py](file:///workspace/main.py)、[src/novelist_brain/clock.py](file:///workspace/src/novelist_brain/clock.py)、[src/novelist_brain/scheduler.py](file:///workspace/src/novelist_brain/scheduler.py)、[docs/AUDIT-REPORT.md](file:///workspace/docs/AUDIT-REPORT.md)、[docs/拟人化日程节律与角色社交补强方案_v2.md](file:///workspace/docs/拟人化日程节律与角色社交补强方案_v2.md)、[docs/系统重构方案_v1.md](file:///workspace/docs/系统重构方案_v1.md)、[docs/refs/borrow_matrix.md](file:///workspace/docs/refs/borrow_matrix.md)

---

## 0. 一句话结论

林逸的一天是一个由 **RealTimeClock 驱动、DailyScheduler 用 B=MAT 模型评分调整、SalienceNetwork 在 DMN/CEN 间切换**的 8 阶段昼夜循环：白天以 DMN 为主"生活、观察、积累记忆"，晚间 19:00–23:00 切到 CEN"把白天活过的素材写成小说"，深夜回到 DMN"做梦与酝酿"。这个循环由 40+ 模块在事件总线上协作完成，借鉴了 21 个开源项目；当前最大的结构性问题是**循环素材质量（fragment 重复/模板化）+ 长期运行稳定性（记忆无界增长/线程不安全）+ 缺失的遗忘与边界机制**。

---

## 1. 林逸的一天：8 阶段循环全景

### 1.1 循环全景图

林逸的节律定义在 [src/novelist_brain/clock.py](file:///workspace/src/novelist_brain/clock.py) 的 `Clock.DEFAULT_RHYTHM` 与 [src/novelist_brain/scheduler.py](file:///workspace/src/novelist_brain/scheduler.py) 的 `DailyScheduler.DEFAULT_PHASES`，两者对齐：

```mermaid
gantt
    title 林逸的一天：8 阶段昼夜循环（00:00–24:00）
    dateFormat HH:mm
    axisFormat %H:%M

    section 睡眠/梦境
    deep_night DMN 做梦/低代谢        :dmn, 00:00, 6h

    section 苏醒
    morning 低需求输入/晨间例程       :mor, 06:00, 2h

    section 白天-生活
    incubation DMN 观察灵感漫游       :dmn2, 08:00, 4h
    social SN/CEN 社交遭遇/午餐       :soc, 12:00, 2h
    simulation CEN 推演/沙盒热身      :cen, 14:00, 4h

    section 晚间-创作
    reflection DMN 复盘/日记          :ref, 18:00, 1h
    creation CEN 晚间写作             :cre, 19:00, 4h

    section 夜间-酝酿
    incubation DMN 睡前酝酿           :inc, 23:00, 1h
```

**8 阶段对照表**（时间、主导网络、核心模块、输入、产出）：

| 阶段 | 时间 | 主导网络 | 核心模块 | 输入来源 | 产出物 |
|------|------|---------|---------|---------|--------|
| deep_night | 00:00–06:00 | DMN | DMN、MemorySystem、ReflectionEngine | 昨日 fragment/paragraph | 梦境 fragment、反思结论 |
| morning | 06:00–08:00 | DMN | IdentityCore、PromptSurface、DailyScheduler | 当前时间、昨日日记 | 当日 DailyPlan |
| incubation | 08:00–12:00 | DMN | PersonalInput、DMN、SelfTimeline | 系统时间、本地配置、昨日残留 | 经验 fragment |
| social | 12:00–14:00 | SN/CEN | SocialInput、OCTownEngine、RelationshipGraph | 读者消息、OC 社交事件 | 社交 fragment、关系更新 |
| simulation | 14:00–18:00 | CEN | CEN、COCMappingEngine、MentalSandbox | 记忆痕迹、世界设定 | 沙盒推演叙事素材 |
| reflection | 18:00–19:00 | DMN | ReflectionEngine、MidTermMemory | 当日 fragment/对话 | 反思结论、压缩摘要 |
| creation | 19:00–23:00 | CEN | Planner、CreationExecutive、ChapterManager、NovelOutput、ContinuityAuditor、QualityEngine | 白天素材、StoryBible、ChapterIntent | 小说段落/章节 |
| incubation | 23:00–24:00 | DMN | DMN、SelfTimeline | 当日全量事件 | 睡前酝酿 fragment、日记 |

### 1.2 循环驱动机制

循环由三层协作驱动，定义在 [main.py](file:///workspace/main.py) 的 `run_agent()` 与 [src/novelist_brain/clock.py](file:///workspace/src/novelist_brain/clock.py)：

```mermaid
flowchart LR
    subgraph 时间层
        WallClock[真实墙钟时间]
    end

    subgraph 节律层
        RTC[RealTimeClock<br/>tick_interval_seconds=60<br/>1 real min = 1 sim min]
        DS[DailyScheduler<br/>B=MAT: behavior=motivation×ability×trigger]
        DP[DailyPlan<br/>8 个 Phase]
    end

    subgraph 总线层
        Bus[BusRouter<br/>事件总线]
    end

    subgraph 网络切换层
        SN[SalienceNetwork<br/>评估显著性]
        DMN[DMN 默认模式]
        CEN[CEN 中央执行]
    end

    WallClock -->|gate| RTC
    RTC -->|每天 0 点生成| DS
    DS -->|B=MAT 评分调整| DP
    DP -->|phase_type_at| RTC
    RTC -->|on_tick 回调| Bus
    Bus -->|event.clock.phase.changed| SN
    SN -->|低显著性| DMN
    SN -->|高显著性| CEN
    DMN -->|control.network.switch| Bus
    CEN -->|control.network.switch| Bus
```

**关键机制**：

1. **RealTimeClock**（[clock.py:159](file:///workspace/src/novelist_brain/clock.py#L159)）：默认 1 真实分钟 = 1 模拟分钟 = 1 tick，与现实时间同步常驻运行；`--fast-forward` 时每 tick 推进 30 分钟用于压缩测试。
2. **DailyScheduler**（[scheduler.py:84](file:///workspace/src/novelist_brain/scheduler.py#L84)）：基于 B=MAT 模型（behavior = motivation × ability × trigger）生成 DailyPlan，可在能量低/社交透支时降级（减少 creation/social，增加 recovery/sleep）。
3. **SalienceNetwork**：评估每个输入碎片的显著性，低显著性走 DMN（做梦/反思/漫游），高显著性走 CEN（目标管理/计划/写作）。
4. **总线广播**：clock.on_tick 回调把 `event.clock.phase.changed` 发到总线，所有模块订阅该 topic 并据此切换行为。

---

## 2. 模块分层架构

### 2.1 13 层分层架构

林逸的 40+ 模块按职能分为 13 层，全部注册在 [main.py](file:///workspace/main.py) 的 `create_modules()` 与 `ModuleRegistry`：

```mermaid
flowchart TB
    subgraph L1[1.节律调度层]
        CLK[clock]
        SCH[scheduler]
        DP[daily_plan]
        SDE[segment_detail_enhancer]
    end

    subgraph L2[2.三网络层]
        SN[salience_network]
        DMN[dmn]
        CEN[cen]
    end

    subgraph L3[3.记忆层]
        MEM[memory]
        MS[memory_stream]
        MMS[mid_term_memory]
        MST[memory_store]
        RE[reflection_engine]
        ST[self_timeline]
        CQ[conversation_queue]
    end

    subgraph L4[4.代谢与情绪层]
        MET[metabolism]
        DYN[dynamics]
        SVB[social_vital_bridge]
        ES[expression_state]
        ATT[attachment]
    end

    subgraph L5[5.输入与边界层]
        PI[personal_input]
        SI[social_input]
        RP[reader_profile]
        RRG[reader_rest_gate]
        TB[token_budget]
        TU[tool_use_module]
    end

    subgraph L6[6.沙盒推演层]
        SBX[sandbox]
        SBV[sandbox_versioning]
        TRPG[trpg / trpg_extended / trpg_rulebook / trpg_state]
        COC[coc_mapping_engine]
    end

    subgraph L7[7.创作链路层]
        CRE[creation_executive]
        PLN[planner]
        CM[chapter_manager]
        NO[novel_output]
    end

    subgraph L8[8.小说真源层]
        WS[world_state]
        OCS[oc_character_system]
        OCT[oc_town_engine]
        CCM[character_card_module / character_card_adapter]
        WBT[world_book_trigger]
    end

    subgraph L9[9.OC社交层]
        RG[relationship_graph]
        SM[social_models]
    end

    subgraph L10[10.提示与人格层]
        ID[identity]
        PI2[persona_injector]
        PS[prompt_surface]
        PR[prompts]
        LF[llm_fact_extractor]
    end

    subgraph L11[11.容错与持久化层]
        PER[persistence]
        FLT[fault]
        REC[recovery]
        CB[circuit_breaker]
        TRN[transaction]
        LLM[llm + ResilientLLMService]
    end

    subgraph L12[12.观测层]
        EOS[eos]
        WVD[world_visual_debugger]
    end

    subgraph L13[13.总线与配置层]
        BUS[bus]
        CFG[config]
        MOD[module / module_registry]
        MOD2[models / topics]
    end

    L1 --> L2
    L2 --> L3
    L2 --> L6
    L5 --> L3
    L6 --> L7
    L3 --> L7
    L8 --> L6
    L9 --> L4
    L7 --> L8
    L10 --> L7
    L11 -.保护.-> L1
    L11 -.保护.-> L7
    L12 -.观测.-> L1
    L12 -.观测.-> L7
    L13 -.承载.-> L1
    L13 -.承载.-> L7
```

### 2.2 模块职责清单

下表覆盖循环核心模块，给出"一句话职责 + 关键事件 topic + 参考项目"（参考项目详见第 4 节）。

#### 节律调度层

| 模块 | 职责 | 关键 topic | 参考项目 |
|------|------|-----------|---------|
| [clock.py](file:///workspace/src/novelist_brain/clock.py) | 真实时间时钟，把墙钟时间映射到 8 阶段 | event.clock.phase.changed | generative_agents（reverie 主循环） |
| [scheduler.py](file:///workspace/src/novelist_brain/scheduler.py) | B=MAT 评分生成/调整 DailyPlan | control.schedule.adjust | astrbot_companion（两层日程） |
| [daily_plan.py](file:///workspace/src/novelist_brain/daily_plan.py) | PlanItem + SegmentDetail 数据模型 | data.daily_plan.updated | astrbot_companion |
| [segment_detail_enhancer.py](file:///workspace/src/novelist_brain/segment_detail_enhancer.py) | 细化当前时段（today_events/proactive_events） | data.segment.detail | astrbot_companion（SegmentDetail） |

#### 三网络层

| 模块 | 职责 | 关键 topic | 参考项目 |
|------|------|-----------|---------|
| [salience_network.py](file:///workspace/src/novelist_brain/salience_network.py) | 评估输入显著性，切换 DMN/CEN | control.network.switch | 脑科学三大网络模型 |
| [dmn.py](file:///workspace/src/novelist_brain/dmn.py) | 默认模式：做梦、反思、心理漫游 | data.dmn.fragment | generative_agents（reflection） |
| [cen.py](file:///workspace/src/novelist_brain/cen.py) | 中央执行：目标管理、计划、触发创作 | control.sandbox.scenario.load | 脑科学 CEN |

#### 记忆层

| 模块 | 职责 | 关键 topic | 参考项目 |
|------|------|-----------|---------|
| [memory.py](file:///workspace/src/novelist_brain/memory.py) | Fragment→Trace→巩固 主记忆系统 | data.memory.trace.created | generative_agents、mem0 |
| [memory_stream.py](file:///workspace/src/novelist_brain/memory_stream.py) | recency+importance+relevance 三因子检索 + 混合 | data.memory_stream.update | generative_agents、a16z companion |
| [mid_term_memory.py](file:///workspace/src/novelist_brain/mid_term_memory.py) | 对话队列溢出后压缩摘要 | data.memory.mid_term.summary | MaiBot（mid_term） |
| [memory_store.py](file:///workspace/src/novelist_brain/memory_store.py) | 记忆持久化后端（memory/sqlite） | — | mem0、MemGPT |
| [reflection_engine.py](file:///workspace/src/novelist_brain/reflection_engine.py) | 累计 importance 触发高阶反思 | data.reflection.generated | generative_agents（reflect） |
| [self_timeline.py](file:///workspace/src/novelist_brain/self_timeline.py) | 统一记录"今天已做过什么"防失忆重复 | data.self.timeline.updated | astrbot_companion |
| [conversation_queue.py](file:///workspace/src/novelist_brain/conversation_queue.py) | 最近 N 条对话 FIFO | data.conversation.queue.update | a16z companion（Redis 队列） |

#### 代谢与情绪层

| 模块 | 职责 | 关键 topic | 参考项目 |
|------|------|-----------|---------|
| [metabolism.py](file:///workspace/src/novelist_brain/metabolism.py) | energy/compute_budget/time_currency/social_capital | data.metabolism.state | Design.md §7 代谢预算 |
| [dynamics.py](file:///workspace/src/novelist_brain/dynamics.py) | 习惯强度、动机向量 | data.dynamics.updated | BJ Fogg 行为模型 |
| [social_vital_bridge.py](file:///workspace/src/novelist_brain/social_vital_bridge.py) | 社交事件→情绪维度+衰减 | data.social.vital.updated | Project AIRI（情绪连续性） |
| [expression_state.py](file:///workspace/src/novelist_brain/expression_state.py) | vital state→表情/身体参数 | data.expression.changed | Project AIRI（VRM/Live2D） |
| [attachment.py](file:///workspace/src/novelist_brain/attachment.py) | 依恋风格心理扩展 | data.attachment.updated | 心理学依恋理论 |

#### 输入与边界层

| 模块 | 职责 | 关键 topic | 参考项目 |
|------|------|-----------|---------|
| [personal_input.py](file:///workspace/src/novelist_brain/personal_input.py) | 封闭系统内个人经验碎片 | data.fragment.personal.new | astrbot_companion |
| [social_input.py](file:///workspace/src/novelist_brain/social_input.py) | 社交遭遇碎片 | data.fragment.social.new | ai-town |
| [reader_profile.py](file:///workspace/src/novelist_brain/reader_profile.py) | 读者画像与 known_facts | data.reader.profile.updated | MaiBot（印象） |
| [reader_rest_gate.py](file:///workspace/src/novelist_brain/reader_rest_gate.py) | 本地读者休息信号门控（5 级） | control.reader.rest | astrbot_companion（user_rest_gate） |
| [token_budget.py](file:///workspace/src/novelist_brain/token_budget.py) | 内部 token 成本治理 | control.token.budget.exhausted | astrbot_companion |
| [tool_use_module.py](file:///workspace/src/novelist_brain/tool_use_module.py) | 只读本地 MCP 工具层 | data.tool.result | Agent Zero（工具抽象） |

#### 沙盒推演层

| 模块 | 职责 | 关键 topic | 参考项目 |
|------|------|-----------|---------|
| [sandbox.py](file:///workspace/src/novelist_brain/sandbox.py) | 脑中世界 TRPG what-if 推演 | data.sandbox.narrative.ready | Design.md §13 沙盒 |
| [sandbox_versioning.py](file:///workspace/src/novelist_brain/sandbox_versioning.py) | A/B 分叉版本管理 | control.sandbox.fork | Design.md §13 A/B |
| [trpg*.py](file:///workspace/src/novelist_brain/trpg.py) | COC 风格技能检定/战斗/追逐 | data.trpg.skill_check | COC 跑团规则 |
| [coc_mapping_engine.py](file:///workspace/src/novelist_brain/coc_mapping_engine.py) | StoryBible→定制 Rulebook+章节场景 | data.coc.scenario.built | Webnovel Writer（题材模板） |

#### 创作链路层

| 模块 | 职责 | 关键 topic | 参考项目 |
|------|------|-----------|---------|
| [planner.py](file:///workspace/src/novelist_brain/planner.py) | NarrativeLine→ChapterIntent+四线编织 | data.novel.chapter.intent | Webnovel Writer（Strand Weave）、ainovel-cli（滚动规划） |
| [creation_executive.py](file:///workspace/src/novelist_brain/creation_executive.py) | Director 角色：决定+编排段落生成 | data.novel.paragraph | AI Novel Factory（Director/Worker）、NovelPilot（9-Agent） |
| [chapter_manager.py](file:///workspace/src/novelist_brain/chapter_manager.py) | 卷/章/段三级+版本控制+回溯 | event.novel.chapter.committed | ainovel-cli（Checkpoint） |
| [novel_output.py](file:///workspace/src/novelist_brain/novel_output.py) | 段落发布（v1 扁平列表） | event.novel.paragraph.published | — |

#### 小说真源层

| 模块 | 职责 | 关键 topic | 参考项目 |
|------|------|-----------|---------|
| [world_state.py](file:///workspace/src/novelist_brain/world_state.py) | WorldStateContract（地理/派系/规则/谜团） | data.world.updated | AI Novel Factory（单一真源） |
| [oc_character_system.py](file:///workspace/src/novelist_brain/oc_character_system.py) | OC 角色档案 CRUD+immutable 锁 | data.oc.created | SillyTavern（角色卡）、ai-town（Player） |
| [oc_town_engine.py](file:///workspace/src/novelist_brain/oc_town_engine.py) | OC 自治社交模拟 | data.oc.town.event | ai-town（Agent.tick/Conversation） |
| [character_card_*.py](file:///workspace/src/novelist_brain/character_card_module.py) | SillyTavern V2 角色卡导入导出 | data.oc.character.imported | SillyTavern（V2/V3 spec） |
| [world_book_trigger.py](file:///workspace/src/novelist_brain/world_book_trigger.py) | 世界书/角色书关键词触发注入 | data.world_book.triggered | SillyTavern（World Info） |

#### OC 社交层

| 模块 | 职责 | 关键 topic | 参考项目 |
|------|------|-----------|---------|
| [relationship_graph.py](file:///workspace/src/novelist_brain/relationship_graph.py) | 有向关系边+时序历史+阶段模型 | data.relationship.updated | Zep（时序图谱）、ai-town |
| [social_models.py](file:///workspace/src/novelist_brain/social_models.py) | GazePressure 等社交模型 | data.social.gaze | Design.md §16 |

#### 提示与人格层

| 模块 | 职责 | 关键 topic | 参考项目 |
|------|------|-----------|---------|
| [identity.py](file:///workspace/src/novelist_brain/identity.py) | 林逸人格内核（LinYiProfile） | data.identity.constraint | evolve-linyi spec |
| [persona_injector.py](file:///workspace/src/novelist_brain/persona_injector.py) | 识别当前回合人物并注入画像 | data.persona.injected | MaiBot（person_profile） |
| [prompt_surface.py](file:///workspace/src/novelist_brain/prompt_surface.py) | 10 槽位有序 prompt 组装 | data.prompt.surface.updated | SillyTavern、a16z、AIRI |
| [prompts.py](file:///workspace/src/novelist_brain/prompts.py) | 雪花写作法+结构选择器+去AI味 | — | AI_NovelGenerator_YILING、NovelDreamer、ainovel-cli |
| [llm_fact_extractor.py](file:///workspace/src/novelist_brain/llm_fact_extractor.py) | 自动学习读者/OC 稳定事实 | data.fact.extracted | MemGPT、MaiBot |

#### 容错与持久化层

| 模块 | 职责 | 关键 topic | 参考项目 |
|------|------|-----------|---------|
| [persistence.py](file:///workspace/src/novelist_brain/persistence.py) | 快照+增量 log+原子写+retention | control.fault.error(PERSISTENCE) | AI Novel Factory、astrbot（store_manager） |
| [fault.py](file:///workspace/src/novelist_brain/fault.py) | 错误分类与严重度 | control.fault.error | — |
| [recovery.py](file:///workspace/src/novelist_brain/recovery.py) | 恢复动作派发+safe_mode | control.recovery.action | — |
| [circuit_breaker.py](file:///workspace/src/novelist_brain/circuit_breaker.py) | LLM 熔断器+lease/heartbeat | control.circuit.open | AI Novel Factory（autopilot-worker） |
| [transaction.py](file:///workspace/src/novelist_brain/transaction.py) | tick 级事务回滚 | — | — |
| [llm.py](file:///workspace/src/novelist_brain/llm.py) | ResilientLLMService（重试+熔断+Mock 降级） | event.llm.fallback | NovelPilot（retry/fallback） |

#### 观测层

| 模块 | 职责 | 关键 topic | 参考项目 |
|------|------|-----------|---------|
| [eos.py](file:///workspace/src/novelist_brain/eos.py) | 7 个 Collector 非侵入观测+阈值告警 | control.eos.recommendation | Design.md §EOS |
| [world_visual_debugger.py](file:///workspace/src/novelist_brain/world_visual_debugger.py) | 世界快照/diff + COC 回放 | data.debug.world.snapshot | — |

#### 总线与配置层

| 模块 | 职责 | 参考项目 |
|------|------|---------|
| [bus.py](file:///workspace/src/novelist_brain/bus.py) | BusRouter pub/sub，模块零耦合 | AstrBot（事件总线） |
| [config.py](file:///workspace/src/novelist_brain/config.py) | NovelistConfig 统一配置 | — |
| [module.py](file:///workspace/src/novelist_brain/module.py) | Module 基类（tick/init/register/to_dict） | — |
| [module_registry.py](file:///workspace/src/novelist_brain/module_registry.py) | 模块注册+依赖+插件发现 | AstrBot、AI Novel Factory |

### 2.3 单 Agent 轨 + 多 Agent 轨双轨数据流

林逸采用"单 Agent 拟人化 + 多 Agent OC 社交"双轨，两轨通过 `WorldStateContract` 与 `SelfTimeline` 交换素材（定义在 [docs/拟人化日程节律与角色社交补强方案_v2.md](file:///workspace/docs/拟人化日程节律与角色社交补强方案_v2.md) §4）：

```mermaid
flowchart LR
    subgraph 输入["输入层（封闭系统）"]
        I1[系统时间/日期]
        I2[本地配置]
        I3[读者消息]
        I4[昨日日记/SelfTimeline]
        I5[WorldStateContract 小说设定]
        I6[TokenBudget 内部剩余]
    end

    subgraph 单["单 Agent 轨：林逸"]
        S2[DailyPlan+SegmentDetail]
        S3[FragmentQualityGate]
        S4[SelfTimeline]
        S5[ReaderRestGate]
        S6[CreationExecutive]
        S7[SocialVitalBridge]
        S8[ExpressionState]
        S9[ToolUseModule]
        S10[ConversationQueue]
        S11[MemoryStream]
    end

    subgraph 多["多 Agent 轨：OC 角色社交"]
        M1[OCTownEngine]
        M2[OCActivity]
        M3[OCConversation]
        M4[OCMemory]
        M5[RelationshipGraph]
    end

    subgraph 产出["小说产出"]
        O1[Fragment]
        O2[Paragraph]
        O3[PlotEvent]
        O4[StoryBible 更新]
    end

    I1 --> S2
    I4 --> S2
    I5 --> S2
    I5 --> M1
    I3 --> S5
    I3 --> S7
    I6 --> S6

    S2 --> S4
    S4 --> S3
    S3 --> O1
    S5 --> S6
    S6 --> O2

    M1 --> M2 --> M3 --> M4 --> M5
    M3 --> O3
    M4 --> O1
    M1 --> S7
    M5 --> S7
    S7 --> S8

    I3 --> S10
    M3 --> S10
    S10 --> S11
    S4 --> S11
    S11 --> S6
    O1 --> S4
    O3 --> S4
```

---

## 3. 各阶段模块协作时序

### 3.1 deep_night + morning：做梦与苏醒

```mermaid
sequenceDiagram
    participant Clock
    participant Bus
    participant SN
    participant DMN
    participant ID as IdentityCore
    participant MEM as MemorySystem
    participant SCH as Scheduler
    participant PS as PromptSurface

    Note over Clock: 00:00 进入 deep_night
    Clock->>Bus: event.clock.phase.changed=deep_night
    Bus->>SN: 评估显著性
    SN->>Bus: control.network.switch=dmn
    Bus->>DMN: 激活
    DMN->>MEM: 检索昨日 fragment/paragraph
    MEM-->>DMN: 痕迹集合
    DMN->>Bus: data.dmn.fragment（梦境碎片）
    Bus->>MEM: 存储梦境 fragment

    Note over Clock: 06:00 进入 morning
    Clock->>Bus: event.clock.phase.changed=morning
    Bus->>ID: 苏醒，广播 data.identity.constraint
    ID->>PS: 注入林逸人格（name/pen_name/self_narrative）
    SCH->>SCH: plan_day() 生成当日 DailyPlan（B=MAT）
    SCH->>Bus: data.daily_plan.updated
    Bus->>PS: self_timeline 槽位更新
```

### 3.2 incubation + social：生活与社交

```mermaid
sequenceDiagram
    participant Clock
    participant PI as PersonalInput
    participant SI as SocialInput
    participant DMN
    participant CEN
    participant MEM as MemorySystem
    participant ST as SelfTimeline
    participant OCT as OCTownEngine
    participant RG as RelationshipGraph
    participant SVB as SocialVitalBridge

    Note over Clock: 08:00-12:00 incubation
    Clock->>PI: phase=incubation
    PI->>PI: 从系统时间/配置/昨日残留生成 fragment
    PI->>MEM: data.fragment.personal.new
    MEM->>ST: 记录"今天已生成 fragment"
    DMN->>ST: 查询"今天已想过什么"防重复
    DMN->>MEM: 通过 gate 的 fragment 入库

    Note over Clock: 12:00-14:00 social
    Clock->>SI: phase=social
    SI->>MEM: data.fragment.social.new
    par OC 社交并行
        OCT->>OCT: tick() 调度 OC operation
        OCT->>RG: 对话更新 affinity/familiarity
        OCT->>SVB: data.oc.town.event
        SVB->>SVB: 微调 mood_bias/arousal/creative_drive
    end
    SVB->>MEM: data.social.vital.updated
```

### 3.3 simulation：下午推演

```mermaid
sequenceDiagram
    participant CEN
    participant COC as COCMappingEngine
    participant OCT as OCTownEngine
    participant SBX as MentalSandbox
    participant TRPG
    participant MEM as MemorySystem
    participant WS as WorldStateContract

    Note over CEN: 14:00-18:00 simulation
    CEN->>COC: control.sandbox.scenario.load
    COC->>WS: 读取 geography/factions/mysteries
    COC->>COC: 挑选 key_npcs + location
    COC->>OCT: control.oc.town.tick（让关键 NPC 先互动）
    OCT-->>COC: oc_town_event 摘要
    COC->>SBX: control.sandbox.build（traces+world_contract+story_bible）
    SBX->>TRPG: control.sandbox.simulate
    TRPG->>TRPG: COC 技能检定/战斗/追逐
    TRPG-->>SBX: skill_checks + narrative
    SBX->>MEM: data.sandbox.narrative.ready（叙事素材）
    SBX->>CEN: 推演完成
```

### 3.4 creation：晚间写作（核心产出阶段）

晚间创作是林逸一天的核心产出阶段，调用最长的模块链路，定义在 [docs/系统重构方案_v1.md](file:///workspace/docs/系统重构方案_v1.md) §2：

```mermaid
sequenceDiagram
    participant CEN
    participant PLN as Planner
    participant CM as ChapterManager
    participant CRE as CreationExecutive
    participant NO as NovelOutput
    participant CA as ContinuityAuditor
    participant QE as QualityEngine
    participant MEM as MemorySystem
    participant ID as IdentityCore
    participant RRG as ReaderRestGate

    Note over CEN: 19:00-23:00 creation
    CEN->>RRG: 检查读者是否休息
    RRG-->>CEN: 未休息 / rest 状态
    CEN->>PLN: 生成 ChapterIntent（四线编织 Quest/Fire/Constellation/Rest）
    PLN->>CM: data.novel.chapter.intent
    CM->>CRE: control.novel.chapter.write（ChapterIntent+NarrativeLine+skill_checks+world_state）
    CRE->>CRE: Director 决定下一步（advance/retry/interrupt）
    CRE->>NO: data.novel.paragraph
    NO->>NO: 发布段落
    NO->>CA: event.novel.paragraph.published
    CA->>CA: 六维审计（OOC/设定/时间线/伏笔/文风/节奏）
    CA->>QE: data.novel.audit.issues
    QE->>QE: 严重度分级派发+自动修订
    QE->>CRE: control.novel.revision.required（如需）
    NO->>MEM: 段落入库
    NO->>ID: data.identity.updated（人格演化）
```

### 3.5 reflection + 夜间 incubation：复盘与酝酿

```mermaid
sequenceDiagram
    participant Clock
    participant DMN
    participant RE as ReflectionEngine
    participant MMS as MidTermMemory
    participant CQ as ConversationQueue
    participant MS as MemoryStream
    participant ST as SelfTimeline
    participant MEM as MemorySystem

    Note over Clock: 18:00-19:00 reflection
    Clock->>DMN: phase=reflection
    DMN->>RE: 触发反思
    RE->>MEM: 检索当日 fragment
    RE->>RE: 累计 importance 超阈值→生成高阶结论
    RE->>MEM: data.reflection.generated
    CQ->>MMS: 队列溢出 data.conversation.queue.evicted
    MMS->>MS: 压缩摘要入 MemoryStream
    MMS->>Bus: data.memory.mid_term.summary

    Note over Clock: 23:00-24:00 夜间 incubation
    Clock->>DMN: phase=incubation
    DMN->>ST: 汇总当日全量事件
    ST->>MEM: 写入日记
    DMN->>DMN: 睡前酝酿 fragment（为明日创作蓄势）
```

---

## 4. 模块-参考项目映射

### 4.1 参考项目分组映射图

林逸借鉴了 21 个开源项目，按职能分为 7 组（来源：[docs/refs/borrow_matrix.md](file:///workspace/docs/refs/borrow_matrix.md) 与 [docs/拟人化日程节律与角色社交补强方案_v2.md](file:///workspace/docs/拟人化日程节律与角色社交补强方案_v2.md) §15）：

```mermaid
flowchart LR
    subgraph LinYi[林逸的一天循环]

        subgraph 节律["节律与拟人化"]
            CLK2[clock/scheduler]
            ST2[self_timeline]
            RRG2[reader_rest_gate]
            TB2[token_budget]
            PS2[prompt_surface]
        end

        subgraph 社交["OC 多 Agent 社交"]
            OCT2[oc_town_engine]
            RG2[relationship_graph]
            OCS2[oc_character_system]
        end

        subgraph 记忆["记忆系统"]
            MEM2[memory/memory_stream]
            RE2[reflection_engine]
            MMS2[mid_term_memory]
            LF2[llm_fact_extractor]
        end

        subgraph 卡片["角色卡/世界书"]
            CCM2[character_card_module]
            WBT2[world_book_trigger]
        end

        subgraph 情绪["情绪与身体"]
            SVB2[social_vital_bridge]
            ES2[expression_state]
        end

        subgraph 工具["本地工具"]
            TU2[tool_use_module]
        end

        subgraph 小说["小说写作链路"]
            PLN2[planner 四线编织]
            CRE2[creation_executive Director]
            CA2[continuity_auditor 六维]
            QE2[quality_engine 去AI味]
            CM2[chapter_manager]
            WS2[world_state 真源]
            COC2[coc_mapping_engine 题材]
            PR2[prompts 雪花/结构]
        end
    end

    subgraph 参考项目
        A1[astrbot_companion]
        A2[ai-town]
        A3[generative_agents]
        A4[MaiBot]
        A5[mem0]
        A6[Zep]
        A7[MemGPT]
        A8[SillyTavern]
        A9[Project AIRI]
        A10[a16z companion]
        A11[Agent Zero]
        N1[ainovel-cli]
        N2[InkOS]
        N3[NovelPilot]
        N4[Webnovel Writer]
        N5[AI Novel Factory]
        N6[NovelDreamer]
        N7[AI_NovelGenerator_YILING]
    end

    A1 --> 节律
    A2 --> 社交
    A3 --> 社交
    A3 --> 记忆
    A4 --> 记忆
    A4 --> 节律
    A5 --> 记忆
    A6 --> 社交
    A7 --> 记忆
    A8 --> 卡片
    A9 --> 情绪
    A10 --> 记忆
    A10 --> 节律
    A11 --> 工具
    N1 --> 小说
    N2 --> 小说
    N3 --> 小说
    N4 --> 小说
    N5 --> 小说
    N6 --> 小说
    N7 --> 小说
```

### 4.2 借鉴矩阵（14 个小说写作借鉴点）

来自 [docs/refs/borrow_matrix.md](file:///workspace/docs/refs/borrow_matrix.md)，覆盖 7 个小说写作项目：

| # | 借鉴点 | 主参考 | 辅助参考 | LinYi 落地位置 |
|---|--------|--------|----------|----------------|
| 1 | Story Bible 真源 | Webnovel Writer | NovelPilot / AI Novel Factory | [models.py::StoryBible](file:///workspace/src/novelist_brain/models.py) + `story_bible/{novel_id}.json` |
| 2 | Strand Weave 四线节奏 | Webnovel Writer | ainovel-cli | [planner.py::Planner](file:///workspace/src/novelist_brain/planner.py) |
| 3 | ContinuityAuditor 六维审计 | InkOS | ainovel-cli / NovelPilot | [continuity_auditor.py](file:///workspace/src/novelist_brain/continuity_auditor.py) |
| 4 | 去 AI 味规则 | ainovel-cli | Webnovel Writer | [quality_engine.py](file:///workspace/src/novelist_brain/quality_engine.py) + [prompts.py](file:///workspace/src/novelist_brain/prompts.py) |
| 5 | 滚动规划 | ainovel-cli | AI Novel Factory | [planner.py](file:///workspace/src/novelist_brain/planner.py) + [chapter_manager.py](file:///workspace/src/novelist_brain/chapter_manager.py) |
| 6 | 雪花写作法提示词 | AI_NovelGenerator_YILING | NovelPilot | [prompts.py](file:///workspace/src/novelist_brain/prompts.py) |
| 7 | 显式叙事结构 | NovelDreamer | AI_NovelGenerator_YILING | [prompts.py](file:///workspace/src/novelist_brain/prompts.py)（结构选择器常量） |
| 8 | 单一真源（SQLite/JSON） | AI Novel Factory | Webnovel Writer | [persistence.py](file:///workspace/src/novelist_brain/persistence.py) + `story_bible/` |
| 9 | 多 Agent 流水线 | NovelPilot | InkOS | [creation_executive.py](file:///workspace/src/novelist_brain/creation_executive.py) + [module_registry.py](file:///workspace/src/novelist_brain/module_registry.py) |
| 10 | 文风指纹 | ainovel-cli | InkOS | [quality_engine.py](file:///workspace/src/novelist_brain/quality_engine.py) + StoryBible.style_fingerprint |
| 11 | 题材模板 | Webnovel Writer | AI_NovelGenerator_YILING | [coc_mapping_engine.py](file:///workspace/src/novelist_brain/coc_mapping_engine.py) |
| 12 | Foreshadowing Tracker | NovelPilot | Webnovel Writer | StoryBible.foreshadowing_ledger + [planner.py::ForeshadowingOp](file:///workspace/src/novelist_brain/planner.py) |
| 13 | Director/Worker 协作 | AI Novel Factory | — | [creation_executive.py](file:///workspace/src/novelist_brain/creation_executive.py)（Director）+ [scheduler.py](file:///workspace/src/novelist_brain/scheduler.py)（Worker）+ [circuit_breaker.py](file:///workspace/src/novelist_brain/circuit_breaker.py) |
| 14 | 风格迁移（外部语料） | NovelDreamer | — | [prompts.py](file:///workspace/src/novelist_brain/prompts.py) + [memory.py](file:///workspace/src/novelist_brain/memory.py) |

### 4.3 拟人化补强借鉴（7 个虚拟生命项目）

来自 [docs/拟人化日程节律与角色社交补强方案_v2.md](file:///workspace/docs/拟人化日程节律与角色社交补强方案_v2.md) §15，对应 7 个补强方向：

| 补强方向 | 主参考 | 辅助参考 | LinYi 落地 | 状态 |
|---------|--------|----------|-----------|------|
| 1. 记忆分层+三因子检索 | generative_agents、mem0 | Zep、MemGPT | [memory_stream.py](file:///workspace/src/novelist_brain/memory_stream.py) | ⚠️ 部分（无向量、无分层） |
| 2. 反思+三因子检索 | generative_agents | mem0 | [reflection_engine.py](file:///workspace/src/novelist_brain/reflection_engine.py) | ⚠️ 部分 |
| 3. 完整拟人化节律 | astrbot_companion | — | clock/scheduler/self_timeline/reader_rest_gate/token_budget | ⚠️ 部分（DailyPlan LLM 生成未落地） |
| 4. OC 自治社交 | ai-town | generative_agents | [oc_town_engine.py](file:///workspace/src/novelist_brain/oc_town_engine.py) + [relationship_graph.py](file:///workspace/src/novelist_brain/relationship_graph.py) | ✅ 基础已落地 |
| 5. 角色卡规范对齐 | SillyTavern | a16z companion | [character_card_module.py](file:///workspace/src/novelist_brain/character_card_module.py) + [world_book_trigger.py](file:///workspace/src/novelist_brain/world_book_trigger.py) | ✅ V2 已落地 |
| 6. 情绪连续性桥接 | Project AIRI | — | [social_vital_bridge.py](file:///workspace/src/novelist_brain/social_vital_bridge.py) + [expression_state.py](file:///workspace/src/novelist_brain/expression_state.py) | ✅ 已落地 |
| 7. 工具使用（安全沙盒） | Agent Zero | — | [tool_use_module.py](file:///workspace/src/novelist_brain/tool_use_module.py) | ✅ 已落地 |

### 4.4 参考项目能力 → LinYi 模块（ER 视图）

```mermaid
erDiagram
    generative_agents ||--o{ MEMORY_STREAM : "三因子检索+反思"
    ai_town ||--o{ OC_TOWN_ENGINE : "Agent.tick+Conversation"
    ai_town ||--o{ RELATIONSHIP_GRAPH : "participatedTogether"
    astrbot_companion ||--o{ CLOCK_SCHEDULER : "两层日程"
    astrbot_companion ||--o{ SELF_TIMELINE : "防失忆"
    astrbot_companion ||--o{ READER_REST_GATE : "休息门控"
    astrbot_companion ||--o{ TOKEN_BUDGET : "成本治理"
    astrbot_companion ||--o{ PROMPT_SURFACE : "槽位组装"
    mem0 ||--o{ MEMORY : "提取+检索+rerank"
    Zep ||--o{ RELATIONSHIP_GRAPH : "时序图谱"
    MemGPT ||--o{ LLM_FACT_EXTRACTOR : "分层记忆"
    SillyTavern ||--o{ CHARACTER_CARD_MODULE : "V2角色卡"
    SillyTavern ||--o{ WORLD_BOOK_TRIGGER : "WorldInfo触发"
    Project_AIRI ||--o{ SOCIAL_VITAL_BRIDGE : "情绪连续性"
    Project_AIRI ||--o{ EXPRESSION_STATE : "身体参数"
    a16z_companion ||--o{ CONVERSATION_QUEUE : "对话队列"
    a16z_companion ||--o{ MEMORY_STREAM : "混合检索"
    Agent_Zero ||--o{ TOOL_USE_MODULE : "工具抽象"
    MaiBot ||--o{ PERSONA_INJECTOR : "画像注入"
    MaiBot ||--o{ MID_TERM_MEMORY : "聊天回想"
    ainovel_cli ||--o{ PLANNER : "滚动规划"
    ainovel_cli ||--o{ QUALITY_ENGINE : "去AI味+文风指纹"
    ainovel_cli ||--o{ CHAPTER_MANAGER : "Checkpoint"
    InkOS ||--o{ CONTINUITY_AUDITOR : "六维审计"
    NovelPilot ||--o{ CREATION_EXECUTIVE : "9-Agent流水线"
    NovelPilot ||--o{ PLANNER : "ForeshadowingTracker"
    Webnovel_Writer ||--o{ PLANNER : "StrandWeave"
    Webnovel_Writer ||--o{ COC_MAPPING_ENGINE : "题材模板"
    AI_Novel_Factory ||--o{ PERSISTENCE : "单一真源"
    AI_Novel_Factory ||--o{ CREATION_EXECUTIVE : "Director/Worker"
    NovelDreamer ||--o{ PROMPTS : "结构选择器"
    AI_NovelGenerator_YILING ||--o{ PROMPTS : "雪花写作法"
```

---

## 5. 循环缺陷审计

### 5.1 缺陷清单（定位到代码）

缺陷来源：[docs/AUDIT-REPORT.md](file:///workspace/docs/AUDIT-REPORT.md)（工程审计）+ [docs/拟人化日程节律与角色社交补强方案_v1.md](file:///workspace/docs/拟人化日程节律与角色社交补强方案_v2.md) §1（节律诊断）+ 本次循环分析。

| # | 严重度 | 缺陷 | 代码位置 | 影响 |
|---|--------|------|---------|------|
| D1 | **P0** | BusRouter 无线程安全保护 | [bus.py](file:///workspace/src/novelist_brain/bus.py) | WebUI 线程 + 主线程并发 publish/flush 丢消息，常驻运行最易触发 |
| D2 | **P1** | 记忆多结构无界增长（_fragments/_traces/_social_provenance/_skill_checks/_prediction_errors） | [memory.py](file:///workspace/src/novelist_brain/memory.py)、[sandbox.py](file:///workspace/src/novelist_brain/sandbox.py) | 7×24 常驻 OOM |
| D3 | **P1** | 遗忘机制缺失（有 recency 衰减计算，无剪枝执行） | [memory.py](file:///workspace/src/novelist_brain/memory.py) | Design.md §12 遗忘曲线未落地 |
| D4 | **P1** | reconstruct_dataclass 的 Literal 类型检查脆弱（`str(origin).startswith("typing.Literal")`） | [persistence.py](file:///workspace/src/novelist_brain/persistence.py) | Python 3.12+ 可能失效 |
| D5 | **P2** | LLM _strip_reasoning_prefix 60+ 硬编码正则脆弱 | [llm.py:515-621](file:///workspace/src/novelist_brain/llm.py#L515) | 正常散文误判 |
| D6 | **P2** | 沙盒战斗 defender 选择只看 other_characters[0] | [sandbox.py](file:///workspace/src/novelist_brain/sandbox.py) | 推演偏差 |
| D7 | **P2** | save_incremental 存完整状态而非增量 | [persistence.py](file:///workspace/src/novelist_brain/persistence.py) | 注释说增量实际全量，长跑 IO 压力 |
| D8 | **P2** | fragment 同义密集重复 + 标签化非生活化 | [memory.py](file:///workspace/src/novelist_brain/memory.py) + [dmn.py](file:///workspace/src/novelist_brain/dmn.py) | 一天循环素材质量差 |
| D9 | **P2** | 日程模板感强（8 阶段每天相似，无"今天是什么日子/昨日残留/小意外"） | [scheduler.py](file:///workspace/src/novelist_brain/scheduler.py) | 循环缺乏变量 |
| D10 | **P2** | DailyPlan LLM 生成未落地（仍是硬编码 DEFAULT_PHASES） | [scheduler.py](file:///workspace/src/novelist_brain/scheduler.py) | B=MAT 评分无实际效果 |
| D11 | **P2** | 三网络切换粗糙（SN 仅按显著性阈值，未结合 reader_temperature/creative_drive） | [salience_network.py](file:///workspace/src/novelist_brain/salience_network.py) | 切换不够拟人 |
| D12 | **P3** | apply_retention 从未在主循环调用（v2 已补，仍需验证） | [main.py](file:///workspace/main.py) | 旧快照堆积 |
| D13 | **P3** | _apply_loaded_context 混用 dict 和 dataclass | [main.py:455](file:///workspace/main.py#L455) | 状态恢复脆弱 |
| D14 | **P3** | 记忆检索仅关键词，无向量/BM25/reranker | [memory_stream.py](file:///workspace/src/novelist_brain/memory_stream.py) | 三因子检索质量低 |
| D15 | **P3** | 无实体识别/知识图谱（OC 关系有时序，实体无图谱） | — | 长篇一致性弱 |

### 5.2 缺陷因果图

```mermaid
flowchart TD
    R1[根因: BusRouter 无锁]
    R2[根因: 记忆结构只增不减]
    R3[根因: 遗忘机制未实现]
    R4[根因: DMN 依赖固定 interests]
    R5[根因: 无 fragment 去重 gate]
    R6[根因: DailyPlan 硬编码]
    R7[根因: SN 切换仅看显著性]
    R8[根因: 检索仅关键词]

    R1 --> S1[现象: WebUI 并发丢消息]
    R2 --> S2[现象: 7×24 OOM]
    R3 --> S2
    R4 --> S3[现象: fragment 标签化重复]
    R5 --> S3
    R6 --> S4[现象: 日程每天相似无变量]
    R7 --> S5[现象: 网络切换不拟人]
    R8 --> S6[现象: 检索召回质量低]

    S2 --> I1[影响: 长期运行崩溃]
    S3 --> I2[影响: 白天素材质量差→晚间小说像无人称练习]
    S4 --> I2
    S5 --> I3[影响: 创作时段触发不稳定]
    S6 --> I4[影响: 创作上下文噪声大]

    I1 --> C[结论: 循环可跑但不可长期跑+产出质量不稳定]
    I2 --> C
    I3 --> C
    I4 --> C
```

### 5.3 缺陷覆盖状态

```mermaid
flowchart LR
    subgraph 已覆盖["已被现有 spec/方案覆盖"]
        D1[D1 BusRouter 加锁]
        D2[D2 内存剪枝]
        D3[D3 遗忘曲线]
        D8[D8 FragmentQualityGate]
        D9[D9 DailyPlan 动态]
        D10[D10 DailyPlan LLM 生成]
    end

    subgraph 部分覆盖["部分覆盖"]
        D11[D11 SN 多维度切换]
        D14[D14 向量检索]
    end

    subgraph 裸露["仍裸露"]
        D4[D4 Literal 类型]
        D5[D5 LLM strip 正则]
        D6[D6 沙盒 defender]
        D7[D7 真增量持久化]
        D12[D12 retention 调用]
        D13[D13 dict/dataclass]
        D15[D15 知识图谱]
    end

    已覆盖 -.->|refactor-novelist-system-v1<br/>拟人化方案 v2| 部分
    部分 -.->|需新工作项| 裸露
```

---

## 6. 进一步/重构建议与路线图

### 6.1 重构建议表（P0~P3）

| 优先级 | 建议 | 对应缺陷 | 复杂度 | 收益 | 对应 spec/工作项 | 参考来源 |
|--------|------|---------|--------|------|-----------------|---------|
| **P0** | BusRouter 加 `threading.RLock()` 保护 publish/flush/subscribe | D1 | 低 | 高 | 新工作项 | [AUDIT-REPORT.md](file:///workspace/docs/AUDIT-REPORT.md) #2 |
| **P0** | 接入 FragmentQualityGate（签名+语义+时间线三重过滤）+ importance 评分 | D8 | 中 | 高 | 拟人化方案 v2 阶段一 | generative_agents、astrbot |
| **P0** | SelfTimeline 已落地，需补"今天已写过什么"在创作前查询 | D8/D9 | 中 | 高 | 拟人化方案 v2 阶段一 | astrbot |
| **P0** | 记忆剪枝执行（importance 阈值+recency 衰减实际删除） | D2/D3 | 中 | 高 | 新工作项 | Design.md §12、mem0 |
| **P1** | DailyPlan LLM 生成落地（每天早晨生成一次，fallback 到 DEFAULT_PHASES） | D9/D10 | 高 | 高 | 拟人化方案 v2 阶段二 | astrbot |
| **P1** | VitalState 扩展 Metabolism（mood_bias/arousal/creative_drive）+ SN 引入多维度切换 | D11 | 低 | 中 | 拟人化方案 v2 阶段三 | astrbot、Project AIRI |
| **P1** | 三因子检索升级为向量+BM25 混合（替换关键词） | D14 | 中 | 中 | 拟人化方案 v2 阶段一 | mem0、a16z |
| **P1** | OCTownEngine 完整对话状态机+OCMemory importance+反思 | — | 高 | 中 | 拟人化方案 v2 阶段三 | ai-town |
| **P2** | LLM reasoning strip 改用 structured output / tool calling | D5 | 中 | 中 | 新工作项 | NovelPilot（retry/fallback） |
| **P2** | save_incremental 改为真增量（只写 delta） | D7 | 中 | 中 | refactor-novelist-system-v1 | AI Novel Factory |
| **P2** | TokenBudget 内部治理（软/硬上限+任务分级） | — | 中 | 中 | 拟人化方案 v2 阶段二 | astrbot、mem0 |
| **P2** | 沙盒 defender 选择改为最近敌对角色 | D6 | 低 | 低 | 新工作项 | — |
| **P2** | reconstruct_dataclass 改 `origin is Literal` | D4 | 低 | 低 | 新工作项 | [AUDIT-REPORT.md](file:///workspace/docs/AUDIT-REPORT.md) #4 |
| **P3** | 分层记忆（工作/情景/语义，MemGPT 模式） | D14 | 高 | 中 | 拟人化方案 v2 阶段五 | MemGPT |
| **P3** | 时序知识图谱（实体-关系-时间戳，Zep 模式） | D15 | 高 | 中 | 拟人化方案 v2 阶段五 | Zep |
| **P3** | MCP 工具协议正式接入（与本地 MCP 生态互通） | — | 中 | 低 | 拟人化方案 v2 阶段五 | mem0、autogen |
| **P3** | apply_retention 在主循环日边界调用验证 | D12 | 低 | 低 | 新工作项 | [AUDIT-REPORT.md](file:///workspace/docs/AUDIT-REPORT.md) #9 |

### 6.2 重构路线图

```mermaid
gantt
    title 林逸循环重构路线图（5 阶段）
    dateFormat YYYY-MM-DD
    axisFormat %m-%d

    section 阶段一 记忆升级+去重
    BusRouter 加锁                    :p0a, 2026-07-24, 1d
    FragmentQualityGate+importance    :p0b, 2026-07-24, 5d
    记忆剪枝执行                       :p0c, 2026-07-25, 4d
    SelfTimeline 创作前查询            :p0d, 2026-07-26, 3d

    section 阶段二 节律完整落地
    DailyPlan LLM 生成                 :p1a, after p0b, 7d
    SegmentDetailEnhancer 联动         :p1b, after p1a, 4d
    VitalState 扩展 Metabolism         :p1c, after p0b, 3d
    SN 多维度切换                      :p1d, after p1c, 3d
    TokenBudget 内部治理               :p1e, after p1a, 3d

    section 阶段三 OC 社交完整
    OCTownEngine 对话状态机            :p2a, after p1b, 6d
    OCMemory importance+反思           :p2b, after p2a, 4d
    RelationshipGraph 衰减             :p2c, after p2a, 2d
    COCMappingEngine 联动              :p2d, after p2b, 3d

    section 阶段四 审计质量闭环
    ContinuityAuditor 六维完整         :p3a, after p2d, 5d
    QualityEngine 去AI味+文风指纹      :p3b, after p3a, 5d
    LLM strip 改 structured output     :p3c, after p3a, 3d

    section 阶段五 分层记忆+图谱
    向量+BM25 混合检索                 :p4a, after p3b, 6d
    分层记忆 MemGPT 模式               :p4b, after p4a, 8d
    时序知识图谱 Zep 模式              :p4c, after p4a, 10d
    MCP 工具协议                       :p4d, after p4a, 5d
```

### 6.3 目标循环：补强后林逸的一天

补强后，循环应呈现如下形态（对比第 1 节现状）：

```mermaid
flowchart LR
    subgraph 白天["白天：生活+社交（DMN 为主）"]
        B1[DailyPlan LLM 生成<br/>基于昨日日记+今日日期+状态]
        B2[SegmentDetail 细化<br/>含 today_events/proactive_events]
        B3[FragmentQualityGate<br/>签名+语义+时间线三重过滤]
        B4[PersonalInput/SocialInput<br/>具体时间地点动作身体感受]
        B5[OCTownEngine<br/>OC 自治对话+反思+关系演化]
        B6[SelfTimeline<br/>统一记录防失忆]
        B7[SocialVitalBridge<br/>社交事件→情绪+衰减]
    end

    subgraph 晚间["晚间：创作（CEN 为主）"]
        E1[Planner 四线编织<br/>Quest/Fire/Constellation/Rest]
        E2[CreationExecutive Director<br/>决定+编排+retry/interrupt]
        E3[ContinuityAuditor 六维审计]
        E4[QualityEngine 去AI味+文风指纹]
        E5[ChapterManager 卷/章/段+版本]
    end

    subgraph 夜间["夜间：反思+梦境（DMN 为主）"]
        N1[ReflectionEngine<br/>importance 累计触发高阶结论]
        N2[MidTermMemory<br/>对话压缩摘要]
        N3[记忆剪枝<br/>遗忘曲线实际执行]
        N4[DMN 做梦<br/>重组当日残留]
    end

    B1 --> B2 --> B3 --> B4 --> B5 --> B6 --> B7
    B7 --> E1
    E1 --> E2 --> E3 --> E4 --> E5
    E5 --> N1 --> N2 --> N3 --> N4
    N4 -.->|次日| B1
```

**目标循环的关键差异**：

1. **DailyPlan 由 LLM 动态生成**，不再每天硬编码（解 D9/D10）
2. **FragmentQualityGate 三重过滤**，素材不再标签化重复（解 D8）
3. **OC 社交完整闭环**，OC 自治产生涌现情节种子（参考 ai-town）
4. **创作链路六维审计+去AI味**，产出具备小说性（参考 7 个小说项目）
5. **夜间记忆剪枝实际执行**，7×24 可持续（解 D2/D3）
6. **SocialVitalBridge 让情绪真正反映社交事件**，循环有情感起伏（参考 Project AIRI）

---

## 7. 审计结论

### 7.1 循环定性

林逸的一天是一个**设计严谨、借鉴广泛、落地度高**的虚拟生命循环：

- **设计严谨**：8 阶段节律对齐真实时间，DMN/CEN/SN 三网络切换有脑科学依据，B=MAT 评分模型有行为科学依据。
- **借鉴广泛**：21 个参考项目覆盖单 Agent 拟人化、多 Agent 社交、记忆工程、角色卡规范、情绪身体、工具使用、小说写作 7 个维度，借鉴矩阵 100% 覆盖。
- **落地度高**：184 tests 全绿，40+ 模块全部注册到总线，主循环 [main.py](file:///workspace/main.py) 已支持常驻运行+快照+增量+retention+事务回滚。

### 7.2 主要风险

循环的**结构性风险**集中在三处：

1. **长期运行稳定性**：BusRouter 线程不安全（P0）+ 记忆无界增长（P1）+ 遗忘缺失（P1）→ 7×24 跑不动。
2. **循环素材质量**：fragment 重复+日程模板化+三网络切换粗糙 → 一天循环产出"像无人称的文学练习"。
3. **工程债务**：LLM strip 正则脆弱+持久化非真增量+Literal 类型检查脆弱 → 长期维护成本高。

### 7.3 优先行动

按"先稳住、再提质、后扩展"的顺序：

1. **先稳住**（P0，1–2 周）：BusRouter 加锁 + 记忆剪枝 + FragmentQualityGate + SelfTimeline 创作前查询。
2. **再提质**（P1，3–4 周）：DailyPlan LLM 生成 + VitalState 扩展 + 向量检索 + OCTownEngine 完整闭环。
3. **后扩展**（P2–P3，按需）：LLM strip 重构 + 真增量持久化 + 分层记忆 + 时序图谱 + MCP 工具协议。

完成 P0+P1 后，林逸的一天将真正成为"生活在电脑中、有自己人格和社交的虚拟生命"的可信循环。

---

## 附录 A：关键文件索引

| 层 | 文件 |
|----|------|
| 主循环 | [main.py](file:///workspace/main.py) |
| 节律 | [clock.py](file:///workspace/src/novelist_brain/clock.py)、[scheduler.py](file:///workspace/src/novelist_brain/scheduler.py)、[daily_plan.py](file:///workspace/src/novelist_brain/daily_plan.py) |
| 三网络 | [salience_network.py](file:///workspace/src/novelist_brain/salience_network.py)、[dmn.py](file:///workspace/src/novelist_brain/dmn.py)、[cen.py](file:///workspace/src/novelist_brain/cen.py) |
| 记忆 | [memory.py](file:///workspace/src/novelist_brain/memory.py)、[memory_stream.py](file:///workspace/src/novelist_brain/memory_stream.py)、[mid_term_memory.py](file:///workspace/src/novelist_brain/mid_term_memory.py)、[reflection_engine.py](file:///workspace/src/novelist_brain/reflection_engine.py)、[self_timeline.py](file:///workspace/src/novelist_brain/self_timeline.py)、[conversation_queue.py](file:///workspace/src/novelist_brain/conversation_queue.py) |
| 代谢情绪 | [metabolism.py](file:///workspace/src/novelist_brain/metabolism.py)、[social_vital_bridge.py](file:///workspace/src/novelist_brain/social_vital_bridge.py)、[expression_state.py](file:///workspace/src/novelist_brain/expression_state.py) |
| 输入边界 | [personal_input.py](file:///workspace/src/novelist_brain/personal_input.py)、[social_input.py](file:///workspace/src/novelist_brain/social_input.py)、[reader_profile.py](file:///workspace/src/novelist_brain/reader_profile.py)、[reader_rest_gate.py](file:///workspace/src/novelist_brain/reader_rest_gate.py)、[token_budget.py](file:///workspace/src/novelist_brain/token_budget.py)、[tool_use_module.py](file:///workspace/src/novelist_brain/tool_use_module.py) |
| 沙盒推演 | [sandbox.py](file:///workspace/src/novelist_brain/sandbox.py)、[coc_mapping_engine.py](file:///workspace/src/novelist_brain/coc_mapping_engine.py) |
| 创作链路 | [planner.py](file:///workspace/src/novelist_brain/planner.py)、[creation_executive.py](file:///workspace/src/novelist_brain/creation_executive.py)、[chapter_manager.py](file:///workspace/src/novelist_brain/chapter_manager.py)、[novel_output.py](file:///workspace/src/novelist_brain/novel_output.py) |
| 小说真源 | [world_state.py](file:///workspace/src/novelist_brain/world_state.py)、[oc_character_system.py](file:///workspace/src/novelist_brain/oc_character_system.py) |
| OC 社交 | [oc_town_engine.py](file:///workspace/src/novelist_brain/oc_town_engine.py)、[relationship_graph.py](file:///workspace/src/novelist_brain/relationship_graph.py) |
| 提示人格 | [identity.py](file:///workspace/src/novelist_brain/identity.py)、[persona_injector.py](file:///workspace/src/novelist_brain/persona_injector.py)、[prompt_surface.py](file:///workspace/src/novelist_brain/prompt_surface.py)、[prompts.py](file:///workspace/src/novelist_brain/prompts.py) |
| 审计质量 | [continuity_auditor.py](file:///workspace/src/novelist_brain/continuity_auditor.py)、[quality_engine.py](file:///workspace/src/novelist_brain/quality_engine.py) |
| 容错持久化 | [persistence.py](file:///workspace/src/novelist_brain/persistence.py)、[fault.py](file:///workspace/src/novelist_brain/fault.py)、[recovery.py](file:///workspace/src/novelist_brain/recovery.py)、[circuit_breaker.py](file:///workspace/src/novelist_brain/circuit_breaker.py)、[transaction.py](file:///workspace/src/novelist_brain/transaction.py)、[llm.py](file:///workspace/src/novelist_brain/llm.py) |
| 观测 | [eos.py](file:///workspace/src/novelist_brain/eos.py)、[world_visual_debugger.py](file:///workspace/src/novelist_brain/world_visual_debugger.py) |
| 总线配置 | [bus.py](file:///workspace/src/novelist_brain/bus.py)、[config.py](file:///workspace/src/novelist_brain/config.py)、[module.py](file:///workspace/src/novelist_brain/module.py)、[module_registry.py](file:///workspace/src/novelist_brain/module_registry.py) |

## 附录 B：上游文档索引

- [Design.md](file:///workspace/Design.md) — 系统设计总文档（2000+ 行）
- [docs/AUDIT-REPORT.md](file:///workspace/docs/AUDIT-REPORT.md) — 哈尼斯工程审计（2026-07-20）
- [docs/拟人化日程节律与角色社交补强方案_v2.md](file:///workspace/docs/拟人化日程节律与角色社交补强方案_v2.md) — 拟人化与 OC 社交补强方案 v2
- [docs/系统重构方案_v1.md](file:///workspace/docs/系统重构方案_v1.md) — 小说性重构方案 v1
- [docs/refs/borrow_matrix.md](file:///workspace/docs/refs/borrow_matrix.md) — 14 借鉴点→参考项目映射（100% 覆盖）
- [docs/refs/architecture_compare.md](file:///workspace/docs/refs/architecture_compare.md) — 架构对照表
- [.trae/specs/evolve-novelist-into-persistent-self-linyi/spec.md](file:///workspace/.trae/specs/evolve-novelist-into-persistent-self-linyi/spec.md) — 持续运行与林逸人格 spec
- [.trae/specs/refactor-novelist-system-v1/spec.md](file:///workspace/.trae/specs/refactor-novelist-system-v1/spec.md) — 小说性重构 spec
- [docs/refs/tech_notes/](file:///workspace/docs/refs/tech_notes/) — 17 份参考项目技术笔记
