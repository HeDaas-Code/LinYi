---
uid: 733c1ace
id: truman-town-flow.code.economy.tax
parent: truman-town-flow.code.economy
name: {zh: "economy/tax.js", en: "economy/tax.js"}
description:
  zh: >
      代码模块 src/economy/tax.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/economy/tax.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:43.877Z"
fingerprint: 6c5f43b6a2505dd011febd1783b64850d3ba3d7b0db51f8a453248e2b619dfe5
source:
  - path: "src/economy/tax.js"
apis:
  - protocol: rpc
    path: "economy.tax.open"
    description:
      zh: >
          open：模块导出函数。
          
      en: >
          open: exported module function.
          
  - protocol: rpc
    path: "economy.tax.poolBalance"
    description:
      zh: >
          poolBalance：模块导出函数。
          
      en: >
          poolBalance: exported module function.
          
  - protocol: rpc
    path: "economy.tax.collect"
    description:
      zh: >
          collect：模块导出函数。
          
      en: >
          collect: exported module function.
          
  - protocol: rpc
    path: "economy.tax.redistribute"
    description:
      zh: >
          redistribute：模块导出函数。
          
      en: >
          redistribute: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.runtime.last-collected-93b4b711
    to_api: "rpc:last-collected-93b4b711:write-collect"
    label: {zh: "写 lastCollected", en: "write lastCollected"}
---
