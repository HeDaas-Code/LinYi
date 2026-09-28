---
uid: 25194c5e
id: truman-town-flow.code.economy.market.price
parent: truman-town-flow.code.economy.market
name: {zh: "economy/market/price.js", en: "economy/market/price.js"}
description:
  zh: >
      代码模块 src/economy/market/price.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/economy/market/price.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:43.149Z"
fingerprint: 72bcbb44aa7c41b0eb41db4ec5d3f8fe0fbf88ee76f4f4ced306341149221f03
source:
  - path: "src/economy/market/price.js"
apis:
  - protocol: rpc
    path: "economy.market.price.quote"
    description:
      zh: >
          quote：模块导出函数。
          
      en: >
          quote: exported module function.
          
  - protocol: rpc
    path: "economy.market.price.update"
    description:
      zh: >
          update：模块导出函数。
          
      en: >
          update: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.economy.prices-8b89e4ac
    to_api: "rpc:prices-8b89e4ac:write-update"
    label: {zh: "写 prices", en: "write prices"}
  - kind: dataflow
    to: truman-town-flow.state.area.social.by-agent-2dd1f55b
    to_api: "rpc:by-agent-2dd1f55b:write-update"
    label: {zh: "写 byAgent", en: "write byAgent"}
---
