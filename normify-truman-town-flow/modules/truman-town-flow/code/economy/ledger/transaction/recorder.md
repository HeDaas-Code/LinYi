---
uid: 36ff7216
id: truman-town-flow.code.economy.ledger.transaction.recorder
parent: truman-town-flow.code.economy.ledger.transaction
name: {zh: "economy/ledger/transaction/recorder.js", en: "economy/ledger/transaction/recorder.js"}
description:
  zh: >
      代码模块 src/economy/ledger/transaction/recorder.js。出边=它写的状态，入边=它读的状态；箭头锚定到具体写/读函数。
      
  en: >
      Code module src/economy/ledger/transaction/recorder.js as a data-flow endpoint.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T17:26:46.551Z"
fingerprint: pending
source: []
apis: []
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.economy.seq-408361b9
    to_api: "rpc:seq-408361b9:write-post"
    label: {zh: "写 seq", en: "write seq"}
---
