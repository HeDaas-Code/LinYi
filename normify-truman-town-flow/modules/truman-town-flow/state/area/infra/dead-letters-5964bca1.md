---
uid: c13a600c
id: truman-town-flow.state.area.infra.dead-letters-5964bca1
parent: truman-town-flow.state.area.infra
name: {zh: "deadLetters", en: "deadLetters"}
description:
  zh: >
      array 类型，声明于 src/infra/events/retry.js:22。写入方 2 个、读取方 5 个；已纳入复位。
      
  en: >
      array declared at src/infra/events/retry.js:22; writers=2, readers=5
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:54.967Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "dead-letters-5964bca1:write-run"
    description:
      zh: >
          写入方 run（src/infra/events/retry.js）
          
      en: >
          writer run
          
  - protocol: rpc
    path: "dead-letters-5964bca1:write-__restore"
    description:
      zh: >
          写入方 __restore（src/infra/events/retry.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "dead-letters-5964bca1:read-run"
    description:
      zh: >
          读取方 run
          
      en: >
          reader run
          
  - protocol: rpc
    path: "dead-letters-5964bca1:read-dead"
    description:
      zh: >
          读取方 dead
          
      en: >
          reader dead
          
  - protocol: rpc
    path: "dead-letters-5964bca1:read-getStats"
    description:
      zh: >
          读取方 getStats
          
      en: >
          reader getStats
          
  - protocol: rpc
    path: "dead-letters-5964bca1:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "dead-letters-5964bca1:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.infra.events.retry
    from_api: "rpc:dead-letters-5964bca1:read-run"
    label: {zh: "读 deadLetters", en: "read deadLetters"}
  - kind: dataflow
    to: truman-town-flow.code.infra.events.retry
    from_api: "rpc:dead-letters-5964bca1:read-dead"
    label: {zh: "读 deadLetters", en: "read deadLetters"}
  - kind: dataflow
    to: truman-town-flow.code.ai.laya
    from_api: "rpc:dead-letters-5964bca1:read-getStats"
    label: {zh: "读 deadLetters", en: "read deadLetters"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:dead-letters-5964bca1:read-__snapshot"
    label: {zh: "读 deadLetters", en: "read deadLetters"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:dead-letters-5964bca1:read-__restore"
    label: {zh: "读 deadLetters", en: "read deadLetters"}
---
