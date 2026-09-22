---
uid: f342efd3
id: truman-town.agent.memory.episodic.recaller
parent: truman-town.agent.memory.episodic
name: {zh: "情景召回", en: "Episodic Recaller"}
description:
  zh: >
      按标签与时间窗口召回情景记忆，并按显著性/时间/标签重合排序。
      
  en: >
      Recalls episodic memories by tag/time window, ranked by salience/recency/tag overlap.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T06:24:06.395Z"
fingerprint: d21a09ce1f1e4b606e56de2f8f0c860d5fb4fc0b7b36fd726fcecaf219b7c335
source:
  - path: "src/agent/memory/episodic/recaller.js"
apis:
  - protocol: rpc
    path: "agent.memory.episodic.recaller.recall"
    description:
      zh: >
          按 tags/since/limit 召回某智能体的情景记忆。
          
      en: >
          Recalls memories filtered by tags/since/limit.
          
  - protocol: rpc
    path: "agent.memory.episodic.recaller.rank"
    description:
      zh: >
          按显著性 + 时间衰减 + 标签重合对记忆排序并返回分数。
          
      en: >
          Ranks memories by salience + recency + tag overlap with scores.
          
deps:
  - kind: call
    to: truman-town.agent.memory.episodic.store
  - kind: call
    to: truman-town.ai.memory.embedding
---
