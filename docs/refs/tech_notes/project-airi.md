# Project AIRI 技术笔记

> 来源：[moeru-ai/airi](https://github.com/moeru-ai/airi)（README 与官方 DevLog 交叉整理）  
> 整理日期：2026-07-22

## 项目概述

Project AIRI 是一个受 Neuro-sama 启发的**自托管数字生命 / AI VTuber** 框架，目标是把“可对话的角色”升级为“能实时陪伴、玩游戏、看视频、有视觉形象的赛博生命”。它不只是一个聊天前端，而是一个完整的多模态 Agent：语音输入、语音合成、VRM/Live2D 形象、浏览器内本地推理（WebGPU）、Discord/Telegram 在线、Minecraft / Factorio 游玩等。

对 LinYi 而言，AIRI 最有借鉴价值的不是 VTuber 直播本身，而是它把**“生命体征、情绪连续性、身体表现”**作为一等公民的设计：一个虚拟角色要能“活”在电脑里，必须有稳定的内部状态，并把社交事件持续转化为可见的情绪/姿态变化。

## 核心架构 / 关键模块

- **Core**：中央 Agent 循环，连接记忆、语音、UI、游戏 Agent。
- **Memory / Memory Alaya**：长期记忆层，使用 DuckDB WASM / pgvector 等嵌入式数据库存储对话、事实与关系。
- **STT + unspeech**：实时语音输入与通用语音合成/识别代理。
- **Stage**：前端舞台，负责渲染 VRM / Live2D 模型、动画、眨眼、注视、 idle 眼动。
- **Realtime Audio**：端到端实时语音聊天示例。
- **Game Agents**：Factorio Agent、Minecraft Agent，让数字生命能与用户一起玩游戏。
- **MCP Launcher / tauri-plugin-mcp**：把外部能力以 MCP 工具形式接入。

## 与 LinYi 最相关的概念

- **身体表现是一等公民**：VRM / Live2D、自动眨眼、自动注视、idle 眼动，让角色在屏幕上有“存在感”。
- **情绪连续性**：角色不是对每条消息单独做表情，而是内部状态持续演化，再映射到外在表现。
- **多模态感知**：语音、视觉（看到你在做什么）、游戏状态都能影响行为。
- **自托管与隐私优先**：状态放在本地（DuckDB WASM / pglite），与 LinYi 的“封闭系统”原则一致。
- **子项目生态**：@proj-airi 下有 memory、stage-ui、server-runtime、unspeech 等可独立复用的组件。

## 对 LinYi 的具体建议

- **把内部 vital state 与社交事件打通**：OC 之间的对话、反思、移动，以及读者互动，都应该能改变林逸的心情、唤醒度、读者关系温度，再被 `ExpressionState` 表达为可见表情。
- **引入“身体/姿态”输出层**：即使前端暂时不使用 VRM，也可以先输出 `blink_rate`、`gaze_target`、`breath_speed`、`pose` 等可渲染参数，为后续接入 Live2D/VRM 做准备。
- **将游戏/工具交互视为社交输入**：AIRI 会和用户一起玩游戏；LinYi 未来若接入 MCP 工具，也应把“一起做了什么”写进记忆与关系图。
- **本地优先的状态存储**：AIRI 用 DuckDB WASM / pglite 把状态留在客户端；LinYi 继续沿用本地 JSON/Valkey/PostgreSQL，避免上云。
- **情绪衰减与回归基线**：真实情绪会自然回落，不应让一次事件永远锁定表情；设计随时间衰减的生命状态桥接器。

## LinYi 可落地的对应实现

- `SocialVitalBridge`：监听 `data.oc.town.event`、`event.reader.interaction`、`data.relationship.updated`，把社交事件映射为 `mood_bias / arousal / reader_temperature / creative_drive` 的微调和衰减。
- `ExpressionState` 已能把 vital state 映射为 `expression` 标签；未来可扩展为输出更细粒度的 avatar 参数。
- `RelationshipGraph` 已提供关系权重；可作为情绪微调的信号源之一。
