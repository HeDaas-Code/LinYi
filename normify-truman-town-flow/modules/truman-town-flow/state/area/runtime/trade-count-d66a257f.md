---
uid: 8db9bc1a
id: truman-town-flow.state.area.runtime.trade-count-d66a257f
parent: truman-town-flow.state.area.runtime
name: {zh: "tradeCount", en: "tradeCount"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:80。写入方 3 个、读取方 1 个；已纳入复位。
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:80; writers=3, readers=1
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "trade-count-d66a257f:write.seed"
    description:
      zh: >
          写入方 seed
      en: >
          writer seed
  - protocol: rpc
    path: "trade-count-d66a257f:write.runMarket"
    description:
      zh: >
          写入方 runMarket
      en: >
          writer runMarket
  - protocol: rpc
    path: "trade-count-d66a257f:write.runIndustry"
    description:
      zh: >
          写入方 runIndustry
      en: >
          writer runIndustry
  - protocol: rpc
    path: "trade-count-d66a257f:read.summary"
    description:
      zh: >
          读取方 summary
      en: >
          reader summary
---
