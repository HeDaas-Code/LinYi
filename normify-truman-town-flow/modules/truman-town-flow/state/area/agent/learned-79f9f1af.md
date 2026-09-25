---
uid: 25a7995c
id: truman-town-flow.state.area.agent.learned-79f9f1af
parent: truman-town-flow.state.area.agent
name: {zh: "learned", en: "learned"}
description:
  zh: >
      map 类型，声明于 src/agent/crafting/recipe.js:15。写入方 1 个、读取方 2 个；已纳入复位。
      
  en: >
      map declared at src/agent/crafting/recipe.js:15; writers=1, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:31.618Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "learned-79f9f1af:write-learn"
    description:
      zh: >
          写入方 learn（src/agent/crafting/recipe.js）
          
      en: >
          writer learn
          
  - protocol: rpc
    path: "learned-79f9f1af:read-learn"
    description:
      zh: >
          读取方 learn
          
      en: >
          reader learn
          
  - protocol: rpc
    path: "learned-79f9f1af:read-isLearned"
    description:
      zh: >
          读取方 isLearned
          
      en: >
          reader isLearned
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:learned-79f9f1af:read-learn"
    label: {zh: "读 learned", en: "read learned"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:learned-79f9f1af:read-isLearned"
    label: {zh: "读 learned", en: "read learned"}
---
