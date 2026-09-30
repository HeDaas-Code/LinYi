---
uid: 4e893a7f
id: truman-town.survival.shelter
parent: truman-town.survival
name: {zh: "避难所状态", en: "Shelter Status"}
description:
  zh: >
      维护 LinYi 号避难所的结构完整度、人口容量与损伤状态。
      
  en: >
      Maintains LinYi Shelter integrity, capacity and damage state.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.839Z"
fingerprint: 303ed7b0dac9492de72ddb895241c66c374aa789f94f3a9bb5c43b8804ca7481
source:
  - path: "src/survival/shelter.js"
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
          
  - protocol: rpc
    path: "survival.shelter.repair"
    description:
      zh: >
          调用 survival.shelter.repair（以劳动力修复完整度、使容量回升）。
          
      en: >
          Calls survival.shelter.repair (repairs integrity and raises capacity).
          
deps:
  - kind: call
    to: truman-town.town.building.structure
  - kind: call
    to: truman-town.infra.store.graph
---
