---
uid: 25e9ac1f
id: truman-town-flow.state.area.runtime.quarantine-count-01b6f45d
parent: truman-town-flow.state.area.runtime
name: {zh: "quarantineCount", en: "quarantineCount"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:94。写入方 3 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:94; writers=3, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:01.640Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "quarantine-count-01b6f45d:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "quarantine-count-01b6f45d:write-runHealth"
    description:
      zh: >
          写入方 runHealth（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runHealth
          
  - protocol: rpc
    path: "quarantine-count-01b6f45d:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "quarantine-count-01b6f45d:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
  - protocol: rpc
    path: "quarantine-count-01b6f45d:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:quarantine-count-01b6f45d:read-summary"
    label: {zh: "读 quarantineCount", en: "read quarantineCount"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:quarantine-count-01b6f45d:read-__snapshot"
    label: {zh: "读 quarantineCount", en: "read quarantineCount"}
---
