---
uid: a296071b
id: truman-town-flow.state.area.survival.residents-99016ca8
parent: truman-town-flow.state.area.survival
name: {zh: "residents", en: "residents"}
description:
  zh: >
      map 类型，声明于 src/survival/needs/meter.js:15。写入方 1 个、读取方 2 个；已纳入复位。
      
  en: >
      map declared at src/survival/needs/meter.js:15; writers=1, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:44.509Z"
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
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.inventory.backpack
    from_api: "rpc:residents-99016ca8:read-load"
    label: {zh: "读 residents", en: "read residents"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:residents-99016ca8:read-query"
    label: {zh: "读 residents", en: "read residents"}
---
