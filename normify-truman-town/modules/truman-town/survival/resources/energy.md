---
uid: fec66481
id: truman-town.survival.resources.energy
parent: truman-town.survival.resources
state: planned
name: {zh: "能源", en: "Energy"}
description:
  zh: >
      追踪能源的生产、消耗与库存。
  en: >
      Tracks energy production, consumption and stockpile.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:55:51Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "survival.resources.energy.produce"
    description:
      zh: >
          调用 survival.resources.energy.produce。
      en: >
          Calls survival.resources.energy.produce.
  - protocol: rpc
    path: "survival.resources.energy.consume"
    description:
      zh: >
          调用 survival.resources.energy.consume。
      en: >
          Calls survival.resources.energy.consume.
  - protocol: rpc
    path: "survival.resources.energy.query"
    description:
      zh: >
          调用 survival.resources.energy.query。
      en: >
          Calls survival.resources.energy.query.
---
