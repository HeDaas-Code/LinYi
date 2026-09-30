---
uid: 8ada172d
id: truman-town-flow.graph.types.economy-tx-b6f7489f
parent: truman-town-flow.graph.types
name: {zh: "economy.tx", en: "economy.tx"}
description:
  zh: >
      声明于 undefined:undefined。生产者 2 个，消费者 11 个。
  en: >
      Declared at undefined:undefined; producers=2, consumers=11
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-01-01T00:00:00Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "economy-tx-b6f7489f:write.src_economy__store_js"
    description:
      zh: >
          生产者 src/economy/_store.js
      en: >
          producer src/economy/_store.js
  - protocol: rpc
    path: "economy-tx-b6f7489f:write.src_economy_ledger_transaction_querier_js"
    description:
      zh: >
          生产者 src/economy/ledger/transaction/querier.js
      en: >
          producer src/economy/ledger/transaction/querier.js
  - protocol: rpc
    path: "economy-tx-b6f7489f:read.src_economy__store_js"
    description:
      zh: >
          消费者 src/economy/_store.js
      en: >
          consumer src/economy/_store.js
  - protocol: rpc
    path: "economy-tx-b6f7489f:read.src_economy_bank_credit_js"
    description:
      zh: >
          消费者 src/economy/bank/credit.js
      en: >
          consumer src/economy/bank/credit.js
  - protocol: rpc
    path: "economy-tx-b6f7489f:read.src_economy_industry_business_js"
    description:
      zh: >
          消费者 src/economy/industry/business.js
      en: >
          consumer src/economy/industry/business.js
  - protocol: rpc
    path: "economy-tx-b6f7489f:read.src_economy_industry_labour_js"
    description:
      zh: >
          消费者 src/economy/industry/labour.js
      en: >
          consumer src/economy/industry/labour.js
  - protocol: rpc
    path: "economy-tx-b6f7489f:read.src_economy_ledger_account_js"
    description:
      zh: >
          消费者 src/economy/ledger/account.js
      en: >
          consumer src/economy/ledger/account.js
  - protocol: rpc
    path: "economy-tx-b6f7489f:read.src_economy_ledger_transaction_querier_js"
    description:
      zh: >
          消费者 src/economy/ledger/transaction/querier.js
      en: >
          consumer src/economy/ledger/transaction/querier.js
---
