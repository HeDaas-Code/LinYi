---
uid: 5a8765f0
id: truman-town-flow.state.area.runtime.current-seed-ffaa622b
parent: truman-town-flow.state.area.runtime
name: {zh: "currentSeed", en: "currentSeed"}
description:
  zh: >
      string 类型，声明于 src/runtime/orchestrator/loop.js:145。写入方 1 个、读取方 2 个；已纳入复位。
  en: >
      string declared at src/runtime/orchestrator/loop.js:145; writers=1, readers=2
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "current-seed-ffaa622b:write.run"
    description:
      zh: >
          写入方 run
      en: >
          writer run
  - protocol: rpc
    path: "current-seed-ffaa622b:read.seedAgentScheduleRoles"
    description:
      zh: >
          读取方 seedAgentScheduleRoles
      en: >
          reader seedAgentScheduleRoles
  - protocol: rpc
    path: "current-seed-ffaa622b:read.decide"
    description:
      zh: >
          读取方 decide
      en: >
          reader decide
---
