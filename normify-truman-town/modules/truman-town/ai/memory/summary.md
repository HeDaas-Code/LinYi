---
uid: c4cf2652
id: truman-town.ai.memory.summary
parent: truman-town.ai.memory
state: planned
name: {zh: "记忆摘要", en: "Memory Summary"}
description:
  zh: >
      把长段记忆压缩为结构化摘要。
  en: >
      Compresses long memories into structured summaries.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "ai.memory.summary.compress"
    description:
      zh: >
          调用 ai.memory.summary.compress。
      en: >
          Calls ai.memory.summary.compress.
deps:
  - kind: call
    to: truman-town.ai.llm.gateway
---
