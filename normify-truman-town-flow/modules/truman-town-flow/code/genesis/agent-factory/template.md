---
uid: e06bfead
id: truman-town-flow.code.genesis.agent-factory.template
parent: truman-town-flow.code.genesis.agent-factory
name: {zh: "genesis/agent-factory/template.js", en: "genesis/agent-factory/template.js"}
description:
  zh: >
      代码模块 src/genesis/agent-factory/template.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/genesis/agent-factory/template.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:45.358Z"
fingerprint: 27e8c6edfe0c11ef1ce3357b3b5c026a582504e1a821ae306ff9e0ebd08196ad
source:
  - path: "src/genesis/agent-factory/template.js"
apis:
  - protocol: rpc
    path: "genesis.agent-factory.template.build"
    description:
      zh: >
          build：模块导出函数。
          
      en: >
          build: exported module function.
          
  - protocol: rpc
    path: "genesis.agent-factory.template.get"
    description:
      zh: >
          get：模块导出函数。
          
      en: >
          get: exported module function.
          
  - protocol: rpc
    path: "genesis.agent-factory.template.list"
    description:
      zh: >
          list：模块导出函数。
          
      en: >
          list: exported module function.
          
  - protocol: rpc
    path: "genesis.agent-factory.template.instantiate"
    description:
      zh: >
          instantiate：模块导出函数。
          
      en: >
          instantiate: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.genesis.templates-bd587d5a
    to_api: "rpc:templates-bd587d5a:write-build"
    label: {zh: "写 templates", en: "write templates"}
  - kind: dataflow
    to: truman-town-flow.state.area.observer.cache-d6a29408
    to_api: "rpc:cache-d6a29408:write-ensure"
    label: {zh: "写 cache", en: "write cache"}
  - kind: dataflow
    to: truman-town-flow.state.area.survival.initialized-048bc601
    to_api: "rpc:initialized-048bc601:write-ensure"
    label: {zh: "写 initialized", en: "write initialized"}
---
