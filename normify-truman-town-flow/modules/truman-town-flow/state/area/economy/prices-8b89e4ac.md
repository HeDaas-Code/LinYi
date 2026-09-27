---
uid: 00aa0d53
id: truman-town-flow.state.area.economy.prices-8b89e4ac
parent: truman-town-flow.state.area.economy
name: {zh: "prices", en: "prices"}
description:
  zh: >
      map 类型，声明于 src/economy/market/price.js:11。写入方 2 个、读取方 3 个；已纳入复位。
      
  en: >
      map declared at src/economy/market/price.js:11; writers=2, readers=3
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:54.967Z"
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
    path: "prices-8b89e4ac:write-__restore"
    description:
      zh: >
          写入方 __restore（src/economy/market/price.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "prices-8b89e4ac:read-quote"
    description:
      zh: >
          读取方 quote
          
      en: >
          reader quote
          
  - protocol: rpc
    path: "prices-8b89e4ac:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "prices-8b89e4ac:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.economy.market.price
    from_api: "rpc:prices-8b89e4ac:read-quote"
    label: {zh: "读 prices", en: "read prices"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:prices-8b89e4ac:read-__snapshot"
    label: {zh: "读 prices", en: "read prices"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:prices-8b89e4ac:read-__restore"
    label: {zh: "读 prices", en: "read prices"}
---
