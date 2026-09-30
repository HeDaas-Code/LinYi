---
uid: c1898e37
id: truman-town-flow.state.area.runtime.in-flight-53dcc34c
parent: truman-town-flow.state.area.runtime
name: {zh: "inFlight", en: "inFlight"}
description:
  zh: >
      flag 类型，声明于 src/runtime/orchestrator/loop.js:169。写入方 3 个、读取方 6 个；已纳入复位。
      
  en: >
      flag declared at src/runtime/orchestrator/loop.js:169; writers=3, readers=6
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:12.668Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "in-flight-53dcc34c:write-step"
    description:
      zh: >
          写入方 step（src/runtime/orchestrator/loop.js）
          
      en: >
          writer step
          
  - protocol: rpc
    path: "in-flight-53dcc34c:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/loop.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "in-flight-53dcc34c:write-markRestored"
    description:
      zh: >
          写入方 markRestored（src/runtime/orchestrator/loop.js）
          
      en: >
          writer markRestored
          
  - protocol: rpc
    path: "in-flight-53dcc34c:read-step"
    description:
      zh: >
          读取方 step
          
      en: >
          reader step
          
  - protocol: rpc
    path: "in-flight-53dcc34c:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "in-flight-53dcc34c:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
  - protocol: rpc
    path: "in-flight-53dcc34c:read-snapshot"
    description:
      zh: >
          读取方 snapshot
          
      en: >
          reader snapshot
          
  - protocol: rpc
    path: "in-flight-53dcc34c:read-markRestored"
    description:
      zh: >
          读取方 markRestored
          
      en: >
          reader markRestored
          
  - protocol: rpc
    path: "in-flight-53dcc34c:read-tickStatus"
    description:
      zh: >
          读取方 tickStatus
          
      en: >
          reader tickStatus
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.api.control
    from_api: "rpc:in-flight-53dcc34c:read-step"
    label: {zh: "读 inFlight", en: "read inFlight"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:in-flight-53dcc34c:read-__snapshot"
    label: {zh: "读 inFlight", en: "read inFlight"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:in-flight-53dcc34c:read-__restore"
    label: {zh: "读 inFlight", en: "read inFlight"}
  - kind: dataflow
    to: truman-town-flow.code.agent.decision.contention
    from_api: "rpc:in-flight-53dcc34c:read-snapshot"
    label: {zh: "读 inFlight", en: "read inFlight"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.loop
    from_api: "rpc:in-flight-53dcc34c:read-markRestored"
    label: {zh: "读 inFlight", en: "read inFlight"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.loop
    from_api: "rpc:in-flight-53dcc34c:read-tickStatus"
    label: {zh: "读 inFlight", en: "read inFlight"}
---
