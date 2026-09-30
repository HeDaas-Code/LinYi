---
uid: 27bdfeb0
id: truman-town-flow.state.area.runtime.conflict-id-a5df4d18
parent: truman-town-flow.state.area.runtime
name: {zh: "conflictId", en: "conflictId"}
description:
  zh: >
      null 类型，声明于 src/runtime/orchestrator/_stage3.js:24。写入方 3 个、读取方 2 个；已纳入复位。
      
  en: >
      null declared at src/runtime/orchestrator/_stage3.js:24; writers=3, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:05.232Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "conflict-id-a5df4d18:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "conflict-id-a5df4d18:write-runPolitics"
    description:
      zh: >
          写入方 runPolitics（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer runPolitics
          
  - protocol: rpc
    path: "conflict-id-a5df4d18:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "conflict-id-a5df4d18:read-runPolitics"
    description:
      zh: >
          读取方 runPolitics
          
      en: >
          reader runPolitics
          
  - protocol: rpc
    path: "conflict-id-a5df4d18:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage3
    from_api: "rpc:conflict-id-a5df4d18:read-runPolitics"
    label: {zh: "读 conflictId", en: "read conflictId"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:conflict-id-a5df4d18:read-__snapshot"
    label: {zh: "读 conflictId", en: "read conflictId"}
---
