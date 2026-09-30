---
uid: e2ec8d86
id: truman-town-flow.state.area.runtime.scarce-ticks-088efc14
parent: truman-town-flow.state.area.runtime
name: {zh: "scarceTicks", en: "scarceTicks"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage3.js:30。写入方 3 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage3.js:30; writers=3, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:09.000Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "scarce-ticks-088efc14:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "scarce-ticks-088efc14:write-runCivilization"
    description:
      zh: >
          写入方 runCivilization（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer runCivilization
          
  - protocol: rpc
    path: "scarce-ticks-088efc14:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "scarce-ticks-088efc14:read-runCivilization"
    description:
      zh: >
          读取方 runCivilization
          
      en: >
          reader runCivilization
          
  - protocol: rpc
    path: "scarce-ticks-088efc14:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage3
    from_api: "rpc:scarce-ticks-088efc14:read-runCivilization"
    label: {zh: "读 scarceTicks", en: "read scarceTicks"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:scarce-ticks-088efc14:read-__snapshot"
    label: {zh: "读 scarceTicks", en: "read scarceTicks"}
---
