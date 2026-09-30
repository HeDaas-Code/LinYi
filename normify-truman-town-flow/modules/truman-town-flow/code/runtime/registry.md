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
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:59.700Z"
fingerprint: e00f082476d0cb7d02a531a84029f7c1dd606d37cd25d6300c1a6d0b7c762aaf
source:
  - path: "src/runtime/registry.js"
apis:
  - protocol: rpc
    path: "runtime.registry.register"
    description:
      zh: >
          register：模块导出函数。
          
      en: >
          register: exported module function.
          
  - protocol: rpc
    path: "runtime.registry.lookup"
    description:
      zh: >
          lookup：模块导出函数。
          
      en: >
          lookup: exported module function.
          
  - protocol: rpc
    path: "runtime.registry.unregister"
    description:
      zh: >
          unregister：模块导出函数。
          
      en: >
          unregister: exported module function.
          
  - protocol: rpc
    path: "runtime.registry.count"
    description:
      zh: >
          count：模块导出函数。
          
      en: >
          count: exported module function.
          
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
