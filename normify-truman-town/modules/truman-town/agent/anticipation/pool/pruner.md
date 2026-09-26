---
uid: 91f77805
id: truman-town.agent.anticipation.pool.pruner
parent: truman-town.agent.anticipation.pool
name: {zh: "候选修剪器", en: "Candidate Pruner"}
description:
  zh: >
      按评分把候选池裁剪到前 K。与 selector.shortlist 同为决策带宽闸门，采用**同一套豁免规则**（生存骨架 + found/socialize/court/accept 保送）——两级闸门必须同时豁免，否则前一级刚放进来的行动会被后一级再切掉。
      
  en: >
      Trims the candidate pool to top-K by score. Shares the **same exemption rules** as selector.shortlist (survival spine plus found/socialize/court/accept reserved); both gates must exempt together or the second gate re-evicts what the first admitted.
      
revision: 45f6c8b7b8ba210fcd94506b2097c8e601dd1382
updated_at: "2026-09-26T01:44:47.639Z"
fingerprint: 07fee21210d2af2442d95e1c6157f8887473294a1cfe04b5e92fda02bc91985f
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
