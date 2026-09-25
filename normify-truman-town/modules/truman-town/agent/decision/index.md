---
uid: "55312917"
id: truman-town.agent.decision
parent: truman-town.agent
name: {zh: "决策器实现", en: "Decision Implementation"}
description:
  zh: >
      综合动机、预想池评分与记忆，选择最终行动并给出解释。
      
  en: >
      Chooses final actions from motivations, anticipation scores and memory, with explanations.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T08:50:35.490Z"
fingerprint: pending
source: []
deps:
  - kind: call
    to: truman-town.agent.anticipation.simulator
  - kind: dataflow
    to: truman-town.agent.memory.episodic
  - kind: call
    to: truman-town.ai.thought
  - kind: call
    to: truman-town.observer.recorder
  - kind: call
    to: truman-town.survival.needs.pressure
  - kind: call
    to: truman-town.agent.psyche.trauma
---
