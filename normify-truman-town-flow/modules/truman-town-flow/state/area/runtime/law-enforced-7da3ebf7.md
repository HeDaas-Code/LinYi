---
uid: 4adbc47d
id: truman-town-flow.state.area.runtime.law-enforced-7da3ebf7
parent: truman-town-flow.state.area.runtime
name: {zh: "lawEnforced", en: "lawEnforced"}
description:
  zh: >
      flag 类型，声明于 src/runtime/orchestrator/_stage3.js:23。写入方 2 个、读取方 1 个；已纳入复位。
  en: >
      flag declared at src/runtime/orchestrator/_stage3.js:23; writers=2, readers=1
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "law-enforced-7da3ebf7:write.seed"
    description:
      zh: >
          写入方 seed
      en: >
          writer seed
  - protocol: rpc
    path: "law-enforced-7da3ebf7:write.runPolitics"
    description:
      zh: >
          写入方 runPolitics
      en: >
          writer runPolitics
  - protocol: rpc
    path: "law-enforced-7da3ebf7:read.runPolitics"
    description:
      zh: >
          读取方 runPolitics
      en: >
          reader runPolitics
---
