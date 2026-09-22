---
uid: d09f7002
id: truman-town.economy.ledger.transaction.querier
parent: truman-town.economy.ledger.transaction
name: {zh: "流水查询器", en: "Transaction Querier"}
description:
  zh: >
      查询与审计交易流水。
      
  en: >
      Queries and audits transaction records.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T08:02:50.389Z"
fingerprint: 2bf0bec260b6df4bbacc152929fec1e8f4b9f9f30a2747b03adb1f3887bfa385
source:
  - path: "src/economy/ledger/transaction/querier.js"
apis:
  - protocol: rpc
    path: "economy.ledger.transaction.querier.query"
    description:
      zh: >
          按账户/来源/去向/区间等条件查询流水。
          
      en: >
          Queries transactions by account/source/target/range.
          
  - protocol: rpc
    path: "economy.ledger.transaction.querier.audit"
    description:
      zh: >
          对账户重放流水并对账，返回一致性结论。
          
      en: >
          Replays transactions for an account and reports consistency.
          
deps:
  - kind: call
    to: truman-town.economy.ledger.transaction.recorder
  - kind: call
    to: truman-town.infra.store.graph
---
