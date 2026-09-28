---
uid: 04fb190f
id: truman-town.civilization.relic.discover
parent: truman-town.civilization.relic
name: {zh: "遗物发现", en: "Relic Discovery"}
description:
  zh: >
      新一代智能体在土地上挖掘并解读遗物，把旧文明知识带回来。
      
  en: >
      New agents excavate and interpret relics, bringing old knowledge back.
      
revision: 824d4c242a0abd8e6ed58a6edcc322da739c728a
updated_at: "2026-09-28T09:00:32.044Z"
fingerprint: 5e0fc84a59cd8164030fc073b70c8195759b62daec98e5c478d3de9bc9a63ad8
source:
  - path: "src/civilization/relic/discover.js"
apis:
  - protocol: rpc
    path: "civilization.relic.discover.interpret"
    description:
      zh: >
          interpret：遗物发现与解读接口。
          
      en: >
          interpret: relic discovery and interpretation API.
          
  - protocol: rpc
    path: "civilization.relic.discover.discover"
    description:
      zh: >
          discover：遗物发现与解读接口。
          
      en: >
          discover: relic discovery and interpretation API.
          
  - protocol: rpc
    path: "civilization.relic.discover.list"
    description:
      zh: >
          list：遗物发现与解读接口。
          
      en: >
          list: relic discovery and interpretation API.
          
  - protocol: rpc
    path: "civilization.relic.discover.byAgent"
    description:
      zh: >
          byAgent：遗物发现与解读接口。
          
      en: >
          byAgent: relic discovery and interpretation API.
          
  - protocol: rpc
    path: "civilization.relic.discover.stats"
    description:
      zh: >
          stats：遗物发现与解读接口。
          
      en: >
          stats: relic discovery and interpretation API.
          
deps:
  - kind: call
    to: truman-town.town.map.zoning
  - kind: call
    to: truman-town.civilization.legacy.summary
  - kind: call
    to: truman-town.agent.memory.semantic
---
