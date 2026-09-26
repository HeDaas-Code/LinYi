---
uid: 546310d9
id: truman-town.agent.memory.semantic
parent: truman-town.agent.memory
name: {zh: "语义记忆", en: "Semantic Memory"}
description:
  zh: >
      沉淀语义记忆条目（事件→摘要），按词面/标签相关度召回（默认纯词面匹配，不依赖 MiniLM）。
      
  en: >
      Stores semantic memory entries (event→summary) and recalls them by lexical/tag relevance (default lexical matching, no MiniLM).
      
revision: f5619e53d4eabebf1a7aa7f58a657c03cf3d5583
updated_at: "2026-09-26T16:03:47.710Z"
fingerprint: 2c3de7aa214f0a641073f110a0fbd57fcc4184d3aee810cb2cac9da414fca9d3
source:
  - path: "src/agent/memory/semantic.js"
apis:
  - protocol: rpc
    path: "agent.memory.semantic.store"
    description:
      zh: >
          写入一条语义记忆（事件→摘要），每主体上限裁剪。
          
      en: >
          Stores one semantic memory entry (event→summary) with per-agent cap.
          
  - protocol: rpc
    path: "agent.memory.semantic.recall"
    description:
      zh: >
          按词面/标签相关度召回语义记忆（top-K）。
          
      en: >
          Recalls semantic memories by lexical/tag relevance (top-K).
          
---
