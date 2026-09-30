---
uid: e3b8f26b
id: truman-town-flow.state.area.api.journal-38e68294
parent: truman-town-flow.state.area.api
name: {zh: "journal", en: "journal"}
description:
  zh: >
      expr 类型，声明于 src/api/observer.js:374。写入方 2 个、读取方 3 个；已纳入复位。
      
  en: >
      expr declared at src/api/observer.js:374; writers=2, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:51.765Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "journal-38e68294:write-saveRun"
    description:
      zh: >
          写入方 saveRun（src/api/observer.js）
          
      en: >
          writer saveRun
          
  - protocol: rpc
    path: "journal-38e68294:write-restoreRun"
    description:
      zh: >
          写入方 restoreRun（src/api/observer.js）
          
      en: >
          writer restoreRun
          
  - protocol: rpc
    path: "journal-38e68294:read-persistenceStatus"
    description:
      zh: >
          读取方 persistenceStatus
          
      en: >
          reader persistenceStatus
          
  - protocol: rpc
    path: "journal-38e68294:read-saveRun"
    description:
      zh: >
          读取方 saveRun
          
      en: >
          reader saveRun
          
  - protocol: rpc
    path: "journal-38e68294:read-restoreRun"
    description:
      zh: >
          读取方 restoreRun
          
      en: >
          reader restoreRun
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.api.observer
    from_api: "rpc:journal-38e68294:read-persistenceStatus"
    label: {zh: "读 journal", en: "read journal"}
  - kind: dataflow
    to: truman-town-flow.code.api.observer
    from_api: "rpc:journal-38e68294:read-saveRun"
    label: {zh: "读 journal", en: "read journal"}
  - kind: dataflow
    to: truman-town-flow.code.api.observer
    from_api: "rpc:journal-38e68294:read-restoreRun"
    label: {zh: "读 journal", en: "read journal"}
---
