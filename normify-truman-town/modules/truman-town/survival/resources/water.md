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
      
revision: b2c533dcbb9a29bf0cd2322749845b223954c80f
updated_at: "2026-09-25T05:42:38.158Z"
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
