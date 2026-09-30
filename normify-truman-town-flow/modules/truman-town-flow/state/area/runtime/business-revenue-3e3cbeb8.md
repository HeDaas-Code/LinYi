---
uid: 367aa74d
id: truman-town-flow.state.area.runtime.business-revenue-3e3cbeb8
parent: truman-town-flow.state.area.runtime
name: {zh: "businessRevenue", en: "businessRevenue"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:109。写入方 3 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:109; writers=3, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:58.220Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "business-revenue-3e3cbeb8:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "business-revenue-3e3cbeb8:write-runIndustry"
    description:
      zh: >
          写入方 runIndustry（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runIndustry
          
  - protocol: rpc
    path: "business-revenue-3e3cbeb8:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "business-revenue-3e3cbeb8:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
  - protocol: rpc
    path: "business-revenue-3e3cbeb8:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:business-revenue-3e3cbeb8:read-summary"
    label: {zh: "读 businessRevenue", en: "read businessRevenue"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:business-revenue-3e3cbeb8:read-__snapshot"
    label: {zh: "读 businessRevenue", en: "read businessRevenue"}
---
