---
uid: 93ac4e48
id: truman-town.agent.anticipation.pool.store
parent: truman-town.agent.anticipation.pool
name: {zh: "候选存储", en: "Candidate Store"}
description:
  zh: >
      存储与列出智能体预想池候选行动，按候选 id 幂等 upsert。
      
  en: >
      Stores and lists an agent candidate actions with id-empotent upsert.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T06:24:06.394Z"
fingerprint: f32b8fa2b141175ab5a37321179df26af7906515e8e5ad7d3b94283d38193527
source:
  - path: "src/agent/anticipation/pool/store.js"
apis:
  - protocol: rpc
    path: "agent.anticipation.pool.store.add"
    description:
      zh: >
          向预想池写入一个候选（按 id upsert）并返回快照。
          
      en: >
          Adds/upserts a candidate and returns its snapshot.
          
  - protocol: rpc
    path: "agent.anticipation.pool.store.list"
    description:
      zh: >
          列出某智能体预想池的全部候选。
          
      en: >
          Lists all candidates in an agent pool.
          
deps:
  - kind: call
    to: truman-town.infra.store.graph
---
