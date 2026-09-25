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
      
revision: 36ce55d9e3d8994abf455c13925f0c4f4a3f316c
updated_at: "2026-09-25T09:50:41.311Z"
fingerprint: 29f52eaad0a19437b22556eaca188c5767536c77c47fbcd3975271b2eda38169
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
