---
uid: 8a12919e
id: truman-town-flow.state.area.observer.segments-4acfacb1
parent: truman-town-flow.state.area.observer
name: {zh: "segments", en: "segments"}
description:
  zh: >
      map 类型，声明于 src/observer/chronicle/store.js:26。写入方 1 个、读取方 3 个；已纳入复位。
      
  en: >
      map declared at src/observer/chronicle/store.js:26; writers=1, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:35.160Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "segments-4acfacb1:write-capture"
    description:
      zh: >
          写入方 capture（src/observer/chronicle/store.js）
          
      en: >
          writer capture
          
  - protocol: rpc
    path: "segments-4acfacb1:read-capture"
    description:
      zh: >
          读取方 capture
          
      en: >
          reader capture
          
  - protocol: rpc
    path: "segments-4acfacb1:read-orderedSegments"
    description:
      zh: >
          读取方 orderedSegments
          
      en: >
          reader orderedSegments
          
  - protocol: rpc
    path: "segments-4acfacb1:read-getStats"
    description:
      zh: >
          读取方 getStats
          
      en: >
          reader getStats
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.observer.chronicle.store
    from_api: "rpc:segments-4acfacb1:read-capture"
    label: {zh: "读 segments", en: "read segments"}
  - kind: dataflow
    to: truman-town-flow.code.observer.chronicle.store
    from_api: "rpc:segments-4acfacb1:read-orderedSegments"
    label: {zh: "读 segments", en: "read segments"}
  - kind: dataflow
    to: truman-town-flow.code.ai.laya
    from_api: "rpc:segments-4acfacb1:read-getStats"
    label: {zh: "读 segments", en: "read segments"}
---
