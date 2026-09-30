---
uid: a2217f3e
id: truman-town-flow.state.area.runtime.stage-error-f79c4049
parent: truman-town-flow.state.area.runtime
name: {zh: "stageError", en: "stageError"}
description:
  zh: >
      null 类型，声明于 src/runtime/orchestrator/loop.js:172。写入方 3 个、读取方 4 个；已纳入复位。
      
  en: >
      null declared at src/runtime/orchestrator/loop.js:172; writers=3, readers=4
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:12.668Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "stage-error-f79c4049:write-step"
    description:
      zh: >
          写入方 step（src/runtime/orchestrator/loop.js）
          
      en: >
          writer step
          
  - protocol: rpc
    path: "stage-error-f79c4049:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/loop.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "stage-error-f79c4049:write-markRestored"
    description:
      zh: >
          写入方 markRestored（src/runtime/orchestrator/loop.js）
          
      en: >
          writer markRestored
          
  - protocol: rpc
    path: "stage-error-f79c4049:read-step"
    description:
      zh: >
          读取方 step
          
      en: >
          reader step
          
  - protocol: rpc
    path: "stage-error-f79c4049:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "stage-error-f79c4049:read-snapshot"
    description:
      zh: >
          读取方 snapshot
          
      en: >
          reader snapshot
          
  - protocol: rpc
    path: "stage-error-f79c4049:read-tickStatus"
    description:
      zh: >
          读取方 tickStatus
          
      en: >
          reader tickStatus
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.api.control
    from_api: "rpc:stage-error-f79c4049:read-step"
    label: {zh: "读 stageError", en: "read stageError"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:stage-error-f79c4049:read-__snapshot"
    label: {zh: "读 stageError", en: "read stageError"}
  - kind: dataflow
    to: truman-town-flow.code.agent.decision.contention
    from_api: "rpc:stage-error-f79c4049:read-snapshot"
    label: {zh: "读 stageError", en: "read stageError"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.loop
    from_api: "rpc:stage-error-f79c4049:read-tickStatus"
    label: {zh: "读 stageError", en: "read stageError"}
---
