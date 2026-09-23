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
      
revision: cb63f58a9c184362bd99a5144c83d0b10e9c5f87
updated_at: "2026-09-23T02:54:54.574Z"
fingerprint: 6da3b4e4fca1fe42be7a49972045a144af4d1384b67c442eab0afd21f3894ae7
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
