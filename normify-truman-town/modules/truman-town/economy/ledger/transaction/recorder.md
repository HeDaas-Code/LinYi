---
uid: 4c97f4c1
id: truman-town.economy.ledger.transaction.recorder
parent: truman-town.economy.ledger.transaction
name: {zh: "流水记录器", en: "Transaction Recorder"}
description:
  zh: >
      记录交易流水并发布事件。
      
  en: >
      Records transactions and publishes events.
      
revision: 824d4c242a0abd8e6ed58a6edcc322da739c728a
updated_at: "2026-09-28T08:45:24.380Z"
fingerprint: 0bc94305c374dbe405ae4af0653393af9c4e2b9e61a73145cbe30676796b3cef
source:
  - path: "src/economy/ledger/transaction/recorder.js"
apis:
  - protocol: rpc
    path: "economy.ledger.transaction.recorder.post"
    description:
      zh: >
          记录一笔转账（校验→落账→写流水→发事件），返回回执。
          
      en: >
          Records a transfer (validate→settle→append→publish), returns a receipt.
          
  - protocol: rpc
    path: "economy.ledger.transaction.recorder.receipt"
    description:
      zh: >
          按流水 ID 取回回执。
          
      en: >
          Fetches a receipt by transaction id.
          
deps:
  - kind: call
    to: truman-town.economy.ledger.transaction.validator
  - kind: call
    to: truman-town.infra.events.pubsub
---
