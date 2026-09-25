---
uid: f90fdd18
id: truman-town.agent.crafting.workbench
parent: truman-town.agent.crafting
name: {zh: "制作物品实现", en: "Workbench Implementation"}
description:
  zh: >
      消耗 tick 与背包材料，产出物品并放入背包。
      
  en: >
      Consumes ticks and backpack materials to produce items into the backpack.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-25T08:50:35.490Z"
fingerprint: pending
source: []
deps:
  - kind: call
    to: truman-town.agent.crafting.recipe
  - kind: call
    to: truman-town.agent.inventory.backpack
  - kind: call
    to: truman-town.survival.resources.energy
  - kind: call
    to: truman-town.runtime.clock
  - kind: call
    to: truman-town.observer.recorder
---
