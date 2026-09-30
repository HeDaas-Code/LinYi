---
uid: bd66f4c3
id: truman-town-flow.state.area.runtime.restarts-0484992f
parent: truman-town-flow.state.area.runtime
name: {zh: "restarts", en: "restarts"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage3.js:45。写入方 3 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage3.js:45; writers=3, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:09.000Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "restarts-0484992f:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "restarts-0484992f:write-runCivilization"
    description:
      zh: >
          写入方 runCivilization（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer runCivilization
          
  - protocol: rpc
    path: "restarts-0484992f:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "restarts-0484992f:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
  - protocol: rpc
    path: "restarts-0484992f:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:restarts-0484992f:read-summary"
    label: {zh: "读 restarts", en: "read restarts"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:restarts-0484992f:read-__snapshot"
    label: {zh: "读 restarts", en: "read restarts"}
---
