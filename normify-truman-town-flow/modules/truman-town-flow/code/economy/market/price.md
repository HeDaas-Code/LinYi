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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:46.551Z"
fingerprint: pending
source: []
apis: []
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
