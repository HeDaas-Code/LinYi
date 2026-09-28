---
uid: 29d65763
id: truman-town.agent.inventory.item
parent: truman-town.agent.inventory
name: {zh: "物品定义", en: "Item"}
description:
  zh: >
      定义物品的类别、属性与用途。
      
  en: >
      Defines item categories, properties and uses.
      
revision: 824d4c242a0abd8e6ed58a6edcc322da739c728a
updated_at: "2026-09-28T08:45:24.378Z"
fingerprint: 1c9ccd05043b6746fb6c7296c18ea15e8222752be592891549897a4eb787540f
source:
  - path: "src/agent/inventory/item.js"
apis:
  - protocol: rpc
    path: "agent.inventory.item.define"
    description:
      zh: >
          定义（幂等）一个物品类型，未给 id 时用 infra.identity 生成有序 id。
          
      en: >
          Defines (idempotently) an item type, generating an ordered id via infra.identity when absent.
          
  - protocol: rpc
    path: "agent.inventory.item.query"
    description:
      zh: >
          查询物品目录：全部 / 按 id / 按 category。
          
      en: >
          Queries the item catalog: all, by id, or by category.
          
deps:
  - kind: call
    to: truman-town.infra.identity
---
