---
uid: 91f77805
id: truman-town.agent.anticipation.pool.pruner
parent: truman-town.agent.anticipation.pool
name: {zh: "候选修剪器", en: "Candidate Pruner"}
description:
  zh: >
      按动机与性格对候选行动池打分并裁剪（保留前 K）。
      
  en: >
      Scores and prunes the candidate action pool by motivation and personality (keep top-K).
      
revision: 26dba326d0f79bf978188bf6f3ac73c02723ff58
updated_at: "2026-09-24T15:12:14.789Z"
fingerprint: d1ed1494cec8a38656c3bb0c3a531deb4fd54f9f4c752c8d9aee8b5e2a3f1bc8
source:
  - path: "src/agent/anticipation/pool/pruner.js"
apis:
  - protocol: rpc
    path: "agent.anticipation.pool.pruner.score"
    description:
      zh: >
          对单个候选打分（基础分+动机+性格）。
          
      en: >
          Scores one candidate (base + motivation + personality).
          
  - protocol: rpc
    path: "agent.anticipation.pool.pruner.prune"
    description:
      zh: >
          裁剪候选池，保留前 K 个。
          
      en: >
          Prunes candidate pool, keeps top-K.
          
deps:
  - kind: call
    to: truman-town.agent.anticipation.pool.store
  - kind: call
    to: truman-town.runtime.clock
---
