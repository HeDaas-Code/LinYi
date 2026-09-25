---
uid: 1170fec1
id: truman-town-flow.state.area.runtime.tasks-79b3964f
parent: truman-town-flow.state.area.runtime
name: {zh: "tasks", en: "tasks"}
description:
  zh: >
      map 类型，声明于 src/runtime/clock.js:14。写入方 1 个、读取方 2 个；已纳入复位。
  en: >
      map declared at src/runtime/clock.js:14; writers=1, readers=2
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "tasks-79b3964f:write.schedule"
    description:
      zh: >
          写入方 schedule
      en: >
          writer schedule
  - protocol: rpc
    path: "tasks-79b3964f:read.tick"
    description:
      zh: >
          读取方 tick
      en: >
          reader tick
  - protocol: rpc
    path: "tasks-79b3964f:read.schedule"
    description:
      zh: >
          读取方 schedule
      en: >
          reader schedule
---
