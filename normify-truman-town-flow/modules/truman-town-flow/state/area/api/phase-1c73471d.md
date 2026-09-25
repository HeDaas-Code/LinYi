---
uid: d56716d2
id: truman-town-flow.state.area.api.phase-1c73471d
parent: truman-town-flow.state.area.api
name: {zh: "phase", en: "phase"}
description:
  zh: >
      string 类型，声明于 src/api/control.js:24。写入方 2 个、读取方 2 个；已纳入复位。
  en: >
      string declared at src/api/control.js:24; writers=2, readers=2
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "phase-1c73471d:write.start"
    description:
      zh: >
          写入方 start
      en: >
          writer start
  - protocol: rpc
    path: "phase-1c73471d:write.pause"
    description:
      zh: >
          写入方 pause
      en: >
          writer pause
  - protocol: rpc
    path: "phase-1c73471d:read.status"
    description:
      zh: >
          读取方 status
      en: >
          reader status
  - protocol: rpc
    path: "phase-1c73471d:read.start"
    description:
      zh: >
          读取方 start
      en: >
          reader start
---
