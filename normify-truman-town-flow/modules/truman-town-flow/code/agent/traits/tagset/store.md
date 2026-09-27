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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:20.282Z"
fingerprint: pending
source: []
apis: []
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
