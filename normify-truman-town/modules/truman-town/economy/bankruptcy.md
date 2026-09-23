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
      
revision: 291c1bea8967e3110e48250864e71452d803a9bf
updated_at: "2026-09-23T13:07:29.470Z"
fingerprint: 2853258afa24c7951a72f965b565b413c5cb6986ecfa26ec6ba09ca47b984a30
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
