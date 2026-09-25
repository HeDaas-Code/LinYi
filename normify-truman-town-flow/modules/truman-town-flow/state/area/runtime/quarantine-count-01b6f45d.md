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
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "quarantine-count-01b6f45d:write.seed"
    description:
      zh: >
          写入方 seed
      en: >
          writer seed
  - protocol: rpc
    path: "quarantine-count-01b6f45d:write.runHealth"
    description:
      zh: >
          写入方 runHealth
      en: >
          writer runHealth
  - protocol: rpc
    path: "quarantine-count-01b6f45d:read.summary"
    description:
      zh: >
          读取方 summary
      en: >
          reader summary
---
