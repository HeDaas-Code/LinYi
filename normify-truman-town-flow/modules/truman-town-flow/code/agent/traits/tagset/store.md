---
uid: 635967d0
id: truman-town-flow.code.agent.traits.tagset.store
parent: truman-town-flow.code.agent.traits.tagset
name: {zh: "agent/traits/tagset/store.js", en: "agent/traits/tagset/store.js"}
description:
  zh: >
      代码模块 src/agent/traits/tagset/store.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/agent/traits/tagset/store.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:35.378Z"
fingerprint: fd656aed6ef8f9e94be6af1a9bcd54d83aaab7a738d936940c673f53e7c1f479
source:
  - path: "src/agent/traits/tagset/store.js"
apis:
  - protocol: rpc
    path: "agent.traits.tagset.store.get"
    description:
      zh: >
          get：模块导出函数。
          
      en: >
          get: exported module function.
          
  - protocol: rpc
    path: "agent.traits.tagset.store.upsert"
    description:
      zh: >
          upsert：模块导出函数。
          
      en: >
          upsert: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.agent.write-count-0535ab2a
    to_api: "rpc:write-count-0535ab2a:write-upsert"
    label: {zh: "写 writeCount", en: "write writeCount"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.read-cache-5dc95f1a
    to_api: "rpc:read-cache-5dc95f1a:write-ensureReadCacheFresh"
    label: {zh: "写 readCache", en: "write readCache"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.read-cache-5dc95f1a
    to_api: "rpc:read-cache-5dc95f1a:write-get"
    label: {zh: "写 readCache", en: "write readCache"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.read-cache-5dc95f1a
    to_api: "rpc:read-cache-5dc95f1a:write-upsert"
    label: {zh: "写 readCache", en: "write readCache"}
  - kind: dataflow
    to: truman-town-flow.state.area.agent.read-cache-graph-gen-6b4b91b0
    to_api: "rpc:read-cache-graph-gen-6b4b91b0:write-ensureReadCacheFresh"
    label: {zh: "写 readCacheGraphGen", en: "write readCacheGraphGen"}
  - kind: dataflow
    to: truman-town-flow.state.area.infra.dim-21e62417
    to_api: "rpc:dim-21e62417:write-upsert"
    label: {zh: "写 dim", en: "write dim"}
  - kind: dataflow
    to: truman-town-flow.state.area.infra.rows-3eedc462
    to_api: "rpc:rows-3eedc462:write-upsert"
    label: {zh: "写 rows", en: "write rows"}
---
