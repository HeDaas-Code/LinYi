# ai-town（a16z-infra/ai-town）交叉分析笔记

> 项目地址：https://github.com/a16z-infra/ai-town  
> 技术栈：TypeScript / React / Convex / Pinecone / OpenAI  
> 核心定位：可定制的多智能体虚拟城镇，AI 角色在其中生活、聊天并形成社交关系。

## 1. 项目概述

ai-town 是 a16z 与 Convex 合作开源的“生成式智能体（Generative Agent）”参考实现，受斯坦福大学《Generative Agents》论文启发。它的目标是让多个 AI 角色在一个共享世界中自主运行，产生涌现的社交动态：友谊、竞争、八卦、群体活动等。

对 LinYi 的价值：我们已经有基于 COC 的 OC 角色卡（`OCCharacterSheet`）和脑中世界沙盒（`MentalSandbox`），但 OC 之间缺少**自主、持续、有记忆的社交生活**。ai-town 提供了一套可直接映射的“OC Town Engine”范式。

## 2. 核心架构拆解

### 2.1 Agent（智能体）

- 每个角色对应一个 `Agent` 实例，关联一个 `playerId`（游戏实体）。
- `Agent.tick(now)` 是行为入口，周期性被游戏引擎调用。
- 关键状态：
  - `toRemember`：待归档到长期记忆的对话。
  - `lastConversation`：上次对话时间戳。
  - `lastInviteAttempt`：上次发起对话邀请的时间戳。
  - `inProgressOperation`：当前正在执行的长期操作。

**可借鉴点**：OC 角色应有一个轻量级的“心跳”循环，而不是只在需要剧情时才被调用。每次 tick 根据内部状态决定下一步。

### 2.2 Agent Behavior & Decision Making

行为决策流程：

1. **产生行动冲动**：如果 agent 不忙，周期性触发 `agentDoSomething`。
2. **收集自我感知与世界上下文**：
   - 我是谁？（性格、背景、当前目标）
   - 我在哪？我在做什么？
   - 附近有谁？他们在做什么？
3. **咨询 LLM（Digital Conscience）**：把上述上下文组织成 prompt，让 LLM 决定高阶计划：闲逛、找某人聊天、独自思考等。
4. **执行决策**：将 LLM 输出翻译成具体动作。

**可借鉴点**：不要把 LLM 调用塞满每个 tick。可以用低成本规则做 80% 的日常决策，只在“关键社交节点”调用 LLM。这与 LinYi 的 `FragmentQualityGate` / `ImportanceScorer` 思路一致。

### 2.3 Memory System

记忆类型：

- **Relationship Memory**：与其他角色的关系信息。
- **Conversation Memory**：过去对话记录。
- **Reflection Memory**：由其他记忆推导出的高层次洞察。

每条记忆包含：

- 文本描述
- importance score（重要性）
- last access timestamp（最近访问时间）
- vector embedding（用于语义检索）
- 类型相关元数据

检索方式：向量语义搜索 + 重要性 + 时间衰减。

**可借鉴点**：LinYi 的 `MemorySystem` 已有 trace 和 fragment，但缺少**针对 OC-OC 关系的独立记忆切片**。应增加 `OCSocialMemory`（关系记忆 + 对话记忆 + 反思记忆）。

### 2.4 Conversation System

- 对话是 agent 之间双向的、有时间线的消息流。
- 对话结束后，agent 会将其“归档”到长期记忆。
- 对话上下文会参考彼此的关系记忆和共同经历。

**可借鉴点**：OC 之间的对话应产生 `data.oc.town.event`，进入 `SelfTimeline`，并被 `MemorySystem` 收录为社交痕迹。对话结束后自动触发记忆固化。

### 2.5 Relationship Engine

ai-town 没有显式的独立关系引擎，关系是通过记忆的内容和向量相似度涌现出来的。但我们可以通过显式设计补强：

- 关系维度：好感度、信任度、权力差、共同记忆数。
- 关系事件：帮助、冲突、背叛、合作。
- 关系影响对话情绪与目标选择。

## 3. 与 LinYi 的映射设计

| ai-town 概念 | LinYi 映射 | 说明 |
|---|---|---|
| Agent | `OCTownAgent` | 包装 `OCCharacterSheet` + 运行时状态 |
| Agent.tick | `OCTownEngine.tick` | 由全局 clock 驱动 |
| Memory (relationship/conversation/reflection) | `OCSocialMemory` | 按角色、按关系索引 |
| Conversation | `OCConversation` / `OCDialogueTurn` | 产生 bus 事件 |
| Decision LLM | `LLMService` + prompt | 关键节点调用 |
| World / Map | `WorldStateContract` + 社交空间 | 已有基础 |
| Player | 林逸 / 读者 | 可作为特殊参与者介入 |

## 4. 建议引入 LinYi 的模块

1. **`OCTownEngine`**：OC Town 主控，维护多个 `OCTownAgent`，驱动 tick，调度社交事件。
2. **`OCSocialMemory`**：管理 OC 之间的关系记忆、对话记忆和反思记忆。
3. **`OCAgentState`**：运行时状态（位置、当前活动、情绪、目标、能量）。
4. **`OCTownEventPublisher`**：将 town 事件发布到 bus（`data.oc.town.event`），与 `SelfTimeline` 和 `MemorySystem` 打通。
5. **`RelationshipDynamics`**：关系变化计算（好感度、信任度、共同记忆）。

## 5. 落地优先级

- **P0**：`OCTownEngine` 骨架 + `OCTownAgent` + 事件发布，让 OC 有“活着”的心跳。
- **P1**：`OCSocialMemory` + 简单对话生成，OC 之间能互动并留下记忆。
- **P2**：关系动力学 + 反思记忆，让社交行为有长期后果。
- **P3**：接入 LLM 做关键决策，提升涌现叙事质量。

## 6. 风险与边界

- **成本**：ai-town 高度依赖 LLM，LinYi 需要把 LLM 调用限制在“重要社交事件”。
- **一致性**：OC 自主行为可能偏离 Story Bible，需要 `WorldStateContract` 做边界检查。
- **人机边界**：林逸（主 AI）与 OC 的社交应可区分，避免读者混淆叙事主体。
