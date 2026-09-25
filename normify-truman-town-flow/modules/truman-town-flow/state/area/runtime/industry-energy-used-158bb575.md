---
uid: bc845913
id: truman-town-flow.state.area.runtime.industry-energy-used-158bb575
parent: truman-town-flow.state.area.runtime
name: {zh: "industryEnergyUsed", en: "industryEnergyUsed"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:102。写入方 2 个、读取方 1 个；已纳入复位。
      
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:102; writers=2, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:36.897Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "industry-energy-used-158bb575:write-seed"
    description:
      zh: >
          写入方 seed（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer seed
          
  - protocol: rpc
    path: "industry-energy-used-158bb575:write-runIndustry"
    description:
      zh: >
          写入方 runIndustry（src/runtime/orchestrator/_stage2.js）
          
      en: >
          writer runIndustry
          
  - protocol: rpc
    path: "industry-energy-used-158bb575:read-summary"
    description:
      zh: >
          读取方 summary
          
      en: >
          reader summary
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.stage2
    from_api: "rpc:industry-energy-used-158bb575:read-summary"
    label: {zh: "读 industryEnergyUsed", en: "read industryEnergyUsed"}
---
