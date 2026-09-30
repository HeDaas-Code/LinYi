---
uid: fec66481
id: truman-town.survival.resources.energy
parent: truman-town.survival.resources
name: {zh: "能源", en: "Energy"}
description:
  zh: >
      追踪能源的生产、消耗与库存。
      
  en: >
      Tracks energy production, consumption and stockpile.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.839Z"
fingerprint: e3e426b44e3c239ed3bdf10fdec51698b04e3c4e0992db8eeb218c8b11ae484e
source:
  - path: "src/survival/resources/energy.js"
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
