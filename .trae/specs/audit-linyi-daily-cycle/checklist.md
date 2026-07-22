# Checklist

文档：[docs/linyi-daily-cycle-audit.md](file:///workspace/docs/linyi-daily-cycle-audit.md)

## 文档骨架与循环全景

- [ ] 文档含元信息（标题、审计日期 2026-07-23、仓库、代码规模、审计视角说明）
- [ ] 含一张覆盖 00:00–24:00 的 8 阶段循环全景 Mermaid 图（gantt 或 sequenceDiagram）
- [ ] 8 阶段齐全：deep_night / morning / incubation / social / simulation / reflection / creation / incubation
- [ ] 每阶段标注：时间区间、主导网络（DMN/CEN/SN）、核心模块、输入来源、产出物
- [ ] 含循环驱动机制图（RealTimeClock → DailyScheduler B=MAT → Phase → event.clock.phase.changed → 总线）

## 模块分层与职责

- [ ] 含 13 层分层架构 Mermaid flowchart
- [ ] 每层有"模块 | 职责 | 关键 topic | 参考项目"四栏表
- [ ] 覆盖循环核心模块至少 40 个（含 clock/scheduler/dmn/cen/salience_network/memory/memory_stream/self_timeline/metabolism/social_vital_bridge/personal_input/social_input/reader_profile/reader_rest_gate/token_budget/tool_use_module/sandbox/coc_mapping_engine/creation_executive/planner/chapter_manager/novel_output/world_state/oc_character_system/oc_town_engine/relationship_graph/identity/persona_injector/prompt_surface/persistence/fault/recovery/eos/bus/config 等）
- [ ] 含单 Agent 轨 + 多 Agent 轨（OC 社交）双轨数据流图

## 阶段协作时序

- [ ] deep_night + morning 时序图
- [ ] incubation + social 时序图（Fragment → MemorySystem → SelfTimeline）
- [ ] simulation 时序图（CEN → OCTownEngine → COCMappingEngine → MentalSandbox）
- [ ] creation 时序图（Planner → ChapterManager → CreationExecutive → NovelOutput → ContinuityAuditor → QualityEngine）
- [ ] reflection + 夜间 incubation 时序图（ReflectionEngine + MidTermMemory）

## 模块-参考项目映射

- [ ] 含模块到 21 个参考项目的映射 Mermaid 图（按 7 组分组）
- [ ] 借鉴矩阵表覆盖 borrow_matrix.md 的 14 个借鉴点
- [ ] 借鉴矩阵表覆盖拟人化方案 v2 的 7 个补强方向
- [ ] 每条映射含主参考、辅助参考、关键文件/行号、LinYi 落地位置
- [ ] 含"参考项目能力 → LinYi 模块"的 ER/类图

## 缺陷与重构建议

- [ ] 缺陷清单每条定位到代码文件（file:/// 链接）
- [ ] 含缺陷因果 Mermaid flowchart
- [ ] 缺陷标注是否已被 v2/重构方案覆盖
- [ ] 重构建议按 P0~P3 优先级排序
- [ ] 每条建议含：优先级 | 建议 | 复杂度 | 收益 | 对应 spec/工作项 | 参考来源
- [ ] 含重构路线图 Mermaid gantt（5 个阶段）
- [ ] 含"目标循环"Mermaid flowchart（补强后的一天）

## 可视化与质量

- [ ] Mermaid 图大面积使用（≥10 张），类型多样（flowchart/sequenceDiagram/erDiagram/gantt/classDiagram）
- [ ] 每张图有标题与简要说明
- [ ] 全文中文
- [ ] 所有文件引用使用 file:/// 链接且路径正确
- [ ] Mermaid 语法可渲染（无未闭合引号、无非法字符）
- [ ] 结论与 [docs/AUDIT-REPORT.md](file:///workspace/docs/AUDIT-REPORT.md)、[docs/拟人化日程节律与角色社交补强方案_v2.md](file:///workspace/docs/拟人化日程节律与角色社交补强方案_v2.md)、[docs/refs/borrow_matrix.md](file:///workspace/docs/refs/borrow_matrix.md) 一致，不矛盾
- [ ] 不修改任何源码（纯文档产出）
