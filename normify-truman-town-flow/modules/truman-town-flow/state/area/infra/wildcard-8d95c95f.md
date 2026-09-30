---
uid: 0cd78984
id: truman-town-flow.state.area.infra.wildcard-8d95c95f
parent: truman-town-flow.state.area.infra
name: {zh: "wildcard", en: "wildcard"}
description:
  zh: >
      set 类型，声明于 src/infra/events/pubsub.js:14。写入方 1 个、读取方 1 个；已纳入复位。
      
  en: >
      set declared at src/infra/events/pubsub.js:14; writers=1, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:54.967Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "wildcard-8d95c95f:write-subscribe"
    description:
      zh: >
          写入方 subscribe（src/infra/events/pubsub.js）
          
      en: >
          writer subscribe
          
  - protocol: rpc
    path: "wildcard-8d95c95f:read-publish"
    description:
      zh: >
          读取方 publish
          
      en: >
          reader publish
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.infra.events.pubsub
    from_api: "rpc:wildcard-8d95c95f:read-publish"
    label: {zh: "读 wildcard", en: "read wildcard"}
---
