---
uid: 4f234966
id: truman-town-flow.state.area.runtime.breakdowns-d0633c4b
parent: truman-town-flow.state.area.runtime
name: {zh: "breakdowns", en: "breakdowns"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage3.js:38。写入方 3 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage3.js:38; writers=3, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:05.232Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "breakdowns-d0633c4b:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "breakdowns-d0633c4b:write-runPsyche"
    description:
      zh: >
          写入方 runPsyche（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer runPsyche
          
  - protocol: rpc
    path: "breakdowns-d0633c4b:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "breakdowns-d0633c4b:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
  - protocol: rpc
    path: "breakdowns-d0633c4b:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:breakdowns-d0633c4b:read-summary"
    label: {zh: "读 breakdowns", en: "read breakdowns"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:breakdowns-d0633c4b:read-__snapshot"
    label: {zh: "读 breakdowns", en: "read breakdowns"}
---
