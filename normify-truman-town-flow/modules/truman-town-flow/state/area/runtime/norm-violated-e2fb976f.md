---
uid: 2806f44b
id: truman-town-flow.state.area.runtime.norm-violated-e2fb976f
parent: truman-town-flow.state.area.runtime
name: {zh: "normViolated", en: "normViolated"}
description:
  zh: >
      flag 类型，声明于 src/runtime/orchestrator/_stage3.js:26。写入方 2 个、读取方 1 个；已纳入复位。
  en: >
      flag declared at src/runtime/orchestrator/_stage3.js:26; writers=2, readers=1
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "norm-violated-e2fb976f:write.seed"
    description:
      zh: >
          写入方 seed
      en: >
          writer seed
  - protocol: rpc
    path: "norm-violated-e2fb976f:write.runCulture"
    description:
      zh: >
          写入方 runCulture
      en: >
          writer runCulture
  - protocol: rpc
    path: "norm-violated-e2fb976f:read.runCulture"
    description:
      zh: >
          读取方 runCulture
      en: >
          reader runCulture
---
