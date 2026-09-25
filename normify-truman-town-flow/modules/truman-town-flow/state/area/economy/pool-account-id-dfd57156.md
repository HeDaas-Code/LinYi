---
uid: 7b34156d
id: truman-town-flow.state.area.economy.pool-account-id-dfd57156
parent: truman-town-flow.state.area.economy
name: {zh: "poolAccountId", en: "poolAccountId"}
description:
  zh: >
      null 类型，声明于 src/economy/tax.js:20。写入方 1 个、读取方 4 个；已纳入复位。
      
  en: >
      null declared at src/economy/tax.js:20; writers=1, readers=4
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:33.450Z"
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
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.economy.bank.credit
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
---
