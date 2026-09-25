---
uid: d3ee8504
id: truman-town-flow.state.area.infra.stats-a44339a1
parent: truman-town-flow.state.area.infra
name: {zh: "stats", en: "stats"}
description:
  zh: >
      expr 类型，声明于 src/infra/events/retry.js:23。写入方 0 个、读取方 3 个；已纳入复位。
      
  en: >
      expr declared at src/infra/events/retry.js:23; writers=0, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:35.160Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "stats-a44339a1:read-enqueue"
    description:
      zh: >
          读取方 enqueue
          
      en: >
          reader enqueue
          
  - protocol: rpc
    path: "stats-a44339a1:read-run"
    description:
      zh: >
          读取方 run
          
      en: >
          reader run
          
  - protocol: rpc
    path: "stats-a44339a1:read-getStats"
    description:
      zh: >
          读取方 getStats
          
      en: >
          reader getStats
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.infra.events.retry
    from_api: "rpc:stats-a44339a1:read-enqueue"
    label: {zh: "读 stats", en: "read stats"}
  - kind: dataflow
    to: truman-town-flow.code.infra.events.retry
    from_api: "rpc:stats-a44339a1:read-run"
    label: {zh: "读 stats", en: "read stats"}
  - kind: dataflow
    to: truman-town-flow.code.ai.laya
    from_api: "rpc:stats-a44339a1:read-getStats"
    label: {zh: "读 stats", en: "read stats"}
---
