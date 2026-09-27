---
uid: 0d0aa7f2
id: truman-town-flow.state.area.runtime.faction-b-2d4cd191
parent: truman-town-flow.state.area.runtime
name: {zh: "factionB", en: "factionB"}
description:
  zh: >
      null 类型，声明于 src/runtime/orchestrator/_stage3.js:20。写入方 2 个、读取方 2 个；已纳入复位。
      
  en: >
      null declared at src/runtime/orchestrator/_stage3.js:20; writers=2, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:08.999Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "faction-b-2d4cd191:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "faction-b-2d4cd191:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "faction-b-2d4cd191:read-runPolitics"
    description:
      zh: >
          读取方 runPolitics
          
      en: >
          reader runPolitics
          
  - protocol: rpc
    path: "faction-b-2d4cd191:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage3
    from_api: "rpc:faction-b-2d4cd191:read-runPolitics"
    label: {zh: "读 factionB", en: "read factionB"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:faction-b-2d4cd191:read-__snapshot"
    label: {zh: "读 factionB", en: "read factionB"}
---
