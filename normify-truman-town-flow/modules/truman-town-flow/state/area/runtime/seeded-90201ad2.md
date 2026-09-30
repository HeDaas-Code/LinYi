---
uid: d83cee96
id: truman-town-flow.state.area.runtime.seeded-90201ad2
parent: truman-town-flow.state.area.runtime
name: {zh: "seeded", en: "seeded"}
description:
  zh: >
      flag 类型，声明于 src/runtime/orchestrator/_stage2.js:73。写入方 2 个、读取方 3 个；已纳入复位。
      
  en: >
      flag declared at src/runtime/orchestrator/_stage2.js:73; writers=2, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:05.231Z"
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
    path: "seeded-90201ad2:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "seeded-90201ad2:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
  - protocol: rpc
    path: "seeded-90201ad2:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "seeded-90201ad2:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:seeded-90201ad2:read-summary"
    label: {zh: "读 seeded", en: "read seeded"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:seeded-90201ad2:read-__snapshot"
    label: {zh: "读 seeded", en: "read seeded"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:seeded-90201ad2:read-__restore"
    label: {zh: "读 seeded", en: "read seeded"}
---
