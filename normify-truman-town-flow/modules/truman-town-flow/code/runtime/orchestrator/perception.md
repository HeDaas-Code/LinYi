---
uid: b080466a
id: truman-town-flow.code.runtime.orchestrator.perception
parent: truman-town-flow.code.runtime.orchestrator
name: {zh: "runtime/orchestrator/perception.js", en: "runtime/orchestrator/perception.js"}
description:
  zh: >
      代码模块 src/runtime/orchestrator/perception.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/runtime/orchestrator/perception.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:56.436Z"
fingerprint: 5422105dc2476c0f37c80c1958240e8134bdf1773da653d954e965d9e93cd291
source:
  - path: "src/runtime/orchestrator/perception.js"
apis:
  - protocol: rpc
    path: "runtime.orchestrator.perception.collect"
    description:
      zh: >
          collect：模块导出函数。
          
      en: >
          collect: exported module function.
          
  - protocol: rpc
    path: "runtime.orchestrator.perception.route"
    description:
      zh: >
          route：模块导出函数。
          
      en: >
          route: exported module function.
          
---
