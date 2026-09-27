---
uid: 2686702e
id: truman-town-flow.state.area.runtime.supply-account-id-f52bfd85
parent: truman-town-flow.state.area.runtime
name: {zh: "supplyAccountId", en: "supplyAccountId"}
description:
  zh: >
      null 类型，声明于 src/runtime/orchestrator/_stage2.js:107。写入方 2 个、读取方 6 个；已纳入复位。
      
  en: >
      null declared at src/runtime/orchestrator/_stage2.js:107; writers=2, readers=6
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:05.231Z"
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
    path: "supply-account-id-f52bfd85:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
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
    path: "supply-account-id-f52bfd85:read-candidateStateFor"
    description:
      zh: >
          读取方 candidateStateFor
          
      en: >
          reader candidateStateFor
          
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
          
  - protocol: rpc
    path: "supply-account-id-f52bfd85:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
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
    from_api: "rpc:supply-account-id-f52bfd85:read-candidateStateFor"
    label: {zh: "读 supplyAccountId", en: "read supplyAccountId"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:supply-account-id-f52bfd85:read-performAgentAction"
    label: {zh: "读 supplyAccountId", en: "read supplyAccountId"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:supply-account-id-f52bfd85:read-summary"
    label: {zh: "读 supplyAccountId", en: "read supplyAccountId"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:supply-account-id-f52bfd85:read-__snapshot"
    label: {zh: "读 supplyAccountId", en: "read supplyAccountId"}
---
