---
uid: "1e908409"
id: truman-town.economy.bankruptcy
parent: truman-town.economy
state: planned
name: {zh: "破产清算", en: "Bankruptcy"}
description:
  zh: >
      对资不抵债的智能体或企业启动破产与清算。
  en: >
      Files and liquidates insolvent agents or businesses.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
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
