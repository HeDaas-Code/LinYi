---
uid: 2db251ff
id: truman-town-flow.state.area.runtime.pending-courts-3dc80871
parent: truman-town-flow.state.area.runtime
name: {zh: "pendingCourts", en: "pendingCourts"}
description:
  zh: >
      map 类型，声明于 src/runtime/orchestrator/_stage2.js:73。写入方 1 个、读取方 2 个；已纳入复位。
  en: >
      map declared at src/runtime/orchestrator/_stage2.js:73; writers=1, readers=2
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "pending-courts-3dc80871:write.performAgentAction"
    description:
      zh: >
          写入方 performAgentAction
      en: >
          writer performAgentAction
  - protocol: rpc
    path: "pending-courts-3dc80871:read.candidateStateFor"
    description:
      zh: >
          读取方 candidateStateFor
      en: >
          reader candidateStateFor
  - protocol: rpc
    path: "pending-courts-3dc80871:read.performAgentAction"
    description:
      zh: >
          读取方 performAgentAction
      en: >
          reader performAgentAction
---
