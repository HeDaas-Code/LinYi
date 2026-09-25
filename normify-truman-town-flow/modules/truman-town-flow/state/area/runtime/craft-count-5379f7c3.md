---
uid: 8ce51b7c
id: truman-town-flow.state.area.runtime.craft-count-5379f7c3
parent: truman-town-flow.state.area.runtime
name: {zh: "craftCount", en: "craftCount"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:81。写入方 2 个、读取方 1 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:81; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:36.897Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "craft-count-5379f7c3:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "craft-count-5379f7c3:write-runCrafting"
    description:
      zh: >
          写入方 runCrafting（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runCrafting
          
  - protocol: rpc
    path: "craft-count-5379f7c3:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:craft-count-5379f7c3:read-summary"
    label: {zh: "读 craftCount", en: "read craftCount"}
---
