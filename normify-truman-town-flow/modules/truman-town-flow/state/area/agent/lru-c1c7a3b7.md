---
uid: 1403928c
id: truman-town-flow.state.area.agent.lru-c1c7a3b7
parent: truman-town-flow.state.area.agent
name: {zh: "lru", en: "lru"}
description:
  zh: >
      map 类型，声明于 src/agent/decision/outcome-model.js:35。写入方 2 个、读取方 3 个；已纳入复位。
      
  en: >
      map declared at src/agent/decision/outcome-model.js:35; writers=2, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:48.437Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "lru-c1c7a3b7:write-touch"
    description:
      zh: >
          写入方 touch（src/agent/decision/outcome-model.js）
          
      en: >
          writer touch
          
  - protocol: rpc
    path: "lru-c1c7a3b7:write-__restore"
    description:
      zh: >
          写入方 __restore（src/agent/decision/outcome-model.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "lru-c1c7a3b7:read-touch"
    description:
      zh: >
          读取方 touch
          
      en: >
          reader touch
          
  - protocol: rpc
    path: "lru-c1c7a3b7:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "lru-c1c7a3b7:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.decision.outcome-model
    from_api: "rpc:lru-c1c7a3b7:read-touch"
    label: {zh: "读 lru", en: "read lru"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:lru-c1c7a3b7:read-__snapshot"
    label: {zh: "读 lru", en: "read lru"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:lru-c1c7a3b7:read-__restore"
    label: {zh: "读 lru", en: "read lru"}
---
