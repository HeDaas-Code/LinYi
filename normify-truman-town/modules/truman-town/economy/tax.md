---
uid: c1181620
id: truman-town.economy.tax
parent: truman-town.economy
state: planned
name: {zh: "税收与再分配", en: "Taxation"}
description:
  zh: >
      征收税款并再分配以维持公共设施与福利。
  en: >
      Collects and redistributes taxes for public goods and welfare.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "economy.tax.collect"
    description:
      zh: >
          调用 economy.tax.collect。
      en: >
          Calls economy.tax.collect.
  - protocol: rpc
    path: "economy.tax.redistribute"
    description:
      zh: >
          调用 economy.tax.redistribute。
      en: >
          Calls economy.tax.redistribute.
deps:
  - kind: call
    to: truman-town.economy.ledger.account
---
