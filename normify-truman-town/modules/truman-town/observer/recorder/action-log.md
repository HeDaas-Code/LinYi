---
uid: 5e26aea9
id: truman-town.observer.recorder.action-log
parent: truman-town.observer.recorder
name: {zh: "行为日志", en: "Action Log"}
description:
  zh: >
      记录每一个智能体行为及其结果，写入图存储为不可变追加日志。
      
  en: >
      Records every agent action and its outcome into an immutable append log in the graph store.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T06:15:09.887Z"
fingerprint: a208cc189cca593302b2905685fdcb8d9b0562f79484bfcc86d5d63f6ed4b53d
source:
  - path: "src/observer/recorder/action-log.js"
apis:
  - protocol: rpc
    path: "observer.recorder.action_log.record"
    description:
      zh: >
          记录一条智能体行为日志（tick、主体、行为与结果），返回已写入的日志节点快照。
          
      en: >
          Records one agent action (tick, subject, action and outcome) and returns the appended log-node snapshot.
          
deps:
  - kind: call
    to: truman-town.infra.store.graph
---
