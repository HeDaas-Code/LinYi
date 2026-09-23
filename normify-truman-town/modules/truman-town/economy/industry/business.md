---
uid: 8f1d8015
id: truman-town.economy.industry.business
parent: truman-town.economy.industry
name: {zh: "企业", en: "Business"}
description:
  zh: >
      创办、运营与关闭企业，构成小镇产业组成。
      
  en: >
      Founds, operates and closes businesses as town industries.
      
revision: f4968a009dccf5f3735a3f0d7a362ed5f05ff7bf
updated_at: "2026-09-23T12:16:51.980Z"
fingerprint: e11e4bee3f71fd00f27ef025880d4ace53dcc48bda67259248da806cac3342ba
source:
  - path: "src/economy/industry/business.js"
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
