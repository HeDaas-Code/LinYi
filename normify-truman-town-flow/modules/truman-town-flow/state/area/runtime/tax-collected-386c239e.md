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
updated_at: "2026-09-25T17:26:38.768Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "tax-collected-386c239e:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "tax-collected-386c239e:write-runFiscal"
    description:
      zh: >
          写入方 runFiscal（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runFiscal
          
  - protocol: rpc
    path: "tax-collected-386c239e:read-runFiscal"
    description:
      zh: >
          读取方 runFiscal
          
      en: >
          reader runFiscal
          
  - protocol: rpc
    path: "tax-collected-386c239e:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:tax-collected-386c239e:read-runFiscal"
    label: {zh: "读 taxCollected", en: "read taxCollected"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:tax-collected-386c239e:read-summary"
    label: {zh: "读 taxCollected", en: "read taxCollected"}
---
