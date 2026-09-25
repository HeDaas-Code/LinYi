---
uid: efa973d8
id: truman-town-flow.state.area.agent.recipes-6c89fd3f
parent: truman-town-flow.state.area.agent
name: {zh: "recipes", en: "recipes"}
description:
  zh: >
      map 类型，声明于 src/agent/crafting/recipe.js:13。写入方 1 个、读取方 2 个；已纳入复位。
      
  en: >
      map declared at src/agent/crafting/recipe.js:13; writers=1, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:31.618Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "recipes-6c89fd3f:write-define"
    description:
      zh: >
          写入方 define（src/agent/crafting/recipe.js）
          
      en: >
          writer define
          
  - protocol: rpc
    path: "recipes-6c89fd3f:read-query"
    description:
      zh: >
          读取方 query
          
      en: >
          reader query
          
  - protocol: rpc
    path: "recipes-6c89fd3f:read-learn"
    description:
      zh: >
          读取方 learn
          
      en: >
          reader learn
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:recipes-6c89fd3f:read-query"
    label: {zh: "读 recipes", en: "read recipes"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:recipes-6c89fd3f:read-learn"
    label: {zh: "读 recipes", en: "read recipes"}
---
