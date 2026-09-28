---
uid: 9de82a9f
id: truman-town-flow.code.runtime.world-state
parent: truman-town-flow.code.runtime
name: {zh: "runtime/world-state.js", en: "runtime/world-state.js"}
description:
  zh: >
      代码模块 src/runtime/world-state.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/runtime/world-state.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:36:00.474Z"
fingerprint: 1dd4be91cefe1c814932556aaa5e4e5267e40ab7ee4afa40a0f4c009c16bf688
source:
  - path: "src/runtime/world-state.js"
apis:
  - protocol: rpc
    path: "runtime.world-state.snapshot"
    description:
      zh: >
          snapshot：模块导出函数。
          
      en: >
          snapshot: exported module function.
          
  - protocol: rpc
    path: "runtime.world-state.get"
    description:
      zh: >
          get：模块导出函数。
          
      en: >
          get: exported module function.
          
  - protocol: rpc
    path: "runtime.world-state.set"
    description:
      zh: >
          set：模块导出函数。
          
      en: >
          set: exported module function.
          
  - protocol: rpc
    path: "runtime.world-state.restore"
    description:
      zh: >
          restore：模块导出函数。
          
      en: >
          restore: exported module function.
          
  - protocol: rpc
    path: "runtime.world-state.diff"
    description:
      zh: >
          diff：模块导出函数。
          
      en: >
          diff: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.world-5ed9ea07
    to_api: "rpc:world-5ed9ea07:write-restore"
    label: {zh: "写 world", en: "write world"}
---
