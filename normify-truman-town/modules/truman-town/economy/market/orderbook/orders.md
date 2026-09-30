---
uid: cdf8d497
id: truman-town.economy.market.orderbook.orders
parent: truman-town.economy.market.orderbook
name: {zh: "订单管理", en: "Order Manager"}
description:
  zh: >
      挂单与撤单，维护买卖订单集合。
      
  en: >
      Places and cancels buy/sell orders.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.835Z"
fingerprint: 3ef1b4278f09c1fe8c98ec85fcb3d4447ff1d99e4588dcc16d139402cc538f74
source:
  - path: "src/economy/market/orderbook/orders.js"
apis:
  - protocol: rpc
    path: "economy.market.orderbook.orders.place"
    description:
      zh: >
          挂单（校验账户与价格/数量合法性）。
          
      en: >
          Places an order (validates account and price/quantity).
          
  - protocol: rpc
    path: "economy.market.orderbook.orders.cancel"
    description:
      zh: >
          撤单（标记 cancelled）。
          
      en: >
          Cancels an open order.
          
deps:
  - kind: call
    to: truman-town.economy.ledger.account
---
