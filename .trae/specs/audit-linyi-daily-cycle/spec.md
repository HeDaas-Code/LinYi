# 林逸的一天循环审计与重构建议 Spec

## Why

LinYi 代码库（22,682 行 Python / 82 文件）围绕小说家"林逸"构建了一个常驻虚拟生命 Agent：他与真实时间同频生活、社交、反思，并在晚间创作小说。系统由 8 阶段昼夜节律驱动，串联起 40+ 个模块、两条轨道（单 Agent 拟人化 + 多 Agent OC 社交），并借鉴了 21 个开源项目。

但目前缺少一份**面向"林逸的一天"这一核心循环**的统一审计文档：现有资料散落在 [Design.md](file:///workspace/Design.md)、[docs/AUDIT-REPORT.md](file:///workspace/docs/AUDIT-REPORT.md)、[docs/拟人化日程节律与角色社交补强方案_v2.md](file:///workspace/docs/拟人化日程节律与角色社交补强方案_v2.md)、[docs/系统重构方案_v1.md](file:///workspace/docs/系统重构方案_v1.md)、[docs/refs/borrow_matrix.md](file:///workspace/docs/refs/borrow_matrix.md) 与多个 spec 目录中，视角各异、颗粒度不一，且未以"一天循环"为主线把模块职责、参考来源、重构建议串联成可視化的整体。本变更补齐这一缺口，产出一篇以 Mermaid 架构图为主表达方式的中文审计分析文档。

## What Changes

- **新增** 审计分析文档 [docs/linyi-daily-cycle-audit.md](file:///workspace/docs/linyi-daily-cycle-audit.md)，内容覆盖：
  - 林逸一天的 8 阶段循环及其驱动机制（Clock / DailyScheduler / B=MAT 模型）
  - 循环中每个阶段涉及的模块、模块职责、模块间数据流
  - 模块到参考项目的映射（21 个参考项目：单 Agent 拟人化 / 多 Agent 社交 / 记忆 / 角色卡 / 情绪身体 / 工具 / 小说写作 7 项目）
  - 现有循环的缺陷（fragment 重复、日程模板化、记忆无界增长、BusRouter 线程不安全等）
  - 进一步/重构建议（按优先级 P0~P3 排序）
- **大面积使用 Mermaid 可视化**：每日循环时序图、模块分层架构图、模块-参考项目映射图、循环缺陷因果图、重构路线图等。
- **不改动任何代码**：本变更仅为分析与文档产出，所有结论基于现有代码与文档，不引入新的功能或破坏性改动。

## Impact

- Affected specs: 与 [evolve-novelist-into-persistent-self-linyi](file:///workspace/.trae/specs/evolve-novelist-into-persistent-self-linyi/spec.md)（节律与人格）、[refactor-novelist-system-v1](file:///workspace/.trae/specs/refactor-novelist-system-v1/spec.md)（重构方案）形成互补，作为两者的"现状审计基线"。
- Affected code: 仅新增 [docs/linyi-daily-cycle-audit.md](file:///workspace/docs/linyi-daily-cycle-audit.md)；不修改任何源码。审计结论将引用以下关键文件：
  - 节律层：[src/novelist_brain/clock.py](file:///workspace/src/novelist_brain/clock.py)、[src/novelist_brain/scheduler.py](file:///workspace/src/novelist_brain/scheduler.py)、[src/novelist_brain/daily_plan.py](file:///workspace/src/novelist_brain/daily_plan.py)
  - 三网络：[src/novelist_brain/salience_network.py](file:///workspace/src/novelist_brain/salience_network.py)、[src/novelist_brain/dmn.py](file:///workspace/src/novelist_brain/dmn.py)、[src/novelist_brain/cen.py](file:///workspace/src/novelist_brain/cen.py)
  - 记忆：[src/novelist_brain/memory.py](file:///workspace/src/novelist_brain/memory.py)、[src/novelist_brain/memory_stream.py](file:///workspace/src/novelist_brain/memory_stream.py)、[src/novelist_brain/self_timeline.py](file:///workspace/src/novelist_brain/self_timeline.py)
  - 创作链路：[src/novelist_brain/sandbox.py](file:///workspace/src/novelist_brain/sandbox.py)、[src/novelist_brain/coc_mapping_engine.py](file:///workspace/src/novelist_brain/coc_mapping_engine.py)、[src/novelist_brain/creation_executive.py](file:///workspace/src/novelist_brain/creation_executive.py)、[src/novelist_brain/planner.py](file:///workspace/src/novelist_brain/planner.py)、[src/novelist_brain/chapter_manager.py](file:///workspace/src/novelist_brain/chapter_manager.py)
  - 社交：[src/novelist_brain/oc_town_engine.py](file:///workspace/src/novelist_brain/oc_town_engine.py)、[src/novelist_brain/relationship_graph.py](file:///workspace/src/novelist_brain/relationship_graph.py)、[src/novelist_brain/social_vital_bridge.py](file:///workspace/src/novelist_brain/social_vital_bridge.py)
  - 主循环：[main.py](file:///workspace/main.py)
- Affected docs: 与 [docs/AUDIT-REPORT.md](file:///workspace/docs/AUDIT-REPORT.md)（哈尼斯的工程审计）形成互补——前者偏工程缺陷，本文偏"一天循环"的系统级审计。

## ADDED Requirements

### Requirement: 一天循环全景图

审计文档 SHALL 以"林逸的一天"为主线，绘制一张覆盖 00:00–24:00 的 8 阶段循环全景图，明确标注每个阶段的时间区间、主导网络（DMN/CEN/SN）、核心模块、输入来源与产出物。

#### Scenario: 读者一眼看懂一天
- **WHEN** 读者打开审计文档
- **THEN** 通过 Mermaid 时序图/甘特图能立即看到 8 个阶段（deep_night / morning / incubation / social / simulation / reflection / creation / incubation）及其衔接关系

### Requirement: 模块分层与职责清单

审计文档 SHALL 把循环涉及的 40+ 模块按职能分层（节律调度 / 三网络 / 记忆 / 代谢与情绪 / 输入边界 / 沙盒推演 / 创作链路 / 小说真源 / OC 社交 / 提示人格 / 容错持久化 / 观测 / 总线配置），并为每个模块给出"一句话职责 + 关键事件 topic + 参考项目"三栏。

#### Scenario: 模块可定位
- **WHEN** 读者想了解某个模块（如 OCTownEngine）在循环中的位置
- **THEN** 能在分层架构图与职责表中定位其所属层级、订阅/发布的事件、参考来源

### Requirement: 模块-参考项目映射

审计文档 SHALL 提供模块到 21 个参考项目的映射图与表格，至少覆盖：astrbot_plugin_private_companion（单 Agent 拟人化）、ai-town + generative_agents（多 Agent 社交）、mem0 / Zep / MemGPT（记忆）、SillyTavern（角色卡/世界书）、Project AIRI（情绪连续性/身体表现）、a16z companion-app（陪伴/混合检索）、Agent Zero（工具）、MaiBot（印象/兴趣）、以及 7 个小说写作项目（ainovel-cli / InkOS / NovelPilot / Webnovel Writer / AI Novel Factory / NovelDreamer / AI_NovelGenerator_YILING）。

#### Scenario: 每个模块能溯源
- **WHEN** 读者想知道某模块（如 Planner 的四线编织）借鉴自哪个项目
- **THEN** 在映射表中能查到主参考、辅助参考、关键文件/行号、LinYi 落地位置

### Requirement: 循环缺陷与重构建议

审计文档 SHALL 总结现有循环的缺陷（fragment 重复、日程模板化、记忆无界增长、BusRouter 线程不安全、LLM reasoning strip 脆弱、持久化非真增量、遗忘机制缺失等），并给出按 P0~P3 优先级排序的重构建议，配以重构路线图。

#### Scenario: 缺陷可追溯、建议可执行
- **WHEN** 读者想推进重构
- **THEN** 每条缺陷能定位到代码文件，每条建议能对应到现有 spec（如 refactor-novelist-system-v1）或新增工作项

### Requirement: 可视化为主表达

审计文档 SHALL 大面积使用 Mermaid 图（flowchart / sequenceDiagram / erDiagram / gantt / classDiagram 等）作为主要表达方式，文字部分仅作图注与结论。每张图必须有标题与简要说明。

#### Scenario: 图表可独立解读
- **WHEN** 读者只看图
- **THEN** 能理解循环结构、模块关系、参考来源、缺陷因果、重构路径

## REMOVED Requirements

无（本变更为纯文档产出，不删除任何现有需求或代码）。
