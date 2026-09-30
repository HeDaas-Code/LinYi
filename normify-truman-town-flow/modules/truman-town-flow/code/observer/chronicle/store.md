---
uid: f4a72235
id: truman-town-flow.code.observer.chronicle.store
parent: truman-town-flow.code.observer.chronicle
name: {zh: "observer/chronicle/store.js", en: "observer/chronicle/store.js"}
description:
  zh: >
      代码模块 src/observer/chronicle/store.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/observer/chronicle/store.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:51.398Z"
fingerprint: 4b4c2d905c73fb29e158d46069575906f843210b5dbcd8d7f1fca4c84f3d937c
source:
  - path: "src/observer/chronicle/store.js"
apis:
  - protocol: rpc
    path: "observer.chronicle.store.capture"
    description:
      zh: >
          capture：模块导出函数。
          
      en: >
          capture: exported module function.
          
  - protocol: rpc
    path: "observer.chronicle.store.query"
    description:
      zh: >
          query：模块导出函数。
          
      en: >
          query: exported module function.
          
  - protocol: rpc
    path: "observer.chronicle.store.range"
    description:
      zh: >
          range：模块导出函数。
          
      en: >
          range: exported module function.
          
  - protocol: rpc
    path: "observer.chronicle.store.list"
    description:
      zh: >
          list：模块导出函数。
          
      en: >
          list: exported module function.
          
  - protocol: rpc
    path: "observer.chronicle.store.getStats"
    description:
      zh: >
          getStats：模块导出函数。
          
      en: >
          getStats: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.observer.segments-4acfacb1
    to_api: "rpc:segments-4acfacb1:write-capture"
    label: {zh: "写 segments", en: "write segments"}
---
