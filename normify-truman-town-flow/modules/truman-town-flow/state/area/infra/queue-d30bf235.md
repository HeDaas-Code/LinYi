---
uid: d85bdd05
id: truman-town-flow.state.area.infra.queue-d30bf235
parent: truman-town-flow.state.area.infra
name: {zh: "queue", en: "queue"}
description:
  zh: >
      map 类型，声明于 src/infra/events/retry.js:20。写入方 3 个、读取方 6 个；已纳入复位。
      
  en: >
      map declared at src/infra/events/retry.js:20; writers=3, readers=6
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:54.967Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "queue-d30bf235:write-enqueue"
    description:
      zh: >
          写入方 enqueue（src/infra/events/retry.js）
          
      en: >
          writer enqueue
          
  - protocol: rpc
    path: "queue-d30bf235:write-run"
    description:
      zh: >
          写入方 run（src/infra/events/retry.js）
          
      en: >
          writer run
          
  - protocol: rpc
    path: "queue-d30bf235:write-__restore"
    description:
      zh: >
          写入方 __restore（src/infra/events/retry.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "queue-d30bf235:read-enqueue"
    description:
      zh: >
          读取方 enqueue
          
      en: >
          reader enqueue
          
  - protocol: rpc
    path: "queue-d30bf235:read-run"
    description:
      zh: >
          读取方 run
          
      en: >
          reader run
          
  - protocol: rpc
    path: "queue-d30bf235:read-pending"
    description:
      zh: >
          读取方 pending
          
      en: >
          reader pending
          
  - protocol: rpc
    path: "queue-d30bf235:read-getStats"
    description:
      zh: >
          读取方 getStats
          
      en: >
          reader getStats
          
  - protocol: rpc
    path: "queue-d30bf235:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "queue-d30bf235:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.infra.events.retry
    from_api: "rpc:queue-d30bf235:read-enqueue"
    label: {zh: "读 queue", en: "read queue"}
  - kind: dataflow
    to: truman-town-flow.code.infra.events.retry
    from_api: "rpc:queue-d30bf235:read-run"
    label: {zh: "读 queue", en: "read queue"}
  - kind: dataflow
    to: truman-town-flow.code.civilization.tech.research
    from_api: "rpc:queue-d30bf235:read-pending"
    label: {zh: "读 queue", en: "read queue"}
  - kind: dataflow
    to: truman-town-flow.code.ai.laya
    from_api: "rpc:queue-d30bf235:read-getStats"
    label: {zh: "读 queue", en: "read queue"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:queue-d30bf235:read-__snapshot"
    label: {zh: "读 queue", en: "read queue"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:queue-d30bf235:read-__restore"
    label: {zh: "读 queue", en: "read queue"}
---
