---
uid: ec4017ad
id: truman-town-flow.state.area.observer.cache-d6a29408
parent: truman-town-flow.state.area.observer
name: {zh: "cache", en: "cache"}
description:
  zh: >
      null 类型，声明于 src/observer/timeline.js:19。写入方 1 个、读取方 1 个；已纳入复位。
      
  en: >
      null declared at src/observer/timeline.js:19; writers=1, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:35.160Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "cache-d6a29408:write-ensure"
    description:
      zh: >
          写入方 ensure（src/observer/timeline.js）
          
      en: >
          writer ensure
          
  - protocol: rpc
    path: "cache-d6a29408:read-ensure"
    description:
      zh: >
          读取方 ensure
          
      en: >
          reader ensure
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.genesis.agent-factory.template
    from_api: "rpc:cache-d6a29408:read-ensure"
    label: {zh: "读 cache", en: "read cache"}
---
