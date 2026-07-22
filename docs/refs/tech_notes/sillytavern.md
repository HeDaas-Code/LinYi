# SillyTavern 交叉分析笔记

> 项目地址：https://github.com/SillyTavern/SillyTavern  
> 文档：https://sillytavern-docs.cerulean.foo/  
> 核心定位：面向高级用户的本地 LLM 角色扮演前端，围绕“角色卡片”构建沉浸式对话体验。

## 1. 项目概述

SillyTavern 起源于 TavernAI 的分支，强调用户对 prompt 的精细控制。它本身不是模型，而是一个“角色扮演容器”：把 LLM、角色设定、世界书、用户人设、情感表达、语音、图像等组件组合成交互界面。对 LinYi 的价值在于：**人机交互层如何承载一个有记忆、有情感、有场景的虚拟生命**。

## 2. 核心机制

### 2.1 角色卡片（Character Cards）

一张角色卡片包含：
- **Name**：角色名称。
- **Description**：角色外貌、性格、背景、说话方式。
- **Personality Summary**：性格关键词与行为模式。
- **Scenario**：开场情境，决定对话起点。
- **Example Dialogues**：3-5 段示例对话，训练模型掌握语气。
- **First Message**：首次打招呼内容。
- **Creator's Notes / System Prompt**：底层系统提示。

**可借鉴点**：LinYi 的 `OCCharacterSheet` 已类似角色卡片，但缺少 **Example Dialogues** 和 **Scenario**。可以在 COC 角色卡中增加 `voice_samples`（示例台词）和 `scenario_seed`。

### 2.2 World Info / Lorebook

- 按关键词触发的背景知识条目。
- 避免把所有 lore 塞进主 prompt，只在相关时注入。

**可借鉴点**：与 LinYi 的 `StoryBible` 和 `WorldStateContract` 结合，做“上下文敏感的世界书”——当对话提到某个地点/人物时，自动 page_in 相关 lore。

### 2.3 User Persona

- 用户可以定义自己的人设（姓名、性格、与角色关系）。
- 角色会基于用户人设调整互动方式。

**可借鉴点**：LinYi 中的“读者”应该有一个可配置的 `ReaderProfile`，影响林逸的 `reader_temperature`、称呼方式、回忆内容。

### 2.4 情感表达（Expression Images / Sprites）

- 角色输出文本后，通过小型情感分类模型自动匹配表情 sprite。
- 支持 6 种或 28 种情感标签。

**可借鉴点**：为 LinYi WebUI 增加“情绪头像/表情”层，根据 `MetabolismState.mood_bias` 和 segment detail 的 mood 自动切换视觉状态，增强“生活在电脑中”的临场感。

### 2.5 Group Chats

- 多个角色在同一个聊天室中互动。
- 角色之间也会互相发言，用户只是其中一员。

**可借鉴点**：`OCTownEngine` 未来可以支持“群聊模式”，让多个 OC 与读者在同一个对话线程中互动。

### 2.6 扩展与数据银行（Data Bank / RAG）

- 可以上传文档作为聊天背景知识。
- 支持多种检索策略。

**可借鉴点**：把小说原稿、Story Bible、OC 设定作为 Data Bank，对话生成时做 RAG 检索，保证不 OOC。

## 3. 与 LinYi 的映射

| SillyTavern 概念 | LinYi 映射 | 说明 |
|---|---|---|
| Character Card | `OCCharacterSheet` / `LinYiProfile` | 需增加示例台词与情境 |
| World Info | `StoryBible` + 关键词触发器 | 上下文敏感注入 |
| User Persona | `ReaderProfile`（新增） | 影响互动温度 |
| Expression Images | WebUI 情绪头像 | 根据 mood_bias 切换 |
| Group Chat | `OCTownEngine` 群聊模式 | 多 OC + 读者 |
| Data Bank | `MemoryStore` 向量归档 | 长文档 RAG |

## 4. 建议引入 LinYi 的模块

1. **`ReaderProfile`**：读者人设（昵称、偏好、关系阶段、禁忌话题），让林逸对“你”有差异化记忆。
2. **`ExpressionState`**：从 mood/arousal 映射到表情/头像状态，供前端渲染。
3. **`VoiceSample`**：在 `OCCharacterSheet` 中存储示例台词，生成对话时做 few-shot。
4. **`ScenarioSeed`**：每次新会话/新一天的开场情境，避免千篇一律的问候。

## 5. 落地优先级

- **P0**：`ReaderProfile` + 把 reader 信息写入 `MemorySystem` 作为长期记忆。
- **P1**：`ExpressionState` 映射表，供 WebUI 消费。
- **P2**：在 `OCCharacterSheet` / `LinYiProfile` 中增加 `voice_samples`。
- **P3**：群聊模式与 Data Bank RAG。
