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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:48.777Z"
fingerprint: pending
source: []
apis: []
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.world-5ed9ea07
    to_api: "rpc:world-5ed9ea07:write-restore"
    label: {zh: "写 world", en: "write world"}
---
