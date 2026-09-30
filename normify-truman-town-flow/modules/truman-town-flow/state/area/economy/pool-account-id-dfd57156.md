---
uid: 7b34156d
id: truman-town-flow.state.area.economy.pool-account-id-dfd57156
parent: truman-town-flow.state.area.economy
name: {zh: "poolAccountId", en: "poolAccountId"}
description:
  zh: >
      null 类型，声明于 src/economy/tax.js:20。写入方 2 个、读取方 6 个；已纳入复位。
      
  en: >
      null declared at src/economy/tax.js:20; writers=2, readers=6
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:54.967Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "pool-account-id-dfd57156:write-open"
    description:
      zh: >
          写入方 open（src/economy/tax.js）
          
      en: >
          writer open
          
  - protocol: rpc
    path: "pool-account-id-dfd57156:write-__restore"
    description:
      zh: >
          写入方 __restore（src/economy/tax.js）
          
      en: >
          writer __restore
          
  - protocol: rpc
    path: "pool-account-id-dfd57156:read-open"
    description:
      zh: >
          读取方 open
          
      en: >
          reader open
          
  - protocol: rpc
    path: "pool-account-id-dfd57156:read-poolBalance"
    description:
      zh: >
          读取方 poolBalance
          
      en: >
          reader poolBalance
          
  - protocol: rpc
    path: "pool-account-id-dfd57156:read-collect"
    description:
      zh: >
          读取方 collect
          
      en: >
          reader collect
          
  - protocol: rpc
    path: "pool-account-id-dfd57156:read-redistribute"
    description:
      zh: >
          读取方 redistribute
          
      en: >
          reader redistribute
          
  - protocol: rpc
    path: "pool-account-id-dfd57156:read-__snapshot"
    description:
      zh: >
          读取方 __snapshot
          
      en: >
          reader __snapshot
          
  - protocol: rpc
    path: "pool-account-id-dfd57156:read-__restore"
    description:
      zh: >
          读取方 __restore
          
      en: >
          reader __restore
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.agent.decision.contention
    from_api: "rpc:pool-account-id-dfd57156:read-open"
    label: {zh: "读 poolAccountId", en: "read poolAccountId"}
  - kind: dataflow
    to: truman-town-flow.code.economy.tax
    from_api: "rpc:pool-account-id-dfd57156:read-poolBalance"
    label: {zh: "读 poolAccountId", en: "read poolAccountId"}
  - kind: dataflow
    to: truman-town-flow.code.economy.tax
    from_api: "rpc:pool-account-id-dfd57156:read-collect"
    label: {zh: "读 poolAccountId", en: "read poolAccountId"}
  - kind: dataflow
    to: truman-town-flow.code.economy.tax
    from_api: "rpc:pool-account-id-dfd57156:read-redistribute"
    label: {zh: "读 poolAccountId", en: "read poolAccountId"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:pool-account-id-dfd57156:read-__snapshot"
    label: {zh: "读 poolAccountId", en: "read poolAccountId"}
  - kind: dataflow
    to: truman-town-flow.code.agent.crafting.recipe
    from_api: "rpc:pool-account-id-dfd57156:read-__restore"
    label: {zh: "读 poolAccountId", en: "read poolAccountId"}
---
