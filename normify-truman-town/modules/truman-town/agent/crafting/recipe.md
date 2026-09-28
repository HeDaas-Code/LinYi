---
uid: 27e2dfdc
id: truman-town.agent.crafting.recipe
parent: truman-town.agent.crafting
name: {zh: "配方", en: "Recipe"}
description:
  zh: >
      定义与学习物品、建筑、书籍的制作配方。
      
  en: >
      Defines and learns recipes for items, buildings and books.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.826Z"
fingerprint: 22eabca8a4bca14a79201b3d1081951722a2cfdeb976a6ef94744280a678c849
source:
  - path: "src/agent/crafting/recipe.js"
apis:
  - protocol: rpc
    path: "agent.crafting.recipe.define"
    description:
      zh: >
          定义制作配方（材料、耗时 tick、能耗、产出）。
          
      en: >
          Defines a crafting recipe (materials, ticks, energy, output).
          
  - protocol: rpc
    path: "agent.crafting.recipe.query"
    description:
      zh: >
          查询配方：全部 / 按 id / 按 kind。
          
      en: >
          Queries recipes: all, by id, or by kind.
          
  - protocol: rpc
    path: "agent.crafting.recipe.learn"
    description:
      zh: >
          记录某居民学会某配方。
          
      en: >
          Records that a resident has learned a recipe.
          
deps:
  - kind: call
    to: truman-town.civilization.tech.tree
  - kind: call
    to: truman-town.agent.inventory.item
---
