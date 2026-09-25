---
uid: 3c59a96a
id: truman-town-flow.state.area.civilization.active-b942d96b
parent: truman-town-flow.state.area.civilization
name: {zh: "active", en: "active"}
description:
  zh: >
      map 类型，声明于 src/civilization/tech/research.js:20。写入方 2 个、读取方 4 个；已纳入复位。
  en: >
      map declared at src/civilization/tech/research.js:20; writers=2, readers=4
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "active-b942d96b:write.start"
    description:
      zh: >
          写入方 start
      en: >
          writer start
  - protocol: rpc
    path: "active-b942d96b:write.complete"
    description:
      zh: >
          写入方 complete
      en: >
          writer complete
  - protocol: rpc
    path: "active-b942d96b:read.start"
    description:
      zh: >
          读取方 start
      en: >
          reader start
  - protocol: rpc
    path: "active-b942d96b:read.progress"
    description:
      zh: >
          读取方 progress
      en: >
          reader progress
  - protocol: rpc
    path: "active-b942d96b:read.complete"
    description:
      zh: >
          读取方 complete
      en: >
          reader complete
  - protocol: rpc
    path: "active-b942d96b:read.pending"
    description:
      zh: >
          读取方 pending
      en: >
          reader pending
---
