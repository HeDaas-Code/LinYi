---
uid: ae9951bc
id: truman-town.agent.traits.tagset.similarity
parent: truman-town.agent.traits.tagset
name: {zh: "特质相似度", en: "Tag Similarity"}
description:
  zh: >
      计算两个 50 标签集合的相似度并检索近邻。
      
  en: >
      Computes similarity between two 50-tag sets and finds neighbors.
      
revision: 6939444d190f953b7c3e7a73b35ad8b25ac43b07
updated_at: "2026-09-24T02:04:23.739Z"
fingerprint: fcc52c46932330246ac98d057a4bc49844e919b6214225fa852134f6f0a75f61
source:
  - path: "src/agent/traits/tagset/similarity.js"
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
