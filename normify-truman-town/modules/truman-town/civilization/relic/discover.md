---
uid: 04fb190f
id: truman-town.civilization.relic.discover
parent: truman-town.civilization.relic
state: planned
name: {zh: "遗物发现", en: "Relic Discovery"}
description:
  zh: >
      新一代智能体在土地上挖掘并解读遗物，把旧文明知识带回来。
  en: >
      New agents excavate and interpret relics, bringing old knowledge back.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T05:08:43Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "civilization.relic.discover.find"
    description:
      zh: >
          调用 civilization.relic.discover.find。
      en: >
          Calls civilization.relic.discover.find.
  - protocol: rpc
    path: "civilization.relic.discover.interpret"
    description:
      zh: >
          调用 civilization.relic.discover.interpret。
      en: >
          Calls civilization.relic.discover.interpret.
deps:
  - kind: call
    to: truman-town.town.land
  - kind: call
    to: truman-town.civilization.legacy.summary
  - kind: call
    to: truman-town.agent.memory.semantic
---
