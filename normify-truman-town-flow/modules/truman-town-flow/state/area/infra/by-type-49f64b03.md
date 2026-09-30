---
uid: b58e02f7
id: truman-town-flow.state.area.infra.by-type-49f64b03
parent: truman-town-flow.state.area.infra
name: {zh: "byType", en: "byType"}
description:
  zh: >
      map 类型，声明于 src/infra/store/graph.js:18。写入方 2 个、读取方 2 个；已纳入复位。
      
  en: >
      map declared at src/infra/store/graph.js:18; writers=2, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:54.967Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "by-type-49f64b03:write-write"
    description:
      zh: >
          写入方 write（src/infra/store/graph.js）
          
      en: >
          writer write
          
  - protocol: rpc
    path: "by-type-49f64b03:write-__restore"
    description:
      zh: >
          写入方 __restore（src/infra/store/graph.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "by-type-49f64b03:read-write"
    description:
      zh: >
          读取方 write
          
      en: >
          reader write
          
  - protocol: rpc
    path: "by-type-49f64b03:read-read"
    description:
      zh: >
          读取方 read
          
      en: >
          reader read
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.memory.episodic.store
    from_api: "rpc:by-type-49f64b03:read-write"
    label: {zh: "读 byType", en: "read byType"}
  - kind: dataflow
    to: truman-town-flow.code.infra.store.graph
    from_api: "rpc:by-type-49f64b03:read-read"
    label: {zh: "读 byType", en: "read byType"}
---
