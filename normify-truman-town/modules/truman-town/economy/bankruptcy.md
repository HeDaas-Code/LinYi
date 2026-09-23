---
uid: "1e908409"
id: truman-town.economy.bankruptcy
parent: truman-town.economy
name: {zh: "破产清算", en: "Bankruptcy"}
description:
  zh: >
      对资不抵债的智能体或企业启动破产与清算。
      
  en: >
      Files and liquidates insolvent agents or businesses.
      
revision: 6b38498fdd1486b9bde9ab17553cc89337c951fd
updated_at: "2026-09-23T18:02:19.899Z"
fingerprint: 9e5ce2a1369ee20b2e2ed4d3917b4cef5a093210e0b040e656fae63b83f8c247
source:
  - path: "src/economy/bankruptcy.js"
apis:
  - protocol: rpc
    path: "economy.bankruptcy.file"
    description:
      zh: >
          调用 economy.bankruptcy.file。
          
      en: >
          Calls economy.bankruptcy.file.
          
  - protocol: rpc
    path: "economy.bankruptcy.liquidate"
    description:
      zh: >
          调用 economy.bankruptcy.liquidate。
          
      en: >
          Calls economy.bankruptcy.liquidate.
          
deps:
  - kind: call
    to: truman-town.economy.ledger.account
  - kind: call
    to: truman-town.economy.industry.business
---
