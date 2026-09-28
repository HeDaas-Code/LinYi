---
uid: a56ff87b
id: truman-town.economy.market.orderbook.matching
parent: truman-town.economy.market.orderbook
name: {zh: "撮合引擎", en: "Matching Engine"}
description:
  zh: >
      撮合买卖订单并调用账本结算。
      
  en: >
      Matches orders and settles via the ledger.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.835Z"
fingerprint: 073819e0a578aaa3bb937760d2f73aed2229d21c0b5b2ffb411f6e8ab836dd16
source:
  - path: "src/economy/market/orderbook/matching.js"
apis:
  - protocol: rpc
    path: "economy.market.orderbook.matching.match"
    description:
      zh: >
          撮合某 symbol 的买卖单（价格/时间优先，只读）。
          
      en: >
          Matches buy/sell orders for a symbol (price-time priority, read-only).
          
  - protocol: rpc
    path: "economy.market.orderbook.matching.settle"
    description:
      zh: >
          结算交易（落账、扣减订单、回写价格）。
          
      en: >
          Settles trades (settle, reduce orders, update price).
          
deps:
  - kind: call
    to: truman-town.economy.market.orderbook.orders
  - kind: call
    to: truman-town.economy.ledger.transaction
---
