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
      
revision: 097b667976bac34f168628c34a69a1c227c462d0
updated_at: "2026-09-28T02:35:41.409Z"
fingerprint: 0bc94305c374dbe405ae4af0653393af9c4e2b9e61a73145cbe30676796b3cef
source:
  - path: "src/economy/ledger/transaction/recorder.js"
apis:
  - protocol: rpc
    path: "economy.ledger.transaction.recorder.post"
    description:
      zh: >
          post：模块导出函数。
          
      en: >
          post: exported module function.
          
  - protocol: rpc
    path: "economy.ledger.transaction.recorder.receipt"
    description:
      zh: >
          receipt：模块导出函数。
          
      en: >
          receipt: exported module function.
          
deps:
  - kind: dataflow
    to: truman-town-flow.state.area.economy.seq-408361b9
    to_api: "rpc:seq-408361b9:write-post"
    label: {zh: "写 seq", en: "write seq"}
---
