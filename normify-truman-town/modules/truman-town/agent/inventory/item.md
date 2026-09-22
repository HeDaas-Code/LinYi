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
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T08:02:32.222Z"
fingerprint: 72e98d6b98beeaf9007f933fb850bdf0993e2015abec95bbafa21cd5e7f0a558
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
