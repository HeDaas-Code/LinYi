---
uid: 98f2c168
id: truman-town-flow.state.area.infra.counter-d8b78ddd
parent: truman-town-flow.state.area.infra
name: {zh: "counter", en: "counter"}
description:
  zh: >
      number 类型，声明于 src/infra/identity.js:9。写入方 2 个、读取方 3 个；已纳入复位。
      
  en: >
      number declared at src/infra/identity.js:9; writers=2, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:54.967Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "counter-d8b78ddd:write-next"
    description:
      zh: >
          写入方 next（src/infra/identity.js）
          
      en: >
          writer next
          
  - protocol: rpc
    path: "counter-d8b78ddd:write-__restore"
    description:
      zh: >
          写入方 __restore（src/infra/identity.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "counter-d8b78ddd:read-next"
    description:
      zh: >
          读取方 next
          
      en: >
          reader next
          
  - protocol: rpc
    path: "counter-d8b78ddd:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "counter-d8b78ddd:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.infra.identity
    from_api: "rpc:counter-d8b78ddd:read-next"
    label: {zh: "读 counter", en: "read counter"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:counter-d8b78ddd:read-__snapshot"
    label: {zh: "读 counter", en: "read counter"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:counter-d8b78ddd:read-__restore"
    label: {zh: "读 counter", en: "read counter"}
---
