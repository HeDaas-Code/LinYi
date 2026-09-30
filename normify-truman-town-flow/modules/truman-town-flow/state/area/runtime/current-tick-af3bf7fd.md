---
uid: ef9595c9
id: truman-town-flow.state.area.runtime.current-tick-af3bf7fd
parent: truman-town-flow.state.area.runtime
name: {zh: "currentTick", en: "currentTick"}
description:
  zh: >
      number 类型，声明于 src/runtime/clock.js:9。写入方 2 个、读取方 3 个；已纳入复位。
      
  en: >
      number declared at src/runtime/clock.js:9; writers=2, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:58.220Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "current-tick-af3bf7fd:write-tick"
    description:
      zh: >
          写入方 tick（src/runtime/clock.js）
          
      en: >
          writer tick
          
  - protocol: rpc
    path: "current-tick-af3bf7fd:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/clock.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "current-tick-af3bf7fd:read-snapshot"
    description:
      zh: >
          读取方 snapshot
          
      en: >
          reader snapshot
          
  - protocol: rpc
    path: "current-tick-af3bf7fd:read-tick"
    description:
      zh: >
          读取方 tick
          
      en: >
          reader tick
          
  - protocol: rpc
    path: "current-tick-af3bf7fd:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.decision.contention
    from_api: "rpc:current-tick-af3bf7fd:read-snapshot"
    label: {zh: "读 currentTick", en: "read currentTick"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.clock
    from_api: "rpc:current-tick-af3bf7fd:read-tick"
    label: {zh: "读 currentTick", en: "read currentTick"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:current-tick-af3bf7fd:read-__snapshot"
    label: {zh: "读 currentTick", en: "read currentTick"}
---
