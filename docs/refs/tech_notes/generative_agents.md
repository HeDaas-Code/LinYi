# 斯坦福 Generative Agents 交叉分析笔记

> 论文：https://arxiv.org/abs/2304.03442  
> 代码：https://github.com/joonspk-research/generative_agents  
> 核心定位：用 LLM 驱动 25 个智能体在沙盒小镇中生活，具备记忆、反思、计划和涌现社交行为。

## 1. 项目概述

Generative Agents（又称 AI Town / Smallville）是斯坦福 2023 年的开创性工作。它把 LLM 作为智能体的认知引擎，通过自然语言记忆流（Memory Stream）记录所有经历，并在此基础上进行检索、反思和计划。智能体之间会形成关系、传播信息、协调活动（如自发组织情人节派对）。

对 LinYi 的价值：它提供了“虚拟生命”最完整的参考架构——**一个 agent 如何像人一样拥有连续自我、目标和社交生活**。

## 2. 核心架构

### 2.1 Memory Stream（记忆流）

- 每个 agent 有一个自然语言记忆列表。
- 每条记忆包含：
  - `description`：自然语言描述。
  - `created`：创建时间戳。
  - `last_accessed`：最近访问时间。
  - `importance`：重要性分数（0-10，由 LLM 打分或启发式）。
  - `embedding`：向量嵌入。

### 2.2 Retrieval（检索）

检索得分由三部分加权：
- **Recency（最近性）**：指数衰减，越久远的记忆得分越低。
- **Importance（重要性）**：重要事件得分高。
- **Relevance（相关性）**：与当前查询的向量相似度。

最终得分 = α·recency + β·importance + γ·relevance。

**可借鉴点**：LinYi 的 `ImportanceScorer` 已有雏形，但缺少显式的 recency decay 和 relevance 融合。可以把这三者统一进 `MemoryRetrieval`。

### 2.3 Reflection（反思）

- 当 agent 积累足够多的记忆后，LLM 会生成更高层次的反思：
  - 基于多条具体记忆抽象出洞察（如“我喜欢独处”）。
  - 反思本身也作为记忆进入记忆流，可被后续检索。
- 反思有层级：具体事件 → 抽象洞察 → 更高层洞察。

**可借鉴点**：在 LinYi 的 `reflection` phase 运行 `ReflectionEngine`，读取 recall memory，生成对自我、OC、读者的洞察，并写回记忆系统。

### 2.4 Planning（计划）

- 智能体有长期计划（今天做什么）、短期计划（下一小时做什么）、以及即时反应。
- 计划会根据环境和其他 agent 行为动态调整。
- 计划以树形结构展开，根节点是“今天”，叶节点是 5-15 分钟粒度的动作。

**可借鉴点**：LinYi 的 `DailyScheduler` + `SegmentDetailEnhancer` 已经有宏观节律，但缺少**agent 自主生成的中长期计划**。可以引入 `PlanTree`：林逸每天晚上生成第二天的计划树，白天按情境展开和调整。

### 2.5 Environment & Interaction

- 环境是 2D 沙盒，agent 有坐标、可观察周围对象和其他 agent。
- agent 通过自然语言动作与环境交互（如 `move to cafe`、`talk to Maria`）。
- 交互产生新的记忆条目。

**可借鉴点**：`OCTownEngine` 可以看作 LinYi 的“脑中世界”社交层。未来可以让 OC 在共享空间（公寓、咖啡馆、旧书店）中执行更细粒度的动作，而不仅仅是移动和交谈。

## 3. 与 LinYi 的映射

| Generative Agents 概念 | LinYi 映射 | 说明 |
|---|---|---|
| Memory Stream | `MemorySystem` + `SelfTimeline` | 自然语言事件流 |
| Retrieval | `MemoryRetrieval`（新增） | recency + importance + relevance |
| Reflection | `ReflectionEngine`（新增） | 在 reflection phase 生成洞察 |
| Planning Tree | `PlanTree`（新增） | 分层计划 |
| Environment | `WorldStateContract` / `OCTownEngine` | 共享空间与坐标 |
| Agent Interaction | `OCTownEngine` conversation | 已初步实现 |

## 4. 建议引入 LinYi 的模块

1. **`MemoryStreamEntry`**：统一的自然语言记忆条目（观察、反思、计划、对话）。
2. **`MemoryRetrieval`**：三因素打分检索。
3. **`ReflectionEngine`**：定期把记忆抽象为反思。
4. **`PlanTree`**：生成并维护分层的日计划/小时计划/动作计划。
5. **`ObservationCollector`**：把 bus 上的事件（读者输入、OC 行为、生理状态）转成记忆流条目。

## 5. 落地优先级

- **P0**：统一 `MemoryStreamEntry` 并扩展 `ImportanceScorer` 支持 recency + relevance。
- **P1**：实现 `ReflectionEngine`，在 reflection phase 生成并写入反思。
- **P2**：实现 `PlanTree`，替代或增强现有固定 phase 模板。
- **P3**：让 `OCTownEngine` 支持更细粒度的环境动作与观察。

## 6. 风险

- **LLM 成本高**：检索打分、反思、计划都依赖 LLM，需要与 `TokenBudget` 联动。
- **计划一致性**：自主计划可能偏离 Story Bible 和读者预期，需要 `ContinuityAuditor` 做边界检查。
- **记忆膨胀**：长期运行会产生大量记忆，必须依赖 `MemoryConsolidator` 做分层归档。
