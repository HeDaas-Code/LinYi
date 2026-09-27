---
uid: 77f70dd8
id: truman-town-flow.state.area.runtime.stage-failure-94c90399
parent: truman-town-flow.state.area.runtime
name: {zh: "stageFailure", en: "stageFailure"}
description:
  zh: >
      null 类型，声明于 src/runtime/orchestrator/loop.js:173。写入方 2 个、读取方 3 个；已纳入复位。
      
  en: >
      null declared at src/runtime/orchestrator/loop.js:173; writers=2, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:12.668Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "stage-failure-94c90399:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/loop.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "stage-failure-94c90399:write-markRestored"
    description:
      zh: >
          写入方 markRestored（src/runtime/orchestrator/loop.js）
          
      en: >
          writer markRestored
          
  - protocol: rpc
    path: "stage-failure-94c90399:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "stage-failure-94c90399:read-snapshot"
    description:
      zh: >
          读取方 snapshot
          
      en: >
          reader snapshot
          
  - protocol: rpc
    path: "stage-failure-94c90399:read-tickStatus"
    description:
      zh: >
          读取方 tickStatus
          
      en: >
          reader tickStatus
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:stage-failure-94c90399:read-__snapshot"
    label: {zh: "读 stageFailure", en: "read stageFailure"}
  - kind: dataflow
    to: truman-town-flow.code.agent.decision.contention
    from_api: "rpc:stage-failure-94c90399:read-snapshot"
    label: {zh: "读 stageFailure", en: "read stageFailure"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.loop
    from_api: "rpc:stage-failure-94c90399:read-tickStatus"
    label: {zh: "读 stageFailure", en: "read stageFailure"}
---
