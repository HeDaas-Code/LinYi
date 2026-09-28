---
uid: 44a88171
id: truman-town.ai.prompt.agent
parent: truman-town.ai.prompt
name: {zh: "智能体提示词", en: "Agent Prompt"}
description:
  zh: >
      用 50 标签、人设与记忆组装智能体提示词。
      
  en: >
      Assembles agent prompts from 50 tags, persona and memory.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.833Z"
fingerprint: 0f98aaad841b088d0949e52c7821fda60675cd0592b4340deae2506f5ac8f288
source:
  - path: "src/ai/prompt/agent.js"
apis:
  - protocol: rpc
    path: "ai.prompt.agent.compose"
    description:
      zh: >
          用 50 标签、人设与记忆组装智能体结构化提示词（system/user/messages）。
          
      en: >
          Assembles a structured agent prompt (system/user/messages) from tags, persona and memory.
          
  - protocol: rpc
    path: "ai.prompt.agent.validate"
    description:
      zh: >
          校验提示词安全性（MVP 内置护栏：筛查提示注入），返回 issues 与净化文本。
          
      en: >
          Validates prompt safety (MVP inline guard for prompt injection), returning issues and sanitized text.
          
deps:
  - kind: call
    to: truman-town.ai.guard
---
