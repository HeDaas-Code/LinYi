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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T08:02:50.389Z"
fingerprint: 3f17a2138d67ea297f0a008121873935c4bcb5ce145aeb306e8ad7dbb4033ec6
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
