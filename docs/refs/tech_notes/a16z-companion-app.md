# a16z AI Companion App 技术笔记

> 来源：`https://github.com/a16z-infra/companion-app`（基于 a16z AI Getting Started Stack）  
> 整理日期：2026-07-22

## 项目概述

a16z AI Companion App 是一个**教学性质的轻量级 AI 陪伴应用 starter stack**，目标是用最少的组件搭建一个可聊天、可自定义性格、具备长期对话记忆的 AI companion。它完整演示了：角色卡定义、向量数据库检索相似记忆、对话历史队列、LLM 流式生成等核心链路。

## 核心架构

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  companions/ │────▶│  Next.js API │────▶│  LangChain.js   │
│  角色卡 JSON │     │  /api/chat   │     │  prompt 组装    │
└─────────────┘     └──────────────┘     └─────────────────┘
                                                │
                       ┌────────────────────────┼────────────────────────┐
                       ▼                        ▼                        ▼
                ┌─────────────┐        ┌──────────────┐        ┌─────────────┐
                │  Pinecone / │        │  Upstash     │        │  OpenAI /   │
                │  pgvector   │        │  Redis       │        │  Replicate  │
                │  向量记忆检索 │        │  对话历史队列 │        │  LLM        │
                └─────────────┘        └──────────────┘        └─────────────┘
```

## 关键机制

### 1. 角色卡（Companion Definition）

每个角色是一个 JSON 文件，位于 `companions/` 目录：

```json
{
  "name": "Evelyn",
  "title": "Evelyn, the wise librarian",
  "description": "Evelyn is a 28-year-old librarian...",
  "prompt": "You are Evelyn...",
  "messageExamples": [
    { "role": "user", "content": "Hi Evelyn" },
    { "role": "Evelyn", "content": "Oh, hello there..." }
  ]
}
```

对 LinYi 的启示：
- `OCCharacterSheet` 可兼容类似的 `description` / `prompt` / `messageExamples` 字段。
- 将角色卡与 `WorldStateContract` 解耦：角色卡描述"你是谁"，世界书描述"世界设定"。

### 2. 记忆机制：向量检索 + 对话队列

```typescript
// 简化逻辑
const relevantHistory = await vectorStore.similaritySearch(question, 3);
const recentChatHistory = await redis.lrange(chatKey, 0, 10);
const prompt = buildPrompt(companion, relevantHistory, recentChatHistory, question);
```

- **长期记忆**：把历史消息向量化存入 Pinecone/pgvector，按问题相似度检索 top-k。
- **短期记忆**：用 Upstash Redis 维护最近 N 条对话，保证上下文连贯。
- 没有显式的重要性评分或反思，但结构清晰、工程成本低。

对 LinYi 的启示：
- `MemoryStream` 的 recall 层可以参考这种"向量相似 + 近期对话队列"混合检索。
- 在检索结果中同时返回 `relevant_history` 和 `recent_history`，prompt 中分别标注来源。

### 3. 多模型后端

同时支持 OpenAI（ChatGPT）和 Replicate（Vicuna-13b），通过环境变量切换。对 LinYi 的启示：
- 当前 LinYi 已通过 `create_llm_service` 支持 OpenAI-compatible endpoint，但模型名硬编码问题需要更灵活的配置。
- 可考虑像 companion-app 一样把"模型提供商"作为角色卡或配置的选项。

### 4. SMS / Web 双通道

通过 Twilio 实现短信交互，前端用 Next.js。对 LinYi 的启示：
- LinYi 是封闭系统，不接入外部平台，但 `personal_input.py` / `social_input.py` 可以设计成本地 HTTP / WebSocket 接口，方便未来本地 UI 接入。

## 与 LinYi 的对应落地建议

| a16z 机制 | LinYi 对应实现 | 优先级 |
|-----------|---------------|--------|
| 角色卡 JSON | `OCCharacterSheet` 字段扩展 | P2 |
| 向量记忆检索 | `MemoryStream` 三因子检索中的 relevance 部分 | P1 |
| 对话历史队列 | `ReaderProfile` / `SelfTimeline` 近期交互记录 | P1 |
| 多模型切换 | `create_llm_service` 配置化改造 | P2 |
| 本地 API 输入 | `personal_input.py` HTTP 适配层 | P2 |

## 一句话总结

> a16z companion-app 提供了一个**最小可运行的 AI 陪伴应用模板**：角色卡 + 向量长期记忆 + 队列短期记忆 + 多模型生成。LinYi 可以在 `MemoryStream` 检索、`OCCharacterSheet` 规范和本地输入接口上直接借鉴。
