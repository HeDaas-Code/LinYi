---
uid: cd9f7864
id: truman-town.agent.memory.episodic.store
parent: truman-town.agent.memory.episodic
name: {zh: "情景写入", en: "Episodic Store"}
description:
  zh: >
      写入并标注带情感标记的情景事件，支持标签合并与列表查询。
      
  en: >
      Writes/tags episodic events with emotional markers, plus list queries.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T06:24:06.394Z"
fingerprint: 50a572aebfa0a2cb430e1f26b07997589d3da21c9abf6283ad51308dd5881dc4
source:
  - path: "src/agent/memory/episodic/store.js"
apis:
  - protocol: rpc
    path: "agent.memory.episodic.store.write"
    description:
      zh: >
          写入一条情景记忆（自动生成或使用指定 id）并返回快照。
          
      en: >
          Writes an episodic memory (auto or explicit id) returning a snapshot.
          
  - protocol: rpc
    path: "agent.memory.episodic.store.tag"
    description:
      zh: >
          为已有情景记忆追加标签（幂等合并去重）。
          
      en: >
          Appends tags to an existing memory (idempotent dedupe).
          
deps:
  - kind: call
    to: truman-town.infra.store.graph
---
