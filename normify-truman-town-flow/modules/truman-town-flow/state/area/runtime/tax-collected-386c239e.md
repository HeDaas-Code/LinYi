---
uid: 9d286f89
id: truman-town-flow.state.area.runtime.tax-collected-386c239e
parent: truman-town-flow.state.area.runtime
name: {zh: "taxCollected", en: "taxCollected"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:94。写入方 2 个、读取方 2 个；已纳入复位。
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:94; writers=2, readers=2
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "tax-collected-386c239e:write.seed"
    description:
      zh: >
          写入方 seed
      en: >
          writer seed
  - protocol: rpc
    path: "tax-collected-386c239e:write.runFiscal"
    description:
      zh: >
          写入方 runFiscal
      en: >
          writer runFiscal
  - protocol: rpc
    path: "tax-collected-386c239e:read.runFiscal"
    description:
      zh: >
          读取方 runFiscal
      en: >
          reader runFiscal
  - protocol: rpc
    path: "tax-collected-386c239e:read.summary"
    description:
      zh: >
          读取方 summary
      en: >
          reader summary
---
