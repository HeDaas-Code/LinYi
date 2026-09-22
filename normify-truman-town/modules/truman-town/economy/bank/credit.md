---
uid: 7f739f6f
id: truman-town.economy.bank.credit
parent: truman-town.economy.bank
state: planned
name: {zh: "信贷", en: "Credit"}
description:
  zh: >
      申请与偿还贷款，支持创业与消费。
  en: >
      Applies for and repays loans for business and consumption.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "economy.bank.credit.apply"
    description:
      zh: >
          调用 economy.bank.credit.apply。
      en: >
          Calls economy.bank.credit.apply.
  - protocol: rpc
    path: "economy.bank.credit.repay"
    description:
      zh: >
          调用 economy.bank.credit.repay。
      en: >
          Calls economy.bank.credit.repay.
deps:
  - kind: call
    to: truman-town.economy.ledger.account
---
