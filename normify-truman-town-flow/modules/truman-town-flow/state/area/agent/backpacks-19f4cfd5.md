---
uid: dbccb459
id: truman-town-flow.state.area.agent.backpacks-19f4cfd5
parent: truman-town-flow.state.area.agent
name: {zh: "backpacks", en: "backpacks"}
description:
  zh: >
      map 类型，声明于 src/agent/inventory/backpack.js:19。写入方 2 个、读取方 3 个；已纳入复位。
      
  en: >
      map declared at src/agent/inventory/backpack.js:19; writers=2, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:48.437Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "backpacks-19f4cfd5:write-load"
    description:
      zh: >
          写入方 load（src/agent/inventory/backpack.js）
          
      en: >
          writer load
          
  - protocol: rpc
    path: "backpacks-19f4cfd5:write-__restore"
    description:
      zh: >
          写入方 __restore（src/agent/inventory/backpack.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "backpacks-19f4cfd5:read-load"
    description:
      zh: >
          读取方 load
          
      en: >
          reader load
          
  - protocol: rpc
    path: "backpacks-19f4cfd5:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "backpacks-19f4cfd5:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.inventory.backpack
    from_api: "rpc:backpacks-19f4cfd5:read-load"
    label: {zh: "读 backpacks", en: "read backpacks"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:backpacks-19f4cfd5:read-__snapshot"
    label: {zh: "读 backpacks", en: "read backpacks"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:backpacks-19f4cfd5:read-__restore"
    label: {zh: "读 backpacks", en: "read backpacks"}
---
