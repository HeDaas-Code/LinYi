---
uid: d83cee96
id: truman-town-flow.state.area.runtime.seeded-90201ad2
parent: truman-town-flow.state.area.runtime
name: {zh: "seeded", en: "seeded"}
description:
  zh: >
      flag 类型，声明于 src/runtime/orchestrator/_stage2.js:63。写入方 1 个、读取方 1 个；已纳入复位。
      
  en: >
      flag declared at src/runtime/orchestrator/_stage2.js:63; writers=1, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:38.768Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "seeded-90201ad2:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "seeded-90201ad2:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:seeded-90201ad2:read-summary"
    label: {zh: "读 seeded", en: "read seeded"}
---
