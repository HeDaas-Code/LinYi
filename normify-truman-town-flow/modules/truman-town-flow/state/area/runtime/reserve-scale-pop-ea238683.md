---
uid: ece0cec8
id: truman-town-flow.state.area.runtime.reserve-scale-pop-ea238683
parent: truman-town-flow.state.area.runtime
name: {zh: "reserveScalePop", en: "reserveScalePop"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:1770。写入方 2 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:1770; writers=2, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:05.231Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "reserve-scale-pop-ea238683:write-rescaleReserves"
    description:
      zh: >
          写入方 rescaleReserves（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer rescaleReserves
          
  - protocol: rpc
    path: "reserve-scale-pop-ea238683:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "reserve-scale-pop-ea238683:read-rescaleReserves"
    description:
      zh: >
          读取方 rescaleReserves
          
      en: >
          reader rescaleReserves
          
  - protocol: rpc
    path: "reserve-scale-pop-ea238683:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:reserve-scale-pop-ea238683:read-rescaleReserves"
    label: {zh: "读 reserveScalePop", en: "read reserveScalePop"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:reserve-scale-pop-ea238683:read-__snapshot"
    label: {zh: "读 reserveScalePop", en: "read reserveScalePop"}
---
