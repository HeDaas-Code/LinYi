---
uid: 554337d9
id: truman-town-flow.state.area.runtime.resident-energy-used-ba9d6b3f
parent: truman-town-flow.state.area.runtime
name: {zh: "residentEnergyUsed", en: "residentEnergyUsed"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:111。写入方 3 个、读取方 2 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:111; writers=3, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:05.231Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "resident-energy-used-ba9d6b3f:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "resident-energy-used-ba9d6b3f:write-runIndustry"
    description:
      zh: >
          写入方 runIndustry（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runIndustry
          
  - protocol: rpc
    path: "resident-energy-used-ba9d6b3f:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "resident-energy-used-ba9d6b3f:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
  - protocol: rpc
    path: "resident-energy-used-ba9d6b3f:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:resident-energy-used-ba9d6b3f:read-summary"
    label: {zh: "读 residentEnergyUsed", en: "read residentEnergyUsed"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:resident-energy-used-ba9d6b3f:read-__snapshot"
    label: {zh: "读 residentEnergyUsed", en: "read residentEnergyUsed"}
---
