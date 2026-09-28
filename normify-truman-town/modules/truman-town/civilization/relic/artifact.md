---
uid: "7632e068"
id: truman-town.civilization.relic.artifact
parent: truman-town.civilization.relic
name: {zh: "遗物", en: "Artifact"}
description:
  zh: >
      把上一代文明的物品、建筑与书籍固化为遗物并持久化。
      
  en: >
      Turns past items, buildings and books into persistent relics.
      
revision: 824d4c242a0abd8e6ed58a6edcc322da739c728a
updated_at: "2026-09-28T09:00:32.044Z"
fingerprint: ebc2a41f28ffb892732d4846b0db9943451abab3729ab0b6675339f56ca7529b
source:
  - path: "src/civilization/relic/artifact.js"
apis:
  - protocol: rpc
    path: "civilization.relic.artifact.forge"
    description:
      zh: >
          forge：遗物铸造与物证管理接口。
          
      en: >
          forge: relic forging and artifact management API.
          
  - protocol: rpc
    path: "civilization.relic.artifact.query"
    description:
      zh: >
          query：遗物铸造与物证管理接口。
          
      en: >
          query: relic forging and artifact management API.
          
  - protocol: rpc
    path: "civilization.relic.artifact.markDiscovered"
    description:
      zh: >
          markDiscovered：遗物铸造与物证管理接口。
          
      en: >
          markDiscovered: relic forging and artifact management API.
          
  - protocol: rpc
    path: "civilization.relic.artifact.remove"
    description:
      zh: >
          remove：遗物铸造与物证管理接口。
          
      en: >
          remove: relic forging and artifact management API.
          
  - protocol: rpc
    path: "civilization.relic.artifact.stats"
    description:
      zh: >
          stats：遗物铸造与物证管理接口。
          
      en: >
          stats: relic forging and artifact management API.
          
deps:
  - kind: call
    to: truman-town.civilization.legacy.graph
  - kind: call
    to: truman-town.infra.store.archive
  - kind: call
    to: truman-town.agent.inventory.item
---
