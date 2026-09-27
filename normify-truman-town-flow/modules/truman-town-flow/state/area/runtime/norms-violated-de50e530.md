---
uid: 320273ce
id: truman-town-flow.state.area.runtime.norms-violated-de50e530
parent: truman-town-flow.state.area.runtime
name: {zh: "normsViolated", en: "normsViolated"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage3.js:36。写入方 3 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage3.js:36; writers=3, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:08.999Z"
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
    path: "norms-violated-de50e530:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "norms-violated-de50e530:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
  - protocol: rpc
    path: "norms-violated-de50e530:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:norms-violated-de50e530:read-summary"
    label: {zh: "读 normsViolated", en: "read normsViolated"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:norms-violated-de50e530:read-__snapshot"
    label: {zh: "读 normsViolated", en: "read normsViolated"}
---
