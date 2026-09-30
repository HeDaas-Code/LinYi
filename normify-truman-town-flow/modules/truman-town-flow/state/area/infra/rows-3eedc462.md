---
uid: 0c17541e
id: truman-town-flow.state.area.infra.rows-3eedc462
parent: truman-town-flow.state.area.infra
name: {zh: "rows", en: "rows"}
description:
  zh: >
      map 类型，声明于 src/infra/store/vector.js:17。写入方 1 个、读取方 4 个；已纳入复位。
      
  en: >
      map declared at src/infra/store/vector.js:17; writers=1, readers=4
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:54.967Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "rows-3eedc462:write-upsert"
    description:
      zh: >
          写入方 upsert（src/infra/store/vector.js）
          
      en: >
          writer upsert
          
  - protocol: rpc
    path: "rows-3eedc462:read-upsert"
    description:
      zh: >
          读取方 upsert
          
      en: >
          reader upsert
          
  - protocol: rpc
    path: "rows-3eedc462:read-search"
    description:
      zh: >
          读取方 search
          
      en: >
          reader search
          
  - protocol: rpc
    path: "rows-3eedc462:read-list"
    description:
      zh: >
          读取方 list
          
      en: >
          reader list
          
  - protocol: rpc
    path: "rows-3eedc462:read-stats"
    description:
      zh: >
          读取方 stats
          
      en: >
          reader stats
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.traits.tagset.store
    from_api: "rpc:rows-3eedc462:read-upsert"
    label: {zh: "读 rows", en: "read rows"}
  - kind: dataflow
    to: truman-town-flow.code.infra.store.vector
    from_api: "rpc:rows-3eedc462:read-search"
    label: {zh: "读 rows", en: "read rows"}
  - kind: dataflow
    to: truman-town-flow.code.agent.memory.episodic.store
    from_api: "rpc:rows-3eedc462:read-list"
    label: {zh: "读 rows", en: "read rows"}
  - kind: dataflow
    to: truman-town-flow.code.agent.decision.outcome-model
    from_api: "rpc:rows-3eedc462:read-stats"
    label: {zh: "读 rows", en: "read rows"}
---
