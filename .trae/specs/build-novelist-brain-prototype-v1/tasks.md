# Tasks

- [x] Task 1: 创建项目骨架与数据类型定义
  - [x] SubTask 1.1: 创建 `src/` 目录与 `__init__.py`
  - [x] SubTask 1.2: 定义 `Fragment`、`Trace`、`WorldModel`、`CharacterProjection`、`NarrativeLine`、`BusMessage`、`TickDelta` 等核心数据类
  - [x] SubTask 1.3: 定义 `Module` 抽象基类

- [x] Task 2: 实现总线与全局时钟
  - [x] SubTask 2.1: 实现 `BusRouter` 与三条总线（EventBus / DataBus / ControlBus），支持 TTL 衰减与优先级
  - [x] SubTask 2.2: 实现 `Clock`，支持 tick 推进、阶段映射与默认节律模板

- [x] Task 3: 实现人格内核与 LLM 服务抽象
  - [x] SubTask 3.1: 实现 `IdentityCore`，包含身份、价值观、性格、自我叙事
  - [x] SubTask 3.2: 定义 `LLMService` 接口（`complete`、`embed`）
  - [x] SubTask 3.3: 实现 `MockLLMService`，提供模板化输出与随机 embedding

- [x] Task 4: 实现代谢层与动力系统
  - [x] SubTask 4.1: 实现 `Metabolism`，跟踪能量/算力/时间/社会资本并广播预算状态
  - [x] SubTask 4.2: 实现 `Dynamics`，根据事件结果计算 RPE 并更新习惯强度

- [x] Task 5: 实现输入模块与突显网络
  - [x] SubTask 5.1: 实现 `PersonalInput`，按阶段生成人格性 Fragment
  - [x] SubTask 5.2: 实现 `SocialInput`，按阶段生成社会性 Fragment
  - [x] SubTask 5.3: 实现 `SalienceNetwork`，使用 B=MAT 评分并切换 DMN/CEN

- [x] Task 6: 实现记忆系统
  - [x] SubTask 6.1: 实现 `MemorySystem` 的 Fragment 存储与工作记忆
  - [x] SubTask 6.2: 实现简化 consolidation 算法（标签聚类 + 重要性/近因/情绪权重评分）
  - [x] SubTask 6.3: 实现痕迹查询接口（按标签/情绪/叙事角色）

- [x] Task 7: 实现 DMN 与 CEN
  - [x] SubTask 7.1: 实现 `DefaultModeNetwork`，在 DMN 阶段生成 dream/reflection/insight Fragment
  - [x] SubTask 7.2: 实现 `CentralExecutiveNetwork`，维护目标栈并向 Sandbox 发送 build/simulate 命令

- [x] Task 8: 实现脑中世界
  - [x] SubTask 8.1: 实现 `MentalSandbox` 的世界模型、角色投射、场景与叙事线结构
  - [x] SubTask 8.2: 实现简化的 COC 判定逻辑（骰子 + 难度）
  - [x] SubTask 8.3: 实现 N 轮推演契约与叙事线就绪判定

- [x] Task 9: 实现创作执行与小说产出
  - [x] SubTask 9.1: 实现 `CreationExecutive`，将叙事线转换为小说段落
  - [x] SubTask 9.2: 实现 `NovelOutput`，管理段落并发布反馈事件

- [x] Task 10: 组装主入口与运行验证
  - [x] SubTask 10.1: 实现 `main.py`，初始化所有模块并运行完整一天周期
  - [x] SubTask 10.2: 验证总线消息流转、网络切换、小说段落输出
  - [x] SubTask 10.3: 运行 `python main.py` 并通过肉眼检查输出

# Task Dependencies

- Task 2 依赖 Task 1
- Task 3 依赖 Task 1
- Task 4 依赖 Task 1、Task 2
- Task 5 依赖 Task 1、Task 2、Task 4
- Task 6 依赖 Task 1、Task 2
- Task 7 依赖 Task 1、Task 2、Task 3、Task 6
- Task 8 依赖 Task 1、Task 2、Task 3、Task 6
- Task 9 依赖 Task 1、Task 2、Task 3、Task 6、Task 8
- Task 10 依赖 Task 1-9
