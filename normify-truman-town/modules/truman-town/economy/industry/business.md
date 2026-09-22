---
uid: 8f1d8015
id: truman-town.economy.industry.business
parent: truman-town.economy.industry
state: planned
name: {zh: "企业", en: "Business"}
description:
  zh: >
      创办、运营与关闭企业，构成小镇产业组成。
  en: >
      Founds, operates and closes businesses as town industries.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "economy.industry.business.found"
    description:
      zh: >
          调用 economy.industry.business.found。
      en: >
          Calls economy.industry.business.found.
  - protocol: rpc
    path: "economy.industry.business.operate"
    description:
      zh: >
          调用 economy.industry.business.operate。
      en: >
          Calls economy.industry.business.operate.
  - protocol: rpc
    path: "economy.industry.business.close"
    description:
      zh: >
          调用 economy.industry.business.close。
      en: >
          Calls economy.industry.business.close.
deps:
  - kind: call
    to: truman-town.town.land
  - kind: call
    to: truman-town.town.building.space
---
