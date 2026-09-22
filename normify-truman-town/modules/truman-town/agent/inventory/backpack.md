---
uid: f21e0ff1
id: truman-town.agent.inventory.backpack
parent: truman-town.agent.inventory
name: {zh: "背包", en: "Backpack"}
description:
  zh: >
      向背包添加、移除、列出物品，并管理容量与负重。
      
  en: >
      Adds, removes and lists backpack items with capacity and weight.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T08:02:32.225Z"
fingerprint: 6393b3f28016de43eaf29b21574f0bac7dd690a5e89551f49811f12c4c68323d
source:
  - path: "src/agent/inventory/backpack.js"
apis:
  - protocol: rpc
    path: "agent.inventory.backpack.add"
    description:
      zh: >
          向背包添加物品（受容量与负重约束）。
          
      en: >
          Adds items to the backpack, enforcing capacity and weight limits.
          
  - protocol: rpc
    path: "agent.inventory.backpack.remove"
    description:
      zh: >
          从背包移除物品（数量不足抛出）。
          
      en: >
          Removes items from the backpack (throws if insufficient).
          
  - protocol: rpc
    path: "agent.inventory.backpack.list"
    description:
      zh: >
          列出某居民背包内容（件数、重量、容量）。
          
      en: >
          Lists a resident's backpack (count, weight, capacity).
          
  - protocol: rpc
    path: "agent.inventory.backpack.capacity"
    description:
      zh: >
          读取 / 设置背包容量与负重上限。
          
      en: >
          Reads or sets the backpack capacity and max weight.
          
deps:
  - kind: call
    to: truman-town.agent.inventory.item
---
