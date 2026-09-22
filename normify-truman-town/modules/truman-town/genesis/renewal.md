---
uid: 880a7a85
id: truman-town.genesis.renewal
parent: truman-town.genesis
state: planned
name: {zh: "小镇更新", en: "Town Renewal"}
description:
  zh: >
      评估人口、产业与空间结构并替换消亡个体，保持小镇自主更新。
  en: >
      Evaluates population, industry and space, replacing the dead to renew the town.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:32:53Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "genesis.renewal.evaluate"
    description:
      zh: >
          调用 genesis.renewal.evaluate。
      en: >
          Calls genesis.renewal.evaluate.
  - protocol: rpc
    path: "genesis.renewal.replace"
    description:
      zh: >
          调用 genesis.renewal.replace。
      en: >
          Calls genesis.renewal.replace.
deps:
  - kind: call
    to: truman-town.agent.lifecycle
  - kind: call
    to: truman-town.town.building.structure
---
