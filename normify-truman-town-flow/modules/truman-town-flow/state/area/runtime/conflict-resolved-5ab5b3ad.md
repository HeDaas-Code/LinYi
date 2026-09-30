---
uid: 1450cc63
id: truman-town-flow.state.area.runtime.conflict-resolved-5ab5b3ad
parent: truman-town-flow.state.area.runtime
name: {zh: "conflictResolved", en: "conflictResolved"}
description:
  zh: >
      flag 类型，声明于 src/runtime/orchestrator/_stage3.js:25。写入方 3 个、读取方 2 个；已纳入复位。
      
  en: >
      flag declared at src/runtime/orchestrator/_stage3.js:25; writers=3, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:05.232Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "conflict-resolved-5ab5b3ad:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "conflict-resolved-5ab5b3ad:write-runPolitics"
    description:
      zh: >
          写入方 runPolitics（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer runPolitics
          
  - protocol: rpc
    path: "conflict-resolved-5ab5b3ad:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "conflict-resolved-5ab5b3ad:read-runPolitics"
    description:
      zh: >
          读取方 runPolitics
          
      en: >
          reader runPolitics
          
  - protocol: rpc
    path: "conflict-resolved-5ab5b3ad:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage3
    from_api: "rpc:conflict-resolved-5ab5b3ad:read-runPolitics"
    label: {zh: "读 conflictResolved", en: "read conflictResolved"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:conflict-resolved-5ab5b3ad:read-__snapshot"
    label: {zh: "读 conflictResolved", en: "read conflictResolved"}
---
