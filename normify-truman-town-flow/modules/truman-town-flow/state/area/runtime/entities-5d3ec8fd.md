---
uid: 38523f40
id: truman-town-flow.state.area.runtime.entities-5d3ec8fd
parent: truman-town-flow.state.area.runtime
name: {zh: "entities", en: "entities"}
description:
  zh: >
      map 类型，声明于 src/runtime/registry.js:10。写入方 3 个、读取方 5 个；已纳入复位。
      
  en: >
      map declared at src/runtime/registry.js:10; writers=3, readers=5
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:12.668Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "entities-5d3ec8fd:write-register"
    description:
      zh: >
          写入方 register（src/runtime/registry.js）
          
      en: >
          writer register
          
  - protocol: rpc
    path: "entities-5d3ec8fd:write-unregister"
    description:
      zh: >
          写入方 unregister（src/runtime/registry.js）
          
      en: >
          writer unregister
          
  - protocol: rpc
    path: "entities-5d3ec8fd:write-__restore"
    description:
      zh: >
          写入方 __restore（src/runtime/registry.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "entities-5d3ec8fd:read-lookup"
    description:
      zh: >
          读取方 lookup
          
      en: >
          reader lookup
          
  - protocol: rpc
    path: "entities-5d3ec8fd:read-unregister"
    description:
      zh: >
          读取方 unregister
          
      en: >
          reader unregister
          
  - protocol: rpc
    path: "entities-5d3ec8fd:read-count"
    description:
      zh: >
          读取方 count
          
      en: >
          reader count
          
  - protocol: rpc
    path: "entities-5d3ec8fd:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "entities-5d3ec8fd:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.registry
    from_api: "rpc:entities-5d3ec8fd:read-lookup"
    label: {zh: "读 entities", en: "read entities"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.registry
    from_api: "rpc:entities-5d3ec8fd:read-unregister"
    label: {zh: "读 entities", en: "read entities"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.registry
    from_api: "rpc:entities-5d3ec8fd:read-count"
    label: {zh: "读 entities", en: "read entities"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:entities-5d3ec8fd:read-__snapshot"
    label: {zh: "读 entities", en: "read entities"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:entities-5d3ec8fd:read-__restore"
    label: {zh: "读 entities", en: "read entities"}
---
