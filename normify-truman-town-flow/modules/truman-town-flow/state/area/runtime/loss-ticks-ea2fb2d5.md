---
uid: 358ed09c
id: truman-town-flow.state.area.runtime.loss-ticks-ea2fb2d5
parent: truman-town-flow.state.area.runtime
name: {zh: "lossTicks", en: "lossTicks"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:113。写入方 3 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:113; writers=3, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:01.640Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "loss-ticks-ea2fb2d5:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "loss-ticks-ea2fb2d5:write-runIndustry"
    description:
      zh: >
          写入方 runIndustry（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runIndustry
          
  - protocol: rpc
    path: "loss-ticks-ea2fb2d5:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "loss-ticks-ea2fb2d5:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
  - protocol: rpc
    path: "loss-ticks-ea2fb2d5:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:loss-ticks-ea2fb2d5:read-summary"
    label: {zh: "读 lossTicks", en: "read lossTicks"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:loss-ticks-ea2fb2d5:read-__snapshot"
    label: {zh: "读 lossTicks", en: "read lossTicks"}
---
