---
uid: 4628fba1
id: truman-town-flow.state.area.agent.items-fc8d8f4b
parent: truman-town-flow.state.area.agent
name: {zh: "items", en: "items"}
description:
  zh: >
      map 类型，声明于 src/agent/inventory/item.js:12。写入方 2 个、读取方 3 个；已纳入复位。
      
  en: >
      map declared at src/agent/inventory/item.js:12; writers=2, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:48.437Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "items-fc8d8f4b:write-define"
    description:
      zh: >
          写入方 define（src/agent/inventory/item.js）
          
      en: >
          writer define
          
  - protocol: rpc
    path: "items-fc8d8f4b:write-__restore"
    description:
      zh: >
          写入方 __restore（src/agent/inventory/item.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "items-fc8d8f4b:read-query"
    description:
      zh: >
          读取方 query
          
      en: >
          reader query
          
  - protocol: rpc
    path: "items-fc8d8f4b:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "items-fc8d8f4b:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:items-fc8d8f4b:read-query"
    label: {zh: "读 items", en: "read items"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:items-fc8d8f4b:read-__snapshot"
    label: {zh: "读 items", en: "read items"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:items-fc8d8f4b:read-__restore"
    label: {zh: "读 items", en: "read items"}
---
