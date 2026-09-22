---
uid: ae9951bc
id: truman-town.agent.traits.tagset.similarity
parent: truman-town.agent.traits.tagset
state: planned
name: {zh: "特质相似度", en: "Tag Similarity"}
description:
  zh: >
      计算两个 50 标签集合的相似度并检索近邻。
  en: >
      Computes similarity between two 50-tag sets and finds neighbors.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T05:27:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "agent.traits.tagset.similarity.compare"
    description:
      zh: >
          调用 agent.traits.tagset.similarity.compare。
      en: >
          Calls agent.traits.tagset.similarity.compare.
  - protocol: rpc
    path: "agent.traits.tagset.similarity.neighbors"
    description:
      zh: >
          调用 agent.traits.tagset.similarity.neighbors。
      en: >
          Calls agent.traits.tagset.similarity.neighbors.
deps:
  - kind: call
    to: truman-town.agent.traits.tagset.store
---
