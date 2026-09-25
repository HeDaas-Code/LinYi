---
uid: 00aa0d53
id: truman-town-flow.state.area.economy.prices-8b89e4ac
parent: truman-town-flow.state.area.economy
name: {zh: "prices", en: "prices"}
description:
  zh: >
      map 类型，声明于 src/economy/market/price.js:11。写入方 1 个、读取方 1 个；已纳入复位。
      
  en: >
      map declared at src/economy/market/price.js:11; writers=1, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:33.450Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "prices-8b89e4ac:write-update"
    description:
      zh: >
          写入方 update（src/economy/market/price.js）
          
      en: >
          writer update
          
  - protocol: rpc
    path: "prices-8b89e4ac:read-quote"
    description:
      zh: >
          读取方 quote
          
      en: >
          reader quote
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.economy.market.price
    from_api: "rpc:prices-8b89e4ac:read-quote"
    label: {zh: "读 prices", en: "read prices"}
---
