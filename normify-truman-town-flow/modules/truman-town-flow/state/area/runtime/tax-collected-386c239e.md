---
uid: 9d286f89
id: truman-town-flow.state.area.runtime.tax-collected-386c239e
parent: truman-town-flow.state.area.runtime
name: {zh: "taxCollected", en: "taxCollected"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:104。写入方 3 个、读取方 3 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:104; writers=3, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:05.231Z"
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
    path: "tax-collected-386c239e:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
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
          
  - protocol: rpc
    path: "tax-collected-386c239e:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:tax-collected-386c239e:read-runFiscal"
    label: {zh: "读 taxCollected", en: "read taxCollected"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:tax-collected-386c239e:read-summary"
    label: {zh: "读 taxCollected", en: "read taxCollected"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:tax-collected-386c239e:read-__snapshot"
    label: {zh: "读 taxCollected", en: "read taxCollected"}
---
