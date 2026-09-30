---
uid: c4cf2652
id: truman-town.ai.memory.summary
parent: truman-town.ai.memory
name: {zh: "记忆摘要", en: "Memory Summary"}
description:
  zh: >
      把长段记忆压缩为结构化摘要。
      
  en: >
      Compresses long memories into structured summaries.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.833Z"
fingerprint: 9eaf3b92621bf715caac3d4431a0a5aae651b19dc361968cfd1518aa5df84c55
source:
  - path: "src/ai/memory/summary.js"
apis:
  - protocol: rpc
    path: "ai.memory.summary.summarize"
    description:
      zh: >
          确定性地去重并截断记忆事实。
          
      en: >
          确定性地去重并截断记忆事实。
          
  - protocol: rpc
    path: "ai.memory.summary.compress"
    description:
      zh: >
          按配置使用确定性或模型摘要。
          
      en: >
          按配置使用确定性或模型摘要。
          
deps:
  - kind: call
    to: truman-town.ai.llm.gateway
---
