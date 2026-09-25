---
uid: d4b72ec3
id: truman-town-flow.state.area.survival.residents-bf48cede
parent: truman-town-flow.state.area.survival
name: {zh: "residents", en: "residents"}
description:
  zh: >
      map 类型，声明于 src/survival/health/disease.js:19。写入方 1 个、读取方 2 个；已纳入复位。
      
  en: >
      map declared at src/survival/health/disease.js:19; writers=1, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:44.509Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "residents-bf48cede:write-load"
    description:
      zh: >
          写入方 load（src/survival/health/disease.js）
          
      en: >
          writer load
          
  - protocol: rpc
    path: "residents-bf48cede:read-load"
    description:
      zh: >
          读取方 load
          
      en: >
          reader load
          
  - protocol: rpc
    path: "residents-bf48cede:read-list"
    description:
      zh: >
          读取方 list
          
      en: >
          reader list
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.inventory.backpack
    from_api: "rpc:residents-bf48cede:read-load"
    label: {zh: "读 residents", en: "read residents"}
  - kind: dataflow
    to: truman-town-flow.code.agent.memory.episodic.store
    from_api: "rpc:residents-bf48cede:read-list"
    label: {zh: "读 residents", en: "read residents"}
---
