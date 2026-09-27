---
uid: cbdda66a
id: truman-town-flow.state.area.runtime.task-seq-d700f01d
parent: truman-town-flow.state.area.runtime
name: {zh: "taskSeq", en: "taskSeq"}
description:
  zh: >
      number 类型，声明于 src/runtime/clock.js:11。写入方 1 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/runtime/clock.js:11; writers=1, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:58.220Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "task-seq-d700f01d:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/clock.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "task-seq-d700f01d:read-schedule"
    description:
      zh: >
          读取方 schedule
          
      en: >
          reader schedule
          
  - protocol: rpc
    path: "task-seq-d700f01d:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.clock
    from_api: "rpc:task-seq-d700f01d:read-schedule"
    label: {zh: "读 taskSeq", en: "read taskSeq"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:task-seq-d700f01d:read-__snapshot"
    label: {zh: "读 taskSeq", en: "read taskSeq"}
---
