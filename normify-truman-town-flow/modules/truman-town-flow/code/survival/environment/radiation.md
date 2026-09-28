---
uid: 17c44ce3
id: truman-town-flow.code.survival.environment.radiation
parent: truman-town-flow.code.survival.environment
name: {zh: "survival/environment/radiation.js", en: "survival/environment/radiation.js"}
description:
  zh: >
      代码模块 src/survival/environment/radiation.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/survival/environment/radiation.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:36:03.732Z"
fingerprint: 1ec0707acb22d0916ac0acabc8b99a7de92b44632ebad4811d22c51d7a189505
source:
  - path: "src/survival/environment/radiation.js"
apis:
  - protocol: rpc
    path: "survival.environment.radiation.configure"
    description:
      zh: >
          configure：模块导出函数。
          
      en: >
          configure: exported module function.
          
  - protocol: rpc
    path: "survival.environment.radiation.query"
    description:
      zh: >
          query：模块导出函数。
          
      en: >
          query: exported module function.
          
  - protocol: rpc
    path: "survival.environment.radiation.spread"
    description:
      zh: >
          spread：模块导出函数。
          
      en: >
          spread: exported module function.
          
  - protocol: rpc
    path: "survival.environment.radiation.field"
    description:
      zh: >
          field：模块导出函数。
          
      en: >
          field: exported module function.
          
  - protocol: rpc
    path: "survival.environment.radiation.dose"
    description:
      zh: >
          dose：模块导出函数。
          
      en: >
          dose: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.survival.grid-82f106b5
    to_api: "rpc:grid-82f106b5:write-generate"
    label: {zh: "写 grid", en: "write grid"}
  - kind: dataflow
    to: truman-town-flow.state.area.survival.grid-82f106b5
    to_api: "rpc:grid-82f106b5:write-spread"
    label: {zh: "写 grid", en: "write grid"}
---
