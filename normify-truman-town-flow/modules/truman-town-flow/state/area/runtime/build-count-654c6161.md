---
uid: fc62a753
id: truman-town-flow.state.area.runtime.build-count-654c6161
parent: truman-town-flow.state.area.runtime
name: {zh: "buildCount", en: "buildCount"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:82。写入方 2 个、读取方 1 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:82; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:36.897Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "build-count-654c6161:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "build-count-654c6161:write-runCrafting"
    description:
      zh: >
          写入方 runCrafting（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runCrafting
          
  - protocol: rpc
    path: "build-count-654c6161:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:build-count-654c6161:read-summary"
    label: {zh: "读 buildCount", en: "read buildCount"}
---
