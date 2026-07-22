# AutoGen 技术笔记

## 项目概述

AutoGen 是微软开源的多 Agent 应用框架，采用分层可扩展架构：底层 Core API 负责消息传递、事件驱动 Agent 与分布式运行时；中层 AgentChat API 提供开箱即用的助手 Agent、群组对话与团队编排；上层 Extensions API 支持模型客户端、工具、代码执行等扩展。Agent 可携带系统提示、工具、记忆、交接（Handoff）能力，并通过团队（Team）实现多角色协作。需要注意的是，AutoGen 目前已进入维护模式，官方推荐新项目使用 Microsoft Agent Framework，但其设计思想仍极具参考价值。对 LinYi 来说，AutoGen 最有价值的是「把不同角色建模为独立 Agent，并用团队机制编排它们」的范式，这与把多个 OC 同时激活并让它们在同一个世界中共存的需求高度契合。读者可以与一个 OC 私聊，也可以把多个 OC 拉进同一场群戏，Agent 框架负责调度谁发言、谁监听、谁行动。

## 核心架构 / 关键模块

- **Core API**：基于 Actor 的消息模型，支持 Agent 注册、订阅、路由与跨语言（Python / .NET）运行时。
- **AgentChat API**：提供 `AssistantAgent`、`BaseChatAgent`、`UserProxyAgent` 等高层抽象，快速搭建对话应用。
- **Teams**：`SelectorGroupChat`（动态选人）、`RoundRobinGroupChat`（轮询）、`Swarm`（蜂群协作）等多种群组模式。
- **Tools / Workbench**：Agent 可调用函数工具或 MCP Workbench，实现代码执行、网络浏览、文件操作等。
- **Memory 与 Model Context**：支持注入长期记忆，支持 `BufferedChatCompletionContext` 等上下文截断策略。
- **Termination 条件**：可配置最大轮次、文本匹配、Token 限制等终止规则，保证多轮交互可控。
- **组件化配置**：Agent、Team、Tool、Memory 均可序列化为 JSON/YAML，实现声明式复现与版本管理。
- **A2A / MCP 互操作**：支持 Agent-to-Agent 协议与 Model Context Protocol，便于接入外部工具生态与跨系统协作。

## 与 LinYi 最相关的概念

- **角色化 Agent**：每个 Agent 通过 `name + description + system_message` 定义角色，适合把不同 OC 建模为独立 Agent。
- **工具调用与记忆交互**：Agent 可调用工具查询 `MemorySystem`、`WorldStateContract`，把记忆访问变成 Agent 的自主行为。
- **Handoff 交接**：实现读者 ↔ OC、OC ↔ OC、创作 Agent ↔ 审计 Agent 之间的任务移交。
- **团队编排**：用 SelectorGroupChat 让多个 OC 按话题和角色能力动态参与群聊。
- **状态持久化**：Agent 实例在多次调用间保持状态，可序列化配置，适合长期运行的虚拟生命与跨会话续聊。
- **结构化输出**：Agent 可配置 `output_content_type`，把决策、情绪、动作意图等以结构化格式返回，方便下游处理。

## 对 LinYi 的具体建议

- 将每个 OC 封装为 `AssistantAgent`，把 `OCCharacterSheet` 的 identity 与 plan 写入 system_message。
- 给 Agent 提供记忆工具（如 `search_memory`、`update_relationship`），让 OC 能主动查询和修改自身状态。
- 在 OC 群聊场景使用 `SelectorGroupChat`，根据话题相关性动态挑选发言者，避免全员尬聊。
- 对需要人工确认的操作使用 `UserProxyAgent` 或 Handoff，把读者纳入创作闭环。
- 使用 `BufferedChatCompletionContext` 控制上下文长度，防止长连载导致 Token 爆炸。
- 将 Agent 配置导出为 JSON/YAML，实现 OC 角色卡与运行时可复现的声明式定义。
- 借鉴 Core API 的消息总线设计，让 OC Agent、创作 Agent、审计 Agent 之间通过统一事件流通信，降低耦合。
- 设计清晰的 Termination 规则，防止多 Agent 对话无限循环，保证交互可控并节省 Token。
- 将 Agent 输出设计为结构化事件（如 `emotion`、`intent`、`target_oc`），驱动前端表情、动作与剧情分支。
