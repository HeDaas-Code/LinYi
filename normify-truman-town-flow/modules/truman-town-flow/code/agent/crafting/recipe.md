---
uid: c2833e78
id: truman-town-flow.code.agent.crafting.recipe
parent: truman-town-flow.code.agent.crafting
name: {zh: "agent/crafting/recipe.js", en: "agent/crafting/recipe.js"}
description:
  zh: >
      代码模块 src/agent/crafting/recipe.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/agent/crafting/recipe.js as a data-flow endpoint.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:44.509Z"
fingerprint: pending
source: []
apis: []
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.agent.recipes-6c89fd3f
    to_api: "rpc:recipes-6c89fd3f:write-define"
    label: {zh: "写 recipes", en: "write recipes"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.learned-79f9f1af
    to_api: "rpc:learned-79f9f1af:write-learn"
    label: {zh: "写 learned", en: "write learned"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.items-fc8d8f4b
    to_api: "rpc:items-fc8d8f4b:write-define"
    label: {zh: "写 items", en: "write items"}
---
