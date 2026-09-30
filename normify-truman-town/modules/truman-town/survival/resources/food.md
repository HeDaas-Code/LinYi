---
uid: 1b042bf1
id: truman-town.survival.resources.food
parent: truman-town.survival.resources
name: {zh: "食物", en: "Food"}
description:
  zh: >
      追踪食物的生产、消耗与库存。
      
  en: >
      Tracks food production, consumption and stockpile.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.839Z"
fingerprint: 2f5df38746dbf5bbc130a332bc2c32649fe0d54932dc773e0827acc1ad8de783
source:
  - path: "src/survival/resources/food.js"
apis:
  - protocol: rpc
    path: "survival.resources.food.produce"
    description:
      zh: >
          增产：库存最多增至容量上限，返回实际增产后的库存快照。
          
      en: >
          Produces food, capping the stockpile at capacity and returning the resulting stock snapshot.
          
  - protocol: rpc
    path: "survival.resources.food.consume"
    description:
      zh: >
          消耗：库存至少减到 0，返回实际消耗量与剩余库存。
          
      en: >
          Consumes food, clamping the stockpile at 0 and returning the actual consumed amount and remaining stock.
          
  - protocol: rpc
    path: "survival.resources.food.query"
    description:
      zh: >
          查询食物库存快照（含稀缺度 scarcity）。
          
      en: >
          Queries the food stockpile snapshot including scarcity.
          
---
