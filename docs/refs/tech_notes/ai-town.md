# AI Town 技术笔记

## 项目概述

AI Town 是 a16z 与 Convex 合作开源的「生成式智能体」参考实现，灵感来自斯坦福大学《Generative Agents》论文。它是一个可部署的多智能体虚拟城镇，AI 角色在其中自主移动、发起对话、建立关系并长期生活。项目基于 TypeScript / React / PixiJS 前端和 Convex 后端，使用 tick 驱动引擎把世界状态、Agent 行为、对话与记忆解耦。其核心目标是为构建可扩展、可定制的多 Agent 社交模拟提供基础框架。对 LinYi 而言，AI Town 是最接近「让 OC 像活人一样持续社交」的参考：OC 不只在剧情触发时出现，而是拥有身份、目标、记忆和关系，并在 tick 循环中自主决定下一步行动。

## 核心架构 / 关键模块

- **游戏引擎（`convex/engine`）**：tick-based 单线程模拟，每秒执行一个 step，处理输入并推进世界状态，使用 HistoricalObject 记录位置等连续量的历史值以支持平滑回放。
- **Agent（`convex/aiTown/agent.ts`）**：每个 Agent 关联一个 Player，拥有 `tick` 入口、待归档对话 `toRemember`、上次对话时间等状态，通过启动异步 Operation 与 LLM 交互。
- **Agent 描述（`agentDescription.ts`）**：只存 `identity` 与 `plan` 两个字段，注入对话 prompt 以稳定角色人格与目标。
- **对话系统（`convex/agent/conversation.ts`）**：支持邀请、走近、参与三种状态，对话结束后调用 LLM 生成第一人称摘要并写入记忆。
- **记忆系统（`convex/agent/memory.ts`）**：记忆类型包括 relationship、conversation、reflection；每条记忆含描述、重要性、最近访问时间、向量嵌入；检索综合语义相似度、重要性、近因三个维度。
- **反思机制**：当最近 100 条记忆的重要性总分超过阈值时，LLM 生成高阶洞察，并以 reflection 类型写回记忆图。

## 与 LinYi 最相关的概念

- **OC 的自主社交生命**：OC 不应只在剧情需要时才出现，而应持续运行、自主决定社交行为。
- **身份 + 计划双字段人格**：用简洁的 `identity` 与 `plan` 控制角色语气与目标，降低 prompt 复杂度。
- **重要性驱动的记忆筛选**：用 LLM 给事件打分，再按重要性、近因、语义相关性排序，避免记忆爆炸。
- **对话即记忆来源**：每次 OC 间或读者-OC 对话结束后自动总结并归档，形成社交痕迹。
- **周期性反思**：通过累积重要性触发高层次洞察，让 OC 对世界和关系产生更稳定的认知。

## 对 LinYi 的具体建议

- 为每个 OC 实现轻量 `tick` 循环，结合规则与关键节点 LLM 调用，让 OC 在没有剧情时也能「活着」。
- 在 OC 的 prompt 中固定注入 `identity` 与 `plan`，并把相关记忆按重要性排序后作为上下文。
- 建立 `OCSocialMemory`，按 OC 维度存储关系、对话、反思三类记忆，并记录重要性与 lastAccess。
- 对话结束后自动总结为第一人称摘要，更新参与者的社交记忆与关系权重。
- 设计反思触发器：当某 OC 近期高重要性事件积分达到阈值时，运行反思生成高层次洞察。
- 将 LLM 密集型操作（如生成消息、反思）做成异步 Operation，避免阻塞主引擎 tick。
- 复用 Embedding 缓存机制，避免对相同查询重复计算向量，降低运行成本。
- 将 AI Town 的社交事件映射到 LinYi 的事件总线，让 OC 的自主行为能被 `SelfTimeline`、`MemorySystem` 与创作引擎共同消费。
