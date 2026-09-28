---
uid: 8ae5dd24
id: truman-town.economy.market.price
parent: truman-town.economy.market
name: {zh: "价格发现", en: "Price Discovery"}
description:
  zh: >
      报价并依据供需更新价格。
      
  en: >
      Quotes and updates prices by supply and demand.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.835Z"
fingerprint: 72bcbb44aa7c41b0eb41db4ec5d3f8fe0fbf88ee76f4f4ced306341149221f03
source:
  - path: "src/economy/market/price.js"
apis:
  - protocol: rpc
    path: "economy.market.price.quote"
    description:
      zh: >
          查询某 symbol 当前价格。
          
      en: >
          Quotes the current price for a symbol.
          
  - protocol: rpc
    path: "economy.market.price.update"
    description:
      zh: >
          更新（发现）某 symbol 价格。
          
      en: >
          Updates (discovers) a symbol's price.
          
deps:
  - kind: dataflow
    to: truman-town.economy.market.orderbook
---
