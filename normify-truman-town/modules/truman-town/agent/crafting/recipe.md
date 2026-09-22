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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T08:02:32.239Z"
fingerprint: 5559f8d9e11333d87f4a97d3604ed0f0e0f3a471db1d2c71fa60488b1615740b
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
