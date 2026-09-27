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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:20.282Z"
fingerprint: pending
source: []
apis: []
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
