---
uid: acbc5715
id: truman-town.economy.ledger.transaction.validator
parent: truman-town.economy.ledger.transaction
name: {zh: "交易校验器", en: "Transaction Validator"}
description:
  zh: >
      校验账户余额与交易原子性。
      
  en: >
      Validates balances and transaction atomicity.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.835Z"
fingerprint: 39fdf876fff7c6d5f7bafe41c9d8f88af069ccc065e55398b2aa3ea24aa0824f
source:
  - path: "src/economy/ledger/transaction/validator.js"
apis:
  - protocol: rpc
    path: "economy.ledger.transaction.validator.check"
    description:
      zh: >
          校验单笔转账的余额充足性与账户有效性。
          
      en: >
          Validates balance sufficiency and account validity of a single transfer.
          
  - protocol: rpc
    path: "economy.ledger.transaction.validator.atomic"
    description:
      zh: >
          校验批量转账原子性（任一步透支即整体失败）。
          
      en: >
          Validates atomicity of a batch of transfers (any overdraft fails the whole batch).
          
deps:
  - kind: call
    to: truman-town.economy.ledger.account
---
