---
uid: 2aa2e627
id: truman-town-flow.state.area.runtime.world-5ed9ea07
parent: truman-town-flow.state.area.runtime
name: {zh: "world", en: "world"}
description:
  zh: >
      object 类型，声明于 src/runtime/world-state.js:9。写入方 1 个、读取方 6 个；已纳入复位。
      
  en: >
      object declared at src/runtime/world-state.js:9; writers=1, readers=6
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:42.543Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "world-5ed9ea07:write-restore"
    description:
      zh: >
          写入方 restore（src/runtime/world-state.js）
          
      en: >
          writer restore
          
  - protocol: rpc
    path: "world-5ed9ea07:read-toPath"
    description:
      zh: >
          读取方 toPath
          
      en: >
          reader toPath
          
  - protocol: rpc
    path: "world-5ed9ea07:read-setByPath"
    description:
      zh: >
          读取方 setByPath
          
      en: >
          reader setByPath
          
  - protocol: rpc
    path: "world-5ed9ea07:read-snapshot"
    description:
      zh: >
          读取方 snapshot
          
      en: >
          reader snapshot
          
  - protocol: rpc
    path: "world-5ed9ea07:read-get"
    description:
      zh: >
          读取方 get
          
      en: >
          reader get
          
  - protocol: rpc
    path: "world-5ed9ea07:read-set"
    description:
      zh: >
          读取方 set
          
      en: >
          reader set
          
  - protocol: rpc
    path: "world-5ed9ea07:read-restore"
    description:
      zh: >
          读取方 restore
          
      en: >
          reader restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.runtime.world-state
    from_api: "rpc:world-5ed9ea07:read-toPath"
    label: {zh: "读 world", en: "read world"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.world-state
    from_api: "rpc:world-5ed9ea07:read-setByPath"
    label: {zh: "读 world", en: "read world"}
  - kind: dataflow
    to: truman-town-flow.code.civilization.tech.tree
    from_api: "rpc:world-5ed9ea07:read-snapshot"
    label: {zh: "读 world", en: "read world"}
  - kind: dataflow
    to: truman-town-flow.code.agent.traits.tagset.store
    from_api: "rpc:world-5ed9ea07:read-get"
    label: {zh: "读 world", en: "read world"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.world-state
    from_api: "rpc:world-5ed9ea07:read-set"
    label: {zh: "读 world", en: "read world"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.world-state
    from_api: "rpc:world-5ed9ea07:read-restore"
    label: {zh: "读 world", en: "read world"}
---
