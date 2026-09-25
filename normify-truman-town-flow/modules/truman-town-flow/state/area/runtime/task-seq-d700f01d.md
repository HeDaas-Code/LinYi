---
uid: cbdda66a
id: truman-town-flow.state.area.runtime.task-seq-d700f01d
parent: truman-town-flow.state.area.runtime
name: {zh: "taskSeq", en: "taskSeq"}
description:
  zh: >
      number 类型，声明于 src/runtime/clock.js:11。写入方 0 个、读取方 1 个；已纳入复位。
      
  en: >
      number declared at src/runtime/clock.js:11; writers=0, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:35.160Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "task-seq-d700f01d:read-schedule"
    description:
      zh: >
          读取方 schedule
          
      en: >
          reader schedule
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.clock
    from_api: "rpc:task-seq-d700f01d:read-schedule"
    label: {zh: "读 taskSeq", en: "read taskSeq"}
---
