---
uid: de14729e
id: truman-town.agent.crafting.workbench.validator
parent: truman-town.agent.crafting.workbench
name: {zh: "配方校验器", en: "Craft Validator"}
description:
  zh: >
      校验配方、材料与背包库存。
      
  en: >
      Validates recipe, materials and backpack inventory.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.826Z"
fingerprint: f452efd1708287f01e3ad9db14f8765e1e27cbe5cb2471499b9ce8f66652db53
source:
  - path: "src/agent/crafting/workbench/validator.js"
apis:
  - protocol: rpc
    path: "agent.crafting.workbench.validator.check"
    description:
      zh: >
          校验配方、背包材料与容量，返回缺料清单。
          
      en: >
          Validates recipe, backpack materials and capacity, returning missing items.
          
  - protocol: rpc
    path: "agent.crafting.workbench.validator.materials"
    description:
      zh: >
          返回配方所需材料与耗时。
          
      en: >
          Returns the recipe's required materials and duration.
          
deps:
  - kind: call
    to: truman-town.agent.crafting.recipe
  - kind: call
    to: truman-town.agent.inventory.backpack
---
