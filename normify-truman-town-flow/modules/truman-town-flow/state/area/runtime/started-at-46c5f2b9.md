---
uid: a014bd99
id: truman-town-flow.state.area.runtime.started-at-46c5f2b9
parent: truman-town-flow.state.area.runtime
name: {zh: "startedAt", en: "startedAt"}
description:
  zh: >
      null 类型，声明于 src/runtime/clock.js:10。写入方 1 个、读取方 2 个；已纳入复位。
      
  en: >
      null declared at src/runtime/clock.js:10; writers=1, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:35.160Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "started-at-46c5f2b9:write-tick"
    description:
      zh: >
          写入方 tick（src/runtime/clock.js）
          
      en: >
          writer tick
          
  - protocol: rpc
    path: "started-at-46c5f2b9:read-snapshot"
    description:
      zh: >
          读取方 snapshot
          
      en: >
          reader snapshot
          
  - protocol: rpc
    path: "started-at-46c5f2b9:read-tick"
    description:
      zh: >
          读取方 tick
          
      en: >
          reader tick
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.civilization.tech.tree
    from_api: "rpc:started-at-46c5f2b9:read-snapshot"
    label: {zh: "读 startedAt", en: "read startedAt"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.clock
    from_api: "rpc:started-at-46c5f2b9:read-tick"
    label: {zh: "读 startedAt", en: "read startedAt"}
---
