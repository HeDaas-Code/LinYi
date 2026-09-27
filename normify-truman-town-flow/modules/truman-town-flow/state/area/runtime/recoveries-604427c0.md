---
uid: 27b92bbe
id: truman-town-flow.state.area.runtime.recoveries-604427c0
parent: truman-town-flow.state.area.runtime
name: {zh: "recoveries", en: "recoveries"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage3.js:39。写入方 3 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage3.js:39; writers=3, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:09.000Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "recoveries-604427c0:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "recoveries-604427c0:write-runPsyche"
    description:
      zh: >
          写入方 runPsyche（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer runPsyche
          
  - protocol: rpc
    path: "recoveries-604427c0:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "recoveries-604427c0:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
  - protocol: rpc
    path: "recoveries-604427c0:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:recoveries-604427c0:read-summary"
    label: {zh: "读 recoveries", en: "read recoveries"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:recoveries-604427c0:read-__snapshot"
    label: {zh: "读 recoveries", en: "read recoveries"}
---
