---
uid: 9685a3b7
id: truman-town-flow.state.area.runtime.tax-redistributed-0029f027
parent: truman-town-flow.state.area.runtime
name: {zh: "taxRedistributed", en: "taxRedistributed"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:105。写入方 3 个、读取方 3 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:105; writers=3, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:05.231Z"
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
    path: "tax-redistributed-0029f027:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
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
          
  - protocol: rpc
    path: "tax-redistributed-0029f027:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:tax-redistributed-0029f027:read-runFiscal"
    label: {zh: "读 taxRedistributed", en: "read taxRedistributed"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:tax-redistributed-0029f027:read-summary"
    label: {zh: "读 taxRedistributed", en: "read taxRedistributed"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:tax-redistributed-0029f027:read-__snapshot"
    label: {zh: "读 taxRedistributed", en: "read taxRedistributed"}
---
