---
uid: 1486f424
id: truman-town-flow.code.ai.laya
parent: truman-town-flow.code.ai
name: {zh: "ai/laya.js", en: "ai/laya.js"}
description:
  zh: >
      代码模块 src/ai/laya.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/ai/laya.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:36.111Z"
fingerprint: 55cce1d6d200ea3934410b860b36620cb93778e101f3ddc866c82a8886dcd495
source:
  - path: "src/ai/laya.js"
apis:
  - protocol: rpc
    path: "ai.laya.stateKey"
    description:
      zh: >
          stateKey：模块导出函数。
          
      en: >
          stateKey: exported module function.
          
  - protocol: rpc
    path: "ai.laya.getStats"
    description:
      zh: >
          getStats：模块导出函数。
          
      en: >
          getStats: exported module function.
          
  - protocol: rpc
    path: "ai.laya.judge"
    description:
      zh: >
          judge：模块导出函数。
          
      en: >
          judge: exported module function.
          
  - protocol: rpc
    path: "ai.laya.scoreExpectation"
    description:
      zh: >
          scoreExpectation：模块导出函数。
          
      en: >
          scoreExpectation: exported module function.
          
  - protocol: rpc
    path: "ai.laya.survivalUrgency"
    description:
      zh: >
          survivalUrgency：模块导出函数。
          
      en: >
          survivalUrgency: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.ai.cache-e04b957e
    to_api: "rpc:cache-e04b957e:write-judge"
    label: {zh: "写 cache", en: "write cache"}
---
