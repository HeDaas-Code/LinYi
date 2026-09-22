---
uid: f087f502
id: truman-town.observer.recorder.event-log
parent: truman-town.observer.recorder
name: {zh: "事件日志", en: "Event Log"}
description:
  zh: >
      记录世界事件并接入事件总线，写入图存储为不可变追加日志。
      
  en: >
      Records world events and connects to the event bus, appending to an immutable log in the graph store.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T06:15:51.378Z"
fingerprint: 4431150baa62a34336e7206ff1091de26547889b3838a90d162d5feb0834113f
source:
  - path: "src/observer/recorder/event-log.js"
apis:
  - protocol: rpc
    path: "observer.recorder.event_log.record"
    description:
      zh: >
          记录一条世界事件日志（tick、主题与载荷），返回已写入的日志节点快照。
          
      en: >
          Records one world event (tick, topic and payload) and returns the appended log-node snapshot.
          
deps:
  - kind: call
    to: truman-town.infra.store.graph
  - kind: call
    to: truman-town.infra.events.pubsub
---
