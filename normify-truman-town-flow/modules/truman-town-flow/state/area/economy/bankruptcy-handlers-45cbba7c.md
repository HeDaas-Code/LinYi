---
uid: 33e1791d
id: truman-town-flow.state.area.economy.bankruptcy-handlers-45cbba7c
parent: truman-town-flow.state.area.economy
name: {zh: "bankruptcyHandlers", en: "bankruptcyHandlers"}
description:
  zh: >
      set 类型，声明于 src/economy/ledger/transaction/validator.js:14。写入方 1 个、读取方 1 个；已纳入复位。
      
  en: >
      set declared at src/economy/ledger/transaction/validator.js:14; writers=1, readers=1
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:42:54.967Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "bankruptcy-handlers-45cbba7c:write-onBankruptcy"
    description:
      zh: >
          写入方 onBankruptcy（src/economy/ledger/transaction/validator.js）
          
      en: >
          writer onBankruptcy
          
  - protocol: rpc
    path: "bankruptcy-handlers-45cbba7c:read-fireBankruptcy"
    description:
      zh: >
          读取方 fireBankruptcy
          
      en: >
          reader fireBankruptcy
          
deps:
  - kind: dataflow
    to: truman-town-flow.code.economy.ledger.transaction.validator
    from_api: "rpc:bankruptcy-handlers-45cbba7c:read-fireBankruptcy"
    label: {zh: "读 bankruptcyHandlers", en: "read bankruptcyHandlers"}
---
