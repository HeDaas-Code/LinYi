---
uid: a7262b7b
id: truman-town.agent.psyche.break
parent: truman-town.agent.psyche
name: {zh: "精神崩溃", en: "Breakdown"}
description:
  zh: >
      创伤积累到阈值后触发崩溃，决策质量下降，极端时走向死亡。
      
  en: >
      Triggers breakdown past a trauma threshold, degrading decisions or ending in death.
      
revision: 824d4c242a0abd8e6ed58a6edcc322da739c728a
updated_at: "2026-09-28T08:45:24.379Z"
fingerprint: 2f5d89e2d118367076585ac043d0899f3e5615060b5363354a6f4dae7015c27b
source:
  - path: "src/agent/psyche/break.js"
apis:
  - protocol: rpc
    path: "agent.psyche.break.check"
    description:
      zh: >
          调用 agent.psyche.break.check。
          
      en: >
          Calls agent.psyche.break.check.
          
  - protocol: rpc
    path: "agent.psyche.break.trigger"
    description:
      zh: >
          调用 agent.psyche.break.trigger。
          
      en: >
          Calls agent.psyche.break.trigger.
          
deps:
  - kind: call
    to: truman-town.agent.psyche.trauma
    label: {zh: "读取创伤判定崩溃", en: "Read trauma to judge breakdown"}
  - kind: call
    to: truman-town.observer.recorder.event-log
    label: {zh: "记录崩溃/恢复事件", en: "Record breakdown/recovery"}
  - kind: call
    to: truman-town.agent.memory.episodic.store
    label: {zh: "写入崩溃记忆", en: "Write breakdown memory"}
  - kind: call
    to: truman-town.agent.decision.selector
    label: {zh: "崩溃影响决策选择", en: "Breakdown biases decisions"}
---
