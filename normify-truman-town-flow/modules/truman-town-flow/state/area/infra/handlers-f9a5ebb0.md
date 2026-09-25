---
uid: 703a2aa2
id: truman-town-flow.state.area.infra.handlers-f9a5ebb0
parent: truman-town-flow.state.area.infra
name: {zh: "handlers", en: "handlers"}
description:
  zh: >
      map 类型，声明于 src/infra/events/pubsub.js:12。写入方 1 个、读取方 2 个；已纳入复位。
  en: >
      map declared at src/infra/events/pubsub.js:12; writers=1, readers=2
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "handlers-f9a5ebb0:write.subscribe"
    description:
      zh: >
          写入方 subscribe
      en: >
          writer subscribe
  - protocol: rpc
    path: "handlers-f9a5ebb0:read.subscribe"
    description:
      zh: >
          读取方 subscribe
      en: >
          reader subscribe
  - protocol: rpc
    path: "handlers-f9a5ebb0:read.publish"
    description:
      zh: >
          读取方 publish
      en: >
          reader publish
---
