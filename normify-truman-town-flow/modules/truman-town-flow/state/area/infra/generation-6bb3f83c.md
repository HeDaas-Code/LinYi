---
uid: eaaea236
id: truman-town-flow.state.area.infra.generation-6bb3f83c
parent: truman-town-flow.state.area.infra
name: {zh: "generation", en: "generation"}
description:
  zh: >
      number 类型，声明于 src/infra/store/graph.js:21。写入方 0 个、读取方 1 个；已纳入复位。
      
  en: >
      number declared at src/infra/store/graph.js:21; writers=0, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:35.160Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "generation-6bb3f83c:read-__generation"
    description:
      zh: >
          读取方 __generation
          
      en: >
          reader __generation
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.infra.store.graph
    from_api: "rpc:generation-6bb3f83c:read-__generation"
    label: {zh: "读 generation", en: "read generation"}
---
