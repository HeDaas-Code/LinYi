---
uid: "44614116"
id: truman-town.agent.psyche.coping
parent: truman-town.agent.psyche
name: {zh: "应对", en: "Coping"}
description:
  zh: >
      选择并执行祈祷、写作、社交、酗酒等应对行为。
      
  en: >
      Chooses and executes coping behaviors such as prayer, writing, socializing or drinking.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T14:25:36.976Z"
fingerprint: 21396753b311947e4d7f91a47f9992985e8a4ec49c235a1e6725f34ee01c1df3
source:
  - path: "src/agent/psyche/coping.js"
apis:
  - protocol: rpc
    path: "agent.psyche.coping.choose"
    description:
      zh: >
          调用 agent.psyche.coping.choose。
          
      en: >
          Calls agent.psyche.coping.choose.
          
  - protocol: rpc
    path: "agent.psyche.coping.execute"
    description:
      zh: >
          调用 agent.psyche.coping.execute。
          
      en: >
          Calls agent.psyche.coping.execute.
          
deps:
  - kind: call
    to: truman-town.agent.psyche.trauma
    label: {zh: "疗愈创伤", en: "Heal trauma"}
  - kind: call
    to: truman-town.agent.traits.tagset.store
    label: {zh: "读取特质选择应对方式", en: "Read traits to choose coping"}
  - kind: call
    to: truman-town.agent.memory.episodic.store
    label: {zh: "写入应对记忆", en: "Write coping memory"}
  - kind: call
    to: truman-town.agent.decision.context
    label: {zh: "输出决策源权重", en: "Emit decision source weights"}
---
