---
uid: 880a7a85
id: truman-town.genesis.renewal
parent: truman-town.genesis
name: {zh: "小镇更新", en: "Town Renewal"}
description:
  zh: >
      评估人口、产业与空间结构并替换消亡个体，保持小镇自主更新。
      
  en: >
      Evaluates population, industry and space, replacing the dead to renew the town.
      
revision: 02dffcd347b42bfde4f8a766a3a77cff7de9c286
updated_at: "2026-09-25T10:17:35.034Z"
fingerprint: 67680da37f40889699a831b0b2a5830e6a8bae255296fc1aebe3213dc6d2272a
source:
  - path: "src/genesis/renewal.js"
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
