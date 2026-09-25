---
uid: ad1d7780
id: truman-town-flow.state.area.runtime.children-born-70a37a36
parent: truman-town-flow.state.area.runtime
name: {zh: "childrenBorn", en: "childrenBorn"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:77。写入方 2 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:77; writers=2, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:36.897Z"
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
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:children-born-70a37a36:read-runProcreation"
    label: {zh: "读 childrenBorn", en: "read childrenBorn"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:children-born-70a37a36:read-summary"
    label: {zh: "读 childrenBorn", en: "read childrenBorn"}
---
