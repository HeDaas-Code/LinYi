---
uid: 45cf098e
id: truman-town-flow.code.economy.ledger.transaction.validator
parent: truman-town-flow.code.economy.ledger.transaction
name: {zh: "economy/ledger/transaction/validator.js", en: "economy/ledger/transaction/validator.js"}
description:
  zh: >
      代码模块 src/economy/ledger/transaction/validator.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/economy/ledger/transaction/validator.js as a data-flow endpoint.
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:42.398Z"
fingerprint: 39fdf876fff7c6d5f7bafe41c9d8f88af069ccc065e55398b2aa3ea24aa0824f
source:
  - path: "src/economy/ledger/transaction/validator.js"
apis:
  - protocol: rpc
    path: "economy.ledger.transaction.validator.onBankruptcy"
    description:
      zh: >
          onBankruptcy：模块导出函数。
          
      en: >
          onBankruptcy: exported module function.
          
  - protocol: rpc
    path: "economy.ledger.transaction.validator.check"
    description:
      zh: >
          check：模块导出函数。
          
      en: >
          check: exported module function.
          
  - protocol: rpc
    path: "economy.ledger.transaction.validator.atomic"
    description:
      zh: >
          atomic：模块导出函数。
          
      en: >
          atomic: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.economy.bankruptcy-handlers-45cbba7c
    to_api: "rpc:bankruptcy-handlers-45cbba7c:write-onBankruptcy"
    label: {zh: "写 bankruptcyHandlers", en: "write bankruptcyHandlers"}
---
