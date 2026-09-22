---
uid: 4e893a7f
id: truman-town.survival.shelter
parent: truman-town.survival
state: planned
name: {zh: "避难所状态", en: "Shelter Status"}
description:
  zh: >
      维护 LinYi 号避难所的结构完整度、人口容量与损伤状态。
  en: >
      Maintains LinYi Shelter integrity, capacity and damage state.
revision: "0000000000000000000000000000000000000000"
updated_at: "2026-09-22T04:55:51Z"
fingerprint: pending
source: []
apis:
  - protocol: rpc
    path: "survival.shelter.status"
    description:
      zh: >
          调用 survival.shelter.status。
      en: >
          Calls survival.shelter.status.
  - protocol: rpc
    path: "survival.shelter.capacity"
    description:
      zh: >
          调用 survival.shelter.capacity。
      en: >
          Calls survival.shelter.capacity.
  - protocol: rpc
    path: "survival.shelter.damage"
    description:
      zh: >
          调用 survival.shelter.damage。
      en: >
          Calls survival.shelter.damage.
deps:
  - kind: call
    to: truman-town.town.building.structure
  - kind: call
    to: truman-town.infra.store.graph
---
