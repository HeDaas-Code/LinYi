---
uid: 9fb7a4b4
id: truman-town-flow.state.area.runtime.seeded-39c5dc93
parent: truman-town-flow.state.area.runtime
name: {zh: "seeded", en: "seeded"}
description:
  zh: >
      flag 类型，声明于 src/runtime/orchestrator/_stage3.js:18。写入方 1 个、读取方 1 个；已纳入复位。
      
  en: >
      flag declared at src/runtime/orchestrator/_stage3.js:18; writers=1, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:42.542Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "seeded-39c5dc93:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage3.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "seeded-39c5dc93:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:seeded-39c5dc93:read-summary"
    label: {zh: "读 seeded", en: "read seeded"}
---
