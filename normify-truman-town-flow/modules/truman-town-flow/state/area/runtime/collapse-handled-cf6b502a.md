---
uid: 38a05af4
id: truman-town-flow.state.area.runtime.collapse-handled-cf6b502a
parent: truman-town-flow.state.area.runtime
name: {zh: "collapseHandled", en: "collapseHandled"}
description:
  zh: >
      flag 类型，声明于 src/runtime/orchestrator/_stage3.js:28。写入方 3 个、读取方 2 个；已纳入复位。
      
  en: >
      flag declared at src/runtime/orchestrator/_stage3.js:28; writers=3, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:05.232Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "collapse-handled-cf6b502a:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "collapse-handled-cf6b502a:write-runCivilization"
    description:
      zh: >
          写入方 runCivilization（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer runCivilization
          
  - protocol: rpc
    path: "collapse-handled-cf6b502a:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "collapse-handled-cf6b502a:read-runCivilization"
    description:
      zh: >
          读取方 runCivilization
          
      en: >
          reader runCivilization
          
  - protocol: rpc
    path: "collapse-handled-cf6b502a:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage3
    from_api: "rpc:collapse-handled-cf6b502a:read-runCivilization"
    label: {zh: "读 collapseHandled", en: "read collapseHandled"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:collapse-handled-cf6b502a:read-__snapshot"
    label: {zh: "读 collapseHandled", en: "read collapseHandled"}
---
