---
uid: 223087c0
id: truman-town-flow.state.area.runtime.last-collected-93b4b711
parent: truman-town-flow.state.area.runtime
name: {zh: "lastCollected", en: "lastCollected"}
description:
  zh: >
      array 类型，声明于 src/runtime/orchestrator/perception.js:11。写入方 1 个、读取方 2 个；已纳入复位。
      
  en: >
      array declared at src/runtime/orchestrator/perception.js:11; writers=1, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:42.543Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "last-collected-93b4b711:write-collect"
    description:
      zh: >
          写入方 collect（src/runtime/orchestrator/perception.js）
          
      en: >
          writer collect
          
  - protocol: rpc
    path: "last-collected-93b4b711:read-collect"
    description:
      zh: >
          读取方 collect
          
      en: >
          reader collect
          
  - protocol: rpc
    path: "last-collected-93b4b711:read-route"
    description:
      zh: >
          读取方 route
          
      en: >
          reader route
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.economy.tax
    from_api: "rpc:last-collected-93b4b711:read-collect"
    label: {zh: "读 lastCollected", en: "read lastCollected"}
  - kind: dataflow
    to: truman-town-flow.code.runtime.orchestrator.perception
    from_api: "rpc:last-collected-93b4b711:read-route"
    label: {zh: "读 lastCollected", en: "read lastCollected"}
---
