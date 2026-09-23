---
uid: cfe6b85b
id: truman-town.economy.industry.production
parent: truman-town.economy.industry
name: {zh: "生产", en: "Production"}
description:
  zh: >
      制定生产计划并产出商品与服务。
      
  en: >
      Plans production and outputs goods and services.
      
revision: f4968a009dccf5f3735a3f0d7a362ed5f05ff7bf
updated_at: "2026-09-23T12:16:51.980Z"
fingerprint: af5f48951e04d492c61e35a76c0c515ddf41ea696535374368c72d3af3a3b45d
source:
  - path: "src/economy/industry/production.js"
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
