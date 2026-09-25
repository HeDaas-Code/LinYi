---
uid: 25e9ac1f
id: truman-town-flow.state.area.runtime.quarantine-count-01b6f45d
parent: truman-town-flow.state.area.runtime
name: {zh: "quarantineCount", en: "quarantineCount"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:84。写入方 2 个、读取方 1 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:84; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:38.768Z"
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
    path: "quarantine-count-01b6f45d:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:quarantine-count-01b6f45d:read-summary"
    label: {zh: "读 quarantineCount", en: "read quarantineCount"}
---
