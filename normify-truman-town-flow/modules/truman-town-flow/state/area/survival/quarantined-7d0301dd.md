---
uid: 3dc21bf2
id: truman-town-flow.state.area.survival.quarantined-7d0301dd
parent: truman-town-flow.state.area.survival
name: {zh: "quarantined", en: "quarantined"}
description:
  zh: >
      set 类型，声明于 src/survival/health/epidemic.js:14。写入方 2 个、读取方 4 个；已纳入复位。
  en: >
      set declared at src/survival/health/epidemic.js:14; writers=2, readers=4
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "quarantined-7d0301dd:write.quarantine"
    description:
      zh: >
          写入方 quarantine
      en: >
          writer quarantine
  - protocol: rpc
    path: "quarantined-7d0301dd:write.release"
    description:
      zh: >
          写入方 release
      en: >
          writer release
  - protocol: rpc
    path: "quarantined-7d0301dd:read.quarantine"
    description:
      zh: >
          读取方 quarantine
      en: >
          reader quarantine
  - protocol: rpc
    path: "quarantined-7d0301dd:read.isQuarantined"
    description:
      zh: >
          读取方 isQuarantined
      en: >
          reader isQuarantined
  - protocol: rpc
    path: "quarantined-7d0301dd:read.listQuarantined"
    description:
      zh: >
          读取方 listQuarantined
      en: >
          reader listQuarantined
  - protocol: rpc
    path: "quarantined-7d0301dd:read.release"
    description:
      zh: >
          读取方 release
      en: >
          reader release
---
