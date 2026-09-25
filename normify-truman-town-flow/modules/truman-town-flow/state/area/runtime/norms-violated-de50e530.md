---
uid: 320273ce
id: truman-town-flow.state.area.runtime.norms-violated-de50e530
parent: truman-town-flow.state.area.runtime
name: {zh: "normsViolated", en: "normsViolated"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage3.js:36。写入方 2 个、读取方 1 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage3.js:36; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:40.619Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "norms-violated-de50e530:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "norms-violated-de50e530:write-runCulture"
    description:
      zh: >
          写入方 runCulture（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer runCulture
          
  - protocol: rpc
    path: "norms-violated-de50e530:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:norms-violated-de50e530:read-summary"
    label: {zh: "读 normsViolated", en: "read normsViolated"}
---
