---
uid: d50c50c6
id: truman-town-flow.state.area.infra.nodes-231cb4f7
parent: truman-town-flow.state.area.infra
name: {zh: "nodes", en: "nodes"}
description:
  zh: >
      map 类型，声明于 src/infra/store/graph.js:15。写入方 1 个、读取方 2 个；已纳入复位。
      
  en: >
      map declared at src/infra/store/graph.js:15; writers=1, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:35.160Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "nodes-231cb4f7:write-write"
    description:
      zh: >
          写入方 write（src/infra/store/graph.js）
          
      en: >
          writer write
          
  - protocol: rpc
    path: "nodes-231cb4f7:read-write"
    description:
      zh: >
          读取方 write
          
      en: >
          reader write
          
  - protocol: rpc
    path: "nodes-231cb4f7:read-read"
    description:
      zh: >
          读取方 read
          
      en: >
          reader read
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.memory.episodic.store
    from_api: "rpc:nodes-231cb4f7:read-write"
    label: {zh: "读 nodes", en: "read nodes"}
  - kind: dataflow
    to: truman-town-flow.code.infra.store.graph
    from_api: "rpc:nodes-231cb4f7:read-read"
    label: {zh: "读 nodes", en: "read nodes"}
---
