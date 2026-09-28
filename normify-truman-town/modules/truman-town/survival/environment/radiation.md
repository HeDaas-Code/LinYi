---
uid: f946921f
id: truman-town.survival.environment.radiation
parent: truman-town.survival.environment
name: {zh: "辐射区", en: "Radiation"}
description:
  zh: >
      作为探索结算的风险因子，查询辐射强度并计算其扩散。
      
  en: >
      Queries radiation intensity and spreads it as a risk factor for expedition resolution.
      
revision: 824d4c242a0abd8e6ed58a6edcc322da739c728a
updated_at: "2026-09-28T08:45:24.383Z"
fingerprint: 1ec0707acb22d0916ac0acabc8b99a7de92b44632ebad4811d22c51d7a189505
source:
  - path: "src/survival/environment/radiation.js"
apis:
  - protocol: rpc
    path: "survival.environment.radiation.query"
    description:
      zh: >
          调用 survival.environment.radiation.query。
          
      en: >
          Calls survival.environment.radiation.query.
          
  - protocol: rpc
    path: "survival.environment.radiation.spread"
    description:
      zh: >
          调用 survival.environment.radiation.spread。
          
      en: >
          Calls survival.environment.radiation.spread.
          
deps:
  - kind: call
    to: truman-town.town.map.topology
  - kind: call
    to: truman-town.survival.shelter
---
