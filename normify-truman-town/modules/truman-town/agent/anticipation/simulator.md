---
uid: 448e8cce
id: truman-town.agent.anticipation.simulator
parent: truman-town.agent.anticipation
name: {zh: "行动模拟", en: "Action Simulator"}
description:
  zh: >
      对候选行动做结果模拟与效用评分。
      
  en: >
      Simulates candidate action outcomes and scores their utility.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.825Z"
fingerprint: a10a30c05301853d5030e30be952941b493fdfb4b4aca0d71358a160367cfc04
source:
  - path: "src/agent/anticipation/simulator.js"
apis:
  - protocol: rpc
    path: "agent.anticipation.simulator.simulate"
    description:
      zh: >
          推演单个候选行动，输出期望效用与风险。
          
      en: >
          Simulates one candidate action, outputs expected utility and risk.
          
  - protocol: rpc
    path: "agent.anticipation.simulator.predict"
    description:
      zh: >
          推演全部候选并按期望效用降序预测。
          
      en: >
          Simulates all candidates and predicts by expected utility desc.
          
deps:
  - kind: dataflow
    to: truman-town.agent.memory.semantic
---
