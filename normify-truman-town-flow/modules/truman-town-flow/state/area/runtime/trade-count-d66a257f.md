---
uid: 8db9bc1a
id: truman-town-flow.state.area.runtime.trade-count-d66a257f
parent: truman-town-flow.state.area.runtime
name: {zh: "tradeCount", en: "tradeCount"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:90。写入方 4 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:90; writers=4, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:05.232Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "trade-count-d66a257f:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "trade-count-d66a257f:write-runMarket"
    description:
      zh: >
          写入方 runMarket（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runMarket
          
  - protocol: rpc
    path: "trade-count-d66a257f:write-runIndustry"
    description:
      zh: >
          写入方 runIndustry（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runIndustry
          
  - protocol: rpc
    path: "trade-count-d66a257f:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "trade-count-d66a257f:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
  - protocol: rpc
    path: "trade-count-d66a257f:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:trade-count-d66a257f:read-summary"
    label: {zh: "读 tradeCount", en: "read tradeCount"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:trade-count-d66a257f:read-__snapshot"
    label: {zh: "读 tradeCount", en: "read tradeCount"}
---
