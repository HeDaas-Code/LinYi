# Tasks

产出文档：[docs/linyi-daily-cycle-audit.md](file:///workspace/docs/linyi-daily-cycle-audit.md)

- [ ] Task 1：搭建文档骨架与"林逸的一天"循环全景图
  - [ ] SubTask 1.1：写入文档元信息（标题、审计日期、仓库、规模、审计视角）
  - [ ] SubTask 1.2：用 Mermaid gantt/sequenceDiagram 绘制 8 阶段循环全景图（00:00–24:00，标注阶段、主导网络、核心模块、输入产出）
  - [ ] SubTask 1.3：绘制循环驱动机制图（RealTimeClock → DailyScheduler B=MAT → Phase 切换 → 总线 event.clock.phase.changed）
- [ ] Task 2：模块分层架构图与职责清单
  - [ ] SubTask 2.1：绘制 13 层分层架构 Mermaid flowchart（节律调度/三网络/记忆/代谢情绪/输入边界/沙盒推演/创作链路/小说真源/OC 社交/提示人格/容错持久化/观测/总线配置）
  - [ ] SubTask 2.2：为每层产出"模块 | 一句话职责 | 关键事件 topic | 参考项目"四栏表格
  - [ ] SubTask 2.3：绘制单 Agent 轨与多 Agent 轨（OC 社交）双轨数据流图
- [ ] Task 3：循环各阶段的模块协作时序
  - [ ] SubTask 3.1：deep_night + morning 阶段时序图（DMN 做梦/苏醒，IdentityCore 注入）
  - [ ] SubTask 3.2：incubation + social 阶段时序图（PersonalInput/SocialInput → Fragment → MemorySystem → SelfTimeline）
  - [ ] SubTask 3.3：simulation 阶段时序图（CEN → OCTownEngine → COCMappingEngine → MentalSandbox 推演）
  - [ ] SubTask 3.4：creation 阶段时序图（Planner → ChapterManager → CreationExecutive → NovelOutput → ContinuityAuditor → QualityEngine）
  - [ ] SubTask 3.5：reflection + 夜间 incubation 时序图（ReflectionEngine + MidTermMemory + 日记回写）
- [ ] Task 4：模块-参考项目映射
  - [ ] SubTask 4.1：绘制模块到 21 个参考项目的映射 Mermaid flowchart（按"单 Agent 拟人化 / 多 Agent 社交 / 记忆 / 角色卡 / 情绪身体 / 工具 / 小说写作 7 项目"分组）
  - [ ] SubTask 4.2：产出借鉴矩阵表格（模块 | 主参考 | 辅助参考 | 关键文件/行号 | LinYi 落地位置），覆盖 borrow_matrix.md 的 14 个借鉴点 + 拟人化方案 v2 的 7 个补强方向
  - [ ] SubTask 4.3：绘制"参考项目能力 → LinYi 模块"的 ER/类图，体现能力如何落地
- [ ] Task 5：循环缺陷审计与因果图
  - [ ] SubTask 5.1：汇总缺陷清单（fragment 重复/日程模板化/记忆无界增长/BusRouter 线程不安全/LLM reasoning strip 脆弱/持久化非真增量/遗忘缺失/三网络切换粗糙/读者边界缺失等），每条定位到代码文件
  - [ ] SubTask 5.2：绘制缺陷因果 Mermaid flowchart（根因 → 现象 → 影响）
  - [ ] SubTask 5.3：标注哪些缺陷已被 v2 方案/重构方案覆盖、哪些仍裸露
- [ ] Task 6：进一步/重构建议与路线图
  - [ ] SubTask 6.1：按 P0~P3 优先级产出建议表（优先级 | 建议 | 复杂度 | 收益 | 对应 spec/工作项 | 参考来源）
  - [ ] SubTask 6.2：绘制重构路线图 Mermaid gantt（阶段一：记忆升级+去重 → 阶段二：节律完整落地 → 阶段三：OC 社交完整 → 阶段四：审计质量闭环 → 阶段五：分层记忆+图谱）
  - [ ] SubTask 6.3：绘制"目标循环"Mermaid flowchart，展示补强后林逸的一天应呈现的形态
- [ ] Task 7：交叉验证与定稿
  - [ ] SubTask 7.1：核对所有 Mermaid 图语法可渲染
  - [ ] SubTask 7.2：核对所有文件引用使用 file:/// 链接且路径正确
  - [ ] SubTask 7.3：核对结论与 [docs/AUDIT-REPORT.md](file:///workspace/docs/AUDIT-REPORT.md)、[docs/拟人化日程节律与角色社交补强方案_v2.md](file:///workspace/docs/拟人化日程节律与角色社交补强方案_v2.md)、[docs/refs/borrow_matrix.md](file:///workspace/docs/refs/borrow_matrix.md) 一致，不矛盾

# Task Dependencies

- Task 2 依赖 Task 1（分层图需要先有循环全景）
- Task 3 依赖 Task 2（阶段时序需要模块分层已定义）
- Task 4 独立，可与 Task 3 并行
- Task 5 依赖 Task 2、Task 3（缺陷需定位到模块与阶段）
- Task 6 依赖 Task 5（建议针对缺陷）
- Task 7 依赖 Task 1–6
