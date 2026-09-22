---
uid: cfe6b85b
id: truman-town.economy.industry.production
parent: truman-town.economy.industry
state: planned
name: {zh: "生产", en: "Production"}
description:
  zh: >
      制定生产计划并产出商品与服务。
  en: >
      Plans production and outputs goods and services.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "economy.industry.production.plan"
    description:
      zh: >
          调用 economy.industry.production.plan。
      en: >
          Calls economy.industry.production.plan.
  - protocol: rpc
    path: "economy.industry.production.output"
    description:
      zh: >
          调用 economy.industry.production.output。
      en: >
          Calls economy.industry.production.output.
deps:
  - kind: call
    to: truman-town.economy.market.price
  - kind: call
    to: truman-town.survival.resources.food
  - kind: call
    to: truman-town.survival.resources.energy
---
