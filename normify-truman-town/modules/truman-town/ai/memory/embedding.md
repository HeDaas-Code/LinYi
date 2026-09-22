---
uid: 82075fb3
id: truman-town.ai.memory.embedding
parent: truman-town.ai.memory
state: planned
name: {zh: "记忆嵌入", en: "Memory Embedding"}
description:
  zh: >
      把情景与语义记忆编码为向量并检索相似记忆。
  en: >
      Encodes memory to vectors and searches similar memories.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "ai.memory.embedding.encode"
    description:
      zh: >
          调用 ai.memory.embedding.encode。
      en: >
          Calls ai.memory.embedding.encode.
  - protocol: rpc
    path: "ai.memory.embedding.search"
    description:
      zh: >
          调用 ai.memory.embedding.search。
      en: >
          Calls ai.memory.embedding.search.
deps:
  - kind: call
    to: truman-town.infra.store.vector
---
