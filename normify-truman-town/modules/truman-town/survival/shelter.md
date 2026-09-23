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
      
revision: da6092c786d6c0615331ed8d297d5c0d6a2fa45a
updated_at: "2026-09-23T12:12:22.377Z"
fingerprint: 455c8fcfbfbb234043d6374227d71f9d9ec8974d8deab08f81a14f85fd8c9365
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
          
deps:
  - kind: call
    to: truman-town.town.building.structure
  - kind: call
    to: truman-town.infra.store.graph
---
