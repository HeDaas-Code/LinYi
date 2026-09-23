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
      
revision: 6b38498fdd1486b9bde9ab17553cc89337c951fd
updated_at: "2026-09-23T18:02:19.899Z"
fingerprint: 5e4754119a25e9f52f15689a5b15f75021bf3ab5a4d706b801454eab592203db
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
