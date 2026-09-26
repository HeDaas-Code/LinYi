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
      
revision: 45f6c8b7b8ba210fcd94506b2097c8e601dd1382
updated_at: "2026-09-26T01:40:46.603Z"
fingerprint: ea6e1cc7713061ee1dac873c1ea37b5910518bbb16ae519cff9e0bff172c7326
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
