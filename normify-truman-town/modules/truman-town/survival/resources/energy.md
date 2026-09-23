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
      
revision: f4968a009dccf5f3735a3f0d7a362ed5f05ff7bf
updated_at: "2026-09-23T12:16:51.981Z"
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
