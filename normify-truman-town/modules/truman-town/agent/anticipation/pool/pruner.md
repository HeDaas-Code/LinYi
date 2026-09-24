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
      
revision: 159dc43daf11d18b03ea9fc0ea5c3e6b18f16488
updated_at: "2026-09-24T02:31:02.016Z"
fingerprint: df122ee4696bbbb5505aa3d4160e3051a7c87d2aed43b78bb8c9b17178cc7b15
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
