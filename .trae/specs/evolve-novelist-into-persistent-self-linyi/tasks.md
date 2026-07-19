# Tasks

- [x] Task 1: 实现真实时间时钟 RealTimeClock
  - [x] SubTask 1.1: 在 `clock.py` 中新增 `RealTimeClock` 类，支持 wall-clock time 驱动 tick
  - [x] SubTask 1.2: 支持可配置 tick 间隔（默认 1 真实分钟 = 1 tick；测试模式 1 真实秒 = 1 tick）
  - [x] SubTask 1.3: 保留原有 `Clock` 作为快速测试/回放用途
  - [x] SubTask 1.4: 实现 `phase_for_datetime(hour)` 将真实时间映射到 `deep_night / morning / creation / social / simulation / reflection / incubation`

- [x] Task 2: 重构主入口为常驻 Agent 循环
  - [x] SubTask 2.1: 将 `main.py` 的 `run_day()` 重命名为 `run_agent()` 或新增常驻函数
  - [x] SubTask 2.2: 启动时加载持久化状态并定位到当前真实时间阶段
  - [x] SubTask 2.3: 实现事件循环：sleep 到下一 tick → 推进 clock → 所有模块 tick → flush bus → 持久化
  - [x] SubTask 2.4: 支持 `--fast-forward`（测试加速）和 `--days N`（限制运行天数后退出）

- [x] Task 3: 建立林逸人格内核
  - [x] SubTask 3.1: 在 `identity.py` 中创建 `LinYiProfile` 数据结构与默认值（姓名、笔名、价值观、性格、自我叙事、生活节律偏好）
  - [x] SubTask 3.2: 让 `IdentityCore` 持有 `LinYiProfile` 并在初始化时广播 `data.identity.constraint`
  - [x] SubTask 3.3: 支持人格演化接口：反思/小说反馈可触发 `integrityScore` 和 trait 微调
  - [x] SubTask 3.4: 人格状态纳入持久化，跨重启保持一致

- [x] Task 4: 将林逸人格注入所有 prompt 与创作流程
  - [x] SubTask 4.1: 更新 `prompts.py` 中所有 prompt 构造器，使其接收并使用 `LinYiProfile`
  - [x] SubTask 4.2: 更新 `build_context()` 使用 `LinYiProfile` 替换通用身份配置
  - [x] SubTask 4.3: 让 `dmn.py`、`cen.py`、`sandbox.py`、`creation_executive.py` 从 context 读取林逸人格并传入 prompt
  - [x] SubTask 4.4: 在日志与小说输出中体现林逸主体（例如标题署名、状态摘要）

- [x] Task 5: 实现每日调度器 DailyScheduler
  - [x] SubTask 5.1: 创建 `scheduler.py` 模块，定义 `DailyScheduler` 类
  - [x] SubTask 5.2: 基于 B=MAT 模型对候选阶段评分（能量、灵感压力、社交成本、待处理痕迹、习惯强度）
  - [x] SubTask 5.3: 生成当天阶段计划，包含 min/max 时长与默认网络
  - [x] SubTask 5.4: 在 `Clock` 中接入调度器：每到一个阶段边界时生成/调整下一阶段

- [x] Task 6: 调整真实时间节律（白天生活/晚上创作/夜间睡眠）
  - [x] SubTask 6.1: 更新 `Clock` 默认节律模板为与现实同步：06:00 起床、08:00-18:00 生活/输入、19:00-23:00 创作、00:00-06:00 睡眠
  - [x] SubTask 6.2: `PersonalInput` 和 `SocialInput` 在白天产生生活/社会碎片，夜间低活跃
  - [x] SubTask 6.3: CEN/CreationExecutive 在晚间创作阶段触发，而非上午
  - [x] SubTask 6.4: DMN 在深夜主导梦境，并反馈白天未处理碎片

- [x] Task 7: 升级持久化为自动增量保存
  - [x] SubTask 7.1: 扩展 `persistence.py` 支持快照 + 增量日志结构
  - [x] SubTask 7.2: 在每个阶段边界自动保存增量
  - [x] SubTask 7.3: 在小说段落发布、人格更新、叙事线提交等关键事件后实时保存
  - [x] SubTask 7.4: 启动时加载最新快照并重放后续增量，恢复真实时间阶段

- [ ] Task 8: 验证生活-创作-睡眠闭环
  - [ ] SubTask 8.1: 在测试加速模式下运行 2-3 天
  - [ ] SubTask 8.2: 检查白天的碎片是否出现在晚间创作 prompt 的 relevant traces 中
  - [ ] SubTask 8.3: 确认每晚创作时段产出小说段落，且段落之间具有连续性
  - [ ] SubTask 8.4: 验证重启后能恢复并继续运行

# Task Dependencies

- [Task 2] depends on [Task 1]
- [Task 4] depends on [Task 3]
- [Task 5] depends on [Task 1]
- [Task 6] depends on [Task 1] and [Task 5]
- [Task 7] depends on [Task 2]
- [Task 8] depends on [Task 2], [Task 4], [Task 6], [Task 7]
