---
uid: 877c2ef5
id: truman-town.agent.crafting.construction
parent: truman-town.agent.crafting
name: {zh: "建造建筑", en: "Construction"}
description:
  zh: >
      消耗 tick 与材料建造或加固避难所建筑。
      
  en: >
      Consumes ticks and materials to build or reinforce shelter structures.
      
revision: 824d4c242a0abd8e6ed58a6edcc322da739c728a
updated_at: "2026-09-28T08:45:24.377Z"
fingerprint: 81d8dab1de592fd8a30263412b5311c6deb312f59ff48e1d27557abebf418ce8
source:
  - path: "src/agent/crafting/construction.js"
apis:
  - protocol: rpc
    path: "agent.crafting.construction.build"
    description:
      zh: >
          发起建筑建造：校验 + 扣材料 + 登记耗时任务。
          
      en: >
          Starts a build: validates, deducts materials and enqueues a timed job.
          
  - protocol: rpc
    path: "agent.crafting.construction.tick"
    description:
      zh: >
          推进建造任务，归零后写入建筑结构并记录观察日志。
          
      en: >
          Advances build jobs; on completion, writes the structure and observer log.
          
deps:
  - kind: call
    to: truman-town.agent.crafting.recipe
  - kind: call
    to: truman-town.agent.inventory.backpack
  - kind: call
    to: truman-town.town.building.structure
  - kind: call
    to: truman-town.runtime.clock
  - kind: call
    to: truman-town.observer.recorder
---
