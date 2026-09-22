---
uid: f946921f
id: truman-town.survival.environment.radiation
parent: truman-town.survival.environment
state: planned
name: {zh: "辐射区", en: "Radiation"}
description:
  zh: >
      作为探索结算的风险因子，查询辐射强度并计算其扩散。
  en: >
      Queries radiation intensity and spreads it as a risk factor for expedition resolution.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T05:20:43Z"
fingerprint: pending
source: []
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
