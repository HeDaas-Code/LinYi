---
uid: c1181620
id: truman-town.economy.tax
parent: truman-town.economy
name: {zh: "税收与再分配", en: "Taxation"}
description:
  zh: >
      征收税款并再分配以维持公共设施与福利。
      
  en: >
      Collects and redistributes taxes for public goods and welfare.
      
revision: 291c1bea8967e3110e48250864e71452d803a9bf
updated_at: "2026-09-23T13:07:29.470Z"
fingerprint: dac5aa0127d28839bcf24bb5a6c3f0c68206201754e33d0479622dcb31e1cd0f
source:
  - path: "src/economy/tax.js"
apis:
  - protocol: rpc
    path: "economy.tax.collect"
    description:
      zh: >
          按余额/交易征税并转入税收池（真实转账）。
          
      en: >
          Collects tax on balances/transactions into the pool.
          
  - protocol: rpc
    path: "economy.tax.redistribute"
    description:
      zh: >
          把税收池余额按人头或公共支出再分配（守恒）。
          
      en: >
          Redistributes the tax pool per capita or to public spending.
          
  - protocol: rpc
    path: "economy.tax.open"
    description:
      zh: >
          开设税收池账户（余额 0）。
          
      en: >
          Opens the tax pool account (balance 0).
          
deps:
  - kind: call
    to: truman-town.economy.ledger.account
  - kind: call
    to: truman-town.economy.ledger.transaction.recorder
---
