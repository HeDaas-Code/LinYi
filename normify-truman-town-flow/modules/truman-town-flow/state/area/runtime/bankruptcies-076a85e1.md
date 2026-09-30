---
uid: 47df1509
id: truman-town-flow.state.area.runtime.bankruptcies-076a85e1
parent: truman-town-flow.state.area.runtime
name: {zh: "bankruptcies", en: "bankruptcies"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:101。写入方 3 个、读取方 3 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:101; writers=3, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:58.220Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "bankruptcies-076a85e1:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "bankruptcies-076a85e1:write-runIndustry"
    description:
      zh: >
          写入方 runIndustry（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runIndustry
          
  - protocol: rpc
    path: "bankruptcies-076a85e1:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "bankruptcies-076a85e1:read-runIndustry"
    description:
      zh: >
          读取方 runIndustry
          
      en: >
          reader runIndustry
          
  - protocol: rpc
    path: "bankruptcies-076a85e1:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
  - protocol: rpc
    path: "bankruptcies-076a85e1:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:bankruptcies-076a85e1:read-runIndustry"
    label: {zh: "读 bankruptcies", en: "read bankruptcies"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:bankruptcies-076a85e1:read-summary"
    label: {zh: "读 bankruptcies", en: "read bankruptcies"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:bankruptcies-076a85e1:read-__snapshot"
    label: {zh: "读 bankruptcies", en: "read bankruptcies"}
---
