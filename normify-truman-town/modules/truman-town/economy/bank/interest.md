---
uid: 4e9af8ce
id: truman-town.economy.bank.interest
parent: truman-town.economy.bank
name: {zh: "利息", en: "Interest"}
description:
  zh: >
      按账户余额与贷款计息并结算。
      
  en: >
      Accrues and settles interest on deposits and loans.
      
revision: 291c1bea8967e3110e48250864e71452d803a9bf
updated_at: "2026-09-23T13:07:29.470Z"
fingerprint: 585af047197f7eae9e6dca380c3fdd92a67cc86d43a91e1a3337c97dadca1ccc
source:
  - path: "src/economy/bank/interest.js"
apis:
  - protocol: rpc
    path: "economy.bank.interest.accrue"
    description:
      zh: >
          对单笔贷款计息一次（单利/复利，仅增债务不造钱）。
          
      en: >
          Accrues interest once on a loan (simple/compound, debt-only).
          
  - protocol: rpc
    path: "economy.bank.interest.accrueAll"
    description:
      zh: >
          对全部在途贷款各计息一次。
          
      en: >
          Accrues interest on all active loans.
          
deps:
  - kind: reference
    to: truman-town.economy.bank.credit
---
