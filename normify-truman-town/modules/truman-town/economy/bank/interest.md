---
uid: 4e9af8ce
id: truman-town.economy.bank.interest
parent: truman-town.economy.bank
state: planned
name: {zh: "利息", en: "Interest"}
description:
  zh: >
      按账户余额与贷款计息并结算。
  en: >
      Accrues and settles interest on deposits and loans.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "economy.bank.interest.accrue"
    description:
      zh: >
          调用 economy.bank.interest.accrue。
      en: >
          Calls economy.bank.interest.accrue.
deps:
  - kind: call
    to: truman-town.economy.ledger.account
---
