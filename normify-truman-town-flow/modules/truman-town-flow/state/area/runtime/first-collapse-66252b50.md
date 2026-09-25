---
uid: cd5eed23
id: truman-town-flow.state.area.runtime.first-collapse-66252b50
parent: truman-town-flow.state.area.runtime
name: {zh: "firstCollapse", en: "firstCollapse"}
description:
  zh: >
      null 类型，声明于 src/runtime/orchestrator/_stage3.js:29。写入方 2 个、读取方 1 个；已纳入复位。
      
  en: >
      null declared at src/runtime/orchestrator/_stage3.js:29; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:40.619Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "first-collapse-66252b50:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "first-collapse-66252b50:write-runCivilization"
    description:
      zh: >
          写入方 runCivilization（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer runCivilization
          
  - protocol: rpc
    path: "first-collapse-66252b50:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:first-collapse-66252b50:read-summary"
    label: {zh: "读 firstCollapse", en: "read firstCollapse"}
---
