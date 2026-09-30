---
uid: ed4e9e07
id: truman-town.survival.resources.water
parent: truman-town.survival.resources
name: {zh: "水源", en: "Water"}
description:
  zh: >
      追踪水源的生产、消耗与库存。
      
  en: >
      Tracks water production, consumption and stockpile.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.839Z"
fingerprint: d27225deb547f3870a264d25ce5128f31240c3808152a69579ab6125f671ad03
source:
  - path: "src/survival/resources/water.js"
apis:
  - protocol: rpc
    path: "survival.resources.water.produce"
    description:
      zh: >
          增产：库存最多增至容量上限，返回实际增产后的库存快照。
          
      en: >
          Produces water, capping the stockpile at capacity and returning the resulting stock snapshot.
          
  - protocol: rpc
    path: "survival.resources.water.consume"
    description:
      zh: >
          消耗：库存至少减到 0，返回实际消耗量与剩余库存。
          
      en: >
          Consumes water, clamping the stockpile at 0 and returning the actual consumed amount and remaining stock.
          
  - protocol: rpc
    path: "survival.resources.water.query"
    description:
      zh: >
          查询水源库存快照（含稀缺度 scarcity）。
          
      en: >
          Queries the water stockpile snapshot including scarcity.
          
---
