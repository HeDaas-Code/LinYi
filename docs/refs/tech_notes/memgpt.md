# MemGPT（现 Letta）交叉分析笔记

> 项目地址：https://github.com/letta-ai/letta（原 cpacker/MemGPT）  
> 论文：https://arxiv.org/abs/2310.08560  
> 核心定位：让固定上下文窗口的 LLM 拥有“无限上下文”的错觉，像操作系统管理虚拟内存一样管理记忆。

## 1. 项目概述

MemGPT 把 LLM 的上下文窗口看作“物理内存 RAM”，把外部向量/数据库存储看作“磁盘”。通过显式的 `page_in` / `page_out` 函数调用，LLM 自己决定什么时候把重要信息写回长期记忆、什么时候从长期记忆中检索内容进入当前提示。它强调：**记忆管理应该是 agent 自主行为的一部分，而不是外部黑盒 RAG**。

对 LinYi 的价值：林逸作为一个“生活在电脑中”的虚拟生命，需要长期记住与读者的互动、自己的创作历程、OC 的关系演变。MemGPT 的分层记忆思想可以直接补强 `MemorySystem` 和 `SelfTimeline`。

## 2. 核心架构

### 2.1 记忆分层

```
┌─────────────────────────────────────┐
│ 主上下文 (Main Context)              │
│ ├─ 系统指令（只读）                  │
│ ├─ 工作上下文（可读写）              │
│ └─ FIFO 消息队列                     │
└─────────────────────────────────────┘
           ↑ ↓ paging
┌─────────────────────────────────────┐
│ 外部上下文 (External Context)        │
│ ├─ Recall Storage（对话/事件历史）   │
│ └─ Archival Storage（向量归档）      │
└─────────────────────────────────────┘
```

- **系统指令**：agent 角色、工具定义、控制流规则。
- **工作上下文**：agent 可以随时读写的“便签本”，如用户偏好、当前目标。
- **FIFO 队列**：近期消息，溢出时生成摘要并淘汰旧消息。
- **Recall Storage**：结构化事件/消息数据库，支持关键词和语义检索。
- **Archival Storage**：大规模向量存储，用于长文档、深层背景知识。

### 2.2 控制流与中断

- **heartbeat 事件**：agent 不仅在用户输入时运行，还会定期“心跳”自主思考。
- **函数调用**：LLM 输出函数调用（`core_memory_append`、`conversation_search`、`archival_search` 等）来管理记忆。
- **内存压力提示**：当上下文接近上限，系统提示 LLM“你感觉记忆满了，请整理”。

### 2.3 自编辑记忆

MemGPT 的关键哲学：**agent 应该能编辑自己的长期记忆**。例如：
- 用户说“其实我叫李四，不是张三” → agent 调用 `core_memory_replace` 修改工作上下文。
- 某段对话非常重要 → agent 主动写入 recall storage。

## 3. 与 LinYi 的映射

| MemGPT 概念 | LinYi 现有/待实现映射 | 说明 |
|---|---|---|
| 系统指令 | `IdentityCore` + `StoryBible` | 角色与世界观 |
| 工作上下文 | `MetabolismState` + `VitalState` | 当前情绪、目标、资源 |
| FIFO 队列 | `BusRouter` 近期消息 | 需要摘要淘汰机制 |
| Recall Storage | `MemorySystem` 的 traces/fragments | 需要更强调事件顺序 |
| Archival Storage | 向量 DB / `MemoryStore` | 已有 SQLite/向量后端 |
| 函数调用 | 内部控制 topic | 如 `control.memory.page_in` |
| heartbeat | `RealTimeClock` tick | 已在运行 |

## 4. 建议引入 LinYi 的机制

1. **分层记忆模型 `MemoryHierarchy`**：
   - `working_memory`：当前 tick 所需的小集合。
   - `recall_memory`：近期事件流（按时间索引）。
   - `archival_memory`：高维向量归档（跨天长周期）。

2. **记忆压力与主动整理**：
   - 当 working memory 超过容量阈值，触发 `MemoryConsolidator` 把低重要性/重复内容归档或淘汰。
   - 高重要性内容自动提升层级。

3. **LLM 可控记忆函数**：
   - `control.memory.page_in(query)`：从归档检索并注入工作上下文。
   - `control.memory.page_out(summary)`：把工作记忆中的内容写入归档。
   - `control.memory.core_update(key, value)`：修改核心身份/偏好。

4. **心跳式反思**：
   - 在 `deep_night` / `reflection` phase，调用 `ReflectionEngine` 读取 recall memory，生成更高层洞察并写回 archival。

## 5. 落地优先级

- **P0**：把 `MemorySystem` 显式拆分为 working / recall / archival 三层接口。
- **P1**：实现 `MemoryConsolidator`（容量检查、摘要、归档）。
- **P2**：暴露 `control.memory.page_in/out` 控制 topic，让创作/社交模块能主动检索。
- **P3**：在 reflection phase 接入 LLM 生成反思记忆。

## 6. 风险

- **成本**：自动归档和反思会增加 LLM 调用，需要与 `TokenBudget` 联动。
- **一致性**：自编辑核心记忆可能污染 `IdentityCore`，需要审计和回滚机制。
- **时序**：必须保证 recall memory 的时间顺序，否则反思会失真。
