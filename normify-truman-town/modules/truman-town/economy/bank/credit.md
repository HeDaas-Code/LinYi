---
uid: 7f739f6f
id: truman-town.economy.bank.credit
parent: truman-town.economy.bank
name: {zh: "信贷", en: "Credit"}
description:
  zh: >
      申请与偿还贷款，支持创业与消费。
      
  en: >
      Applies for and repays loans for business and consumption.
      
revision: 291c1bea8967e3110e48250864e71452d803a9bf
updated_at: "2026-09-23T13:07:29.469Z"
fingerprint: 12b300e4b8008f79a80957c37f633c3ce5a1f936e3da09ad1d9fab51e4668a4b
source:
  - path: "src/economy/bank/credit.js"
apis:
  - protocol: rpc
    path: "economy.bank.credit.apply"
    description:
      zh: >
          申请贷款（银行金库→借款人真实转账，记录额度/期限/状态）。
          
      en: >
          Applies for a loan (bank-treasury-to-borrower transfer, records principal/term/status).
          
  - protocol: rpc
    path: "economy.bank.credit.repay"
    description:
      zh: >
          偿还贷款（借款人→银行金库真实转账）。
          
      en: >
          Repays a loan (borrower-to-bank-treasury transfer).
          
  - protocol: rpc
    path: "economy.bank.credit.open"
    description:
      zh: >
          开设银行金库账户并注入初始资本。
          
      en: >
          Opens the bank treasury account with initial capital.
          
deps:
  - kind: call
    to: truman-town.economy.ledger.account
  - kind: call
    to: truman-town.economy.ledger.transaction.recorder
---
