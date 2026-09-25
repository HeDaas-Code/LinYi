---
uid: 703939be
id: truman-town-flow.code.runtime.registry
parent: truman-town-flow.code.runtime
name: {zh: "runtime/registry.js", en: "runtime/registry.js"}
description:
  zh: >
      代码模块 src/runtime/registry.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/runtime/registry.js as a data-flow endpoint.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:48.777Z"
fingerprint: pending
source: []
apis: []
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.entities-5d3ec8fd
    to_api: "rpc:entities-5d3ec8fd:write-register"
    label: {zh: "写 entities", en: "write entities"}
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.entities-5d3ec8fd
    to_api: "rpc:entities-5d3ec8fd:write-unregister"
    label: {zh: "写 entities", en: "write entities"}
---
