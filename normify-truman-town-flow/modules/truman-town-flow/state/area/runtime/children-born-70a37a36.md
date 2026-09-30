---
uid: ad1d7780
id: truman-town-flow.state.area.runtime.children-born-70a37a36
parent: truman-town-flow.state.area.runtime
name: {zh: "childrenBorn", en: "childrenBorn"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:87。写入方 3 个、读取方 4 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:87; writers=3, readers=4
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:58.221Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "children-born-70a37a36:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "children-born-70a37a36:write-runProcreation"
    description:
      zh: >
          写入方 runProcreation（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runProcreation
          
  - protocol: rpc
    path: "children-born-70a37a36:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "children-born-70a37a36:read-runProcreation"
    description:
      zh: >
          读取方 runProcreation
          
      en: >
          reader runProcreation
          
  - protocol: rpc
    path: "children-born-70a37a36:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
  - protocol: rpc
    path: "children-born-70a37a36:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "children-born-70a37a36:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:children-born-70a37a36:read-runProcreation"
    label: {zh: "读 childrenBorn", en: "read childrenBorn"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:children-born-70a37a36:read-summary"
    label: {zh: "读 childrenBorn", en: "read childrenBorn"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:children-born-70a37a36:read-__snapshot"
    label: {zh: "读 childrenBorn", en: "read childrenBorn"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:children-born-70a37a36:read-__restore"
    label: {zh: "读 childrenBorn", en: "read childrenBorn"}
---
