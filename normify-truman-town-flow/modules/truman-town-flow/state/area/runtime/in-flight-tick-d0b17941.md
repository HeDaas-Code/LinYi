---
uid: 0eff45b5
id: truman-town-flow.state.area.runtime.in-flight-tick-d0b17941
parent: truman-town-flow.state.area.runtime
name: {zh: "inFlightTick", en: "inFlightTick"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/loop.js:171。写入方 2 个、读取方 3 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/loop.js:171; writers=2, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:12.668Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "in-flight-tick-d0b17941:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/loop.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "in-flight-tick-d0b17941:write-markRestored"
    description:
      zh: >
          写入方 markRestored（src/runtime/orchestrator/loop.js）
          
      en: >
          writer markRestored
          
  - protocol: rpc
    path: "in-flight-tick-d0b17941:read-step"
    description:
      zh: >
          读取方 step
          
      en: >
          reader step
          
  - protocol: rpc
    path: "in-flight-tick-d0b17941:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "in-flight-tick-d0b17941:read-tickStatus"
    description:
      zh: >
          读取方 tickStatus
          
      en: >
          reader tickStatus
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.api.control
    from_api: "rpc:in-flight-tick-d0b17941:read-step"
    label: {zh: "读 inFlightTick", en: "read inFlightTick"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:in-flight-tick-d0b17941:read-__snapshot"
    label: {zh: "读 inFlightTick", en: "read inFlightTick"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.loop
    from_api: "rpc:in-flight-tick-d0b17941:read-tickStatus"
    label: {zh: "读 inFlightTick", en: "read inFlightTick"}
---
