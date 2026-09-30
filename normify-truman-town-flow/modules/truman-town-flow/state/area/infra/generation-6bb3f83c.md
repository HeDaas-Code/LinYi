---
uid: eaaea236
id: truman-town-flow.state.area.infra.generation-6bb3f83c
parent: truman-town-flow.state.area.infra
name: {zh: "generation", en: "generation"}
description:
  zh: >
      number 类型，声明于 src/infra/store/graph.js:21。写入方 1 个、读取方 3 个；已纳入复位。
      
  en: >
      number declared at src/infra/store/graph.js:21; writers=1, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:54.967Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "generation-6bb3f83c:write-__restore"
    description:
      zh: >
          写入方 __restore（src/infra/store/graph.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "generation-6bb3f83c:read-__generation"
    description:
      zh: >
          读取方 __generation
          
      en: >
          reader __generation
          
  - protocol: rpc
    path: "generation-6bb3f83c:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "generation-6bb3f83c:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.infra.store.graph
    from_api: "rpc:generation-6bb3f83c:read-__generation"
    label: {zh: "读 generation", en: "read generation"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:generation-6bb3f83c:read-__snapshot"
    label: {zh: "读 generation", en: "read generation"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:generation-6bb3f83c:read-__restore"
    label: {zh: "读 generation", en: "read generation"}
---
