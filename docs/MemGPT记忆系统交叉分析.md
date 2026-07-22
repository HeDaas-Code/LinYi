# MemGPT 记忆系统与 LinYi 记忆架构交叉分析

## 1. 问题空间

LinYi 的目标是成为一个“生活在电脑中、有自己人格和社交的虚拟生命”。要支撑这一点，记忆系统必须同时满足三类需求：

1. **人格连续性**：林逸知道自己是谁、喜欢什么、与谁关系如何。
2. **长期社交记忆**：记住读者说过的话、OC 之间的恩怨、共同经历的事件。
3. **上下文效率**：LLM 上下文窗口有限，不能把一切都塞进 prompt，必须像操作系统管理内存一样分层换页。

MemGPT（以及由其演化而来的 Letta）正是围绕“LLM 作为操作系统”这一隐喻设计的记忆框架。它把上下文窗口看作 RAM，把外部存储看作磁盘，让模型通过函数调用来主动管理记忆。本文对比 MemGPT 的三层记忆模型与 LinYi 现有的记忆栈，找出可直接借鉴的机制与待补强的缺口。

## 2. MemGPT 架构解析

MemGPT 的核心贡献是 **virtual context management**：在固定上下文窗口内模拟“无限上下文”。其记忆体系分为三层：

### 2.1 Main Context（主上下文 / RAM）

这是每次调用 LLM 时真正塞进窗口的内容，进一步细分为：

- **System instructions**：告诉模型存在哪些记忆层级、可用哪些记忆管理函数。
- **Working context**：当前任务需要的临时信息。
- **Core memory**：
  - `persona`：代理的自我描述（人格、身份、行为准则）。
  - `human`：正在交互用户的关键信息（事实、偏好、关系阶段）。
  - `functions`：可用的工具/函数签名。
- **Recent conversation**：最近的对话轮次。

Core memory 的大小是固定的，由系统严格控制；模型被允许通过 `core_memory_append` / `core_memory_replace` 来编辑它。

### 2.2 Recall Memory（回想记忆 / 近期磁盘）

完整对话历史的线性记录。模型可以通过 `conversation_search` / `conversation_search_date` 按关键词或日期检索。它对应操作系统中的“交换分区”或“页文件”：比 RAM 慢，但完整。

### 2.3 Archival Memory（归档记忆 / 长期磁盘）

由向量数据库存储的长期记忆。每条归档记录是一段自然语言事实或摘要，附带 embedding。模型通过 `archival_memory_insert` 写入，通过 `archival_memory_search` 按语义检索。它用于存放：

- 提取出的用户事实。
- 历史对话摘要。
- 文档片段、世界设定等。

### 2.4 函数调用驱动的换页

MemGPT 的关键设计是：模型本身决定何时把信息从 core memory 移到 archival memory，何时从 recall/archival 中检索信息并塞回 core memory。系统提示中会明确给出类似：

```text
You have access to the following functions:
- core_memory_append(section, content)
- core_memory_replace(section, old_content, new_content)
- archival_memory_insert(content)
- archival_memory_search(query, page, count)
- conversation_search(query, page, count)
- send_message(message)
```

这种“显式换页”让模型能：

- 在上下文快满时主动把低优先级信息归档。
- 在回答前主动检索相关历史。
- 把重要事实固化到 core memory。

### 2.5 评估指标

MemGPT 论文关注：

- **上下文连续性**：跨多 session 是否记得关键事实。
- **检索准确率**：`archival_memory_search` 能否在 top-k 中找到需要的内容。
- **换页开销**：每次对话平均产生多少次 page-fault 式的工具调用。

## 3. LinYi 现状映射

LinYi 已经形成了与 MemGPT 大致对应的记忆分层：

| MemGPT 层级 | LinYi 对应模块 | 说明 |
|---|---|---|
| System instructions | [prompt_surface.py](file:///home/hedaas/文档/project/LinYi/src/novelist_brain/prompt_surface.py) | 组装 system rules、character definition、world info 等 |
| Core memory - persona | [identity.py](file:///home/hedaas/文档/project/LinYi/src/novelist_brain/identity.py) / IdentityCore | 林逸的自我画像、性格、价值观 |
| Core memory - human | [reader_profile.py](file:///home/hedaas/文档/project/LinYi/src/novelist_brain/reader_profile.py) | 读者画像，含 known_facts、relationship_stage |
| Core memory - OC facts | [oc_character_system.py](file:///home/hedaas/文档/project/LinYi/src/novelist_brain/oc_character_system.py) | OC 设定 + `known_facts` |
| Recall memory | [conversation_queue.py](file:///home/hedaas/文档/project/LinYi/src/novelist_brain/conversation_queue.py) | 近期对话轮次的 FIFO 队列 |
| Working memory / retrieval | [memory_stream.py](file:///home/hedaas/文档/project/LinYi/src/novelist_brain/memory_stream.py) | 三因子检索（recency/importance/relevance） |
| Archival summaries | [mid_term_memory.py](file:///home/hedaas/文档/project/LinYi/src/novelist_brain/mid_term_memory.py) | 把被 evict 的对话压缩成摘要存入 MemoryStream |
| Core memory editor | [llm_fact_extractor.py](file:///home/hedaas/文档/project/LinYi/src/novelist_brain/llm_fact_extractor.py) | 自动提取事实写入 ReaderProfile / OC known_facts |
| Social memory | [relationship_graph.py](file:///home/hedaas/文档/project/LinYi/src/novelist_brain/relationship_graph.py) | 显式关系图 + 时序历史 |
| Reflection | [reflection_engine.py](file:///home/hedaas/文档/project/LinYi/src/novelist_brain/reflection_engine.py) | 从记忆流中合成高层洞察 |

LinYi 的 MemoryStream 已经在注释中明确提到借鉴了 MemGPT 的 tiered memory 与 page-in/page-out 思想：

- `control.memory.page_in`
- `control.memory.page_out`
- `data.memory_stream.update`

## 4. 交叉对比

| 维度 | MemGPT / Letta | LinYi 现状 | 差距 |
|---|---|---|---|
| **核心记忆编辑** | LLM 通过函数调用主动编辑 persona / human | `LLMFactExtractor` 自动提取，但模型本身无法主动决定“现在该记什么” | 缺少让 LLM 主动调用 `core_memory_replace` 的机制 |
| **换页触发** | 模型自己决定 page-in / page-out | MemoryStream 提供 topic，但主要由模块被动触发 | 缺少“上下文压力”感知与主动换页策略 |
| **Recall 检索** | `conversation_search` / `conversation_search_date` | `ConversationQueue.recent_turns()` 只按时间返回 | 缺少按关键词/日期搜索完整对话历史 |
| **Archival 写入** | 模型调用 `archival_memory_insert` | `MidTermMemory` 自动把 evicted turns 压缩后写入 | LinYi 写入是自动的，但不可由模型根据重要性主动写入 |
| **记忆压缩粒度** | 可配置 chunk size、摘要比例 | `MidTermMemory` 整段摘要，`MemoryStream` 单条 entry | 缺少对长文档/长对话的分块索引 |
| **人格-记忆边界** | persona / human / functions 三区分离清晰 | Identity、ReaderProfile、OC 分散在不同模块 | 已在 PromptSurface 汇合，但缺少统一 core memory schema |
| **社交记忆** | 主要通过 human / archival 承载 | RelationshipGraph 显式建模关系 + 时序历史 | 关系历史尚未自动写入记忆流或归档 |
| **可观测性** | page-fault rate、recall@k | 无专门指标 | 缺少记忆检索质量与换页频率指标 |

## 5. 可直接借鉴的机制

### 5.1 让 LLM 主动管理核心记忆

MemGPT 最重要的启示是：记忆不应该是纯被动的“模块自动提取”，而应该是模型可写可控的。LinYi 可以在 `PromptSurface` 中加入一段 core memory 管理指令，并让 LLM 返回 JSON 中包含可选的 `memory_edits`：

```json
{
  "response": "...",
  "memory_edits": [
    {"section": "reader", "op": "append", "key": "喜欢的饮料", "value": "美式咖啡"},
    {"section": "persona", "op": "replace", "old": "讨厌雨天", "new": "逐渐学会欣赏雨天"}
  ]
}
```

这样 LLM 可以在生成回复的同时，决定哪些事实值得固化到核心记忆。

### 5.2 上下文压力感知与主动换页

在 `PromptSurface.assemble()` 中计算当前 surface 长度。当接近 `max_surface_chars` 时：

1. 优先把权重低、时间久的 MemoryStream entry 标记为可 page-out。
2. 触发 `control.memory.page_out`，由 `MidTermMemory` 或 `MemoryStream` 压缩归档。
3. 在 prompt 中提示模型“上下文将满，请决定保留/归档哪些信息”。

### 5.3 完整对话历史的可搜索 recall

把 `ConversationQueue` 的历史 turn 持久化到 SQLite/JSONL，提供 `conversation_search(query)`。这能让模型回答“我们上周聊过什么”这类跨 session 问题。

### 5.4 统一 Core Memory Schema

定义一个 `CoreMemory` 结构：

```python
{
  "persona": { ... },           # 来自 IdentityCore
  "reader": { ... },            # 来自 ReaderProfile
  "oc_facts": { "oc_id": {...} },
  "active_goals": [...],
  "taboo": [...],
}
```

`PromptSurface` 在每次组装时把这个 schema 渲染成 prompt 片段，而不是从多个模块分别拼接。

### 5.5 把 RelationshipGraph 阶段变化写入 Archival

当 `data.relationship.stage.changed` 发生时，生成一条自然语言摘要：

> “2026-07-22，读者与苏晚的关系从 warm 升到 close，原因是读者称赞了苏晚。”

存入 MemoryStream / MidTermMemory，成为后续叙事和对话的素材。

## 6. 实施路线图

| 阶段 | 工作项 | 优先级 | 对应文件 |
|---|---|---|---|
| 1 | 定义统一 `CoreMemory` schema，并在 PromptSurface 中渲染 | 高 | `prompt_surface.py`, `models.py` |
| 2 | 让 LLM 输出 `memory_edits`，由 `LLMFactExtractor` 执行 | 高 | `llm_fact_extractor.py`, `prompt_surface.py` |
| 3 | 在 PromptSurface 中加入上下文压力提示与 page-out 触发 | 中 | `prompt_surface.py`, `memory_stream.py` |
| 4 | ConversationQueue 历史持久化 + `conversation_search` | 中 | `conversation_queue.py` |
| 5 | RelationshipGraph 阶段变化自动生成叙事摘要并存档 | 中 | `relationship_graph.py`, `memory_stream.py` |
| 6 | 增加记忆检索/换页指标（page-fault count, recall@k） | 低 | `evaluation_observability_system.py` |

## 7. 风险与应对

| 风险 | 应对 |
|---|---|
| LLM 频繁误写核心记忆 | 限制每次调用最多 N 条编辑；对 persona 编辑增加人工/审计门控 |
| 换页工具定义占用 prompt 空间 | 把工具说明放入 system rules 末尾，控制字符预算 |
| 自动 page-out 误删关键信息 | 保留“pinned”标签；重要记忆需显式解锁才允许换出 |
| 对话历史搜索增加延迟 | 使用本地 SQLite FTS；搜索只在显式需要时触发 |

## 8. 结论

LinYi 的记忆栈已经覆盖了 MemGPT 三层模型的大部分功能：

- `ConversationQueue` ≈ Recall memory
- `MemoryStream` ≈ Working memory + page-in/page-out
- `MidTermMemory` ≈ Archival summaries
- `IdentityCore` / `ReaderProfile` / `OC known_facts` ≈ Core memory
- `LLMFactExtractor` ≈ Core memory editor（自动版）

主要差距在于 **“模型主动管理记忆”** 与 **“上下文压力感知”**。下一步应优先把 `PromptSurface` 升级为带 `memory_edits` 输出与 page-out 触发的统一核心记忆层，让林逸不仅能记住，还能决定“现在该记住什么、忘记什么”。

## 参考

- Packer et al. "MemGPT: Towards LLMs as Operating Systems", arXiv:2310.08560, 2023.
- Letta (formerly MemGPT) GitHub: https://github.com/letta-ai/letta
- Agent Patterns Catalog: MemGPT-Style Paging. https://agentpatternscatalog.github.io/patterns/patterns/memgpt-paging.html
