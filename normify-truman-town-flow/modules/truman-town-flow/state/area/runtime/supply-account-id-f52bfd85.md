---
uid: 2686702e
id: truman-town-flow.state.area.runtime.supply-account-id-f52bfd85
parent: truman-town-flow.state.area.runtime
name: {zh: "supplyAccountId", en: "supplyAccountId"}
description:
  zh: >
      null 类型，声明于 src/runtime/orchestrator/_stage2.js:97。写入方 1 个、读取方 4 个；已纳入复位。
      
  en: >
      null declared at src/runtime/orchestrator/_stage2.js:97; writers=1, readers=4
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:38.768Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "supply-account-id-f52bfd85:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "supply-account-id-f52bfd85:read-runIndustry"
    description:
      zh: >
          读取方 runIndustry
          
      en: >
          reader runIndustry
          
  - protocol: rpc
    path: "supply-account-id-f52bfd85:read-runFiscal"
    description:
      zh: >
          读取方 runFiscal
          
      en: >
          reader runFiscal
          
  - protocol: rpc
    path: "supply-account-id-f52bfd85:read-performAgentAction"
    description:
      zh: >
          读取方 performAgentAction
          
      en: >
          reader performAgentAction
          
  - protocol: rpc
    path: "supply-account-id-f52bfd85:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:supply-account-id-f52bfd85:read-runIndustry"
    label: {zh: "读 supplyAccountId", en: "read supplyAccountId"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:supply-account-id-f52bfd85:read-runFiscal"
    label: {zh: "读 supplyAccountId", en: "read supplyAccountId"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:supply-account-id-f52bfd85:read-performAgentAction"
    label: {zh: "读 supplyAccountId", en: "read supplyAccountId"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:supply-account-id-f52bfd85:read-summary"
    label: {zh: "读 supplyAccountId", en: "read supplyAccountId"}
---
