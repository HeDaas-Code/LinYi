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
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.831Z"
fingerprint: 6e24fad0d88a750a896e9e01db24e3a83cf29980ebd3dfb2104a3b217e7e3e6d
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
