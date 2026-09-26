---
uid: "7632e068"
id: truman-town.civilization.relic.artifact
parent: truman-town.civilization.relic
state: planned
name: {zh: "遗物", en: "Artifact"}
description:
  zh: >
      把上一代文明的物品、建筑与书籍固化为遗物并持久化。
      
  en: >
      Turns past items, buildings and books into persistent relics.
      
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-26T03:35:05.395Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "civilization.relic.artifact.create"
    description:
      zh: >
          调用 civilization.relic.artifact.create。
          
      en: >
          Calls civilization.relic.artifact.create.
          
  - protocol: rpc
    path: "civilization.relic.artifact.persist"
    description:
      zh: >
          调用 civilization.relic.artifact.persist。
          
      en: >
          Calls civilization.relic.artifact.persist.
          
deps:
  - kind: call
    to: truman-town.civilization.legacy.graph
  - kind: call
    to: truman-town.infra.store.archive
  - kind: call
    to: truman-town.agent.inventory.item
---
