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
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.834Z"
fingerprint: 2ca476013fa13e47558ed0d27174a2d95f8c9b581525509e387ee475d221d8ef
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
