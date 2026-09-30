---
uid: 82075fb3
id: truman-town.ai.memory.embedding
parent: truman-town.ai.memory
name: {zh: "记忆嵌入", en: "Memory Embedding"}
description:
  zh: >
      把情景与语义记忆编码为向量并检索相似记忆。
      
  en: >
      Encodes memory to vectors and searches similar memories.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.833Z"
fingerprint: 7e9a49439546fddb158c1d2dd598bf3b91118c00138756d8d9a62586da33008a
source:
  - path: "src/ai/memory/embedding.js"
apis:
  - protocol: rpc
    path: "ai.memory.embedding.encode"
    description:
      zh: >
          将记忆文本编码为向量。
          
      en: >
          将记忆文本编码为向量。
          
  - protocol: rpc
    path: "ai.memory.embedding.index"
    description:
      zh: >
          将记忆向量写入索引。
          
      en: >
          将记忆向量写入索引。
          
  - protocol: rpc
    path: "ai.memory.embedding.search"
    description:
      zh: >
          按向量相似度检索记忆。
          
      en: >
          按向量相似度检索记忆。
          
deps:
  - kind: call
    to: truman-town.infra.store.vector
---
