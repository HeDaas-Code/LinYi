---
uid: 431d3956
id: truman-town-flow.state.area.runtime.conflicts-resolved-86cba80a
parent: truman-town-flow.state.area.runtime
name: {zh: "conflictsResolved", en: "conflictsResolved"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage3.js:34。写入方 3 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage3.js:34; writers=3, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:05.232Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "conflicts-resolved-86cba80a:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "conflicts-resolved-86cba80a:write-runPolitics"
    description:
      zh: >
          写入方 runPolitics（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer runPolitics
          
  - protocol: rpc
    path: "conflicts-resolved-86cba80a:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "conflicts-resolved-86cba80a:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
  - protocol: rpc
    path: "conflicts-resolved-86cba80a:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:conflicts-resolved-86cba80a:read-summary"
    label: {zh: "读 conflictsResolved", en: "read conflictsResolved"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:conflicts-resolved-86cba80a:read-__snapshot"
    label: {zh: "读 conflictsResolved", en: "read conflictsResolved"}
---
