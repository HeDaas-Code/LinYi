---
uid: 6a6121ed
id: truman-town-flow.state.area.agent.read-cache-5dc95f1a
parent: truman-town-flow.state.area.agent
name: {zh: "readCache", en: "readCache"}
description:
  zh: >
      map 类型，声明于 src/agent/traits/tagset/store.js:23。写入方 3 个、读取方 2 个；已纳入复位。
      
  en: >
      map declared at src/agent/traits/tagset/store.js:23; writers=3, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:51.765Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "read-cache-5dc95f1a:write-ensureReadCacheFresh"
    description:
      zh: >
          写入方 ensureReadCacheFresh（src/agent/traits/tagset/store.js）
          
      en: >
          writer ensureReadCacheFresh
          
  - protocol: rpc
    path: "read-cache-5dc95f1a:write-get"
    description:
      zh: >
          写入方 get（src/agent/traits/tagset/store.js）
          
      en: >
          writer get
          
  - protocol: rpc
    path: "read-cache-5dc95f1a:write-upsert"
    description:
      zh: >
          写入方 upsert（src/agent/traits/tagset/store.js）
          
      en: >
          writer upsert
          
  - protocol: rpc
    path: "read-cache-5dc95f1a:read-ensureReadCacheFresh"
    description:
      zh: >
          读取方 ensureReadCacheFresh
          
      en: >
          reader ensureReadCacheFresh
          
  - protocol: rpc
    path: "read-cache-5dc95f1a:read-get"
    description:
      zh: >
          读取方 get
          
      en: >
          reader get
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.traits.tagset.store
    from_api: "rpc:read-cache-5dc95f1a:read-ensureReadCacheFresh"
    label: {zh: "读 readCache", en: "read readCache"}
  - kind: dataflow
    to: truman-town-flow.code.agent.traits.tagset.store
    from_api: "rpc:read-cache-5dc95f1a:read-get"
    label: {zh: "读 readCache", en: "read readCache"}
---
