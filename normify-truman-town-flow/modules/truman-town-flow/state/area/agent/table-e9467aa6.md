---
uid: 8120d9c5
id: truman-town-flow.state.area.agent.table-e9467aa6
parent: truman-town-flow.state.area.agent
name: {zh: "table", en: "table"}
description:
  zh: >
      map 类型，声明于 src/agent/decision/outcome-model.js:33。写入方 3 个、读取方 7 个；已纳入复位。
      
  en: >
      map declared at src/agent/decision/outcome-model.js:33; writers=3, readers=7
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:48.437Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "table-e9467aa6:write-touch"
    description:
      zh: >
          写入方 touch（src/agent/decision/outcome-model.js）
          
      en: >
          writer touch
          
  - protocol: rpc
    path: "table-e9467aa6:write-observe"
    description:
      zh: >
          写入方 observe（src/agent/decision/outcome-model.js）
          
      en: >
          writer observe
          
  - protocol: rpc
    path: "table-e9467aa6:write-__restore"
    description:
      zh: >
          写入方 __restore（src/agent/decision/outcome-model.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "table-e9467aa6:read-observe"
    description:
      zh: >
          读取方 observe
          
      en: >
          reader observe
          
  - protocol: rpc
    path: "table-e9467aa6:read-estimate"
    description:
      zh: >
          读取方 estimate
          
      en: >
          reader estimate
          
  - protocol: rpc
    path: "table-e9467aa6:read-size"
    description:
      zh: >
          读取方 size
          
      en: >
          reader size
          
  - protocol: rpc
    path: "table-e9467aa6:read-stats"
    description:
      zh: >
          读取方 stats
          
      en: >
          reader stats
          
  - protocol: rpc
    path: "table-e9467aa6:read-snapshot"
    description:
      zh: >
          读取方 snapshot
          
      en: >
          reader snapshot
          
  - protocol: rpc
    path: "table-e9467aa6:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "table-e9467aa6:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.decision.outcome-model
    from_api: "rpc:table-e9467aa6:read-observe"
    label: {zh: "读 table", en: "read table"}
  - kind: dataflow
    to: truman-town-flow.code.agent.decision.outcome-model
    from_api: "rpc:table-e9467aa6:read-estimate"
    label: {zh: "读 table", en: "read table"}
  - kind: dataflow
    to: truman-town-flow.code.agent.decision.outcome-model
    from_api: "rpc:table-e9467aa6:read-size"
    label: {zh: "读 table", en: "read table"}
  - kind: dataflow
    to: truman-town-flow.code.agent.decision.outcome-model
    from_api: "rpc:table-e9467aa6:read-stats"
    label: {zh: "读 table", en: "read table"}
  - kind: dataflow
    to: truman-town-flow.code.agent.decision.contention
    from_api: "rpc:table-e9467aa6:read-snapshot"
    label: {zh: "读 table", en: "read table"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:table-e9467aa6:read-__snapshot"
    label: {zh: "读 table", en: "read table"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:table-e9467aa6:read-__restore"
    label: {zh: "读 table", en: "read table"}
---
