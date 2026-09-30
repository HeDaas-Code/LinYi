---
uid: 7e510cc5
id: truman-town.agent.decision.context
parent: truman-town.agent.decision
name: {zh: "决策上下文", en: "Decision Context"}
description:
  zh: >
      把动机、预想评分、记忆与生存压力归一化为统一决策输入并排序。
      
  en: >
      Normalizes motivations, anticipation scores, memory and pressure into ranked decision inputs.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.827Z"
fingerprint: 6b74c5d68a0cd51a2b9301b1562000a989d5d3878473d6b6256e1475431da270
source:
  - path: "src/agent/decision/context.js"
apis:
  - protocol: rpc
    path: "agent.decision.context.assemble"
    description:
      zh: >
          组装决策上下文，将四类输入归一化为 items 列表。
          
      en: >
          Assembles the context, normalizing four input kinds into items.
          
  - protocol: rpc
    path: "agent.decision.context.rank"
    description:
      zh: >
          按来源权重 × 单项分数对 items 排序。
          
      en: >
          Ranks items by source weight × item score.
          
deps:
  - kind: call
    to: truman-town.agent.memory.episodic
  - kind: call
    to: truman-town.survival.needs.pressure
  - kind: call
    to: truman-town.agent.anticipation.simulator
---
