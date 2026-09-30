---
uid: c5538e96
id: truman-town.survival.needs.meter
parent: truman-town.survival.needs
name: {zh: "需求计量", en: "Needs Meter"}
description:
  zh: >
      更新并查询每个居民的生存需求水平。
      
  en: >
      Updates and queries survival need levels for each resident.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.839Z"
fingerprint: a5bbfb742857742921378ec6ac37b01ea132309698688eeebe77391a0ea5ec5f
source:
  - path: "src/survival/needs/meter.js"
apis:
  - protocol: rpc
    path: "survival.needs.meter.update"
    description:
      zh: >
          更新某居民某类需求水平（level 绝对或 delta 相对，夹在 [0,1]）。
          
      en: >
          Updates a resident's need level (absolute level or relative delta, clamped to [0,1]).
          
  - protocol: rpc
    path: "survival.needs.meter.query"
    description:
      zh: >
          查询居民需求水平（含 food/water 稀缺度）。
          
      en: >
          Queries resident need levels together with food/water scarcity.
          
deps:
  - kind: dataflow
    to: truman-town.survival.resources.food
  - kind: dataflow
    to: truman-town.survival.resources.water
---
