---
uid: 56b293a8
id: truman-town-flow.state.area.api.last-snapshot-6b34bb05
parent: truman-town-flow.state.area.api
name: {zh: "lastSnapshot", en: "lastSnapshot"}
description:
  zh: >
      null 类型，声明于 src/api/observer.js:371。写入方 1 个、读取方 2 个；已纳入复位。
      
  en: >
      null declared at src/api/observer.js:371; writers=1, readers=2
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:51.765Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "last-snapshot-6b34bb05:write-saveRun"
    description:
      zh: >
          写入方 saveRun（src/api/observer.js）
          
      en: >
          writer saveRun
          
  - protocol: rpc
    path: "last-snapshot-6b34bb05:read-persistenceStatus"
    description:
      zh: >
          读取方 persistenceStatus
          
      en: >
          reader persistenceStatus
          
  - protocol: rpc
    path: "last-snapshot-6b34bb05:read-restoreRun"
    description:
      zh: >
          读取方 restoreRun
          
      en: >
          reader restoreRun
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.api.observer
    from_api: "rpc:last-snapshot-6b34bb05:read-persistenceStatus"
    label: {zh: "读 lastSnapshot", en: "read lastSnapshot"}
  - kind: dataflow
    to: truman-town-flow.code.api.observer
    from_api: "rpc:last-snapshot-6b34bb05:read-restoreRun"
    label: {zh: "读 lastSnapshot", en: "read lastSnapshot"}
---
