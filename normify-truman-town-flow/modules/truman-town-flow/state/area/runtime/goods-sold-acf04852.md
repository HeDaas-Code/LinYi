---
uid: b259a8b9
id: truman-town-flow.state.area.runtime.goods-sold-acf04852
parent: truman-town-flow.state.area.runtime
name: {zh: "goodsSold", en: "goodsSold"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:108。写入方 3 个、读取方 3 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:108; writers=3, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:01.640Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "goods-sold-acf04852:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "goods-sold-acf04852:write-runIndustry"
    description:
      zh: >
          写入方 runIndustry（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runIndustry
          
  - protocol: rpc
    path: "goods-sold-acf04852:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "goods-sold-acf04852:read-foundConditionsFor"
    description:
      zh: >
          读取方 foundConditionsFor
          
      en: >
          reader foundConditionsFor
          
  - protocol: rpc
    path: "goods-sold-acf04852:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
  - protocol: rpc
    path: "goods-sold-acf04852:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:goods-sold-acf04852:read-foundConditionsFor"
    label: {zh: "读 goodsSold", en: "read goodsSold"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:goods-sold-acf04852:read-summary"
    label: {zh: "读 goodsSold", en: "read goodsSold"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:goods-sold-acf04852:read-__snapshot"
    label: {zh: "读 goodsSold", en: "read goodsSold"}
---
