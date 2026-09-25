---
uid: 1170fec1
id: truman-town-flow.state.area.runtime.tasks-79b3964f
parent: truman-town-flow.state.area.runtime
name: {zh: "tasks", en: "tasks"}
description:
  zh: >
      map 类型，声明于 src/runtime/clock.js:14。写入方 1 个、读取方 2 个；已纳入复位。
      
  en: >
      map declared at src/runtime/clock.js:14; writers=1, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:35.160Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "tasks-79b3964f:write-schedule"
    description:
      zh: >
          写入方 schedule（src/runtime/clock.js）
          
      en: >
          writer schedule
          
  - protocol: rpc
    path: "tasks-79b3964f:read-tick"
    description:
      zh: >
          读取方 tick
          
      en: >
          reader tick
          
  - protocol: rpc
    path: "tasks-79b3964f:read-schedule"
    description:
      zh: >
          读取方 schedule
          
      en: >
          reader schedule
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.clock
    from_api: "rpc:tasks-79b3964f:read-tick"
    label: {zh: "读 tasks", en: "read tasks"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.clock
    from_api: "rpc:tasks-79b3964f:read-schedule"
    label: {zh: "读 tasks", en: "read tasks"}
---
