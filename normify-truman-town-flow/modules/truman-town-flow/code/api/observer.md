---
uid: fa57cbfb
id: truman-town-flow.code.api.observer
parent: truman-town-flow.code.api
name: {zh: "api/observer.js", en: "api/observer.js"}
description:
  zh: >
      代码模块 src/api/observer.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/api/observer.js as a data-flow endpoint.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:20.282Z"
fingerprint: pending
source: []
apis: []
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.api.last-snapshot-6b34bb05
    to_api: "rpc:last-snapshot-6b34bb05:write-saveRun"
    label: {zh: "写 lastSnapshot", en: "write lastSnapshot"}
  - kind: dataflow
    to: truman-town-flow.state.area.api.journal-38e68294
    to_api: "rpc:journal-38e68294:write-saveRun"
    label: {zh: "写 journal", en: "write journal"}
  - kind: dataflow
    to: truman-town-flow.state.area.api.journal-38e68294
    to_api: "rpc:journal-38e68294:write-restoreRun"
    label: {zh: "写 journal", en: "write journal"}
---
