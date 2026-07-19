# Checklist

## 真实时间时钟与持续运行

- [ ] `RealTimeClock` 类已实现并支持 wall-clock time 驱动 tick
- [ ] tick 间隔可配置（默认真实 1 分钟 = 1 tick；测试模式可缩至 1 秒）
- [ ] 系统启动后不再在 24 小时后退出，而是常驻运行
- [ ] 快速测试模式 `--fast-forward` / `--days N` 可用并运行多天

## 每日调度器

- [ ] `DailyScheduler` 模块已创建
- [ ] 调度器基于 B=MAT 对阶段评分（能量、灵感压力、社交成本、待处理痕迹、习惯强度）
- [ ] 生成的一天计划包含各阶段的 min/max 时长与默认网络
- [ ] 高灵感日能延长创作阶段，社交透支日能增加恢复/睡眠阶段

## 林逸人格内核

- [ ] `LinYiProfile` 数据结构已创建，包含姓名、笔名、价值观、性格、自我叙事、生活节律偏好
- [ ] `IdentityCore` 持有 `LinYiProfile` 并在初始化时广播 `data.identity.constraint`
- [ ] 人格支持演化：反思/小说反馈可触发 `integrityScore` 与 trait 微调
- [ ] 人格状态被持久化，重启后保持一致

## 人格注入与创作流程

- [ ] 所有 prompt 构造器接收并使用 `LinYiProfile`
- [ ] `build_context()` 使用 `LinYiProfile` 替换通用身份配置
- [ ] DMN、CEN、Sandbox、CreationExecutive 从 context 读取林逸人格并传入 prompt
- [ ] 日志和小说输出中能识别出林逸作为主体（例如署名、状态摘要）

## 真实时间节律

- [ ] 默认节律与现实时间对齐：06:00 起床、08:00-18:00 生活/输入、19:00-23:00 创作、00:00-06:00 睡眠
- [ ] PersonalInput/SocialInput 在白天产生碎片，夜间低活跃
- [ ] CEN/CreationExecutive 在晚间创作阶段触发
- [ ] DMN 在深夜主导梦境并反馈白天未处理碎片

## 自动增量持久化

- [ ] `PersistenceManager` 支持快照 + 增量日志
- [ ] 阶段边界自动保存增量
- [ ] 小说段落发布、人格更新、叙事线提交后实时保存
- [ ] 启动时能加载最新快照并重放增量，恢复到正确真实时间阶段

## 闭环验证

- [ ] 测试加速模式下成功运行 2-3 天
- [ ] 白天产生的碎片出现在晚间创作的 relevant traces 中
- [ ] 每晚创作时段产出小说段落，段落间保持连续性
- [ ] 重启后能从上次状态恢复并继续运行
