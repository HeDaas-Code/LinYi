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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-27T01:43:20.282Z"
fingerprint: pending
source: []
apis: []
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.economy.bankruptcy-handlers-45cbba7c
    to_api: "rpc:bankruptcy-handlers-45cbba7c:write-onBankruptcy"
    label: {zh: "写 bankruptcyHandlers", en: "write bankruptcyHandlers"}
---
