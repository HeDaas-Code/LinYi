---
uid: 9685a3b7
id: truman-town-flow.state.area.runtime.tax-redistributed-0029f027
parent: truman-town-flow.state.area.runtime
name: {zh: "taxRedistributed", en: "taxRedistributed"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:95。写入方 2 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:95; writers=2, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:38.768Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "tax-redistributed-0029f027:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "tax-redistributed-0029f027:write-runFiscal"
    description:
      zh: >
          写入方 runFiscal（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runFiscal
          
  - protocol: rpc
    path: "tax-redistributed-0029f027:read-runFiscal"
    description:
      zh: >
          读取方 runFiscal
          
      en: >
          reader runFiscal
          
  - protocol: rpc
    path: "tax-redistributed-0029f027:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:tax-redistributed-0029f027:read-runFiscal"
    label: {zh: "读 taxRedistributed", en: "read taxRedistributed"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:tax-redistributed-0029f027:read-summary"
    label: {zh: "读 taxRedistributed", en: "read taxRedistributed"}
---
