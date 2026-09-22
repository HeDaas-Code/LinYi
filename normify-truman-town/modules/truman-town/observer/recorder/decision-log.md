---
uid: a65a089a
id: truman-town.observer.recorder.decision-log
parent: truman-town.observer.recorder
name: {zh: "决策日志", en: "Decision Log"}
description:
  zh: >
      记录每一次智能体决策：谁在哪个 tick、从哪些候选中选择了什么及理由，写入图存储为不可变追加日志。
      
  en: >
      Records every agent decision — who chose what from which options at which tick and why — into an immutable append log in the graph store.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T06:15:09.887Z"
fingerprint: 3e1f3cb0f49ab7bbec3ccfca939979eb342e0afe9aa016d036f8b9c8e51faafc
source:
  - path: "src/observer/recorder/decision-log.js"
apis:
  - protocol: rpc
    path: "observer.recorder.decision_log.record"
    description:
      zh: >
          记录一条智能体决策日志（tick、主体、候选、选择与理由），返回已写入的日志节点快照。
          
      en: >
          Records one agent decision (tick, subject, options, choice and reason) and returns the appended log-node snapshot.
          
deps:
  - kind: call
    to: truman-town.infra.store.graph
---
