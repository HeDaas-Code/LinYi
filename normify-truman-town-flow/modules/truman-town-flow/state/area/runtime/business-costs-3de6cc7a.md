---
uid: "537e4708"
id: truman-town-flow.state.area.runtime.business-costs-3de6cc7a
parent: truman-town-flow.state.area.runtime
name: {zh: "businessCosts", en: "businessCosts"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:100。写入方 2 个、读取方 1 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:100; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:36.897Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "business-costs-3de6cc7a:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "business-costs-3de6cc7a:write-runIndustry"
    description:
      zh: >
          写入方 runIndustry（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runIndustry
          
  - protocol: rpc
    path: "business-costs-3de6cc7a:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:business-costs-3de6cc7a:read-summary"
    label: {zh: "读 businessCosts", en: "read businessCosts"}
---
