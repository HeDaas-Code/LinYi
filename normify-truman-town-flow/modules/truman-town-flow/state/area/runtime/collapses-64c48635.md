---
uid: ea367762
id: truman-town-flow.state.area.runtime.collapses-64c48635
parent: truman-town-flow.state.area.runtime
name: {zh: "collapses", en: "collapses"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage3.js:44。写入方 2 个、读取方 1 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage3.js:44; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:40.619Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "collapses-64c48635:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "collapses-64c48635:write-runCivilization"
    description:
      zh: >
          写入方 runCivilization（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer runCivilization
          
  - protocol: rpc
    path: "collapses-64c48635:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:collapses-64c48635:read-summary"
    label: {zh: "读 collapses", en: "read collapses"}
---
