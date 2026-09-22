---
uid: 448e8cce
id: truman-town.agent.anticipation.simulator
parent: truman-town.agent.anticipation
state: planned
name: {zh: "行动模拟", en: "Action Simulator"}
description:
  zh: >
      对候选行动做结果模拟与效用评分。
  en: >
      Simulates candidate action outcomes and scores their utility.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "agent.anticipation.simulator.score"
    description:
      zh: >
          调用 agent.anticipation.simulator.score。
      en: >
          Calls agent.anticipation.simulator.score.
  - protocol: rpc
    path: "agent.anticipation.simulator.compare"
    description:
      zh: >
          调用 agent.anticipation.simulator.compare。
      en: >
          Calls agent.anticipation.simulator.compare.
deps:
  - kind: dataflow
    to: truman-town.agent.memory.semantic
---
