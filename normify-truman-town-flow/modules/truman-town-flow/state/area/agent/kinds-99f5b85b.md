---
uid: "02411731"
id: truman-town-flow.state.area.agent.kinds-99f5b85b
parent: truman-town-flow.state.area.agent
name: {zh: "KINDS", en: "KINDS"}
description:
  zh: >
      set 类型，声明于 src/agent/crafting/recipe.js:10。写入方 0 个、读取方 1 个；**未纳入复位**（跨 run 可能残留）。
      
  en: >
      set declared at src/agent/crafting/recipe.js:10; writers=0, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:48.436Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "kinds-99f5b85b:read-define"
    description:
      zh: >
          读取方 define
          
      en: >
          reader define
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:kinds-99f5b85b:read-define"
    label: {zh: "读 KINDS", en: "read KINDS"}
---
