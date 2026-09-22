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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T06:36:55.531Z"
fingerprint: a4bda053d84174d62952c4fee2bd74b9187acdcc8bddb05d998402116492fb30
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
