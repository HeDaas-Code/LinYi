---
uid: c320ca75
id: truman-town.economy.ledger.account
parent: truman-town.economy.ledger
name: {zh: "账户", en: "Account"}
description:
  zh: >
      开户、查询余额与销户，承载货币持有。
      
  en: >
      Opens, queries and closes money accounts.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.834Z"
fingerprint: 094618ae968abca8aa85e05c64ebd4b846bb679d5b17841fe8e9137cd8ac8160
source:
  - path: "src/economy/ledger/account.js"
apis:
  - protocol: rpc
    path: "economy.ledger.account.open"
    description:
      zh: >
          开户（可选指定 owner 与初始余额）。
          
      en: >
          Opens an account (optional owner and initial balance).
          
  - protocol: rpc
    path: "economy.ledger.account.balance"
    description:
      zh: >
          查询账户余额。
          
      en: >
          Queries an account balance.
          
  - protocol: rpc
    path: "economy.ledger.account.close"
    description:
      zh: >
          销户（标记关闭，保留余额供审计）。
          
      en: >
          Closes an account (keeps balance for audit).
          
deps:
  - kind: call
    to: truman-town.infra.identity
---
