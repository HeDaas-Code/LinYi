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
      
revision: f4968a009dccf5f3735a3f0d7a362ed5f05ff7bf
updated_at: "2026-09-23T12:16:51.980Z"
fingerprint: 7fd7e67b04f6755055265817577d6638f0b606b3d4381f1e8c90dd50ed4e4b5e
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
