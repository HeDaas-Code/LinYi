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
      
revision: 159dc43daf11d18b03ea9fc0ea5c3e6b18f16488
updated_at: "2026-09-24T02:49:57.818Z"
fingerprint: bccf1aa2f63ed92a25ff6738d41a18cd071c7a1784447efaaaef1fac48230357
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
