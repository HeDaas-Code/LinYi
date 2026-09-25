---
uid: 554337d9
id: truman-town-flow.state.area.runtime.resident-energy-used-ba9d6b3f
parent: truman-town-flow.state.area.runtime
name: {zh: "residentEnergyUsed", en: "residentEnergyUsed"}
description:
  zh: >
      number 类型，声明于 src/runtime/orchestrator/_stage2.js:101。写入方 2 个、读取方 1 个；已纳入复位。
  en: >
      number declared at src/runtime/orchestrator/_stage2.js:101; writers=2, readers=1
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "resident-energy-used-ba9d6b3f:write.seed"
    description:
      zh: >
          写入方 seed
      en: >
          writer seed
  - protocol: rpc
    path: "resident-energy-used-ba9d6b3f:write.runIndustry"
    description:
      zh: >
          写入方 runIndustry
      en: >
          writer runIndustry
  - protocol: rpc
    path: "resident-energy-used-ba9d6b3f:read.summary"
    description:
      zh: >
          读取方 summary
      en: >
          reader summary
---
