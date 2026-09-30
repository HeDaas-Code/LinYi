---
uid: a296071b
id: truman-town-flow.state.area.survival.residents-99016ca8
parent: truman-town-flow.state.area.survival
name: {zh: "residents", en: "residents"}
description:
  zh: >
      map 类型，声明于 src/survival/needs/meter.js:15。写入方 2 个、读取方 4 个；已纳入复位。
      
  en: >
      map declared at src/survival/needs/meter.js:15; writers=2, readers=4
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:16.417Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "residents-99016ca8:write-load"
    description:
      zh: >
          写入方 load（src/survival/needs/meter.js）
          
      en: >
          writer load
          
  - protocol: rpc
    path: "residents-99016ca8:write-__restore"
    description:
      zh: >
          写入方 __restore（src/survival/needs/meter.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "residents-99016ca8:read-load"
    description:
      zh: >
          读取方 load
          
      en: >
          reader load
          
  - protocol: rpc
    path: "residents-99016ca8:read-query"
    description:
      zh: >
          读取方 query
          
      en: >
          reader query
          
  - protocol: rpc
    path: "residents-99016ca8:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "residents-99016ca8:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.inventory.backpack
    from_api: "rpc:residents-99016ca8:read-load"
    label: {zh: "读 residents", en: "read residents"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:residents-99016ca8:read-query"
    label: {zh: "读 residents", en: "read residents"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:residents-99016ca8:read-__snapshot"
    label: {zh: "读 residents", en: "read residents"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:residents-99016ca8:read-__restore"
    label: {zh: "读 residents", en: "read residents"}
---
